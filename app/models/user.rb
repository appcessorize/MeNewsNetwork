class User < ActiveRecord::Base
  validates :email, presence: true, uniqueness: true
  validates :google_uid, presence: true, uniqueness: true

  has_many :stories, dependent: :destroy
  has_many :comments, dependent: :destroy
  has_many :push_subscriptions, dependent: :destroy

  has_many :group_memberships, dependent: :destroy
  has_many :groups, through: :group_memberships
  has_many :created_groups, class_name: "Group", foreign_key: :creator_id, dependent: :nullify
  has_many :created_invites, class_name: "GroupInvite", foreign_key: :created_by_id, dependent: :destroy

  def in_any_group?
    groups.exists?
  end

  def primary_group
    groups.first
  end

  def self.find_or_create_from_google(profile)
    find_or_initialize_by(google_uid: profile[:sub]).tap do |user|
      user.email = profile[:email]
      user.name = profile[:name]
      user.avatar_url = profile[:picture]
      user.save!
    end
  end
end
