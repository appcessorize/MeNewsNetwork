# TODO

## Configure Resend (Email)

Resend is used for transactional email (e.g. notifications, alerts).

### Steps

1. **Create a Resend account** at [resend.com](https://resend.com)

2. **Get your API key** from the Resend dashboard under **API Keys**

3. **Add the key to `.env`**:
   ```
   RESEND_API_KEY=re_your_actual_key_here
   ```

4. **Verify a sending domain** (optional but recommended for production):
   - In the Resend dashboard go to **Domains** and add your domain
   - Add the DNS records Resend provides (SPF, DKIM, etc.)
   - Update `app/mailers/application_mailer.rb` with your verified domain:
     ```ruby
     default from: "Newsroom <hello@yourdomain.com>"
     ```

5. **Restart the server** after updating `.env`:
   ```bash
   bin/dev
   ```

### Notes

- The default sender is `onboarding@resend.dev` (Resend's sandbox domain). This works for testing but emails may land in spam.
- For production, verify your own domain and update the `from` address in `app/mailers/application_mailer.rb`.
- The test email endpoint is at `POST /api/email/test` and is restricted to the admin user.
- ActionMailer is configured to use Resend as the delivery method in both `config/environments/development.rb` and `config/environments/production.rb`.

## Configure Web Push (VAPID)

VAPID keys are already generated in `.env`. If you need to regenerate:

```bash
bin/rails runner "
  require 'openssl'
  key = OpenSSL::PKey::EC.generate('prime256v1')
  pub = Base64.urlsafe_encode64(key.public_key.to_octet_string(:uncompressed), padding: false)
  priv = Base64.urlsafe_encode64(key.private_key.to_s(2), padding: false)
  puts 'VAPID_PUBLIC_KEY=' + pub
  puts 'VAPID_PRIVATE_KEY=' + priv
"
```

Replace the values in `.env` and restart the server.
