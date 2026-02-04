require "openssl"
require "base64"
require "json"

class WebPushService
  # Web Push encryption + VAPID, no gem needed.
  # Implements RFC 8291 (Message Encryption) + RFC 8292 (VAPID).

  def initialize
    @vapid_public  = Rails.configuration.x.vapid.public_key
    @vapid_private = Rails.configuration.x.vapid.private_key
  end

  def send_notification(subscription, payload)
    endpoint = subscription.endpoint
    p256dh   = subscription.p256dh
    auth     = subscription.auth

    encrypted = encrypt(payload.to_json, p256dh, auth)
    jwt       = build_vapid_jwt(endpoint)
    vapid_key = @vapid_public

    conn = Faraday.new do |f|
      f.adapter Faraday.default_adapter
    end

    response = conn.post(endpoint) do |req|
      req.headers["Content-Type"]     = "application/octet-stream"
      req.headers["Content-Encoding"] = "aes128gcm"
      req.headers["TTL"]              = "60"
      req.headers["Authorization"]    = "vapid t=#{jwt},k=#{vapid_key}"
      req.body = encrypted
    end

    { status: response.status, body: response.body }
  end

  private

  # ── RFC 8291 encryption ──────────────────────
  def encrypt(plaintext, client_pub_b64, client_auth_b64)
    client_pub_raw  = Base64.urlsafe_decode64(client_pub_b64)
    client_auth_raw = Base64.urlsafe_decode64(client_auth_b64)

    # Generate ephemeral ECDH key pair
    group = OpenSSL::PKey::EC::Group.new("prime256v1")
    server_key = OpenSSL::PKey::EC.generate("prime256v1")
    server_pub_raw = server_key.public_key.to_octet_string(:uncompressed)

    # Derive shared secret via ECDH
    client_point = OpenSSL::PKey::EC::Point.new(group, OpenSSL::BN.new(client_pub_raw, 2))
    shared_secret = server_key.dh_compute_key(client_point)

    # HKDF to derive the content encryption key and nonce
    # auth_info for the auth secret
    auth_info = "WebPush: info\x00" + client_pub_raw + server_pub_raw
    prk = hkdf_extract(client_auth_raw, shared_secret)
    ikm = hkdf_expand(prk, auth_info, 32)

    # Derive CEK and nonce
    salt = OpenSSL::Random.random_bytes(16)
    prk2 = hkdf_extract(salt, ikm)
    cek  = hkdf_expand(prk2, "Content-Encoding: aes128gcm\x00", 16)
    nonce = hkdf_expand(prk2, "Content-Encoding: nonce\x00", 12)

    # Encrypt with AES-128-GCM
    cipher = OpenSSL::Cipher::AES.new(128, :GCM)
    cipher.encrypt
    cipher.key = cek
    cipher.iv  = nonce

    # Add padding delimiter (0x02 = final record)
    padded = plaintext + "\x02"
    encrypted = cipher.update(padded) + cipher.final + cipher.auth_tag

    # Build aes128gcm header: salt (16) + rs (4) + idlen (1) + keyid (65)
    rs = [ padded.bytesize + 16 + 1 ].pack("N") # record size (content + tag + padding)
    rs = [ 4096 ].pack("N")
    header = salt + rs + [ server_pub_raw.bytesize ].pack("C") + server_pub_raw

    header + encrypted
  end

  # ── HKDF (RFC 5869) ─────────────────────────
  def hkdf_extract(salt, ikm)
    OpenSSL::HMAC.digest("SHA256", salt, ikm)
  end

  def hkdf_expand(prk, info, length)
    OpenSSL::HMAC.digest("SHA256", prk, info + "\x01")[0...length]
  end

  # ── VAPID JWT ────────────────────────────────
  def build_vapid_jwt(endpoint)
    audience = URI.parse(endpoint).then { |u| "#{u.scheme}://#{u.host}" }

    header = { "typ" => "JWT", "alg" => "ES256" }
    payload = {
      "aud" => audience,
      "exp" => Time.now.to_i + 3600,
      "sub" => "mailto:admin@newsroom.test"
    }

    header_b64  = base64url(header.to_json)
    payload_b64 = base64url(payload.to_json)
    signing_input = "#{header_b64}.#{payload_b64}"

    # Sign with VAPID private key
    priv_raw = Base64.urlsafe_decode64(@vapid_private)
    asn1 = OpenSSL::ASN1::Sequence.new([
      OpenSSL::ASN1::Integer.new(1),
      OpenSSL::ASN1::OctetString.new(priv_raw),
      OpenSSL::ASN1::ObjectId.new("prime256v1", 0, :EXPLICIT),
    ])
    key = OpenSSL::PKey::EC.new(asn1.to_der)

    digest = OpenSSL::Digest::SHA256.digest(signing_input)
    sig_der = key.dsa_sign_asn1(digest)

    # Convert DER signature to raw r||s (64 bytes)
    asn1_sig = OpenSSL::ASN1.decode(sig_der)
    r = asn1_sig.value[0].value.to_s(2).rjust(32, "\x00")
    s = asn1_sig.value[1].value.to_s(2).rjust(32, "\x00")
    sig_raw = r + s

    "#{signing_input}.#{base64url(sig_raw)}"
  end

  def base64url(data)
    Base64.urlsafe_encode64(data, padding: false)
  end
end
