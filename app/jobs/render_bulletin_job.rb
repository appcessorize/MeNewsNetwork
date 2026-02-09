class RenderBulletinJob < ApplicationJob
  queue_as :default

  retry_on StandardError, wait: 30.seconds, attempts: 2

  def perform(bulletin_id)
    bulletin = DebugBulletin.find(bulletin_id)

    # Concurrency guard: acquire advisory lock
    lock_key = "render_bulletin_#{bulletin_id}".hash.abs
    unless bulletin.class.connection.get_advisory_lock(lock_key)
      Rails.logger.warn("[RenderJob] Could not acquire lock for bulletin ##{bulletin_id}, skipping")
      return
    end

    begin
      bulletin.reload
      if bulletin.render_status == "rendering"
        Rails.logger.warn("[RenderJob] Bulletin ##{bulletin_id} already rendering, skipping")
        return
      end

      bulletin.update!(
        render_status: "rendering",
        render_progress: 0,
        render_step: "Starting render",
        render_error: nil,
        render_log: nil
      )

      renderer = BulletinRenderer.new(bulletin, on_progress: lambda { |pct, step|
        bulletin.update_columns(render_progress: pct, render_step: step)
      })

      result = renderer.render!

      bulletin.update!(
        render_status: "done",
        render_progress: 100,
        render_step: "Complete",
        rendered_video_uid: result[:video_uid],
        render_log: truncate_log(result[:log])
      )

      Rails.logger.info("[RenderJob] Bulletin ##{bulletin_id} render complete, uid=#{result[:video_uid]}")

    rescue => e
      Rails.logger.error("[RenderJob] Bulletin ##{bulletin_id} render failed: #{e.message}\n#{e.backtrace&.first(10)&.join("\n")}")
      bulletin.update!(
        render_status: "failed",
        render_error: e.message,
        render_step: "Failed",
        render_log: truncate_log(e.message + "\n" + e.backtrace&.first(20)&.join("\n").to_s)
      )
      raise
    ensure
      bulletin.class.connection.release_advisory_lock(lock_key)
    end
  end

  private

  def truncate_log(log)
    return nil if log.blank?
    log.last(5000)
  end
end
