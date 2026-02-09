module Debug
  class MockNewsController < ApplicationController
    before_action :require_login!
    before_action :require_admin!
    skip_forgery_protection only: [
      :create_bulletin, :fetch_weather, :analyze_story, :serve_video, :build,
      :start_render
    ]

    ADMIN_EMAIL = DebugController::ADMIN_EMAIL
    MAX_FILE_SIZE = 200.megabytes
    ALLOWED_TYPES = %w[video/mp4 video/quicktime video/webm video/x-msvideo video/mpeg].freeze
    STAGING_DIR = Rails.root.join("tmp", "debug_videos")

    # GET /debug/mock_news
    def show
    end

    # POST /debug/mock_news/bulletins
    def create_bulletin
      bulletin = DebugBulletin.create!(status: "draft")

      Rails.logger.info("[debug_news] Created bulletin ##{bulletin.id}")

      render json: { ok: true, bulletin_id: bulletin.id }
    rescue => e
      Rails.logger.error("[debug_news] Create bulletin failed: #{e.message}")
      render json: { ok: false, error: e.message }, status: :internal_server_error
    end

    # POST /debug/mock_news/bulletins/:id/stories
    # Receives ONE video, uploads to R2, enqueues background analysis job
    def analyze_story
      bulletin = DebugBulletin.find(params[:id])

      video = params[:video]
      Rails.logger.info("[debug_news] analyze_story called — bulletin=##{bulletin.id}, " \
        "video_present=#{video.present?}, " \
        "responds_to_tempfile=#{video.respond_to?(:tempfile) rescue 'N/A'}, " \
        "user_agent=#{request.user_agent&.first(120)}, " \
        "content_length=#{request.content_length}, " \
        "content_type_header=#{request.content_type}")

      unless video.present? && video.respond_to?(:tempfile)
        Rails.logger.warn("[debug_news] No video file in params. Param keys: #{params.keys.join(', ')}")
        return render json: { ok: false, error: "No video file provided" }, status: :bad_request
      end

      tempfile_size = video.tempfile.size rescue "unknown"
      Rails.logger.info("[debug_news] Video received: filename=#{video.original_filename.inspect}, " \
        "content_type=#{video.content_type.inspect}, " \
        "declared_size=#{video.size}, tempfile_size=#{tempfile_size}, " \
        "tempfile_path=#{video.tempfile.path rescue 'N/A'}")

      unless ALLOWED_TYPES.include?(video.content_type)
        return render json: { ok: false, error: "Unsupported video type: #{video.content_type}" }, status: :bad_request
      end

      if video.size > MAX_FILE_SIZE
        return render json: { ok: false, error: "Video exceeds 200MB limit (#{(video.size / 1e6).round(1)} MB)" }, status: :bad_request
      end

      # Check for zero-byte or suspiciously small files
      if tempfile_size.is_a?(Integer) && tempfile_size < 1000
        Rails.logger.warn("[debug_news] Suspiciously small tempfile: #{tempfile_size} bytes (declared #{video.size})")
        return render json: { ok: false, error: "Video file appears empty or corrupted (#{tempfile_size} bytes received)" }, status: :bad_request
      end

      story_number = (params[:story_number] || bulletin.debug_stories.count + 1).to_i
      user_context = params[:user_context].presence

      story = bulletin.debug_stories.create!(
        story_number: story_number,
        story_type: "video",
        user_context: user_context,
        status: "analyzing",
        original_filename: video.original_filename,
        content_type: video.content_type
      )
      Rails.logger.info("[debug_news] Created story record id=#{story.id}, story_number=#{story.story_number}")

      # Upload to R2 if configured, otherwise fall back to local staging
      r2 = Cloudflare::R2Client.new
      if r2.configured?
        r2_key = "stories/#{story.id}/video#{File.extname(video.original_filename)}"
        Rails.logger.info("[debug_news] Uploading to R2: key=#{r2_key}, size=#{(video.size / 1e6).round(1)} MB...")
        r2.upload(r2_key, video.tempfile.path, content_type: video.content_type)
        story.update!(r2_video_key: r2_key)
        Rails.logger.info("[debug_news] Story ##{story.story_number} uploaded to R2 successfully")
      else
        # Fallback: local staging (existing behavior)
        FileUtils.mkdir_p(STAGING_DIR)
        staging_path = STAGING_DIR.join("story_#{story.id}#{File.extname(video.original_filename)}")
        FileUtils.cp(video.tempfile.path, staging_path)
        story.update!(temp_file_path: staging_path.to_s)
        Rails.logger.info("[debug_news] Story ##{story.story_number} staged locally (#{(video.size / 1e6).round(1)} MB)")
      end

      AnalyzeDebugStoryJob.perform_later(story.id)
      Rails.logger.info("[debug_news] AnalyzeDebugStoryJob enqueued for story ##{story.id}")

      render json: {
        ok: true,
        story: {
          id: story.id,
          story_number: story.story_number,
          status: story.status
        }
      }, status: :accepted
    rescue => e
      Rails.logger.error("[debug_news] analyze_story FAILED: #{e.class}: #{e.message}\n#{e.backtrace&.first(8)&.join("\n")}")
      story&.update(status: "failed", error_message: e.message) if story&.persisted?
      render json: { ok: false, error: e.message }, status: :internal_server_error
    end

    # GET /debug/mock_news/stories/:id/video
    def serve_video
      story = DebugStory.find(params[:id])

      if story.media.attached?
        redirect_to Rails.application.routes.url_helpers.rails_blob_path(story.media, only_path: true), allow_other_host: false
      elsif story.temp_file_path.present? && File.exist?(story.temp_file_path)
        send_file story.temp_file_path,
                  type: story.content_type || "video/mp4",
                  disposition: "inline"
      else
        head :not_found
      end
    end

    # POST /debug/mock_news/bulletins/:id/weather
    def fetch_weather
      bulletin = DebugBulletin.find(params[:id])

      Rails.logger.info("[debug_news] Fetching weather for #{bulletin.location}...")
      raw_weather = Weather::OpenMeteoClient.new.fetch

      generator = Gemini::ContentGenerator.new
      weather_result = generator.generate_json(
        VideoAnalysis::PromptBuilder.weather_prompt(raw_weather),
        temperature: 0.5
      )

      narration_result = generator.generate_json(
        DebugNews::PromptBuilder.weather_narration_prompt(raw_weather),
        temperature: 0.5
      )

      combined = {
        raw: raw_weather,
        report: weather_result[:parsed],
        narration: narration_result[:parsed]
      }

      bulletin.update!(weather_json: combined)
      Rails.logger.info("[debug_news] Weather stored on bulletin ##{bulletin.id}")

      render json: { ok: true, weather: combined }
    rescue => e
      Rails.logger.error("[debug_news] Weather fetch failed: #{e.message}")
      render json: { ok: false, error: e.message }, status: :internal_server_error
    end

    # GET /debug/mock_news/bulletins/:id/status
    def status
      bulletin = DebugBulletin.find(params[:id])

      stories = bulletin.debug_stories.order(:story_number).map do |s|
        {
          id: s.id,
          story_number: s.story_number,
          status: s.status,
          story_title: s.story_title,
          story_emoji: s.story_emoji,
          intro_text: s.intro_text,
          error_message: s.error_message,
          video_ready: s.cloudflare_stream_uid.present? || s.r2_video_key.present? || s.temp_file_path.present?
        }
      end

      done_count = stories.count { |s| s[:status] == "done" }
      failed_count = stories.count { |s| s[:status] == "failed" }

      render json: {
        ok: true,
        bulletin_id: bulletin.id,
        bulletin_status: bulletin.status,
        stories_total: stories.length,
        stories_done: done_count,
        stories_failed: failed_count,
        stories: stories
      }
    end

    # POST /debug/mock_news/bulletins/:id/build
    def build
      bulletin = DebugBulletin.find(params[:id])

      master = BulletinBuilder.new(bulletin).build!

      render json: { ok: true, master: master }
    rescue => e
      Rails.logger.error("[debug_news] Build failed: #{e.message}")
      render json: { ok: false, error: e.message }, status: :internal_server_error
    end

    # POST /debug/mock_news/bulletins/:id/render
    def start_render
      bulletin = DebugBulletin.find(params[:id])

      unless bulletin.status == "ready"
        return render json: { ok: false, error: "Bulletin must be built first (status: #{bulletin.status})" },
                      status: :unprocessable_entity
      end

      if bulletin.render_in_progress?
        return render json: { ok: false, error: "Render already in progress" }, status: :conflict
      end

      bulletin.update!(render_status: "queued", render_progress: 0, render_step: "Queued", render_error: nil)
      RenderBulletinJob.perform_later(bulletin.id)

      Rails.logger.info("[debug_news] Render enqueued for bulletin ##{bulletin.id}")
      render json: { ok: true, render_status: "queued" }
    rescue => e
      Rails.logger.error("[debug_news] Start render failed: #{e.message}")
      render json: { ok: false, error: e.message }, status: :internal_server_error
    end

    # GET /debug/mock_news/bulletins/:id/render_status
    def render_status
      bulletin = DebugBulletin.find(params[:id])

      customer_code = Rails.configuration.x.cloudflare.customer_code
      video_url = nil
      if bulletin.rendered_video_uid.present? && customer_code.present?
        video_url = "https://customer-#{customer_code}.cloudflarestream.com/#{bulletin.rendered_video_uid}/manifest/video.m3u8"
      end

      render json: {
        ok: true,
        render_status: bulletin.render_status,
        render_progress: bulletin.render_progress || 0,
        render_step: bulletin.render_step,
        render_error: bulletin.render_error,
        rendered_video_uid: bulletin.rendered_video_uid,
        video_url: video_url
      }
    end

    # GET /debug/mock_news/bulletins/:id.json
    def show_bulletin
      bulletin = DebugBulletin.find(params[:id])

      unless bulletin.master_json.present?
        return render json: { ok: false, error: "Bulletin not built yet" }, status: :not_found
      end

      render json: { ok: true, master: bulletin.master_json }
    end

    private

    def require_admin!
      unless current_user&.email == ADMIN_EMAIL
        if request.format.json?
          render json: { ok: false, error: "Access denied." }, status: :forbidden
        else
          redirect_to newsroom_path, alert: "Access denied."
        end
      end
    end

  end
end
