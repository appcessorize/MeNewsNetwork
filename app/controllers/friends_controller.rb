class FriendsController < ApplicationController
  before_action :require_login!

  def show
    @has_groups = current_user.in_any_group?

    if @has_groups
      @group = current_user.primary_group
      @members = @group.members.order(:name)
    end
  end

  def create_invite
    group = current_user.primary_group

    unless group
      render json: { error: "No group found" }, status: :unprocessable_entity
      return
    end

    invite, token = GroupInvite.create_for_group(group: group, user: current_user)
    invite_url = join_url(token)

    render json: {
      invite_url: invite_url,
      expires_at: invite.expires_at.iso8601
    }
  end

  def create_group
    group = Group.create!(
      name: params[:name].presence || "#{current_user.name}'s Group",
      creator: current_user
    )

    redirect_to friends_path, notice: "Group created!"
  rescue ActiveRecord::RecordInvalid => e
    redirect_to friends_path, alert: e.message
  end

  private

  def friends_path
    "/friends"
  end
end
