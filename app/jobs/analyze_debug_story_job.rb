class AnalyzeDebugStoryJob < ApplicationJob
  queue_as :default

  retry_on StandardError, wait: 5.seconds, attempts: 2

  def perform(debug_story_id)
    story = DebugStory.find(debug_story_id)
    return if story.status == "done"

    story.update!(status: "analyzing")
    Rails.logger.info("[debug_news] Analyzing story ##{story.story_number} (id=#{story.id})")

    tempfile = Tempfile.new([ "debug_story_#{story.id}_", ".mp4" ])
    tempfile.binmode
    story.media.download { |chunk| tempfile.write(chunk) }
    tempfile.rewind

    begin
      # 1. Upload to Gemini File API
      Rails.logger.info("[debug_news] Uploading video to Gemini (#{(tempfile.size / 1e6).round(1)} MB)...")
      file_manager = Gemini::FileManager.new
      gemini_file = file_manager.upload_and_wait(
        tempfile.path,
        mime_type: story.media.content_type,
        display_name: "debug_story_#{story.story_number}"
      )

      # 2. Generate analysis with Gemini
      Rails.logger.info("[debug_news] File ACTIVE, running analysis prompt...")
      generator = Gemini::ContentGenerator.new
      prompt = DebugNews::PromptBuilder.story_analysis_prompt(
        story_number: story.story_number,
        user_context: story.user_context
      )

      result = generator.generate_with_file(
        file_uri: gemini_file[:uri],
        file_mime_type: gemini_file[:mimeType],
        prompt: prompt,
        temperature: 0.3,
        json_response: true
      )

      # 3. Parse and store
      parsed = JSON.parse(result[:text], symbolize_names: true)
      Rails.logger.info("[debug_news] Got title=#{parsed[:storyTitle]}, emoji=#{parsed[:storyEmoji]}")

      story.update!(
        gemini_json: parsed,
        story_title: parsed[:storyTitle],
        story_emoji: parsed[:storyEmoji],
        intro_text: parsed[:introText],
        subtitle_segments: parsed[:subtitleSegments],
        status: "done",
        error_message: nil
      )

      # 4. Clean up Gemini file
      file_manager.delete_file(gemini_file[:name])
      Rails.logger.info("[debug_news] Story ##{story.story_number} done, Gemini file cleaned up")

      # 5. Check if all stories for this bulletin are done
      check_bulletin_completion(story.debug_bulletin)

    rescue => e
      Rails.logger.error("[debug_news] Story ##{story.story_number} failed: #{e.message}")
      story.update!(status: "failed", error_message: e.message)
      raise # Let retry logic handle it
    ensure
      tempfile.close
      tempfile.unlink
    end
  end

  private

  def check_bulletin_completion(bulletin)
    bulletin.reload
    return unless bulletin.all_stories_done?

    new_status = bulletin.any_story_failed? ? "failed" : "ready"
    bulletin.update!(status: new_status)
    Rails.logger.info("[debug_news] Bulletin ##{bulletin.id} status -> #{new_status}")
  end
end
