class DebugStory < ApplicationRecord
  belongs_to :debug_bulletin

  has_one_attached :media
  has_one_attached :tts_audio

  STATUSES = %w[pending analyzing done failed].freeze
  STORY_TYPES = %w[video].freeze

  validates :status, inclusion: { in: STATUSES }
  validates :story_type, inclusion: { in: STORY_TYPES }
  validates :story_number, presence: true,
            uniqueness: { scope: :debug_bulletin_id }
end
