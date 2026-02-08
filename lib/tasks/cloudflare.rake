namespace :cloudflare do
  desc "Upload bumper video to Cloudflare Stream (one-time)"
  task upload_bumper: :environment do
    bumper_path = Rails.root.join("public", "MENNintroBlank.mp4")

    unless File.exist?(bumper_path)
      abort "Bumper video not found at #{bumper_path}"
    end

    client = Cloudflare::StreamClient.new
    unless client.configured?
      abort "Cloudflare credentials not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN."
    end

    puts "Uploading #{bumper_path} (#{(File.size(bumper_path) / 1e6).round(1)} MB)..."
    result = client.upload_video(bumper_path.to_s, filename: "MENNintroBlank.mp4")
    uid = result[:uid]
    puts "Upload complete. UID: #{uid}"

    puts "Waiting for video to be ready..."
    max_wait = 5 * 60 # 5 minutes
    interval = 5
    elapsed = 0

    loop do
      if client.video_ready?(uid)
        puts "Video is ready!"
        break
      end

      elapsed += interval
      if elapsed >= max_wait
        puts "Timed out after #{max_wait / 60} minutes. Video may still be processing."
        puts "Check status later with: Cloudflare::StreamClient.new.video_ready?(\"#{uid}\")"
        break
      end

      print "."
      sleep interval
    end

    puts ""
    puts "=" * 60
    puts "Set this env var in Coolify (or .env):"
    puts ""
    puts "  CLOUDFLARE_BUMPER_UID=#{uid}"
    puts ""
    puts "=" * 60
  end
end
