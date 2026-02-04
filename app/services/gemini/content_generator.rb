module Gemini
  class ContentGenerator
    def initialize(api_key: Rails.configuration.x.gemini.api_key)
      @client = Gemini::Client.new(api_key: api_key)
    end

    # Simple text generation
    def generate_text(prompt, model: Rails.configuration.x.gemini.model_name, temperature: nil)
      config = {}
      config[:temperature] = temperature if temperature

      result = @client.generate_content(
        model: model,
        contents: [{ parts: [{ text: prompt }] }],
        generation_config: config
      )

      extract_text(result)
    end

    # Generate with JSON response
    def generate_json(prompt, model: Rails.configuration.x.gemini.model_name, temperature: nil)
      config = { responseMimeType: "application/json" }
      config[:temperature] = temperature if temperature

      result = @client.generate_content(
        model: model,
        contents: [{ parts: [{ text: prompt }] }],
        generation_config: config
      )

      text = extract_text(result)
      usage = extract_usage(result)
      parsed = JSON.parse(text, symbolize_names: true)

      { parsed: parsed, usage: usage, raw: text }
    end

    # Generate with file reference (video analysis)
    def generate_with_file(file_uri:, file_mime_type:, prompt:, model: Rails.configuration.x.gemini.model_name, temperature: nil, json_response: false)
      config = {}
      config[:temperature] = temperature if temperature
      config[:responseMimeType] = "application/json" if json_response

      result = @client.generate_content(
        model: model,
        contents: [{
          parts: [
            { fileData: { mimeType: file_mime_type, fileUri: file_uri } },
            { text: prompt }
          ]
        }],
        generation_config: config
      )

      text = extract_text(result)
      usage = extract_usage(result)

      { text: text, usage: usage }
    end

    # Generate with file + question (follow-up queries)
    def query_file(file_uri:, file_mime_type:, question:, model: Rails.configuration.x.gemini.model_name, temperature: 0.3)
      generate_with_file(
        file_uri: file_uri,
        file_mime_type: file_mime_type,
        prompt: question,
        model: model,
        temperature: temperature
      )
    end

    private

    def extract_text(result)
      result.dig(:candidates, 0, :content, :parts, 0, :text) || ""
    end

    def extract_usage(result)
      result[:usageMetadata] || {}
    end
  end
end
