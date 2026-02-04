# Be sure to restart your server when you modify this file.

# Define an application-wide content security policy.
# See the Securing Rails Applications Guide for more information:
# https://guides.rubyonrails.org/security.html#content-security-policy-header

Rails.application.configure do
  config.content_security_policy do |policy|
    policy.default_src :self
    policy.font_src    :self, :data, "https://fonts.gstatic.com"
    policy.img_src     :self, :data, :blob, "https:", "http://localhost:*"
    policy.object_src  :none
    policy.script_src  :self, "https://cdn.jsdelivr.net"
    policy.style_src   :self, :unsafe_inline, "https://fonts.googleapis.com"
    policy.connect_src :self, :blob, "https://generativelanguage.googleapis.com", "https://api.cloudflare.com", "wss://localhost:*", "ws://localhost:*"
    policy.media_src   :self, :blob, "https://customer-*.cloudflarestream.com"
    policy.frame_src   :self, "https://customer-*.cloudflarestream.com"
    policy.worker_src  :self, :blob
  end

  # Generate session nonces for permitted importmap, inline scripts, and inline styles.
  config.content_security_policy_nonce_generator = ->(request) { request.session.id.to_s }
  config.content_security_policy_nonce_directives = %w(script-src)

  # Report violations without enforcing the policy (safe for initial rollout).
  # Once you've verified no legitimate resources are blocked, set this to false.
  config.content_security_policy_report_only = true
end
