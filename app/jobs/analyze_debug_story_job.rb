class AnalyzeDebugStoryJob < ApplicationJob
  queue_as :default

  retry_on StandardError, wait: 30.seconds, attempts: 3

  def perform(debug_story_id)
    story = DebugStory.find(debug_story_id)

    # Resolve video source: R2, local staging, or error
    staging_path = resolve_video_path(story)

    t0 = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    Rails.logger.info("[debug_news] Job: Analyzing story ##{story.story_number} (id=#{story.id})")

    # 1. Upload to Gemini File API
    staging_size = File.size(staging_path)
    declared_mime = story.content_type || "video/mp4"
    Rails.logger.info("[debug_news] Job step 1: Uploading to Gemini File API — file=#{staging_path}, size=#{(staging_size / 1e6).round(2)} MB, declared_mime=#{declared_mime}")
    file_manager = Gemini::FileManager.new
    gemini_file = file_manager.upload_and_wait(
      staging_path,
      mime_type: declared_mime,
      display_name: "debug_story_#{story.story_number}"
    )
    elapsed1 = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - t0).round(1)
    Rails.logger.info("[debug_news] Job step 1 done in #{elapsed1}s — file: #{gemini_file[:name]}")

    # 2. Generate analysis with Gemini
    Rails.logger.info("[debug_news] Job step 2: Running Gemini analysis...")
    generator = Gemini::ContentGenerator.new
    prompt = DebugNews::PromptBuilder.story_analysis_prompt(
      story_number: story.story_number,
      user_context: story.user_context
    )

    result = generator.generate_with_file(
      file_uri: gemini_file[:uri],
      file_mime_type: gemini_file[:mimeType],
      prompt: prompt,
      temperature: 0.3,
      json_response: true
    )

    # 3. Parse and save Gemini results
    elapsed2 = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - t0).round(1)
    Rails.logger.info("[debug_news] Job step 2 done in #{elapsed2}s total")
    parsed = JSON.parse(result[:text], symbolize_names: true)
    Rails.logger.info("[debug_news] Got title=#{parsed[:storyTitle]}, emoji=#{parsed[:storyEmoji]}")

    story.update!(
      gemini_json: parsed,
      story_title: parsed[:storyTitle],
      story_emoji: parsed[:storyEmoji],
      intro_text: parsed[:introText],
      subtitle_segments: parsed[:subtitleSegments],
      error_message: nil
    )

    # 3b. Generate TTS audio for story intro
    generate_tts(story)

    # 4. Upload to Cloudflare Stream
    cf_uid = upload_to_cloudflare(story, staging_path)

    # 5. Mark done and save CF UID
    story.update!(
      status: "done",
      cloudflare_stream_uid: cf_uid
    )

    # 6. Cleanup
    file_manager.delete_file(gemini_file[:name])
    # Only clean up local staging file if we have a copy in R2 or CF
    if story.r2_video_key.present? || cf_uid.present?
      cleanup_staging_file(staging_path) unless staging_path == story.temp_file_path && story.r2_video_key.blank?
    end

    total = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - t0).round(1)
    Rails.logger.info("[debug_news] Story ##{story.story_number} fully processed in #{total}s")

  rescue => e
    file_size_info = staging_path && File.exist?(staging_path) ? " (file_size=#{(File.size(staging_path) / 1e6).round(2)} MB)" : ""
    Rails.logger.error("[debug_news] Job failed for story ##{story.id}#{file_size_info}: #{e.message}\n#{e.backtrace&.first(5)&.join("\n")}")
    story&.update(status: "failed", error_message: e.message) if story&.persisted?
    raise
  end

  private

  def resolve_video_path(story)
    # If video is in R2, download it to a temp file for Gemini upload
    if story.r2_video_key.present?
      r2 = Cloudflare::R2Client.new
      tmp_dir = Rails.root.join("tmp", "debug_videos")
      FileUtils.mkdir_p(tmp_dir)
      ext = File.extname(story.original_filename || ".mp4")
      local_path = tmp_dir.join("story_#{story.id}_r2#{ext}").to_s
      r2.download(story.r2_video_key, local_path)
      file_size = File.size(local_path)
      first_bytes = File.binread(local_path, 16).bytes.map { |b| b.to_s(16).rjust(2, "0") }.join(" ")
      Rails.logger.info("[debug_news] Downloaded from R2: #{story.r2_video_key} → #{(file_size / 1e6).round(2)} MB, first bytes: [#{first_bytes}]")
      if file_size == 0
        raise "R2 download produced empty file for story ##{story.id} (key: #{story.r2_video_key})"
      end
      return local_path
    end

    # Fall back to local staging file
    path = story.temp_file_path
    unless path.present? && File.exist?(path)
      raise "No video source for story ##{story.id} (no R2 key, no staging file)"
    end
    path
  end

  def upload_to_cloudflare(story, staging_path)
    cf_client = Cloudflare::StreamClient.new
    unless cf_client.configured?
      Rails.logger.warn("[debug_news] Cloudflare not configured, skipping CF upload for story ##{story.id}")
      return nil
    end

    Rails.logger.info("[debug_news] Uploading to Cloudflare Stream...")
    cf_result = cf_client.upload_video(
      staging_path,
      filename: story.original_filename || "story_#{story.id}.mp4",
      content_type: story.content_type || "video/mp4"
    )
    uid = cf_result[:uid]
    Rails.logger.info("[debug_news] CF upload done, uid=#{uid}. Polling for ready...")

    # Poll until ready (max 5 min, every 5s)
    60.times do
      break if cf_client.video_ready?(uid)
      sleep 5
    end

    if cf_client.video_ready?(uid)
      Rails.logger.info("[debug_news] CF Stream video ready: #{uid}")
    else
      Rails.logger.warn("[debug_news] CF Stream video not ready after 5min, proceeding anyway: #{uid}")
    end

    # Enable MP4 downloads on the video
    begin
      cf_client.enable_downloads(uid)
      Rails.logger.info("[debug_news] CF Stream downloads enabled for: #{uid}")
    rescue => e
      Rails.logger.warn("[debug_news] Failed to enable downloads (non-fatal): #{e.message}")
    end

    uid
  rescue => e
    Rails.logger.warn("[debug_news] Cloudflare upload failed (non-fatal): #{e.message}")
    nil
  end

  def generate_tts(story)
    return unless story.intro_text.present?

    Rails.logger.info("[debug_news] Generating TTS for story ##{story.story_number}...")
    pcm = Gemini::TtsGenerator.new.generate(text: story.intro_text, voice: "Orus")
    wav = Audio::WavBuilder.build(pcm)

    # Upload TTS to R2 if configured
    r2 = Cloudflare::R2Client.new
    if r2.configured?
      r2_key = "stories/#{story.id}/tts.wav"
      r2.upload(r2_key, StringIO.new(wav), content_type: "audio/wav")
      story.update!(r2_tts_key: r2_key)
      Rails.logger.info("[debug_news] TTS uploaded to R2 for story ##{story.story_number}")
    end

    # Also attach via ActiveStorage for backward compat (master_json ttsUrl)
    story.tts_audio.attach(
      io: StringIO.new(wav),
      filename: "story_#{story.id}_tts.wav",
      content_type: "audio/wav"
    )
    Rails.logger.info("[debug_news] TTS audio attached for story ##{story.story_number}")
  rescue => e
    Rails.logger.warn("[debug_news] TTS generation failed (non-fatal): #{e.message}")
  end

  def cleanup_staging_file(path)
    File.delete(path) if path.present? && File.exist?(path)
  rescue => e
    Rails.logger.warn("[debug_news] Failed to cleanup staging file: #{e.message}")
  end
end
