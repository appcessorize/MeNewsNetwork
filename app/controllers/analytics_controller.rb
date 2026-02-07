class AnalyticsController < ApplicationController
  UMAMI_HOST = "https://umamipod.pikapod.net".freeze

  # GET /a/script.js — proxy the Umami tracking script
  def script
    conn = Faraday.new(url: UMAMI_HOST) { |f| f.options.timeout = 10 }
    resp = conn.get("/script.js")

    if resp.success?
      # Rewrite the script to send events to our proxy endpoint instead
      body = resp.body.gsub(UMAMI_HOST, "")
      expires_in 1.hour, public: true
      render plain: body, content_type: "application/javascript"
    else
      head :bad_gateway
    end
  rescue Faraday::Error
    head :bad_gateway
  end

  # POST /a/event — proxy event data to Umami
  def event
    conn = Faraday.new(url: UMAMI_HOST) { |f| f.options.timeout = 10 }
    resp = conn.post("/api/send") do |req|
      req.headers["Content-Type"] = "application/json"
      req.headers["User-Agent"] = request.user_agent
      req.body = request.raw_post
    end

    head resp.status
  rescue Faraday::Error
    head :bad_gateway
  end
end
