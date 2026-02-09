module Api
  class TestDemoController < BaseController
    before_action :require_login!

    # POST /api/test/generate_bulletin
    # Uses the same logic as debug/mock_news — build JSON then queue render.
    # Client polls /studio/bulletin_status/:id for progress (same as mock_news render_status).
    def generate_bulletin
      group = current_user.primary_group
      unless group
        return render json: { ok: false, error: "No group found" }, status: :unprocessable_entity
      end

      bulletin = DebugBulletin.find_or_create_for_group_today!(group)

      # Clean up failed stories so they don't inflate counts or confuse status
      bulletin.debug_stories.where(status: "failed").destroy_all
      # Wipe old seed stories so the seeder always creates a fresh set of 3
      bulletin.debug_stories.where(user_id: nil).destroy_all
      # Keep only the user's latest done story
      user_done = bulletin.debug_stories.where(user_id: current_user.id, status: "done").order(created_at: :desc)
      user_done.offset(1).destroy_all if user_done.count > 1

      if bulletin.debug_stories.where(status: "done").empty?
        return render json: { ok: false, error: "No analyzed stories to build a bulletin from" }, status: :unprocessable_entity
      end

      if bulletin.any_story_failed?
        Rails.logger.warn("[TestDemo] Some stories failed, proceeding with #{bulletin.debug_stories.where(status: 'done').count} done stories")
      end

      # Seed demo stories from friends/family (copies from source bulletin 67)
      seeded = TestBulletinSeeder.new(bulletin).seed!
      Rails.logger.info("[TestDemo] Seeded #{seeded} demo stories") if seeded > 0

      # Step 1: Build the bulletin JSON (same as POST /debug/mock_news/bulletins/:id/build)
      Rails.logger.info("[TestDemo] Building bulletin ##{bulletin.id}...")
      BulletinBuilder.new(bulletin).build!
      bulletin.reload
      Rails.logger.info("[TestDemo] Bulletin ##{bulletin.id} built, status=#{bulletin.status}")

      unless bulletin.status == "ready"
        return render json: { ok: false, error: "Bulletin build failed (status: #{bulletin.status})" }, status: :unprocessable_entity
      end

      # Step 2: Start render (same as POST /debug/mock_news/bulletins/:id/render)
      # Clear old render state completely so client doesn't see stale video
      bulletin.update!(
        render_status: "queued",
        render_progress: 0,
        render_step: "Queued",
        render_error: nil,
        rendered_video_uid: nil
      )
      RenderBulletinJob.perform_later(bulletin.id)
      Rails.logger.info("[TestDemo] Render queued for bulletin ##{bulletin.id}")

      render json: { ok: true, bulletin_id: bulletin.id }
    rescue => e
      Rails.logger.error("[TestDemo] generate_bulletin failed: #{e.class}: #{e.message}\n#{e.backtrace&.first(5)&.join("\n")}")
      render json: { ok: false, error: e.message }, status: :internal_server_error
    end

    # GET /api/test/bulletin_status
    # Returns analysis status for the test user's current bulletin.
    # Client polls this to know when analysis is done before calling generate_bulletin.
    def bulletin_status
      group = current_user.primary_group
      unless group
        return render json: { ok: false, error: "No group found" }, status: :unprocessable_entity
      end

      bulletin = DebugBulletin.find_or_create_for_group_today!(group)

      stories = bulletin.debug_stories.order(:story_number).map do |s|
        {
          id: s.id,
          story_number: s.story_number,
          status: s.status,
          story_title: s.story_title,
          story_emoji: s.story_emoji,
          error_message: s.error_message
        }
      end

      done_count = stories.count { |s| s[:status] == "done" }
      failed_count = stories.count { |s| s[:status] == "failed" }
      analyzing_count = stories.count { |s| s[:status] == "analyzing" }

      render json: {
        ok: true,
        bulletin_id: bulletin.id,
        bulletin_status: bulletin.status,
        stories_total: done_count + analyzing_count,
        stories_done: done_count,
        stories_failed: failed_count,
        stories_analyzing: analyzing_count,
        all_done: analyzing_count == 0,
        stories: stories
      }
    rescue => e
      Rails.logger.error("[TestDemo] bulletin_status failed: #{e.message}")
      render json: { ok: false, error: e.message }, status: :internal_server_error
    end
  end
end
