module Api
  class PushController < BaseController
    before_action :require_session_user!

    # POST /api/push/subscribe
    def subscribe
      sub = current_user.push_subscriptions.find_or_initialize_by(endpoint: params[:endpoint])
      sub.p256dh = params[:p256dh]
      sub.auth   = params[:auth]

      if sub.save
        render json: { ok: true, message: "Subscribed to push notifications." }
      else
        render json: { ok: false, error: sub.errors.full_messages.join(", ") }, status: :unprocessable_entity
      end
    end

    # POST /api/push/send
    def send_now
      payload = {
        title: params[:title] || "Newsroom Alert",
        body:  params[:body]  || "This is a test push notification.",
        url:   "/studio",
        tag:   "debug-push-#{Time.now.to_i}"
      }

      results = deliver_to_all(payload)
      render json: { ok: true, message: "Push sent.", results: results }
    end

    # POST /api/push/schedule
    def schedule
      delay = (params[:delay] || 60).to_i
      payload = {
        title: params[:title] || "Scheduled Newsroom Alert",
        body:  params[:body]  || "This is your scheduled push notification!",
        url:   "/studio",
        tag:   "scheduled-push-#{Time.now.to_i}"
      }

      Thread.new do
        sleep delay
        deliver_to_all(payload)
      end

      render json: { ok: true, message: "Push scheduled in #{delay} seconds." }
    end

    # GET /api/push/vapid_key
    def vapid_key
      render json: { vapid_public_key: Rails.configuration.x.vapid.public_key }
    end

    private

    def require_session_user!
      return if current_user
      render json: { ok: false, error: "Not authenticated." }, status: :unauthorized
    end

    def deliver_to_all(payload)
      service = WebPushService.new
      results = []

      current_user.push_subscriptions.find_each do |sub|
        result = service.send_notification(sub, payload)
        results << { endpoint: sub.endpoint.last(30), status: result[:status] }

        # Clean up expired subscriptions
        sub.destroy if result[:status] == 410
      rescue => e
        results << { endpoint: sub.endpoint.last(30), error: e.message }
      end

      results
    end
  end
end
