module Api
  class AnalyzeController < BaseController
    before_action :require_gemini_key!

    MAX_FILE_SIZE = 200.megabytes
    ALLOWED_TYPES = %w[video/mp4 video/quicktime video/webm video/x-msvideo video/mpeg].freeze

    def create
      validate_upload!
      return if performed?

      file = params[:video]
      file_path = file.tempfile.path
      mime_type = file.content_type
      original_name = file.original_filename

      Rails.logger.info("[upload] Received #{original_name} (#{mime_type}, #{(file.size / 1e6).round(1)} MB)")

      begin
        # 1. Upload to Gemini File API
        Rails.logger.info("[gemini] Uploading file via File API...")
        file_manager = Gemini::FileManager.new
        gemini_file = file_manager.upload_and_wait(file_path, mime_type: mime_type, display_name: original_name)

        # 2. Analyze video
        Rails.logger.info("[gemini] File is ACTIVE, starting analysis...")
        generator = Gemini::ContentGenerator.new
        analysis = generator.generate_with_file(
          file_uri: gemini_file[:uri],
          file_mime_type: gemini_file[:mimeType],
          prompt: VideoAnalysis::PromptBuilder.analysis_prompt,
          temperature: 0.2,
          json_response: true
        )

        # 3. Parse and validate segments
        parsed = JSON.parse(analysis[:text], symbolize_names: true)
        segments = parsed[:segments] || []
        segments = VideoAnalysis::SegmentValidator.validate(segments)
        segments = VideoAnalysis::SegmentMerger.merge(segments)

        segments_text = segments.map { |s| "#{s[:start]}-#{s[:end]}: [#{s[:tag]}] #{s[:text]}" }.join("\n")
        Rails.logger.info("[done] Returning #{segments.length} segments")

        # 4. Generate newsreader script
        Rails.logger.info("[gemini] Generating newsreader script...")
        script_result = generator.generate_with_file(
          file_uri: gemini_file[:uri],
          file_mime_type: gemini_file[:mimeType],
          prompt: VideoAnalysis::PromptBuilder.script_prompt(segments_text),
          temperature: 0.4
        )

        news_script = script_result[:text]
        Rails.logger.info("[gemini] Script generated")

        # 5. Combine usage
        usage = combine_usage(analysis[:usage], script_result[:usage])

        # 6. Store session for follow-up queries
        session_id = SecureRandom.uuid
        session_store.set(session_id, {
          gemini_file_name: gemini_file[:name],
          gemini_file_uri: gemini_file[:uri],
          gemini_file_mime_type: gemini_file[:mimeType]
        })
        Rails.logger.info("[session] Created session #{session_id}")

        render json: {
          ok: true,
          segmentsText: segments_text,
          segments: segments,
          newsScript: news_script,
          sessionId: session_id,
          usage: usage
        }
      rescue => e
        Rails.logger.error("[error] #{e.message}")
        render json: { ok: false, error: "Gemini analysis failed: #{e.message}" }, status: :bad_gateway
      end
    end

    private

    def validate_upload!
      file = params[:video]
      unless file
        render json: { ok: false, error: "No video file uploaded. Field name must be 'video'." }, status: :bad_request
        return
      end

      unless ALLOWED_TYPES.include?(file.content_type)
        render json: { ok: false, error: "Unsupported file type: #{file.content_type}" }, status: :bad_request
        return
      end

      if file.size > MAX_FILE_SIZE
        render json: { ok: false, error: "File too large (max 200MB)." }, status: :bad_request
      end
    end

    def combine_usage(analysis_usage, script_usage)
      {
        promptTokenCount: (analysis_usage[:promptTokenCount] || 0) + (script_usage[:promptTokenCount] || 0),
        candidatesTokenCount: (analysis_usage[:candidatesTokenCount] || 0) + (script_usage[:candidatesTokenCount] || 0),
        totalTokenCount: (analysis_usage[:totalTokenCount] || 0) + (script_usage[:totalTokenCount] || 0),
        segmentAnalysis: analysis_usage,
        scriptGeneration: script_usage
      }
    end
  end
end
