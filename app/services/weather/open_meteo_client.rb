module Weather
  class OpenMeteoClient
    METEO_URL = "https://api.open-meteo.com/v1/forecast" \
      "?latitude=51.5074&longitude=-0.1278" \
      "&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m" \
      "&hourly=temperature_2m,weather_code" \
      "&forecast_days=3&timezone=Europe%2FLondon"

    def fetch
      conn = Faraday.new do |f|
        f.options.timeout = 15
        f.adapter Faraday.default_adapter
      end

      response = conn.get(METEO_URL)
      raise "Open-Meteo returned #{response.status}" unless response.success?

      JSON.parse(response.body, symbolize_names: true)
    end
  end
end
