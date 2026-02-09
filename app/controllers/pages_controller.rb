class PagesController < ApplicationController
  before_action :require_login!, only: %i[newsroom settings onboarding complete_onboarding dismiss_test_welcome]

  def home
    if logged_in?
      unless current_user.onboarding_completed?
        redirect_to "/onboarding"
        return
      end

      @test_user = session[:test_user] == true

      if @test_user && !session[:test_welcome_seen]
        render :test_welcome
        return
      end

      if @test_user
        group = current_user.primary_group
        if group
          bulletin = DebugBulletin.find_or_create_for_group_today!(group)
          # Wipe ALL stories (user-submitted + seeds) so each test session starts fresh
          bulletin.debug_stories.destroy_all
          # Reset bulletin build/render state to blank
          bulletin.update!(
            status: "draft",
            master_json: nil,
            render_status: nil,
            render_progress: nil,
            render_step: nil,
            render_error: nil,
            render_log: nil,
            rendered_video_uid: nil
          )
          # Purge TTS audio so they get regenerated on next build
          bulletin.welcome_tts_audio.purge if bulletin.welcome_tts_audio.attached?
          bulletin.closing_tts_audio.purge if bulletin.closing_tts_audio.attached?
          Rails.logger.info("[TestUser] Reset bulletin ##{bulletin.id} — destroyed all stories, reset to draft")
        end
      end

      @user = current_user
      @group = current_user.primary_group
      @group_members = @group ? @group.members.where.not(id: current_user.id).order(:name) : []
      render :chat
    end
  end

  def dismiss_test_welcome
    session[:test_welcome_seen] = true
    head :ok
  end

  def newsroom
  end

  def settings
  end

  def onboarding
    @user = current_user
    @has_group = current_user.in_any_group?

    if @has_group
      @group = current_user.primary_group
      _invite, token = GroupInvite.create_for_group(group: @group, user: current_user)
      @invite_url = join_url(token)
    end
  end

  def complete_onboarding
    current_user.update!(onboarding_completed_at: Time.current)
    head :ok
  end

  def terms
  end

  def privacy
  end
end
