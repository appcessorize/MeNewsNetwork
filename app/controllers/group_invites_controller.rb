class GroupInvitesController < ApplicationController
  # GET /join/:token - Public entry point
  def show
    @token = params[:token]
    invite = GroupInvite.find_by_token(@token)

    if invite.nil?
      render :invalid, status: :not_found
      return
    end

    unless invite.valid_for_use?
      @reason = invite.expired? ? "expired" : "fully used"
      render :invalid, status: :gone
      return
    end

    @group = invite.group

    unless logged_in?
      session[:pending_invite_token] = @token
      # Use debug login in development for easier testing
      redirect_to debug_login_allowed? ? auth_debug_path : auth_google_path
      return
    end

    @already_member = @group.members.include?(current_user)
  end

  # POST /join/:token - Redeem the invite
  def create
    unless logged_in?
      redirect_to debug_login_allowed? ? auth_debug_path : auth_google_path
      return
    end

    token = params[:token]
    invite = GroupInvite.find_by_token(token)

    if invite.nil? || !invite.valid_for_use?
      redirect_to "/friends", alert: "Invalid or expired invite link."
      return
    end

    post_join_path = current_user.onboarding_completed? ? "/friends" : "/onboarding"

    if invite.group.members.include?(current_user)
      redirect_to post_join_path, notice: "You're already in this group!"
      return
    end

    if invite.redeem!(current_user)
      redirect_to post_join_path, notice: "Welcome to #{invite.group.name}!"
    else
      redirect_to "/friends", alert: "Could not join group. Please try again."
    end
  end

  private

  def debug_login_allowed?
    Rails.env.development? || ENV["ALLOW_DEBUG_LOGIN"] == "true"
  end
end
