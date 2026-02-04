module Api
  class BaseController < ApplicationController
    skip_forgery_protection

    rescue_from StandardError, with: :handle_error

    private

    def require_gemini_key!
      return if Rails.configuration.x.gemini.api_key.present?

      render json: { ok: false, error: "GEMINI_API_KEY not set." }, status: :internal_server_error
    end

    def session_store
      Rails.configuration.x.gemini.session_store
    end

    def handle_error(exception)
      Rails.logger.error("[#{controller_name}] #{exception.message}")
      Rails.logger.error(exception.backtrace&.first(5)&.join("\n"))
      render json: { ok: false, error: exception.message }, status: :bad_gateway
    end
  end
end
