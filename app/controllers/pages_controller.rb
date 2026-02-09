class PagesController < ApplicationController
  before_action :require_login!, only: %i[newsroom settings]

  def home
    if logged_in?
      @user = current_user
      @group = current_user.primary_group
      @group_members = @group ? @group.members.where.not(id: current_user.id).order(:name) : []
      render :chat
    end
  end

  def newsroom
  end

  def settings
  end

  def onboarding
  end

  def terms
  end

  def privacy
  end
end
