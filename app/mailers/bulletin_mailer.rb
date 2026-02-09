class BulletinMailer < ApplicationMailer
  def video_ready(user, bulletin)
    @user = user
    @bulletin = bulletin
    @group = bulletin.group
    @story_count = bulletin.debug_stories.where(status: "done").count

    mail(
      to: user.email,
      subject: "Your #{@group.name} bulletin is ready!"
    )
  end
end
