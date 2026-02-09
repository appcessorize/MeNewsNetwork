require "fileutils"
require "shellwords"

class BulletinRenderer
  class RenderError < StandardError; end

  RESOLUTION = "1080x1920"
  FPS = 30
  VIDEO_CODEC = "-c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p"
  AUDIO_CODEC = "-c:a aac -ar 48000 -ac 2 -b:a 128k"
  SILENT_AUDIO = "-f lavfi -i anullsrc=r=48000:cl=stereo"
  BG_MUSIC_PATH = Rails.root.join("public", "bgmusic.mp3").to_s
  ANCHOR_VIDEO_PATH = Rails.root.join("app", "assets", "anchorcompressed.mp4").to_s
  BUMPER_CACHE_PATH = Rails.root.join("tmp", "bulletin_renders", "bumper_cache.mp4").to_s
  BUMPER_CACHE_MAX_AGE = 24.hours

  attr_reader :bulletin, :work_dir

  def initialize(bulletin, on_progress: nil)
    @bulletin = bulletin
    @on_progress = on_progress
    @ffmpeg = BulletinRenderer::FfmpegRunner.new
    @frame_gen = BulletinRenderer::FrameGenerator.new
    @r2 = Cloudflare::R2Client.new
    @cf_stream = Cloudflare::StreamClient.new
    @log_lines = []
    @work_dir = nil
  end

  def render!
    @work_dir = Rails.root.join("tmp", "bulletin_renders", "bulletin_#{bulletin.id}_#{SecureRandom.hex(4)}")
    FileUtils.mkdir_p(@work_dir)

    update_progress(0, "Preparing inputs")

    # Phase 0: Download all inputs from R2
    log("[Render] Downloading bumper...")
    bumper_path = download_bumper
    stories = bulletin.debug_stories.where(status: "done").order(:story_number)
    log("[Render] Found #{stories.count} done stories: #{stories.map { |s| "##{s.story_number} #{s.story_title}" }.join(', ')}")
    json_stories = bulletin.master_json&.dig("stories")&.map { |s| "##{s['storyNumber']} #{s['storyTitle']} (id=#{s['storyId']})" }&.join(", ") || "none"
    log("[Render] Master JSON stories: #{json_stories}")
    log("[Render] Downloading story inputs...")
    story_inputs = download_story_inputs(stories)
    story_inputs.each do |story_id, data|
      log("[Render] Story #{story_id}: video=#{data[:video].present?}, tts=#{data[:tts].present?}, poster=#{data[:poster].present?}")
    end
    update_progress(10, "Rendering segments")

    # Phase 1: Render individual segments
    segment_paths = []
    total_stories = stories.count
    studio_bg = Rails.root.join("public", "newsBgEdited.jpeg").to_s
    welcome_inputs = download_welcome_inputs
    closing_inputs = download_closing_inputs

    # Welcome segment (before opening bumper)
    if welcome_inputs[:tts]
      update_progress(11, "Rendering welcome segment")
      welcome_seg = render_welcome_segment(welcome_inputs)
      log_segment_duration(welcome_seg, "welcome")
      segment_paths << { path: welcome_seg, type: :studio }
    end

    # Opening bumper
    if bumper_path
      bumper_seg = render_bumper_segment(bumper_path, "opening")
      log_segment_duration(bumper_seg, "opening bumper")
      segment_paths << { path: bumper_seg, type: :bumper }
    end

    # Per-story segments
    stories.each_with_index do |story, idx|
      inputs = story_inputs[story.id]
      pct = 12 + ((idx.to_f / total_stories) * 48).to_i
      update_progress(pct, "Rendering story #{idx + 1}/#{total_stories}: #{story.story_title}")

      log("[Render] Story #{idx + 1}/#{total_stories}: id=#{story.id}, title=#{story.story_title.inspect}, video=#{inputs[:video].present?}, tts=#{inputs[:tts].present?}, poster=#{inputs[:poster].present?}")

      # Studio intro segment
      log("[Render] Starting studio intro for story #{story.story_number}...")
      studio_seg = render_studio_segment(story, inputs, studio_bg)
      log_segment_duration(studio_seg, "studio story #{story.story_number}")
      segment_paths << { path: studio_seg, type: :studio }

      # User video segment
      if inputs[:video]
        log("[Render] Rendering user video for story #{story.story_number}...")
        video_seg = render_user_video_segment(inputs[:video], story)
        log_segment_duration(video_seg, "user video story #{story.story_number}")
        segment_paths << { path: video_seg, type: :user_video }
      else
        log("[Render] No video file for story #{story.story_number}, skipping user video segment")
      end
    end

    # Closing segment (before closing bumper)
    if closing_inputs[:tts]
      update_progress(66, "Rendering closing segment")
      closing_seg = render_closing_segment(closing_inputs)
      log_segment_duration(closing_seg, "closing")
      segment_paths << { path: closing_seg, type: :studio }
    end

    # Closing bumper
    if bumper_path
      outro_seg = render_bumper_segment(bumper_path, "closing")
      log_segment_duration(outro_seg, "closing bumper")
      segment_paths << { path: outro_seg, type: :bumper }
    end

    # Phase 2: Concat all segments
    log("[Render] Total segments to concat: #{segment_paths.count}")
    update_progress(70, "Concatenating segments")
    concat_path = concat_segments(segment_paths.map { |s| s[:path] })
    log("[Render] Concat output: #{(File.size(concat_path) / 1e6).round(2)} MB")

    # Phase 2b: Mix background music
    update_progress(80, "Mixing background music")
    final_path = mix_background_music(concat_path, segment_paths)
    log("[Render] Final video: #{(File.size(final_path) / 1e6).round(2)} MB")

    # Phase 3: Upload to CF Stream
    update_progress(90, "Uploading to Cloudflare Stream")
    video_uid = upload_to_stream(final_path)

    update_progress(100, "Done")

    { video_uid: video_uid, log: collected_log }
  ensure
    cleanup
  end

  private

  def update_progress(pct, step)
    @on_progress&.call(pct, step)
    log("[Render] #{pct}% — #{step}")
  end

  def log(msg)
    Rails.logger.info(msg)
    @log_lines << "#{Time.current.strftime('%H:%M:%S')} #{msg}"
  end

  def collected_log
    @log_lines.last(200).join("\n")
  end

  # ── Download helpers ──────────────────────────

  def download_bumper
    # Try CF Stream download first, fall back to local file
    bumper_uid = ENV["CLOUDFLARE_BUMPER_UID"]
    customer_code = Rails.configuration.x.cloudflare.customer_code

    # Use cached bumper if fresh
    if File.exist?(BUMPER_CACHE_PATH) && File.mtime(BUMPER_CACHE_PATH) > BUMPER_CACHE_MAX_AGE.ago
      log("[Render] Using cached bumper")
      return BUMPER_CACHE_PATH
    end

    if bumper_uid.present? && customer_code.present?
      begin
        download_url = "https://customer-#{customer_code}.cloudflarestream.com/#{bumper_uid}/downloads/default.mp4"
        FileUtils.mkdir_p(File.dirname(BUMPER_CACHE_PATH))
        dest = BUMPER_CACHE_PATH

        log("[Render] Downloading bumper from CF Stream...")
        conn = Faraday.new { |f| f.options.timeout = 60 }
        response = conn.get(download_url)

        if response.status == 200
          File.binwrite(dest, response.body)
          log("[Render] Bumper downloaded (#{(File.size(dest) / 1e6).round(1)} MB)")
          return dest
        end
      rescue => e
        log("[Render] Bumper download failed: #{e.message}")
      end
    end

    # Fall back to local file
    local = Rails.root.join("public", "MENNintroBlank.mp4").to_s
    if File.exist?(local)
      log("[Render] Using local bumper")
      return local
    end

    log("[Render] No bumper available — tried CF Stream UID=#{bumper_uid.inspect}, local=#{local}")
    nil
  end

  def download_story_inputs(stories)
    inputs = {}
    stories.each do |story|
      story_dir = File.join(@work_dir, "story_#{story.id}")
      FileUtils.mkdir_p(story_dir)

      data = { video: nil, tts: nil, poster: nil }

      # Download user video from R2
      if story.r2_video_key.present?
        begin
          video_path = File.join(story_dir, "video#{File.extname(story.original_filename || '.mp4')}")
          @r2.download(story.r2_video_key, video_path)
          data[:video] = video_path if File.exist?(video_path) && File.size(video_path) > 0
        rescue => e
          log("[Render] R2 video download failed for story #{story.id}: #{e.message}")
        end
      elsif story.temp_file_path.present? && File.exist?(story.temp_file_path)
        data[:video] = story.temp_file_path
      end

      # Download TTS from R2
      if story.r2_tts_key.present?
        begin
          tts_path = File.join(story_dir, "tts.wav")
          @r2.download(story.r2_tts_key, tts_path)
          data[:tts] = tts_path if File.exist?(tts_path) && File.size(tts_path) > 0
        rescue => e
          log("[Render] R2 TTS download failed for story #{story.id}: #{e.message}")
        end
      elsif story.tts_audio.attached?
        tts_path = File.join(story_dir, "tts.wav")
        File.binwrite(tts_path, story.tts_audio.download)
        data[:tts] = tts_path
      end

      # Download poster from R2
      if story.r2_poster_key.present?
        begin
          poster_path = File.join(story_dir, "poster.jpg")
          @r2.download(story.r2_poster_key, poster_path)
          data[:poster] = poster_path if File.exist?(poster_path) && File.size(poster_path) > 0
        rescue => e
          log("[Render] R2 poster download failed for story #{story.id}: #{e.message}")
        end
      end

      inputs[story.id] = data
    end
    inputs
  end

  def download_weather_inputs
    data = { tts: nil }
    weather_dir = File.join(@work_dir, "weather")
    FileUtils.mkdir_p(weather_dir)

    if bulletin.weather_tts_audio.attached?
      tts_path = File.join(weather_dir, "weather_tts.wav")
      File.binwrite(tts_path, bulletin.weather_tts_audio.download)
      data[:tts] = tts_path
    end

    data
  end

  def download_welcome_inputs
    data = { tts: nil }
    if bulletin.welcome_tts_audio.attached?
      welcome_dir = File.join(@work_dir, "welcome")
      FileUtils.mkdir_p(welcome_dir)
      tts_path = File.join(welcome_dir, "welcome_tts.wav")
      File.binwrite(tts_path, bulletin.welcome_tts_audio.download)
      data[:tts] = tts_path
    end
    data
  end

  def download_closing_inputs
    data = { tts: nil }
    if bulletin.closing_tts_audio.attached?
      closing_dir = File.join(@work_dir, "closing")
      FileUtils.mkdir_p(closing_dir)
      tts_path = File.join(closing_dir, "closing_tts.wav")
      File.binwrite(tts_path, bulletin.closing_tts_audio.download)
      data[:tts] = tts_path
    end
    data
  end

  # ── Segment rendering ────────────────────────

  def render_bumper_segment(bumper_path, label)
    output = File.join(@work_dir, "bumper_#{label}.mp4")

    # Re-encode bumper to match our format, strip audio (silent), ensure audio track
    cmd = [
      "ffmpeg -y -i #{esc(bumper_path)}",
      SILENT_AUDIO,
      "-map 0:v:0 -map 1:a:0",
      "-t 10",  # Cap bumper at 10s
      "-vf 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,fps=#{FPS}'",
      "-r #{FPS}",
      VIDEO_CODEC,
      "-shortest",
      AUDIO_CODEC,
      esc(output)
    ].join(" ")

    @ffmpeg.run(cmd, label: "bumper_#{label}")
    output
  end

  def render_studio_segment(story, inputs, studio_bg)
    story_dir = File.join(@work_dir, "story_#{story.id}")
    output = File.join(story_dir, "studio_intro.mp4")
    headline = story.gemini_json&.dig("studioHeadline") || story.story_title&.upcase

    if File.exist?(ANCHOR_VIDEO_PATH)
      # Anchor video background with transparent overlay
      overlay_path = File.join(story_dir, "overlay.png")
      @frame_gen.story_overlay(output: overlay_path)

      if inputs[:tts]
        tts_duration = @ffmpeg.probe_duration(inputs[:tts])

        cmd = [
          "ffmpeg -y",
          "-stream_loop -1 -i #{esc(ANCHOR_VIDEO_PATH)}",
          "-loop 1 -framerate #{FPS} -i #{esc(overlay_path)}",
          "-i #{esc(inputs[:tts])}",
          "-filter_complex '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,fps=#{FPS}[bg];[bg][1:v]overlay=0:0[out]'",
          "-map [out] -map 2:a:0",
          "-t #{tts_duration.round(2)}",
          "-r #{FPS}",
          VIDEO_CODEC,
          AUDIO_CODEC,
          esc(output)
        ].join(" ")
      else
        cmd = [
          "ffmpeg -y",
          "-stream_loop -1 -i #{esc(ANCHOR_VIDEO_PATH)}",
          "-loop 1 -framerate #{FPS} -i #{esc(overlay_path)}",
          SILENT_AUDIO,
          "-filter_complex '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,fps=#{FPS}[bg];[bg][1:v]overlay=0:0[out]'",
          "-map [out] -map 2:a:0",
          "-t 5",
          "-r #{FPS}",
          VIDEO_CODEC,
          AUDIO_CODEC,
          esc(output)
        ].join(" ")
      end
    else
      # Fallback: static frame (original behaviour)
      frame_path = File.join(story_dir, "frame.png")
      @frame_gen.story_frame(
        background: studio_bg,
        poster: inputs[:poster],
        emoji: story.story_emoji,
        headline: headline,
        output: frame_path
      )

      if inputs[:tts]
        tts_duration = @ffmpeg.probe_duration(inputs[:tts])

        cmd = [
          "ffmpeg -y",
          "-loop 1 -framerate #{FPS} -i #{esc(frame_path)}",
          "-i #{esc(inputs[:tts])}",
          "-vf scale=1080:1920,fps=#{FPS}",
          "-t #{tts_duration.round(2)}",
          "-r #{FPS}",
          VIDEO_CODEC,
          AUDIO_CODEC,
          esc(output)
        ].join(" ")
      else
        cmd = [
          "ffmpeg -y",
          "-loop 1 -framerate #{FPS} -t 5 -i #{esc(frame_path)}",
          SILENT_AUDIO,
          "-vf scale=1080:1920,fps=#{FPS}",
          "-r #{FPS}",
          VIDEO_CODEC,
          AUDIO_CODEC,
          "-t 5 -shortest",
          esc(output)
        ].join(" ")
      end
    end

    @ffmpeg.run(cmd, label: "studio_story_#{story.story_number}")
    output
  end

  def render_user_video_segment(video_path, story)
    story_dir = File.join(@work_dir, "story_#{story.id}")
    output = File.join(story_dir, "user_video.mp4")
    headline = story.gemini_json&.dig("studioHeadline") || story.story_title&.upcase

    # Generate info bar overlay PNG
    overlay_path = File.join(story_dir, "user_overlay.png")
    @frame_gen.user_video_overlay(headline: headline, output: overlay_path)

    # Scale/pad to 1080x1920, composite info bar overlay, force 30fps CFR, keep original audio
    cmd = [
      "ffmpeg -y -i #{esc(video_path)}",
      "-loop 1 -framerate #{FPS} -i #{esc(overlay_path)}",
      "-filter_complex '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,fps=#{FPS}[bg];[bg][1:v]overlay=0:0[out]'",
      "-map [out] -map 0:a:0?",
      "-sn -dn",
      "-r #{FPS}",
      VIDEO_CODEC,
      AUDIO_CODEC,
      "-shortest",
      esc(output)
    ].join(" ")

    @ffmpeg.run(cmd, label: "user_video_story_#{story.story_number}")

    # Verify it has an audio track, if not add silent
    probe_cmd = "ffprobe -v quiet -select_streams a -show_entries stream=codec_type -of csv=p=0 #{esc(output)}"
    result = @ffmpeg.run(probe_cmd, label: "check_audio_story_#{story.story_number}")
    if result[:stdout].strip.empty?
      output_with_audio = File.join(story_dir, "user_video_audio.mp4")
      cmd2 = [
        "ffmpeg -y -i #{esc(output)}",
        SILENT_AUDIO,
        "-map 0:v:0 -map 1:a:0",
        "-c:v copy",
        AUDIO_CODEC,
        "-shortest",
        esc(output_with_audio)
      ].join(" ")
      @ffmpeg.run(cmd2, label: "add_silent_audio_story_#{story.story_number}")
      FileUtils.mv(output_with_audio, output)
    end

    output
  end

  def render_weather_segment(weather_inputs, studio_bg)
    weather_dir = File.join(@work_dir, "weather")
    output = File.join(weather_dir, "weather_segment.mp4")
    frame_path = File.join(weather_dir, "frame.png")

    @frame_gen.weather_frame(
      background: studio_bg,
      weather_data: bulletin.weather_json,
      output: frame_path
    )

    tts_duration = @ffmpeg.probe_duration(weather_inputs[:tts])

    cmd = [
      "ffmpeg -y",
      "-loop 1 -framerate #{FPS} -i #{esc(frame_path)}",
      "-i #{esc(weather_inputs[:tts])}",
      "-vf scale=1080:1920,fps=#{FPS}",
      "-t #{tts_duration.round(2)}",
      "-r #{FPS}",
      VIDEO_CODEC,
      AUDIO_CODEC,
      esc(output)
    ].join(" ")

    @ffmpeg.run(cmd, label: "weather_segment")
    output
  end

  def render_welcome_segment(welcome_inputs)
    welcome_dir = File.join(@work_dir, "welcome")
    FileUtils.mkdir_p(welcome_dir)
    output = File.join(welcome_dir, "welcome_segment.mp4")

    overlay_path = File.join(welcome_dir, "overlay.png")
    @frame_gen.story_overlay(output: overlay_path)

    tts_duration = @ffmpeg.probe_duration(welcome_inputs[:tts])

    cmd = [
      "ffmpeg -y",
      "-stream_loop -1 -i #{esc(ANCHOR_VIDEO_PATH)}",
      "-loop 1 -framerate #{FPS} -i #{esc(overlay_path)}",
      "-i #{esc(welcome_inputs[:tts])}",
      "-filter_complex '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,fps=#{FPS}[bg];[bg][1:v]overlay=0:0[out]'",
      "-map [out] -map 2:a:0",
      "-t #{tts_duration.round(2)}",
      "-r #{FPS}",
      VIDEO_CODEC,
      AUDIO_CODEC,
      esc(output)
    ].join(" ")

    @ffmpeg.run(cmd, label: "welcome_segment")
    output
  end

  def render_closing_segment(closing_inputs)
    closing_dir = File.join(@work_dir, "closing")
    FileUtils.mkdir_p(closing_dir)
    output = File.join(closing_dir, "closing_segment.mp4")

    overlay_path = File.join(closing_dir, "overlay.png")
    @frame_gen.story_overlay(output: overlay_path)

    tts_duration = @ffmpeg.probe_duration(closing_inputs[:tts])

    cmd = [
      "ffmpeg -y",
      "-stream_loop -1 -i #{esc(ANCHOR_VIDEO_PATH)}",
      "-loop 1 -framerate #{FPS} -i #{esc(overlay_path)}",
      "-i #{esc(closing_inputs[:tts])}",
      "-filter_complex '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,fps=#{FPS}[bg];[bg][1:v]overlay=0:0[out]'",
      "-map [out] -map 2:a:0",
      "-t #{tts_duration.round(2)}",
      "-r #{FPS}",
      VIDEO_CODEC,
      AUDIO_CODEC,
      esc(output)
    ].join(" ")

    @ffmpeg.run(cmd, label: "closing_segment")
    output
  end

  # ── Concat ─────────────────────────────────────

  def concat_segments(paths)
    concat_list = File.join(@work_dir, "concat.txt")
    # FFmpeg concat demuxer requires: file 'path'
    File.write(concat_list, paths.map { |p| "file '#{p}'" }.join("\n"))

    output = File.join(@work_dir, "concat.mp4")
    cmd = "ffmpeg -y -f concat -safe 0 -i #{esc(concat_list)} -c copy #{esc(output)}"
    @ffmpeg.run(cmd, label: "concat")
    output
  end

  # ── Background music mix ───────────────────────

  def mix_background_music(concat_path, segment_infos)
    unless File.exist?(BG_MUSIC_PATH)
      log("[Render] No background music file, skipping mix")
      return concat_path
    end

    output = File.join(@work_dir, "final.mp4")

    # Calculate segment durations and build volume automation
    volume_expr = build_volume_filter(segment_infos)

    # Write filter graph to a temp file to avoid shell-escaping issues
    filter_file = File.join(@work_dir, "music_filter.txt")
    File.write(filter_file, "#{volume_expr}[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[aout]")

    cmd = [
      "ffmpeg -y",
      "-i #{esc(concat_path)}",
      "-stream_loop -1 -i #{esc(BG_MUSIC_PATH)}",
      "-filter_complex_script #{esc(filter_file)}",
      "-map 0:v:0 -map [aout]",
      "-c:v copy",
      AUDIO_CODEC,
      esc(output)
    ].join(" ")

    @ffmpeg.run(cmd, label: "music_mix")
    output
  end

  def build_volume_filter(segment_infos)
    # Probe each segment duration to build time ranges
    ranges = []
    current_time = 0.0

    segment_infos.each do |seg|
      duration = @ffmpeg.probe_duration(seg[:path])
      ranges << { start: current_time.round(2), finish: (current_time + duration).round(2), type: seg[:type] }
      current_time += duration
    end

    log("[Render] Music volume ranges: #{ranges.map { |r| "#{r[:start]}-#{r[:finish]}s=#{r[:type]}" }.join(', ')}")

    # Chained volume filters with enable timeline:
    # Base level: 0.18 (studio level for entire track)
    # User video segments: multiply by 0 → mute (0.18 * 0 = 0)
    # Bumper segments: multiply by 5.5556 → full volume (0.18 * 5.5556 ≈ 1.0)
    # Studio segments: no extra filter needed — base 0.18 applies
    filters = [ "volume=0.18" ]

    ranges.each do |r|
      case r[:type]
      when :user_video
        filters << "volume=volume=0:enable='between(t,#{r[:start]},#{r[:finish]})'"
      when :bumper
        filters << "volume=volume=5.5556:enable='between(t,#{r[:start]},#{r[:finish]})'"
      end
    end

    chain = filters.join(",")
    log("[Render] Volume filter chain: #{chain}")

    "[1:a]#{chain}"
  end

  # ── Upload to CF Stream ────────────────────────

  def upload_to_stream(file_path)
    unless @cf_stream.configured?
      log("[Render] CF Stream not configured, skipping upload")
      return nil
    end

    result = @cf_stream.upload_video(
      file_path,
      filename: "bulletin_#{bulletin.id}.mp4",
      content_type: "video/mp4"
    )
    uid = result[:uid]
    log("[Render] Uploaded to CF Stream: #{uid}")

    # Poll until ready (max 10 min)
    120.times do
      break if @cf_stream.video_ready?(uid)
      sleep 5
    end

    begin
      @cf_stream.enable_downloads(uid)
    rescue => e
      log("[Render] Enable downloads failed (non-fatal): #{e.message}")
    end

    uid
  end

  # ── Cleanup ────────────────────────────────────

  def cleanup
    if @work_dir && Dir.exist?(@work_dir)
      FileUtils.rm_rf(@work_dir)
      log("[Render] Cleaned up work dir")
    end
  rescue => e
    Rails.logger.warn("[Render] Cleanup failed: #{e.message}")
  end

  def log_segment_duration(path, label)
    dur = @ffmpeg.probe_duration(path)
    log("[Render] #{label} duration: #{dur.round(2)}s")
    dur
  end

  def esc(path)
    Shellwords.escape(path)
  end
end
