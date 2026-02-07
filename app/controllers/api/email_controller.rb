module Api
  class EmailController < BaseController
    before_action :require_admin!
    before_action :require_resend_key!

    # POST /api/email/test
    def test
      to = params[:to]
      subject = params[:subject].presence

      if to.blank? || !to.match?(/\A[^@\s]+@[^@\s]+\z/)
        return render json: { ok: false, error: "Valid email address required." }, status: :bad_request
      end

      Rails.logger.info "[Email] Sending test email to #{to}..."
      DebugMailer.test_email(to: to, subject: subject).deliver_now
      Rails.logger.info "[Email] Test email sent successfully to #{to}"

      render json: { ok: true, message: "Test email sent to #{to}." }
    rescue => e
      Rails.logger.error "[Email] Failed to send: #{e.class} - #{e.message}"
      Rails.logger.error e.backtrace&.first(5)&.join("\n")

      error_message = case e.message
      when /API key/i, /unauthorized/i, /401/
                        "Resend API key is invalid or missing. Check RESEND_API_KEY."
      when /domain.*not.*verified/i, /403/
                        "Sending domain not verified. Verify menews.network in Resend dashboard."
      when /rate.*limit/i, /429/
                        "Rate limit exceeded. Wait a moment and try again."
      else
                        e.message
      end

      render json: { ok: false, error: error_message }, status: :internal_server_error
    end

    private

    def require_admin!
      unless current_user&.email == DebugController::ADMIN_EMAIL
        render json: { ok: false, error: "Access denied. Admin login required." }, status: :forbidden
      end
    end

    def require_resend_key!
      unless ENV["RESEND_API_KEY"].present?
        render json: { ok: false, error: "RESEND_API_KEY not configured in environment." }, status: :service_unavailable
      end
    end
  end
end
