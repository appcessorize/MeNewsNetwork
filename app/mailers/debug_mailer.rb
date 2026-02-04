class DebugMailer < ApplicationMailer
  def test_email(to:, subject: nil)
    @to = to
    @sent_at = Time.current
    mail(to: to, subject: subject || "Newsroom Test Email")
  end
end
