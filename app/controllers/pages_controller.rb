class PagesController < ApplicationController
  before_action :require_login!, only: %i[newsroom settings]

  def home
    redirect_to newsroom_path if logged_in?
  end

  def newsroom
  end

  def settings
  end

  def terms
  end

  def privacy
  end
end
