class DebugController < ApplicationController
  before_action :require_login!
  before_action :require_admin!

  ADMIN_EMAIL = ENV.fetch("ADMIN_EMAIL", nil).freeze

  def show
    @vapid_public_key = Rails.configuration.x.vapid.public_key
  end

  private

  def require_admin!
    unless current_user&.email == ADMIN_EMAIL
      redirect_to newsroom_path, alert: "Access denied."
    end
  end
end
