class StoreDebugVideoJob < ApplicationJob
  queue_as :default

  retry_on StandardError, wait: 10.seconds, attempts: 3

  def perform(debug_story_id)
    story = DebugStory.find(debug_story_id)
    path = story.temp_file_path

    unless path.present? && File.exist?(path)
      Rails.logger.warn("[debug_news] StoreDebugVideoJob: no temp file for story ##{story.id}, skipping")
      return
    end

    Rails.logger.info("[debug_news] Attaching video to ActiveStorage for story ##{story.id} (#{(File.size(path) / 1e6).round(1)} MB)")

    story.media.attach(
      io: File.open(path, "rb"),
      filename: story.original_filename || "story_#{story.id}.mp4",
      content_type: story.content_type || "video/mp4"
    )

    story.update!(temp_file_path: nil)

    File.delete(path) if File.exist?(path)

    Rails.logger.info("[debug_news] Story ##{story.id} video stored in ActiveStorage, temp file cleaned up")
  end
end
