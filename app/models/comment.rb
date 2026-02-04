class Comment < ApplicationRecord
  belongs_to :user
  belongs_to :story

  has_many_attached :media

  COMMENT_TYPES = %w[text image video audio].freeze
  EMOJI_OPTIONS = %w[👍 ❤️ 😂 😮 😢 🔥 💯 🎯 📰 🗞️].freeze

  validates :comment_type, inclusion: { in: COMMENT_TYPES }, allow_nil: true
  validates :body, presence: true, if: -> { comment_type == "text" }
end
