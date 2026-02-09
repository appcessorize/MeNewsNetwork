class StudioController < ApplicationController
  before_action :require_login!

  def show
    @group = current_user.primary_group
    if @group
      @bulletin = @group.debug_bulletins.find_by(bulletin_date: Date.current)
      @stories = @bulletin&.debug_stories&.order(:story_number) || []
    end
  end

  def build_bulletin
    bulletin = DebugBulletin.find(params[:id])
    unless bulletin.group_id == current_user.primary_group&.id
      return render json: { ok: false, error: "Access denied" }, status: :forbidden
    end

    master = BulletinBuilder.new(bulletin).build!
    render json: { ok: true, master: master }
  rescue => e
    Rails.logger.error("[Studio] Build failed: #{e.message}")
    render json: { ok: false, error: e.message }, status: :internal_server_error
  end

  def start_render
    bulletin = DebugBulletin.find(params[:id])
    unless bulletin.group_id == current_user.primary_group&.id
      return render json: { ok: false, error: "Access denied" }, status: :forbidden
    end

    unless bulletin.status == "ready"
      return render json: { ok: false, error: "Bulletin must be built first" }, status: :unprocessable_entity
    end

    if bulletin.render_in_progress?
      return render json: { ok: false, error: "Render already in progress" }, status: :conflict
    end

    bulletin.update!(render_status: "queued", render_progress: 0, render_step: "Queued", render_error: nil)
    RenderBulletinJob.perform_later(bulletin.id)

    render json: { ok: true, render_status: "queued" }
  rescue => e
    render json: { ok: false, error: e.message }, status: :internal_server_error
  end

  def bulletin_status
    bulletin = DebugBulletin.find(params[:id])
    unless bulletin.group_id == current_user.primary_group&.id
      return render json: { ok: false, error: "Access denied" }, status: :forbidden
    end

    stories = bulletin.debug_stories.order(:story_number).map do |s|
      {
        id: s.id,
        story_number: s.story_number,
        status: s.status,
        story_title: s.story_title,
        story_emoji: s.story_emoji,
        error_message: s.error_message,
        user_name: s.user&.name,
        user_avatar: s.user&.avatar_url
      }
    end

    customer_code = Rails.configuration.x.cloudflare.customer_code
    video_url = nil
    if bulletin.rendered_video_uid.present? && customer_code.present?
      video_url = "https://customer-#{customer_code}.cloudflarestream.com/#{bulletin.rendered_video_uid}/manifest/video.m3u8"
    end

    render json: {
      ok: true,
      bulletin_id: bulletin.id,
      bulletin_status: bulletin.status,
      render_status: bulletin.render_status,
      render_progress: bulletin.render_progress || 0,
      render_step: bulletin.render_step,
      render_error: bulletin.render_error,
      video_url: video_url,
      stories: stories
    }
  end
end
