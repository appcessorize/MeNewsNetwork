module Api
  class TestDemoController < BaseController
    before_action :require_login!

    # POST /api/test/generate_bulletin
    def generate_bulletin
      group = current_user.primary_group
      unless group
        return render json: { ok: false, error: "No group found" }, status: :unprocessable_entity
      end

      bulletin = DebugBulletin.find_or_create_for_group_today!(group)

      # Wait for stories to finish analyzing (up to 60s)
      60.times do
        break if bulletin.reload.all_stories_done?
        sleep 1
      end

      unless bulletin.all_stories_done?
        return render json: { ok: false, error: "Stories are still being analyzed. Please try again shortly." }, status: :accepted
      end

      if bulletin.debug_stories.empty?
        return render json: { ok: false, error: "No stories to build a bulletin from" }, status: :unprocessable_entity
      end

      # Build the bulletin
      BulletinBuilder.new(bulletin).build!

      # Start render
      bulletin.update!(render_status: "queued", render_progress: 0, render_step: "Queued", render_error: nil)
      RenderBulletinJob.perform_later(bulletin.id)

      render json: { ok: true, bulletin_id: bulletin.id }
    rescue => e
      Rails.logger.error("[TestDemo] generate_bulletin failed: #{e.message}")
      render json: { ok: false, error: e.message }, status: :internal_server_error
    end
  end
end
