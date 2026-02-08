Rails.application.routes.draw do
  mount ActiveStorageDB::Engine => "/active_storage_db"

  root "pages#home"

  get "newsroom", to: "pages#newsroom"
  get "settings", to: "pages#settings"
  get "studio",   to: "studio#show"
  get "debug",    to: "debug#show"
  get "terms",    to: "pages#terms"
  get "privacy",  to: "pages#privacy"

  # Friends / Groups
  get  "friends",              to: "friends#show"
  post "friends/create_invite", to: "friends#create_invite"
  post "friends/create_group",  to: "friends#create_group"

  # Join flow (public)
  get  "join/:token", to: "group_invites#show", as: :join
  post "join/:token", to: "group_invites#create"

  # Debug Mock News
  scope :debug do
    get  "mock_news",                       to: "debug/mock_news#show"
    post "mock_news/bulletins",             to: "debug/mock_news#create_bulletin"
    post "mock_news/bulletins/:id/weather", to: "debug/mock_news#fetch_weather"
    post "mock_news/bulletins/:id/stories", to: "debug/mock_news#analyze_story"
    get  "mock_news/stories/:id/video",     to: "debug/mock_news#serve_video"
    get  "mock_news/bulletins/:id/status",  to: "debug/mock_news#status"
    post "mock_news/bulletins/:id/build",   to: "debug/mock_news#build"
    get  "mock_news/bulletins/:id",         to: "debug/mock_news#show_bulletin",
                                            defaults: { format: :json }
  end

  resources :stories, only: [ :index, :show ] do
    resources :comments, only: [ :create ]
  end

  # Google OAuth
  get  "auth/google",          to: "auth#google",   as: :auth_google
  get  "auth/google/callback", to: "auth#callback",  as: :auth_google_callback
  delete "auth/logout",        to: "auth#destroy",   as: :auth_logout

  # Debug login (development only - remove before production!)
  get  "auth/debug",           to: "auth#debug_form",  as: :auth_debug
  post "auth/debug",           to: "auth#debug_login"

  # Analytics proxy (avoids ad-blocker blocking of third-party domain)
  get  "a/script.js", to: "analytics#script"
  post "a/api/send",  to: "analytics#event"

  get "up" => "rails/health#show", as: :rails_health_check

  # Webhooks
  namespace :webhooks do
    post "resend/inbound", to: "resend#inbound"
  end

  namespace :api, defaults: { format: :json } do
    get "health",        to: "health#show"
    get "test-gemini",   to: "gemini_test#show"
    get "weather",       to: "weather#show"
    post "analyze",      to: "analyze#create"
    post "query",        to: "query#create"
    get "voices",        to: "voices#index"
    post "tts",          to: "tts#create"
    delete "session/:id", to: "sessions#destroy"

    post "cf/create-upload", to: "cloudflare#create_upload"
    get  "cf/video/:uid",    to: "cloudflare#video_status"
    get  "cf/config",        to: "cloudflare#stream_config"

    post "chat/analyze",   to: "chat#analyze"
    post "chat/followup",  to: "chat#followup"
    post "chat/generate",  to: "chat#generate"

    # Email
    post "email/test",     to: "email#test"

    post "stories",                  to: "stories#create"
    post "stories/:id/voice_notes",  to: "stories#add_voice_note"
    post "stories/:id/images",       to: "stories#add_image"
  end
end
