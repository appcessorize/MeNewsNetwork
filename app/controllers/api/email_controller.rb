module Api
  class EmailController < BaseController
    before_action :require_admin!

    # POST /api/email/test
    def test
      to = params[:to]
      subject = params[:subject].presence

      if to.blank? || !to.match?(/\A[^@\s]+@[^@\s]+\z/)
        return render json: { ok: false, error: "Valid email address required." }, status: :bad_request
      end

      DebugMailer.test_email(to: to, subject: subject).deliver_now
      render json: { ok: true, message: "Test email sent to #{to}." }
    rescue => e
      render json: { ok: false, error: e.message }, status: :internal_server_error
    end

    private

    def require_admin!
      unless current_user&.email == DebugController::ADMIN_EMAIL
        render json: { ok: false, error: "Access denied." }, status: :forbidden
      end
    end
  end
end
