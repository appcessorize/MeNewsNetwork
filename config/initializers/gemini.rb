Rails.configuration.x.gemini.api_key = ENV["GEMINI_API_KEY"]
Rails.configuration.x.gemini.model_name = "gemini-2.0-flash"
Rails.configuration.x.gemini.tts_model = "gemini-2.5-flash-preview-tts"

Rails.configuration.x.cloudflare.account_id = ENV["CLOUDFLARE_ACCOUNT_ID"]
Rails.configuration.x.cloudflare.api_token = ENV["CLOUDFLARE_API_TOKEN"]
Rails.configuration.x.cloudflare.customer_code = ENV["CLOUDFLARE_STREAM_CUSTOMER_CODE"]

# Boot-time diagnostic logging for Cloudflare env vars
%w[CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN CLOUDFLARE_STREAM_CUSTOMER_CODE].each do |var|
  val = ENV[var]
  status = if val.nil?
             "NIL"
           elsif val.empty?
             "EMPTY"
           else
             "SET (len=#{val.length}, prefix=#{val[0, 4]}...)"
           end
  Rails.logger.info "[BOOT] #{var}: #{status}"
end

# Google OAuth
Rails.configuration.x.google.client_id     = ENV["GOOGLE_CLIENT_ID"]
Rails.configuration.x.google.client_secret  = ENV["GOOGLE_CLIENT_SECRET"]

# Initialize the in-memory session store
require_relative "../../app/services/session_store"
Rails.configuration.x.gemini.session_store = SessionStore.new

# VAPID keys for Web Push
Rails.configuration.x.vapid.public_key  = ENV["VAPID_PUBLIC_KEY"]
Rails.configuration.x.vapid.private_key = ENV["VAPID_PRIVATE_KEY"]
