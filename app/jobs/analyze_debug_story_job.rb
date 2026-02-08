class AnalyzeDebugStoryJob < ApplicationJob
  queue_as :default

  retry_on StandardError, wait: 30.seconds, attempts: 3

  def perform(debug_story_id)
    story = DebugStory.find(debug_story_id)
    staging_path = story.temp_file_path

    unless staging_path.present? && File.exist?(staging_path)
      raise "No staging file at #{staging_path} for story ##{story.id}"
    end

    t0 = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    Rails.logger.info("[debug_news] Job: Analyzing story ##{story.story_number} (id=#{story.id})")

    # 1. Upload to Gemini File API
    Rails.logger.info("[debug_news] Job step 1: Uploading to Gemini File API...")
    file_manager = Gemini::FileManager.new
    gemini_file = file_manager.upload_and_wait(
      staging_path,
      mime_type: story.content_type || "video/mp4",
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

    # 4. Upload to Cloudflare Stream
    cf_uid = upload_to_cloudflare(story, staging_path)

    # 5. Mark done and save CF UID
    story.update!(
      status: "done",
      cloudflare_stream_uid: cf_uid
    )

    # 6. Cleanup
    file_manager.delete_file(gemini_file[:name])
    cleanup_staging_file(staging_path) if cf_uid.present?

    total = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - t0).round(1)
    Rails.logger.info("[debug_news] Story ##{story.story_number} fully processed in #{total}s")

  rescue => e
    Rails.logger.error("[debug_news] Job failed for story ##{story.id}: #{e.message}\n#{e.backtrace&.first(5)&.join("\n")}")
    story&.update(status: "failed", error_message: e.message) if story&.persisted?
    raise
  end

  private

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

    uid
  rescue => e
    Rails.logger.warn("[debug_news] Cloudflare upload failed (non-fatal): #{e.message}")
    nil
  end

  def cleanup_staging_file(path)
    File.delete(path) if path.present? && File.exist?(path)
  rescue => e
    Rails.logger.warn("[debug_news] Failed to cleanup staging file: #{e.message}")
  end
end
