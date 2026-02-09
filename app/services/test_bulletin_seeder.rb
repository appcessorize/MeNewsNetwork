# Seeds a test user's bulletin with pre-made stories from the demo bulletin.
# Copies story records from the source bulletin, reusing R2 keys and CF Stream UIDs
# so the renderer can download the original video/TTS files.
class TestBulletinSeeder
  # Source story IDs from bulletin 67 (created via debug/mock_news)
  SOURCE_STORY_IDS = [125, 126, 127, 128, 129].freeze

  # How many seed stories to add (pick a random subset to keep bulletins short)
  SEED_COUNT = 3

  def initialize(bulletin)
    @bulletin = bulletin
  end

  # Seed the bulletin with demo stories if it doesn't already have them.
  # Returns the number of stories seeded.
  def seed!
    # Don't re-seed if this bulletin already has seed stories
    return 0 if @bulletin.debug_stories.where(user_id: nil).exists?

    source_stories = DebugStory.where(id: SOURCE_STORY_IDS, status: "done").order(:story_number)
    if source_stories.empty?
      Rails.logger.warn("[TestBulletinSeeder] No source stories found (IDs: #{SOURCE_STORY_IDS})")
      return 0
    end

    # Pick a random subset
    selected = source_stories.to_a.sample(SEED_COUNT)

    # Renumber: user's stories keep their numbers, seed stories fill in around them
    max_story_number = @bulletin.debug_stories.maximum(:story_number).to_i

    seeded = 0
    selected.each_with_index do |source, idx|
      new_number = max_story_number + idx + 1

      new_story = @bulletin.debug_stories.create!(
        story_number: new_number,
        story_type: source.story_type,
        status: "done",
        user_context: source.user_context,
        story_title: source.story_title,
        story_emoji: source.story_emoji,
        intro_text: source.intro_text,
        gemini_json: source.gemini_json,
        subtitle_segments: source.subtitle_segments,
        cloudflare_stream_uid: source.cloudflare_stream_uid,
        original_filename: source.original_filename,
        content_type: source.content_type,
        r2_video_key: source.r2_video_key,
        r2_tts_key: source.r2_tts_key,
        r2_poster_key: source.r2_poster_key,
        # user_id intentionally nil — marks these as seeded stories
        user_id: nil
      )

      # Copy TTS audio attachment from source story
      if source.tts_audio.attached?
        new_story.tts_audio.attach(
          io: StringIO.new(source.tts_audio.download),
          filename: "tts_story_#{new_number}.wav",
          content_type: "audio/wav"
        )
      end

      Rails.logger.info("[TestBulletinSeeder] Seeded story ##{new_number}: #{source.story_emoji} #{source.story_title} (from source #{source.id})")
      seeded += 1
    end

    Rails.logger.info("[TestBulletinSeeder] Seeded #{seeded} stories into bulletin ##{@bulletin.id}")
    seeded
  end
end
