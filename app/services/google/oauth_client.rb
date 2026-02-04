module Google
  class OauthClient
    AUTH_URI  = "https://accounts.google.com/o/oauth2/v2/auth"
    TOKEN_URI = "https://oauth2.googleapis.com/token"
    USERINFO_URI = "https://www.googleapis.com/oauth2/v3/userinfo"

    def initialize(
      client_id: Rails.configuration.x.google.client_id,
      client_secret: Rails.configuration.x.google.client_secret
    )
      @client_id = client_id
      @client_secret = client_secret
    end

    def configured?
      @client_id.present? && @client_secret.present?
    end

    # Build the URL to redirect the user to Google's consent screen
    def authorize_url(redirect_uri:, state: nil)
      params = {
        client_id: @client_id,
        redirect_uri: redirect_uri,
        response_type: "code",
        scope: "openid email profile",
        access_type: "online",
        prompt: "select_account"
      }
      params[:state] = state if state
      "#{AUTH_URI}?#{URI.encode_www_form(params)}"
    end

    # Exchange the authorization code for tokens
    def exchange_code(code:, redirect_uri:)
      conn = Faraday.new(url: TOKEN_URI)
      response = conn.post do |req|
        req.body = URI.encode_www_form(
          code: code,
          client_id: @client_id,
          client_secret: @client_secret,
          redirect_uri: redirect_uri,
          grant_type: "authorization_code"
        )
        req.headers["Content-Type"] = "application/x-www-form-urlencoded"
      end

      JSON.parse(response.body, symbolize_names: true)
    end

    # Fetch user profile using the access token
    def fetch_profile(access_token)
      conn = Faraday.new(url: USERINFO_URI)
      response = conn.get do |req|
        req.headers["Authorization"] = "Bearer #{access_token}"
      end

      JSON.parse(response.body, symbolize_names: true)
    end
  end
end
