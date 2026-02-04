class Story < ApplicationRecord
  belongs_to :user
  has_many :comments, dependent: :destroy

  has_many_attached :images
  has_many_attached :voice_notes
  has_many_attached :media

  STORY_TYPES = %w[text image video audio].freeze

  validates :story_type, inclusion: { in: STORY_TYPES }, allow_nil: true

  scope :active, -> { where("expires_at > ?", Time.current) }
  scope :todays, -> { where(created_at: Time.current.beginning_of_day..Time.current.end_of_day) }

  before_create :set_broadcast_and_expiry

  def expired?
    expires_at.present? && expires_at < Time.current
  end

  def broadcast_time
    broadcast_at || created_at.change(hour: 19)
  end

  private

  def set_broadcast_and_expiry
    self.broadcast_at ||= created_at_or_now.change(hour: 19)
    self.expires_at ||= created_at_or_now.end_of_day
  end

  def created_at_or_now
    created_at || Time.current
  end
end
