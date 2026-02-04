module Api
  class QueryController < BaseController
    before_action :require_gemini_key!

    def create
      session_id = params[:sessionId]
      question = params[:question]

      unless session_id.present? && question.present?
        return render json: { ok: false, error: "Missing sessionId or question." }, status: :bad_request
      end

      session = session_store.get(session_id)
      unless session
        return render json: {
          ok: false,
          error: "Session expired or not found. Please re-upload the video."
        }, status: :not_found
      end

      Rails.logger.info("[query] Session #{session_id}: \"#{question}\"")

      generator = Gemini::ContentGenerator.new
      result = generator.query_file(
        file_uri: session[:gemini_file_uri],
        file_mime_type: session[:gemini_file_mime_type],
        question: question
      )

      Rails.logger.info("[query] Token usage: #{result[:usage]}")
      render json: { ok: true, answer: result[:text], usage: result[:usage] }
    end
  end
end
