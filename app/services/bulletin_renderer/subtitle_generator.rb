module BulletinRenderer
  class SubtitleGenerator
    # Convert subtitleSegments JSON array to ASS subtitle format
    # Scales timing to match actual TTS WAV duration
    def generate(segments, actual_duration:, output_path:)
      return nil if segments.blank?

      # Determine the estimated end time from the segments
      estimated_end = segments.map { |s| s["end"] || s[:end] || 0 }.max
      estimated_end = 1.0 if estimated_end <= 0

      scale_factor = actual_duration / estimated_end

      ass_content = ass_header
      ass_content += "\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"

      segments.each do |seg|
        start_time = (seg["start"] || seg[:start] || 0) * scale_factor
        end_time = (seg["end"] || seg[:end] || 0) * scale_factor
        text = (seg["text"] || seg[:text] || "").gsub("\n", "\\N")

        ass_content += "Dialogue: 0,#{format_ass_time(start_time)},#{format_ass_time(end_time)},Default,,0,0,0,,#{text}\n"
      end

      File.write(output_path, ass_content)
      output_path
    end

    private

    def ass_header
      <<~ASS
        [Script Info]
        ScriptType: v4.00+
        PlayResX: 1080
        PlayResY: 1920
        WrapStyle: 0

        [V4+ Styles]
        Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
        Style: Default,DejaVu Sans,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,3,2,0,2,40,40,180,1
      ASS
    end

    def format_ass_time(seconds)
      h = (seconds / 3600).to_i
      m = ((seconds % 3600) / 60).to_i
      s = (seconds % 60).to_i
      cs = ((seconds % 1) * 100).to_i
      format("%d:%02d:%02d.%02d", h, m, s, cs)
    end
  end
end
