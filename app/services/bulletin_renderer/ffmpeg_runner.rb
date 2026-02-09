require "open3"

class BulletinRenderer
  class FfmpegRunner
    class FfmpegError < StandardError; end

    # Execute an FFmpeg/FFprobe command, log output, raise on failure
    def run(command, label: "ffmpeg")
      Rails.logger.info("[FFmpeg] #{label}: #{command}")

      stdout, stderr, status = Open3.capture3(command)

      unless status.success?
        error_tail = stderr.to_s.split("\n").last(20).join("\n")
        raise FfmpegError, "#{label} failed (exit #{status.exitstatus}):\n#{error_tail}"
      end

      { stdout: stdout, stderr: stderr }
    end

    # Get duration of an audio or video file in seconds
    def probe_duration(file_path)
      cmd = "ffprobe -v quiet -show_entries format=duration -of csv=p=0 #{Shellwords.escape(file_path)}"
      result = run(cmd, label: "probe_duration")
      duration = result[:stdout].strip.to_f
      raise FfmpegError, "Could not determine duration for #{file_path}" if duration <= 0
      duration
    end

    # Get video dimensions
    def probe_dimensions(file_path)
      cmd = "ffprobe -v quiet -select_streams v:0 -show_entries stream=width,height -of csv=p=0 #{Shellwords.escape(file_path)}"
      result = run(cmd, label: "probe_dimensions")
      parts = result[:stdout].strip.split(",")
      { width: parts[0].to_i, height: parts[1].to_i }
    end
  end
end
