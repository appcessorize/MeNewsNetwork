class Group < ApplicationRecord
  before_create :set_uuid

  belongs_to :creator, class_name: "User"

  has_many :group_memberships, dependent: :destroy
  has_many :members, through: :group_memberships, source: :user
  has_many :group_invites, dependent: :destroy
  has_many :debug_bulletins, dependent: :destroy

  validates :name, presence: true, length: { maximum: 100 }

  after_create :add_creator_as_member

  private

  def add_creator_as_member
    group_memberships.create!(user: creator, role: "admin")
  end

  def set_uuid
    self.id ||= SecureRandom.uuid
  end
end
