module Api
  class HealthController < BaseController
    def show
      Rails.logger.info("[health] Health check requested")
      render json: { ok: true, time: Time.now.iso8601 }
    end
  end
end
