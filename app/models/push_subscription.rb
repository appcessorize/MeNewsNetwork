class PushSubscription < ApplicationRecord
  belongs_to :user

  validates :endpoint, presence: true
  validates :p256dh, presence: true
  validates :auth, presence: true
  validates :endpoint, uniqueness: { scope: :user_id }
end
