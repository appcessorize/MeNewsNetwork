class CommentsController < ApplicationController
  before_action :require_login!
  before_action :set_story

  def create
    @comment = @story.comments.build(comment_params)
    @comment.user = current_user

    if @comment.save
      redirect_to story_path(@story), notice: "Comment added."
    else
      redirect_to story_path(@story), alert: "Could not save comment."
    end
  end

  private

  def set_story
    @story = Story.find(params[:story_id])
  end

  def comment_params
    params.require(:comment).permit(:body, :emoji, :comment_type, media: [])
  end
end
