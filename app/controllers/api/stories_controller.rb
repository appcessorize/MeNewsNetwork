module Api
  class StoriesController < BaseController
    before_action :require_session_user!
    before_action :set_story, only: %i[add_voice_note add_image]

    # POST /api/stories
    def create
      story = current_user.stories.create!(
        title: params[:title].presence || "Untitled",
        body: params[:body]
      )

      render json: {
        ok: true,
        story: story_json(story),
        user: { name: current_user.name, email: current_user.email, avatar_url: current_user.avatar_url }
      }
    end

    # POST /api/stories/:id/voice_notes
    def add_voice_note
      file = params[:voice_note]
      unless file.is_a?(ActionDispatch::Http::UploadedFile)
        return render json: { ok: false, error: "No audio file provided." }, status: :bad_request
      end

      @story.voice_notes.attach(file)

      render json: {
        ok: true,
        voice_note: {
          url: url_for(@story.voice_notes.last),
          filename: @story.voice_notes.last.filename.to_s,
          content_type: @story.voice_notes.last.content_type
        }
      }
    end

    # POST /api/stories/:id/images
    def add_image
      file = params[:image]
      unless file.is_a?(ActionDispatch::Http::UploadedFile)
        return render json: { ok: false, error: "No image file provided." }, status: :bad_request
      end

      @story.images.attach(file)

      render json: {
        ok: true,
        image: {
          url: url_for(@story.images.last),
          filename: @story.images.last.filename.to_s,
          content_type: @story.images.last.content_type
        }
      }
    end

    private

    def require_session_user!
      return if current_user

      render json: { ok: false, error: "Not authenticated." }, status: :unauthorized
    end

    def set_story
      @story = current_user.stories.find(params[:id])
    rescue ActiveRecord::RecordNotFound
      render json: { ok: false, error: "Story not found." }, status: :not_found
    end

    def story_json(story)
      {
        id: story.id,
        title: story.title,
        body: story.body,
        created_at: story.created_at.iso8601
      }
    end
  end
end
