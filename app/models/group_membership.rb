class GroupMembership < ApplicationRecord
  ROLES = %w[admin member].freeze

  before_create :set_uuid

  belongs_to :group
  belongs_to :user

  validates :role, inclusion: { in: ROLES }
  validates :user_id, uniqueness: { scope: :group_id, message: "is already a member" }

  private

  def set_uuid
    self.id ||= SecureRandom.uuid
  end
end
