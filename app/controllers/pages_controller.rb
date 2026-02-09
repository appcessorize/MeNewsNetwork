class PagesController < ApplicationController
  before_action :require_login!, only: %i[newsroom settings onboarding complete_onboarding dismiss_test_welcome]

  def home
    if logged_in?
      unless current_user.onboarding_completed?
        redirect_to "/onboarding"
        return
      end

      @test_user = session[:test_user] == true

      if @test_user && !session[:test_welcome_seen]
        render :test_welcome
        return
      end

      @user = current_user
      @group = current_user.primary_group
      @group_members = @group ? @group.members.where.not(id: current_user.id).order(:name) : []
      render :chat
    end
  end

  def dismiss_test_welcome
    session[:test_welcome_seen] = true
    head :ok
  end

  def newsroom
  end

  def settings
  end

  def onboarding
    @user = current_user
    @has_group = current_user.in_any_group?

    if @has_group
      @group = current_user.primary_group
      _invite, token = GroupInvite.create_for_group(group: @group, user: current_user)
      @invite_url = join_url(token)
    end
  end

  def complete_onboarding
    current_user.update!(onboarding_completed_at: Time.current)
    head :ok
  end

  def terms
  end

  def privacy
  end
end
