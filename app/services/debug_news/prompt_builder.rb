module DebugNews
  class PromptBuilder
    # Per-story analysis prompt — sent with video file reference
    def self.story_analysis_prompt(story_number:, user_context: nil)
      context_block = if user_context.present?
        <<~CTX

          IMPORTANT — The user has provided this context about the video. USE IT to identify people by name, mention the specific location, and weave these details into the introText naturally:

          userContext: "#{user_context}"

          If the context names a person (e.g. "People: Hugo the dog"), refer to them BY NAME in the introText (e.g. "Hugo" not "a dog").
          If it provides a location, name it specifically.
        CTX
      else
        ""
      end

      <<~PROMPT
        You are a charismatic local news presenter writing a script for a community news bulletin.
        Your style is warm, personable, slightly cheeky — like a beloved local news anchor.
        Think of a friendly evening news show: conversational but professional.

        Rules:
        - Output must be a single valid JSON object. No markdown, no backticks, no extra text.
        - Never invent file paths, URLs, IDs, or storage locations. Only echo the provided identifiers.
        - You MAY and SHOULD identify people/animals by name if the userContext names them.
        - Be specific about locations if the userContext provides them.
        - Your introText should sound like it's being READ ALOUD by a newsreader on camera.
        - Use present tense and active voice. Be vivid and engaging.

        Examples of good introText style:
        - "And now to an interesting one — Hugo the labrador has been making waves down at Regent's Park this afternoon. Let's take a look at what he's been up to..."
        - "Next up, some action from the local football scene. It's been a cracking match down at Hackney Marshes today..."
        - "Now over to Shoreditch, where something rather unusual has been spotted on the high street..."
        - "And finally tonight, a heartwarming story coming to us from a garden in Hampstead..."

        You will receive:
        1) A video clip (attached)
        2) A storyId and fileRef that must be echoed back exactly
        3) Optional user context text describing who/what is in the video
        #{context_block}
        Return STRICT JSON matching this schema exactly:

        {
          "storyId": #{story_number},
          "fileRef": "story_#{story_number}",
          "storyTitle": "string",
          "storyEmoji": "string",
          "studioHeadline": "string",
          "introText": "string",
          "subtitleSegments": [
            { "start": number, "end": number, "text": "string" }
          ]
        }

        Constraints:
        - storyTitle: 2-4 words, Title Case, descriptive (e.g. "Hugo's Park Adventure", "Local Derby Drama").
        - storyEmoji: exactly ONE emoji character that represents this story.
        - studioHeadline: 1-3 words, ALL CAPS (e.g. "PARK CHAOS", "LOCAL SPORT").
        - introText: 2-4 sentences. Must be written AS A SPOKEN NEWS SCRIPT. Warm, engaging, local-news style. 15-25 seconds reading time. Reference people/places by name from userContext. End with a natural lead-in to the video like "let's take a look" or "here's what happened".
        - Do NOT start introText with positional phrases like "first up", "next up", "and now", "moving on", "finally". Jump straight into the story content. Each introText is read independently — avoid assuming position in a sequence.
        - subtitleSegments:
          - Must cover the FULL introText word-for-word.
          - Start at 0.0 and be monotonic increasing.
          - 3-6 segments, each 2-5 seconds long.
          - Each segment text should be a contiguous chunk of introText (no new words).
          - Use seconds with 1 decimal place (e.g., 0.0, 3.2, 6.8).
          - Estimate realistic reading pace (~150 words/minute, ~2.5 words/second).

        Now analyze this story:

        storyId: #{story_number}
        fileRef: "story_#{story_number}"
      PROMPT
    end

    # Weather narration prompt — text-only, returns a spoken weather line
    def self.weather_narration_prompt(weather_json)
      <<~PROMPT
        You are a friendly TV weather presenter on a local news bulletin.
        Deliver the weather like you're chatting to the audience — warm, clear, maybe a light joke.

        Rules:
        - Output must be a single valid JSON object. No markdown, no backticks, no extra text.
        - Use Celsius and plain language.
        - If fields are missing, omit them rather than guessing.
        - The narration should sound SPOKEN — contractions, natural phrasing.

        Example style:
        "Right, let's have a look at the weather then! It's been a gorgeous day here in London — we've hit about 18 degrees this afternoon with plenty of sunshine. But don't put the brollies away just yet, because tomorrow's looking a bit cloudier with a chance of showers in the evening. Wrap up warm if you're heading out early!"

        Given this weather JSON for London, UK, produce a weather script.

        Return STRICT JSON:
        {
          "weatherHeadline": "string (catchy one-line weather headline, no emoji in this field)",
          "weatherNarration": "string (3-5 sentence spoken weather script, warm and conversational, reference specific temperatures and conditions)",
          "weatherEmoji": "string (single emoji for current conditions)",
          "subtitleSegments": [
            { "start": number, "end": number, "text": "string" }
          ]
        }

        SubtitleSegments rules:
        - Must cover the FULL weatherNarration word-for-word
        - Start at 0.0, monotonic increasing
        - 3-6 segments, each 2-5 seconds
        - Estimate realistic reading pace (~150 words/minute)
        - Seconds with 1 decimal place
        - No line breaks in segment text

        weatherJson: #{JSON.pretty_generate(weather_json)}
      PROMPT
    end

    # Welcome & closing scripts — text-only
    def self.welcome_closing_prompt(story_summaries:)
      stories_list = story_summaries.map.with_index(1) do |s, i|
        "#{i}. #{s[:emoji]} #{s[:title]}"
      end.join("\n")

      <<~PROMPT
        You are a warm, charismatic local TV news anchor opening and closing tonight's community bulletin.

        Rules:
        - Output must be a single valid JSON object. No markdown, no backticks, no extra text.
        - Write as SPOKEN script — contractions, natural phrasing, conversational tone.
        - Reference the actual story topics in the welcome to preview what's coming.

        Return STRICT JSON:
        {
          "welcomeScript": "string (3-4 sentences: greet viewers warmly, briefly preview the stories coming up by mentioning what they're about, set a friendly and upbeat tone)",
          "closingScript": "string (2-3 sentences: wrap up the bulletin warmly, then include this CTA: 'Don't forget to add your videos, pictures and news in the app for tomorrow's bulletin.' End with a friendly sign-off.)"
        }

        Stories in tonight's bulletin:
        #{stories_list}
      PROMPT
    end

    # Script polish pass — rewrites all introTexts for coherence
    def self.script_polish_prompt(stories:)
      stories_list = stories.map.with_index(1) do |s, i|
        "#{i}. Title: #{s[:title]}\n   Current introText: #{s[:intro_text]}"
      end.join("\n\n")

      <<~PROMPT
        You are a broadcast news producer polishing the scripts for tonight's community news bulletin.
        You have #{stories.length} story introductions that will be read by a news anchor on camera.
        Each intro leads into a user-submitted video clip.

        Rules:
        - Output must be a single valid JSON object. No markdown, no backticks, no extra text.
        - Rewrite each introText to create a coherent, varied bulletin flow.
        - Do NOT start any intro with "first up", "next up", "and now", "moving on", "finally", or similar positional phrases.
        - Vary the openers — some can jump straight into the action, some can set a scene, some can address the viewer.
        - Maintain warm, local-news, conversational tone.
        - Keep each intro 15-25 seconds reading time (roughly 40-65 words).
        - Each intro must still end with a natural lead-in to the video (e.g. "let's take a look", "here's what happened").
        - Preserve story-specific details (names, places, events) from the originals.
        - Return the SAME number of intros in the SAME order.

        Return STRICT JSON:
        {
          "introTexts": ["string", "string", ...]
        }

        Current scripts:
        #{stories_list}
      PROMPT
    end

    # Bulletin polish pass — text-only, generates transitions
    def self.bulletin_polish_prompt(story_summaries:, weather_headline:)
      stories_list = story_summaries.map.with_index(1) do |s, i|
        "#{i}. #{s[:emoji]} #{s[:title]} — #{s[:intro]}"
      end.join("\n")

      <<~PROMPT
        You are a broadcast news producer writing tonight's bulletin script.
        The tone is LOCAL NEWS — friendly, community-focused, slightly informal.

        Rules:
        - Output must be a single valid JSON object. No markdown, no backticks, no extra text.
        - Do not invent story file URLs or IDs.
        - Keep it warm, conversational, and suitable for general audiences.
        - Write as SPOKEN script — use contractions, natural flow.

        Example bulletinIntro: "Good evening and welcome to the seven o'clock news! I'm your host, and we've got a packed show for you tonight."
        Example storyTransition: "Right, moving on now to something a bit different..."
        Example closingLine: "And that's all from us tonight! Stay safe, and we'll see you same time tomorrow. Goodnight!"

        Return STRICT JSON:
        {
          "bulletinIntro": "string (1-2 sentences, warm greeting to open the show)",
          "storyTransitions": ["string (one per story, natural lead-in)"],
          "weatherOutro": "string (hand over to weather, e.g. 'Now let's check in on the weather...')",
          "closingLine": "string (friendly sign-off to end the bulletin)"
        }

        Input data (do not reorder stories):

        location: "London, UK"
        weatherHeadline: "#{weather_headline}"

        stories:
        #{stories_list}
      PROMPT
    end
  end
end
