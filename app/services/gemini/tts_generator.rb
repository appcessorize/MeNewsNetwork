module Gemini
  class TtsGenerator
    def initialize(api_key: Rails.configuration.x.gemini.api_key)
      @client = Gemini::Client.new(api_key: api_key)
      @api_key = api_key
    end

    def generate(text:, voice: "Kore", style: nil)
      prompt = if style.present?
        "#{style}: #{text}"
      else
        "Read the following in a professional, authoritative news anchor tone:\n\n#{text}"
      end

      model = Rails.configuration.x.gemini.tts_model
      url = "https://generativelanguage.googleapis.com/v1beta/models/#{model}:generateContent?key=#{@api_key}"

      body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice }
            }
          }
        }
      }

      conn = Faraday.new do |f|
        f.options.timeout = 120
        f.adapter Faraday.default_adapter
      end

      response = conn.post(url) do |req|
        req.headers["Content-Type"] = "application/json"
        req.body = body.to_json
      end

      result = JSON.parse(response.body, symbolize_names: true)
      audio_data = result.dig(:candidates, 0, :content, :parts, 0, :inlineData, :data)

      raise "No audio data in Gemini response" unless audio_data

      Base64.decode64(audio_data)
    end

    private

    attr_reader :api_key
  end
end
