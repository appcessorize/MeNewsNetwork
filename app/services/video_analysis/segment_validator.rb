module VideoAnalysis
  class SegmentValidator
    VALID_TAGS = %w[description speech sound].freeze

    def self.validate(segments)
      segments
        .select { |s| s[:start] && s[:end] && s[:tag] && s[:text] }
        .map { |s| normalize_segment(s) }
        .select { |s| timestamp_to_seconds(s[:start]) < timestamp_to_seconds(s[:end]) }
    end

    def self.normalize_segment(segment)
      {
        start: normalize_timestamp(segment[:start].to_s),
        end: normalize_timestamp(segment[:end].to_s),
        tag: VALID_TAGS.include?(segment[:tag].to_s) ? segment[:tag].to_s : "description",
        text: segment[:text].to_s.strip
      }
    end

    def self.normalize_timestamp(ts)
      ts = ts.strip

      # HH:MM:SS → MM:SS
      if (m = ts.match(/^(\d+):(\d{2}):(\d{2})$/))
        total_min = m[1].to_i * 60 + m[2].to_i
        return format("%02d:%s", total_min, m[3])
      end

      # MM:SS
      if (m = ts.match(/^(\d{1,3}):(\d{2})$/))
        return format("%02d:%s", m[1].to_i, m[2])
      end

      # Seconds only
      if (m = ts.match(/^(\d+)$/))
        total = m[1].to_i
        minutes = total / 60
        seconds = total % 60
        return format("%02d:%02d", minutes, seconds)
      end

      "00:00"
    end

    def self.timestamp_to_seconds(ts)
      parts = ts.split(":").map(&:to_i)
      case parts.length
      when 2 then parts[0] * 60 + parts[1]
      when 3 then parts[0] * 3600 + parts[1] * 60 + parts[2]
      else 0
      end
    end

    def self.compare_timestamps(a, b)
      diff = timestamp_to_seconds(a[:start]) - timestamp_to_seconds(b[:start])
      return diff unless diff == 0

      order = { "description" => 0, "speech" => 1, "sound" => 2 }
      (order[a[:tag]] || 0) - (order[b[:tag]] || 0)
    end
  end
end
