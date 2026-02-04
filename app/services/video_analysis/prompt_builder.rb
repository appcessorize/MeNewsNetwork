module VideoAnalysis
  class PromptBuilder
    def self.analysis_prompt
      <<~PROMPT
        You are a precise video analyst. Analyze this video and produce timestamp-segmented annotations.

        RULES:
        1. Create "description" segments as the main structure — one per meaningful visual change (scene, action, subject, camera angle).
        2. Create "speech" segments when someone speaks. Transcribe spoken words as best you can.
        3. Create "sound" segments for significant non-speech audio (applause, door slam, car horn, music, etc.).
        4. Speech and sound segments CAN overlap the same time range as description segments.
        5. Do NOT do frame-by-frame analysis. Only create a new segment when something meaningfully changes.
        6. Aim for roughly 6–25 description segments depending on video length.
        7. Use MM:SS format for all timestamps (e.g. 00:00, 01:23, 10:05).
        8. Every segment must have start < end.
        9. Segments must be in chronological order.
        10. If unsure about speech, use "(unclear)" rather than guessing.
        11. If unsure about a sound, use "(unclear)" rather than guessing.

        Pay close attention to:
        - Visual scene changes, actions, subjects, and camera movements.
        - All spoken words (dialogue, narration, voice-over).
        - Significant non-speech audio (music, sound effects, environmental sounds).

        Return ONLY valid JSON in this exact schema — no markdown, no backticks, no extra text:
        {
          "segments": [
            { "start": "MM:SS", "end": "MM:SS", "tag": "description", "text": "..." },
            { "start": "MM:SS", "end": "MM:SS", "tag": "speech", "text": "..." },
            { "start": "MM:SS", "end": "MM:SS", "tag": "sound", "text": "..." }
          ]
        }
      PROMPT
    end

    def self.script_prompt(segments_text)
      <<~PROMPT
        You are an experienced TV news scriptwriter. You have just watched the video clip above and here is a detailed breakdown of what happens in it:

        #{segments_text}

        Write a newsreader introduction script for this clip. The script is what the news anchor reads on-camera BEFORE the clip plays, to set context for the viewer.

        RULES:
        1. Write in a professional broadcast news tone — clear, concise, authoritative.
        2. Open with a strong lead sentence that captures the story.
        3. Provide just enough context so the viewer understands what they are about to see.
        4. End with a natural hand-off line like "Take a look." or "Here's the footage." or similar.
        5. Keep it to 3–6 sentences (roughly 15–30 seconds of reading time).
        6. Do NOT describe frame-by-frame what happens — the viewer is about to watch the clip.
        7. If speech is present in the clip, you may reference what is said but don't quote it at length.
        8. Use present tense for immediacy where appropriate.
        9. Do NOT use markdown formatting. Return plain text only.

        Return ONLY the script text, nothing else.
      PROMPT
    end

    def self.weather_prompt(meteo_data)
      <<~PROMPT
        You are a friendly TV weather presenter. Here is raw weather data for London, UK from the Open-Meteo API:

        #{JSON.pretty_generate(meteo_data)}

        Produce a JSON weather report with this EXACT schema (no markdown, no backticks):
        {
          "location": "London, UK",
          "current": {
            "emoji": "<single weather emoji>",
            "summary": "<one sentence current conditions>",
            "temp_c": <number>,
            "feels_like": "<e.g. Chilly>",
            "wind_kmh": <number>,
            "humidity_pct": <number>
          },
          "daily": [
            {
              "day": "<e.g. Today, Tomorrow, Wednesday>",
              "emoji": "<single weather emoji>",
              "high_c": <number>,
              "low_c": <number>,
              "summary": "<short forecast sentence>"
            }
          ],
          "headline": "<catchy 1-sentence weather headline with emoji>",
          "advice": "<practical tip, e.g. bring an umbrella>"
        }

        Rules:
        - Use appropriate weather emojis
        - "daily" array should have one entry per forecast day (up to 3 days).
        - Temperatures as numbers, not strings.
        - Be warm, conversational, slightly witty in summaries.
      PROMPT
    end
  end
end
