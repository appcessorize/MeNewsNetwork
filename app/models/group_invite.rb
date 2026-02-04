class GroupInvite < ApplicationRecord
  EXPIRY_DURATION = 7.days

  before_create :set_uuid

  belongs_to :group
  belongs_to :created_by, class_name: "User"

  validates :token_digest, presence: true, uniqueness: true
  validates :expires_at, presence: true

  before_validation :set_expiry, on: :create

  scope :active, -> { where("expires_at > ?", Time.current) }

  # Generate a new invite with secure token
  def self.create_for_group(group:, user:, max_uses: nil)
    token = SecureRandom.urlsafe_base64(32)
    invite = create!(
      group: group,
      created_by: user,
      token_digest: digest(token),
      max_uses: max_uses
    )
    [invite, token]
  end

  def self.find_by_token(token)
    return nil if token.blank?
    find_by(token_digest: digest(token))
  end

  def self.digest(token)
    Digest::SHA256.hexdigest(token)
  end

  def valid_for_use?
    !expired? && !exhausted?
  end

  def expired?
    expires_at < Time.current
  end

  def exhausted?
    max_uses.present? && use_count >= max_uses
  end

  def redeem!(user)
    return false unless valid_for_use?
    return false if group.members.include?(user)

    transaction do
      group.group_memberships.create!(user: user)
      increment!(:use_count)
    end
    true
  end

  private

  def set_expiry
    self.expires_at ||= EXPIRY_DURATION.from_now
  end

  def set_uuid
    self.id ||= SecureRandom.uuid
  end
end
