class BulletinBuilder
  def initialize(bulletin)
    @bulletin = bulletin
  end

  def build!
    unless @bulletin.all_stories_done?
      pending = @bulletin.debug_stories.where.not(status: %w[done failed]).count
      raise "#{pending} stories still analyzing. Wait for completion."
    end

    if @bulletin.any_story_failed?
      failed = @bulletin.debug_stories.where(status: "failed").count
      Rails.logger.warn("[BulletinBuilder] Building bulletin with #{failed} failed stories")
    end

    polish_scripts!
    generate_welcome_closing!
    assemble_and_save!

    @bulletin.reload.master_json
  end

  private

  def generate_weather_tts!
    weather_narration = @bulletin.weather_json&.dig("narration", "weatherNarration") ||
                        @bulletin.weather_json&.dig(:narration, :weatherNarration)
    return unless weather_narration.present? && !@bulletin.weather_tts_audio.attached?

    Rails.logger.info("[BulletinBuilder] Generating weather TTS...")
    pcm = Gemini::TtsGenerator.new.generate(text: weather_narration, voice: "Orus")
    wav = Audio::WavBuilder.build(pcm)
    @bulletin.weather_tts_audio.attach(
      io: StringIO.new(wav),
      filename: "weather_tts.wav",
      content_type: "audio/wav"
    )
    Rails.logger.info("[BulletinBuilder] Weather TTS audio attached")
  rescue => e
    Rails.logger.warn("[BulletinBuilder] Weather TTS generation failed (non-fatal): #{e.message}")
  end

  def polish_scripts!
    done_stories = @bulletin.debug_stories.where(status: "done").where.not(user_id: nil).order(:story_number)
    stories_for_polish = done_stories.map { |s| { title: s.story_title, intro_text: s.intro_text } }

    return unless stories_for_polish.length > 1

    Rails.logger.info("[BulletinBuilder] Polishing #{stories_for_polish.length} story scripts...")
    generator = Gemini::ContentGenerator.new
    polish_result = generator.generate_json(
      DebugNews::PromptBuilder.script_polish_prompt(stories: stories_for_polish),
      temperature: 0.7
    )
    polished = polish_result[:parsed]
    intro_texts = polished["introTexts"] || polished[:introTexts] || []

    return unless intro_texts.length == done_stories.length

    done_stories.each_with_index do |story, idx|
      new_text = intro_texts[idx]
      next if new_text.blank?

      story.update!(intro_text: new_text)
      Rails.logger.info("[BulletinBuilder] Story ##{story.story_number} intro polished")

      begin
        pcm = Gemini::TtsGenerator.new.generate(text: new_text, voice: "Orus")
        wav = Audio::WavBuilder.build(pcm)
        story.tts_audio.attach(
          io: StringIO.new(wav),
          filename: "tts_story_#{story.story_number}.wav",
          content_type: "audio/wav"
        )
        Rails.logger.info("[BulletinBuilder] Story ##{story.story_number} TTS regenerated")
      rescue => e
        Rails.logger.warn("[BulletinBuilder] Story ##{story.story_number} TTS regen failed (non-fatal): #{e.message}")
      end
    end
  rescue => e
    Rails.logger.warn("[BulletinBuilder] Script polish failed (non-fatal): #{e.message}")
  end

  def generate_welcome_closing!
    done_stories = @bulletin.debug_stories.where(status: "done", user_id: nil).order(:story_number)
    story_summaries = done_stories.reload.map { |s| { emoji: s.story_emoji, title: s.story_title } }

    Rails.logger.info("[BulletinBuilder] Generating welcome/closing scripts...")
    generator = Gemini::ContentGenerator.new
    wc_result = generator.generate_json(
      DebugNews::PromptBuilder.welcome_closing_prompt(story_summaries: story_summaries),
      temperature: 0.7
    )
    wc = wc_result[:parsed]
    @welcome_script = wc["welcomeScript"] || wc[:welcomeScript]
    @closing_script = wc["closingScript"] || wc[:closingScript]

    if @welcome_script.present?
      Rails.logger.info("[BulletinBuilder] Generating welcome TTS...")
      pcm = Gemini::TtsGenerator.new.generate(text: @welcome_script, voice: "Orus")
      wav = Audio::WavBuilder.build(pcm)
      @bulletin.welcome_tts_audio.attach(
        io: StringIO.new(wav),
        filename: "welcome_tts.wav",
        content_type: "audio/wav"
      )
    end

    if @closing_script.present?
      Rails.logger.info("[BulletinBuilder] Generating closing TTS...")
      pcm = Gemini::TtsGenerator.new.generate(text: @closing_script, voice: "Orus")
      wav = Audio::WavBuilder.build(pcm)
      @bulletin.closing_tts_audio.attach(
        io: StringIO.new(wav),
        filename: "closing_tts.wav",
        content_type: "audio/wav"
      )
    end
  rescue => e
    Rails.logger.warn("[BulletinBuilder] Welcome/closing generation failed (non-fatal): #{e.message}")
  end

  def assemble_and_save!
    master = assemble_master_json
    master[:welcomeScript] = @welcome_script if @welcome_script.present?
    master[:closingScript] = @closing_script if @closing_script.present?
    @bulletin.update!(master_json: master, status: "ready")

    Rails.logger.info("[BulletinBuilder] Bulletin ##{@bulletin.id} built with #{master[:stories].length} stories")
  end

  def assemble_master_json
    customer_code = Rails.configuration.x.cloudflare.customer_code

    stories_data = @bulletin.debug_stories.where(status: "done").order(:story_number).map do |story|
      uid = story.cloudflare_stream_uid
      video_url = if uid.present? && customer_code.present?
                    "https://customer-#{customer_code}.cloudflarestream.com/#{uid}/manifest/video.m3u8"
                  else
                    "/debug/mock_news/stories/#{story.id}/video"
                  end

      poster_url = if uid.present? && customer_code.present?
                     "https://customer-#{customer_code}.cloudflarestream.com/#{uid}/thumbnails/thumbnail.jpg?time=1s&height=176&width=176&fit=crop"
                   end

      tts_url = story.tts_audio.attached? ? Rails.application.routes.url_helpers.rails_blob_path(story.tts_audio, only_path: true) : nil

      {
        storyId: story.id,
        storyNumber: story.story_number,
        storyType: story.story_type,
        storyTitle: story.story_title,
        storyEmoji: story.story_emoji,
        studioHeadline: story.gemini_json&.dig("studioHeadline") || story.story_title&.upcase,
        introText: story.intro_text,
        subtitleSegments: story.subtitle_segments,
        videoUrl: video_url,
        posterUrl: poster_url,
        ttsUrl: tts_url
      }
    end

    weather = @bulletin.weather_json || {}
    weather_tts_url = @bulletin.weather_tts_audio.attached? ? Rails.application.routes.url_helpers.rails_blob_path(@bulletin.weather_tts_audio, only_path: true) : nil

    bumper_uid = ENV["CLOUDFLARE_BUMPER_UID"]
    bumper_url = if bumper_uid.present? && customer_code.present?
                   "https://customer-#{customer_code}.cloudflarestream.com/#{bumper_uid}/manifest/video.m3u8"
                 else
                   "/MENNintroBlank.mp4"
                 end

    {
      bulletinId: @bulletin.id,
      createdAt: @bulletin.created_at&.iso8601,
      location: @bulletin.location,
      assets: {
        bumperUrl: bumper_url,
        studioBgUrl: "/newsBgEdited.jpeg"
      },
      weather: {
        raw: weather["raw"] || weather[:raw],
        report: weather["report"] || weather[:report],
        narration: weather["narration"] || weather[:narration],
        ttsUrl: weather_tts_url
      },
      stories: stories_data,
      ttsEnabled: true
    }
  end
end
