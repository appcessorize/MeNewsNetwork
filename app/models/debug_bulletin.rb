class DebugBulletin < ApplicationRecord
  has_many :debug_stories, -> { order(:story_number) }, dependent: :destroy
  has_one_attached :weather_tts_audio

  STATUSES = %w[draft analyzing ready failed].freeze
  RENDER_STATUSES = %w[queued rendering done failed].freeze

  validates :status, inclusion: { in: STATUSES }
  validates :location, presence: true

  scope :recent, -> { order(created_at: :desc) }

  def all_stories_done?
    debug_stories.where.not(status: %w[done failed]).none?
  end

  def any_story_failed?
    debug_stories.where(status: "failed").any?
  end

  def render_in_progress?
    render_status == "rendering"
  end

  def renderable?
    status == "ready" && !render_in_progress?
  end
end
