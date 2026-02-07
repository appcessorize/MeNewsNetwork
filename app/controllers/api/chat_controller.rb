module Api
  class ChatController < BaseController
    before_action :require_gemini_key!

    IMAGE_TYPES = %w[image/jpeg image/png image/gif image/webp image/heic image/heif].freeze
    VIDEO_TYPES = %w[video/mp4 video/quicktime video/webm video/x-msvideo video/mpeg].freeze
    AUDIO_TYPES = %w[audio/webm audio/ogg audio/mp4 audio/mpeg audio/wav].freeze
    MAX_FILE_SIZE = 200.megabytes

    ANALYSIS_PROMPT = <<~PROMPT.freeze
      You are a journalist's assistant helping a citizen reporter. Analyze this %{media_type} and provide:
      1. A brief, conversational description of what you see/hear (2-3 sentences)
      2. Key details you notice (people, location, objects, events, mood)
      3. Two specific follow-up questions a journalist should ask the source

      Return valid JSON:
      {
        "description": "...",
        "key_details": ["detail1", "detail2"],
        "follow_up_questions": ["question1", "question2"]
      }
    PROMPT

    GENERATE_PROMPT = <<~PROMPT.freeze
      You are writing a news item for a friend group's fun evening news broadcast.
      Using the analysis and journalist's notes below, write an engaging news item.
      Keep it fun and friendly — this is for close friends, not the BBC.

      Include a catchy headline and 2-3 short paragraphs.

      Return valid JSON:
      {
        "headline": "...",
        "body": "..."
      }

      === ANALYSIS ===
      %{analysis}

      === JOURNALIST NOTES ===
      Who: %{who}
      When: %{when_answer}
      Where: %{where_answer}
      Context: %{context}
      %{extra_notes}
    PROMPT

    # POST /api/chat/analyze
    def analyze
      file = params[:media]
      media_type = params[:media_type] || detect_media_type(file)

      unless file
        return render json: { ok: false, error: "No media file provided." }, status: :bad_request
      end

      if file.size > MAX_FILE_SIZE
        return render json: { ok: false, error: "File too large (max 200MB)." }, status: :bad_request
      end

      mime = file.content_type
      unless (IMAGE_TYPES + VIDEO_TYPES + AUDIO_TYPES).include?(mime)
        return render json: { ok: false, error: "Unsupported file type: #{mime}" }, status: :bad_request
      end

      generator = Gemini::ContentGenerator.new
      prompt = format(ANALYSIS_PROMPT, media_type: media_type)
      session_id = SecureRandom.uuid

      if IMAGE_TYPES.include?(mime)
        # Inline base64 for images (faster, no File API upload)
        data = Base64.strict_encode64(file.read)
        result = generator.generate_with_inline_data(
          data: data, mime_type: mime, prompt: prompt,
          temperature: 0.3, json_response: true
        )
      else
        # File API upload for video/audio
        file_manager = Gemini::FileManager.new
        gemini_file = file_manager.upload_and_wait(
          file.tempfile.path, mime_type: mime, display_name: file.original_filename
        )

        result = generator.generate_with_file(
          file_uri: gemini_file[:uri], file_mime_type: gemini_file[:mimeType],
          prompt: prompt, temperature: 0.3, json_response: true
        )

        # Store session for follow-up queries
        session_store.set(session_id, {
          gemini_file_name: gemini_file[:name],
          gemini_file_uri: gemini_file[:uri],
          gemini_file_mime_type: gemini_file[:mimeType]
        })
      end

      parsed = JSON.parse(result[:text], symbolize_names: true)

      render json: {
        ok: true,
        analysis: parsed[:description],
        key_details: parsed[:key_details] || [],
        follow_up_questions: parsed[:follow_up_questions] || [],
        session_id: session_id
      }
    rescue JSON::ParserError
      render json: {
        ok: true,
        analysis: result[:text],
        key_details: [],
        follow_up_questions: [],
        session_id: session_id
      }
    rescue => e
      Rails.logger.error("[chat/analyze] #{e.message}")
      render json: { ok: false, error: "Analysis failed: #{e.message}" }, status: :bad_gateway
    end

    # POST /api/chat/followup
    def followup
      session_id = params[:session_id]
      question = params[:question]
      context = params[:context] || ""

      session_data = session_store.get(session_id)
      unless session_data
        return render json: { ok: false, error: "Session expired or not found." }, status: :not_found
      end

      generator = Gemini::ContentGenerator.new
      full_question = "Context from previous conversation:\n#{context}\n\nNew question: #{question}"

      result = generator.query_file(
        file_uri: session_data[:gemini_file_uri],
        file_mime_type: session_data[:gemini_file_mime_type],
        question: full_question
      )

      render json: { ok: true, answer: result[:text] }
    rescue => e
      Rails.logger.error("[chat/followup] #{e.message}")
      render json: { ok: false, error: "Follow-up failed: #{e.message}" }, status: :bad_gateway
    end

    # POST /api/chat/generate
    def generate
      analysis = params[:analysis] || ""
      answers = params[:answers] || {}
      media_type = params[:media_type] || "text"

      extra_notes = answers.select { |k, _| k.to_s.start_with?("followup_") }
                          .map { |k, v| "Additional: #{v}" }
                          .join("\n")

      prompt = format(GENERATE_PROMPT,
        analysis: analysis,
        who: answers[:who] || "Not specified",
        when_answer: answers[:when] || "Not specified",
        where_answer: answers[:where] || "Not specified",
        context: answers[:context] || "Not specified",
        extra_notes: extra_notes
      )

      generator = Gemini::ContentGenerator.new
      result = generator.generate_json(prompt, temperature: 0.6)
      parsed = result[:parsed]

      headline = parsed[:headline] || "Untitled Story"
      body = parsed[:body] || ""

      # Create the Story record
      story = current_user.stories.create!(
        title: headline,
        body: body,
        story_type: media_type,
        analysis: analysis
      )

      render json: {
        ok: true,
        story_id: story.id,
        headline: headline,
        news_text: body
      }
    rescue => e
      Rails.logger.error("[chat/generate] #{e.message}")
      render json: { ok: false, error: "Generation failed: #{e.message}" }, status: :bad_gateway
    end

    private

    def detect_media_type(file)
      return "unknown" unless file

      mime = file.content_type
      if IMAGE_TYPES.include?(mime)
        "image"
      elsif VIDEO_TYPES.include?(mime)
        "video"
      elsif AUDIO_TYPES.include?(mime)
        "audio"
      else
        "file"
      end
    end

    def current_user
      @current_user ||= User.find_by(id: session[:user_id])
    end
  end
end
