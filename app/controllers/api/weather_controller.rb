module Api
  class WeatherController < BaseController
    before_action :require_gemini_key!

    def show
      Rails.logger.info("[weather] Fetching Open-Meteo data for London...")

      meteo = Weather::OpenMeteoClient.new.fetch
      Rails.logger.info("[weather] Got meteo data, current temp: #{meteo.dig(:current, :temperature_2m)}")

      prompt = VideoAnalysis::PromptBuilder.weather_prompt(meteo)
      generator = Gemini::ContentGenerator.new
      result = generator.generate_json(prompt, temperature: 0.5)

      render json: { ok: true, report: result[:parsed], usage: result[:usage] }
    end
  end
end
