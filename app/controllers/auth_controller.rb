class AuthController < ApplicationController
  # GET /auth/google — redirect to Google's OAuth consent screen
  def google
    client = Google::OauthClient.new

    unless client.configured?
      redirect_to root_path, alert: "Google OAuth not configured."
      return
    end

    url = client.authorize_url(
      redirect_uri: auth_google_callback_url,
      state: form_authenticity_token
    )
    redirect_to url, allow_other_host: true
  end

  # GET /auth/google/callback — handle the OAuth callback
  def callback
    client = Google::OauthClient.new

    if params[:error].present?
      Rails.logger.warn("[auth] Google OAuth error: #{params[:error]}")
      redirect_to root_path, alert: "Login cancelled."
      return
    end

    # Exchange authorization code for tokens
    tokens = client.exchange_code(
      code: params[:code],
      redirect_uri: auth_google_callback_url
    )

    if tokens[:error].present?
      Rails.logger.error("[auth] Token exchange failed: #{tokens[:error_description] || tokens[:error]}")
      redirect_to root_path, alert: "Login failed. Please try again."
      return
    end

    # Fetch user profile
    profile = client.fetch_profile(tokens[:access_token])

    if profile[:sub].blank?
      Rails.logger.error("[auth] Failed to fetch Google profile")
      redirect_to root_path, alert: "Could not retrieve your Google profile."
      return
    end

    # Find or create user
    user = User.find_or_create_from_google(profile)
    session[:user_id] = user.id
    Rails.logger.info("[auth] User logged in: #{user.email} (id=#{user.id})")

    # Check for pending invite to join after login
    if session[:pending_invite_token].present?
      token = session.delete(:pending_invite_token)
      redirect_to join_path(token)
      return
    end

    redirect_to newsroom_path
  end

  # DELETE /auth/logout — clear session
  def destroy
    session.delete(:user_id)
    redirect_to root_path
  end

  # ══════════════════════════════════════════════════════════════════════════
  # DEBUG LOGIN — enabled in dev, or when ALLOW_DEBUG_LOGIN=true in env
  # ══════════════════════════════════════════════════════════════════════════

  # GET /auth/debug — show debug login form
  def debug_form
    redirect_to root_path unless debug_login_allowed?
  end

  # POST /auth/debug — create/find test user and log in
  def debug_login
    return redirect_to root_path unless debug_login_allowed?

    email = params[:email].to_s.strip.downcase
    name = params[:name].to_s.strip.presence || email.split("@").first.titleize

    if email.blank? || !email.include?("@")
      redirect_to auth_debug_path, alert: "Please enter a valid email"
      return
    end

    # Find or create debug user
    user = User.find_or_initialize_by(email: email)
    user.google_uid ||= "debug_#{SecureRandom.hex(8)}"
    user.name = name
    user.save!

    session[:user_id] = user.id
    Rails.logger.info("[auth:debug] Debug user logged in: #{user.email} (id=#{user.id})")

    # Check for pending invite
    if session[:pending_invite_token].present?
      token = session.delete(:pending_invite_token)
      redirect_to join_path(token)
      return
    end

    redirect_to newsroom_path, notice: "Logged in as #{user.name}"
  end

  private

  def debug_login_allowed?
    Rails.env.development? || ENV["ALLOW_DEBUG_LOGIN"] == "true"
  end
end
