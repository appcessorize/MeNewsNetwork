module Api
  class SessionsController < BaseController
    def destroy
      session_id = params[:id]
      session = session_store.get(session_id)

      unless session
        return render json: { ok: true, message: "Already deleted." }
      end

      session_store.delete(session_id)
      Rails.logger.info("[session] Manually deleted session #{session_id}")
      render json: { ok: true }
    end
  end
end
