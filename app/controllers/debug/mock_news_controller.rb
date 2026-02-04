module Debug
  class MockNewsController < ApplicationController
    before_action :require_login!
    before_action :require_admin!
    skip_forgery_protection only: [
      :create_bulletin, :fetch_weather, :analyze, :build
    ]

    ADMIN_EMAIL = DebugController::ADMIN_EMAIL
    MAX_FILE_SIZE = 200.megabytes
    ALLOWED_TYPES = %w[video/mp4 video/quicktime video/webm video/x-msvideo video/mpeg].freeze

    # GET /debug/mock_news
    def show
    end

    # POST /debug/mock_news/bulletins
    def create_bulletin
      videos = Array(params[:videos])
      contexts = Array(params[:user_context])

      if videos.empty?
        return render json: { ok: false, error: "No videos uploaded" }, status: :bad_request
      end

      videos.each_with_index do |video, i|
        unless ALLOWED_TYPES.include?(video.content_type)
          return render json: {
            ok: false,
            error: "Video #{i + 1}: unsupported type #{video.content_type}"
          }, status: :bad_request
        end
        if video.size > MAX_FILE_SIZE
          return render json: {
            ok: false,
            error: "Video #{i + 1}: exceeds 200MB limit"
          }, status: :bad_request
        end
      end

      bulletin = DebugBulletin.create!(status: "draft")

      videos.each_with_index do |video, i|
        story = bulletin.debug_stories.create!(
          story_number: i + 1,
          story_type: "video",
          user_context: contexts[i].presence,
          status: "pending"
        )
        story.media.attach(video)
      end

      Rails.logger.info("[debug_news] Created bulletin ##{bulletin.id} with #{videos.length} stories")

      render json: {
        ok: true,
        bulletin_id: bulletin.id,
        story_count: bulletin.debug_stories.count
      }
    rescue => e
      Rails.logger.error("[debug_news] Create bulletin failed: #{e.message}")
      render json: { ok: false, error: e.message }, status: :internal_server_error
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

    # POST /debug/mock_news/bulletins/:id/analyze
    def analyze
      bulletin = DebugBulletin.find(params[:id])
      pending_stories = bulletin.debug_stories.where(status: %w[pending failed])

      if pending_stories.none?
        return render json: { ok: false, error: "No stories to analyze" }, status: :unprocessable_entity
      end

      bulletin.update!(status: "analyzing")

      # Reset failed stories back to pending
      pending_stories.where(status: "failed").update_all(status: "pending", error_message: nil)

      pending_stories.each do |story|
        AnalyzeDebugStoryJob.perform_later(story.id)
      end

      Rails.logger.info("[debug_news] Enqueued #{pending_stories.count} analysis jobs for bulletin ##{bulletin.id}")

      render json: {
        ok: true,
        bulletin_id: bulletin.id,
        jobs_enqueued: pending_stories.count
      }
    rescue => e
      Rails.logger.error("[debug_news] Analyze failed: #{e.message}")
      render json: { ok: false, error: e.message }, status: :internal_server_error
    end

    # GET /debug/mock_news/bulletins/:id/status
    def status
      bulletin = DebugBulletin.find(params[:id])

      stories = bulletin.debug_stories.order(:story_number).map do |s|
        {
          id: s.id,
          story_number: s.story_number,
          filename: s.media.attached? ? s.media.filename.to_s : nil,
          status: s.status,
          story_title: s.story_title,
          story_emoji: s.story_emoji,
          error_message: s.error_message
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

    def assemble_master_json(bulletin)
      stories_data = bulletin.debug_stories.where(status: "done").order(:story_number).map do |story|
        video_url = if story.media.attached?
          Rails.application.routes.url_helpers.rails_blob_path(story.media, only_path: true)
        end

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
          ttsUrl: nil
        }
      end

      weather = bulletin.weather_json || {}

      {
        bulletinId: bulletin.id,
        createdAt: bulletin.created_at&.iso8601,
        location: bulletin.location,
        assets: {
          bumperUrl: "/MENNintroBlank.mp4",
          studioBgUrl: "/newsBgEdited.jpeg"
        },
        weather: {
          raw: weather["raw"] || weather[:raw],
          report: weather["report"] || weather[:report],
          narration: weather["narration"] || weather[:narration],
          ttsUrl: nil
        },
        stories: stories_data,
        ttsEnabled: false
      }
    end
  end
end
