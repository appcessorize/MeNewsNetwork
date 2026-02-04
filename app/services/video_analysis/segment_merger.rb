module VideoAnalysis
  class SegmentMerger
    SIMILARITY_THRESHOLD = 0.6
    GAP_THRESHOLD = 1 # seconds

    def self.merge(segments)
      descriptions = segments.select { |s| s[:tag] == "description" }
      others = segments.reject { |s| s[:tag] == "description" }

      descriptions.sort! { |a, b| SegmentValidator.compare_timestamps(a, b) }

      merged = []
      descriptions.each do |seg|
        prev = merged.last
        if prev
          prev_end = SegmentValidator.timestamp_to_seconds(prev[:end])
          cur_start = SegmentValidator.timestamp_to_seconds(seg[:start])
          gap = cur_start - prev_end

          if gap <= GAP_THRESHOLD && texts_similar?(prev[:text], seg[:text])
            prev[:end] = seg[:end]
            prev[:text] = "#{prev[:text]}; #{seg[:text]}"
            next
          end
        end
        merged << seg.dup
      end

      (merged + others).sort { |a, b| SegmentValidator.compare_timestamps(a, b) }
    end

    def self.texts_similar?(a, b)
      words_a = Set.new(a.downcase.split(/\s+/))
      words_b = Set.new(b.downcase.split(/\s+/))
      intersection = words_a & words_b
      union = words_a | words_b
      return false if union.empty?

      jaccard = intersection.size.to_f / union.size
      jaccard > SIMILARITY_THRESHOLD
    end
  end
end
