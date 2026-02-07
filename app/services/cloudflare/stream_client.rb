module Cloudflare
  class StreamClient
    BASE_URL = "https://api.cloudflare.com/client/v4"

    def initialize(
      account_id: Rails.configuration.x.cloudflare.account_id,
      api_token: Rails.configuration.x.cloudflare.api_token
    )
      @account_id = account_id
      @api_token = api_token
      @conn = Faraday.new do |f|
        f.options.timeout = 30
        f.adapter Faraday.default_adapter
      end
    end

    def configured?
      @account_id.present? && @api_token.present?
    end

    def create_direct_upload(filename: "upload.mp4")
      body = {
        maxDurationSeconds: 60 * 20,
        allowedOrigins: [ "localhost:3000", "localhost", "127.0.0.1:3000", "127.0.0.1", "menews.network" ],
        requireSignedURLs: false,
        meta: { name: filename },
        expiry: (Time.now + 10.minutes).iso8601
      }

      response = @conn.post("#{BASE_URL}/accounts/#{@account_id}/stream/direct_upload") do |req|
        req.headers["Authorization"] = "Bearer #{@api_token}"
        req.headers["Content-Type"] = "application/json"
        req.body = body.to_json
      end

      result = JSON.parse(response.body, symbolize_names: true)
      raise "Cloudflare create-upload failed" unless result[:success]

      result[:result]
    end

    def get_video(uid)
      response = @conn.get("#{BASE_URL}/accounts/#{@account_id}/stream/#{uid}") do |req|
        req.headers["Authorization"] = "Bearer #{@api_token}"
      end

      result = JSON.parse(response.body, symbolize_names: true)
      raise "Cloudflare get video failed" unless result[:success]

      result[:result]
    end

    private

    attr_reader :account_id, :api_token, :conn
  end
end
