module Gemini
  class Client
    BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
    UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta"

    def initialize(api_key: Rails.configuration.x.gemini.api_key)
      @api_key = api_key
      @conn = Faraday.new do |f|
        f.options.timeout = 300
        f.options.open_timeout = 30
        f.adapter Faraday.default_adapter
      end
    end

    def generate_content(model:, contents:, generation_config: {})
      url = "#{BASE_URL}/models/#{model}:generateContent?key=#{@api_key}"
      body = { contents: contents }
      body[:generationConfig] = generation_config if generation_config.any?

      response = @conn.post(url) do |req|
        req.headers["Content-Type"] = "application/json"
        req.body = body.to_json
      end

      unless response.success?
        Rails.logger.error("[gemini] API error: HTTP #{response.status} — #{response.body&.first(500)}")
        raise Gemini::ApiError.new(
          "Gemini API error: HTTP #{response.status}",
          step: "generate_content",
          http_status: response.status,
          response_body: response.body
        )
      end

      JSON.parse(response.body, symbolize_names: true)
    end

    private

    attr_reader :api_key, :conn
  end
end
