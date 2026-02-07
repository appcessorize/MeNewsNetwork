module Webhooks
  class ResendController < ApplicationController
    skip_before_action :verify_authenticity_token

    # POST /webhooks/resend/inbound
    # Handles incoming emails to contact@menews.network
    def inbound
      payload = JSON.parse(request.body.read)

      # Log the inbound email for debugging
      Rails.logger.info "[Resend Inbound] Received email from: #{payload.dig('from')}"
      Rails.logger.info "[Resend Inbound] To: #{payload.dig('to')}"
      Rails.logger.info "[Resend Inbound] Subject: #{payload.dig('subject')}"

      # Extract email data
      from_email = payload["from"]
      to_email = payload["to"]
      subject = payload["subject"]
      html_body = payload["html"]
      text_body = payload["text"]

      # TODO: Process the inbound email based on your needs
      # Examples:
      # - Save to database for admin review
      # - Forward to a support system
      # - Auto-reply with acknowledgment
      # - Create a support ticket

      # For now, just log it
      Rails.logger.info "[Resend Inbound] Email received and logged successfully"

      head :ok
    end
  end
end
