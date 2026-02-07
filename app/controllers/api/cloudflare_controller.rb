module Api
  class CloudflareController < BaseController
    def create_upload
      client = Cloudflare::StreamClient.new
      unless client.configured?
        return render json: { ok: false, error: "Cloudflare env vars not set." }, status: :internal_server_error
      end

      filename = params[:filename] || "upload.mp4"
      result = client.create_direct_upload(filename: filename)

      Rails.logger.info("[cf/create-upload] Upload URL created, uid=#{result[:uid]}")
      render json: { ok: true, uploadURL: result[:uploadURL], uid: result[:uid] }
    end

    def video_status
      client = Cloudflare::StreamClient.new
      unless client.configured?
        return render json: { ok: false, error: "Cloudflare env vars not set." }, status: :internal_server_error
      end

      result = client.get_video(params[:uid])
      render json: { ok: true, result: result }
    end

    def config
      render json: {
        ok: true,
        customerCode: Rails.configuration.x.cloudflare.customer_code,
        configured: Rails.configuration.x.cloudflare.account_id.present? &&
                    Rails.configuration.x.cloudflare.api_token.present?
      }
    rescue => e
      Rails.logger.error "[CF Config] Error: #{e.message}"
      render json: { ok: false, error: e.message }, status: :internal_server_error
    end
  end
end
