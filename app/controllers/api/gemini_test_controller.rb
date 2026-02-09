module Api
  class GeminiTestController < BaseController
    before_action :require_gemini_key!

    def show
      Rails.logger.info("[test-gemini] Testing basic Gemini text call...")

      generator = Gemini::ContentGenerator.new
      result = generator.generate_text(
        "What is the weather typically like in London in January? Reply in one sentence.",
        model: "gemini-3-flash-preview"
      )

      Rails.logger.info("[test-gemini] Success: #{result}")
      render json: { ok: true, reply: result }
    end
  end
end
