module Debug
  class MockNewsController < ApplicationController
    before_action :require_login!
    before_action :require_admin!
    skip_forgery_protection only: [
      :create_bulletin, :fetch_weather, :analyze_story, :serve_video, :build
    ]

    ADMIN_EMAIL = DebugController::ADMIN_EMAIL
    MAX_FILE_SIZE = 200.megabytes
    ALLOWED_TYPES = %w[video/mp4 video/quicktime video/webm video/x-msvideo video/mpeg].freeze
    STAGING_DIR = Rails.root.join("tmp", "debug_videos")

    # GET /debug/mock_news
    def show
    end

    # POST /debug/mock_news/bulletins
    # Lightweight — no files, just creates the bulletin shell
    def create_bulletin
      bulletin = DebugBulletin.create!(status: "draft")

      Rails.logger.info("[debug_news] Created bulletin ##{bulletin.id}")

      render json: { ok: true, bulletin_id: bulletin.id }
    rescue => e
      Rails.logger.error("[debug_news] Create bulletin failed: #{e.message}")
      render json: { ok: false, error: e.message }, status: :internal_server_error
    end

    # POST /debug/mock_news/bulletins/:id/stories
    # Receives ONE video, stages it, enqueues background analysis job, returns immediately
    def analyze_story
      bulletin = DebugBulletin.find(params[:id])

      video = params[:video]
      unless video.present? && video.respond_to?(:tempfile)
        return render json: { ok: false, error: "No video file provided" }, status: :bad_request
      end

      unless ALLOWED_TYPES.include?(video.content_type)
        return render json: { ok: false, error: "Unsupported video type: #{video.content_type}" }, status: :bad_request
      end

      if video.size > MAX_FILE_SIZE
        return render json: { ok: false, error: "Video exceeds 200MB limit" }, status: :bad_request
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

      # Copy tempfile to staging dir (tempfile is deleted after request ends)
      FileUtils.mkdir_p(STAGING_DIR)
      staging_path = STAGING_DIR.join("story_#{story.id}#{File.extname(video.original_filename)}")
      FileUtils.cp(video.tempfile.path, staging_path)
      story.update!(temp_file_path: staging_path.to_s)

      Rails.logger.info("[debug_news] Story ##{story.story_number} staged (#{(video.size / 1e6).round(1)} MB), enqueuing job")

      # Fire-and-forget: analysis + CF upload happens in background
      AnalyzeDebugStoryJob.perform_later(story.id)

      render json: {
        ok: true,
        story: {
          id: story.id,
          story_number: story.story_number,
          status: story.status
        }
      }, status: :accepted
    rescue => e
      Rails.logger.error("[debug_news] analyze_story failed: #{e.message}\n#{e.backtrace&.first(5)&.join("\n")}")
      story&.update(status: "failed", error_message: e.message) if story&.persisted?
      render json: { ok: false, error: e.message }, status: :internal_server_error
    end

    # GET /debug/mock_news/stories/:id/video
    # Stable video URL — serves from ActiveStorage or temp file fallback
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

      # Generate weather report via Gemini (reuse existing weather prompt)
      generator = Gemini::ContentGenerator.new
      weather_result = generator.generate_json(
        VideoAnalysis::PromptBuilder.weather_prompt(raw_weather),
        temperature: 0.5
      )

      # Generate weather narration via Gemini
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
          video_ready: s.cloudflare_stream_uid.present? || s.temp_file_path.present?
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

      unless bulletin.all_stories_done?
        pending = bulletin.debug_stories.where.not(status: %w[done failed]).count
        return render json: {
          ok: false,
          error: "#{pending} stories still analyzing. Wait for completion."
        }, status: :unprocessable_entity
      end

      if bulletin.any_story_failed?
        failed = bulletin.debug_stories.where(status: "failed").count
        Rails.logger.warn("[debug_news] Building bulletin with #{failed} failed stories")
      end

      # Generate weather TTS if narration text exists and not already generated
      weather_narration = bulletin.weather_json&.dig("narration", "weatherNarration") ||
                          bulletin.weather_json&.dig(:narration, :weatherNarration)
      if weather_narration.present? && !bulletin.weather_tts_audio.attached?
        begin
          Rails.logger.info("[debug_news] Generating weather TTS...")
          pcm = Gemini::TtsGenerator.new.generate(text: weather_narration, voice: "Orus")
          wav = Audio::WavBuilder.build(pcm)
          bulletin.weather_tts_audio.attach(
            io: StringIO.new(wav),
            filename: "weather_tts.wav",
            content_type: "audio/wav"
          )
          Rails.logger.info("[debug_news] Weather TTS audio attached")
        rescue => e
          Rails.logger.warn("[debug_news] Weather TTS generation failed (non-fatal): #{e.message}")
        end
      end

      master = assemble_master_json(bulletin)
      bulletin.update!(master_json: master, status: "ready")

      Rails.logger.info("[debug_news] Bulletin ##{bulletin.id} built with #{master[:stories].length} stories")

      render json: { ok: true, master: master }
    rescue => e
      Rails.logger.error("[debug_news] Build failed: #{e.message}")
      render json: { ok: false, error: e.message }, status: :internal_server_error
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

    def bumper_url(customer_code)
      bumper_uid = ENV["CLOUDFLARE_BUMPER_UID"]
      if bumper_uid.present? && customer_code.present?
        "https://customer-#{customer_code}.cloudflarestream.com/#{bumper_uid}/iframe?controls=false&letterboxColor=000000&autoplay=true&muted=true&preload=auto"
      else
        "/MENNintroBlank.mp4"
      end
    end

    def assemble_master_json(bulletin)
      customer_code = Rails.configuration.x.cloudflare.customer_code

      stories_data = bulletin.debug_stories.where(status: "done").order(:story_number).map do |story|
        uid = story.cloudflare_stream_uid
        video_url = if uid.present? && customer_code.present?
                      "https://customer-#{customer_code}.cloudflarestream.com/#{uid}/iframe?controls=false&letterboxColor=000000&preload=auto&muted=true"
                    else
                      "/debug/mock_news/stories/#{story.id}/video"
                    end

        poster_url = if uid.present? && customer_code.present?
                       "https://customer-#{customer_code}.cloudflarestream.com/#{uid}/thumbnails/thumbnail.jpg?time=1s&height=176&width=176&fit=crop"
                     end

        tts_url = story.tts_audio.attached? ? Rails.application.routes.url_helpers.rails_blob_path(story.tts_audio, only_path: true) : nil

        {
          storyId: story.id,
          storyNumber: story.story_number,
          storyType: story.story_type,
          storyTitle: story.story_title,
          storyEmoji: story.story_emoji,
          studioHeadline: story.gemini_json&.dig("studioHeadline") || story.story_title&.upcase,
          introText: story.intro_text,
          subtitleSegments: story.subtitle_segments,
          videoUrl: video_url,
          posterUrl: poster_url,
          ttsUrl: tts_url
        }
      end

      weather = bulletin.weather_json || {}
      weather_tts_url = bulletin.weather_tts_audio.attached? ? Rails.application.routes.url_helpers.rails_blob_path(bulletin.weather_tts_audio, only_path: true) : nil

      {
        bulletinId: bulletin.id,
        createdAt: bulletin.created_at&.iso8601,
        location: bulletin.location,
        assets: {
          bumperUrl: bumper_url(customer_code),
          studioBgUrl: "/newsBgEdited.jpeg"
        },
        weather: {
          raw: weather["raw"] || weather[:raw],
          report: weather["report"] || weather[:report],
          narration: weather["narration"] || weather[:narration],
          ttsUrl: weather_tts_url
        },
        stories: stories_data,
        ttsEnabled: true
      }
    end
  end
end
