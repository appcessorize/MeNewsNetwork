module Api
  class BulletinContributionsController < BaseController
    before_action :require_login!

    MAX_FILE_SIZE = 200.megabytes
    ALLOWED_TYPES = %w[video/mp4 video/quicktime video/webm video/x-msvideo video/mpeg].freeze

    def create
      group = current_user.primary_group
      unless group
        return render json: { ok: false, error: "You must be in a group to contribute" }, status: :unprocessable_entity
      end

      video = params[:video]
      unless video.present? && video.respond_to?(:tempfile)
        return render json: { ok: false, error: "No video file provided" }, status: :bad_request
      end

      unless ALLOWED_TYPES.include?(video.content_type)
        return render json: { ok: false, error: "Unsupported video type: #{video.content_type}" }, status: :bad_request
      end

      if video.size > MAX_FILE_SIZE
        return render json: { ok: false, error: "Video exceeds 200MB limit" }, status: :bad_request
      end

      tempfile_size = video.tempfile.size rescue 0
      if tempfile_size < 1000
        return render json: { ok: false, error: "Video file appears empty or corrupted" }, status: :bad_request
      end

      bulletin = DebugBulletin.find_or_create_for_group_today!(group)

      story_number = bulletin.debug_stories.maximum(:story_number).to_i + 1

      user_context = [
        params[:who].presence && "Who: #{params[:who]}",
        params[:when_answer].presence && "When: #{params[:when_answer]}",
        params[:where_answer].presence && "Where: #{params[:where_answer]}",
        params[:context].presence && "Context: #{params[:context]}"
      ].compact.join("\n")

      story = bulletin.debug_stories.create!(
        user: current_user,
        story_number: story_number,
        story_type: "video",
        user_context: user_context.presence,
        status: "analyzing",
        original_filename: video.original_filename,
        content_type: video.content_type
      )

      r2 = Cloudflare::R2Client.new
      if r2.configured?
        r2_key = "stories/#{story.id}/video#{File.extname(video.original_filename)}"
        r2.upload(r2_key, video.tempfile.path, content_type: video.content_type)
        story.update!(r2_video_key: r2_key)
      else
        staging_dir = Rails.root.join("tmp", "debug_videos")
        FileUtils.mkdir_p(staging_dir)
        staging_path = staging_dir.join("story_#{story.id}#{File.extname(video.original_filename)}")
        FileUtils.cp(video.tempfile.path, staging_path)
        story.update!(temp_file_path: staging_path.to_s)
      end

      AnalyzeDebugStoryJob.perform_later(story.id)

      render json: {
        ok: true,
        bulletin_id: bulletin.id,
        story_id: story.id,
        story_number: story.story_number,
        status: story.status
      }, status: :accepted
    rescue ActiveRecord::RecordNotUnique
      retry
    end
  end
end
