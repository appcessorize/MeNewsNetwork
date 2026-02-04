class StoriesController < ApplicationController
  before_action :require_login!
  before_action :set_story, only: :show

  def index
    @stories = Story.includes(:user, :comments).todays.order(created_at: :desc)
  end

  def show
    @comments = @story.comments.includes(:user).order(created_at: :asc)
  end

  private

  def set_story
    @story = Story.find(params[:id])
  end
end
