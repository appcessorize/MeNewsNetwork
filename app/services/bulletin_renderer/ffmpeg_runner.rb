require "open3"

class BulletinRenderer
  class FfmpegRunner
    class FfmpegError < StandardError; end

    TIMEOUT = 300 # 5 minutes per FFmpeg command
    PROBE_TIMEOUT = 30 # 30 seconds for probe commands

    # Execute an FFmpeg/FFprobe command with timeout, log output, raise on failure
    def run(command, label: "ffmpeg", timeout: TIMEOUT)
      Rails.logger.info("[FFmpeg] START #{label}: #{command}")
      t0 = Process.clock_gettime(Process::CLOCK_MONOTONIC)

      Open3.popen3(command) do |stdin, stdout, stderr, wait_thr|
        stdin.close

        # Read output in threads to prevent pipe buffer deadlock
        stdout_thread = Thread.new { stdout.read }
        stderr_thread = Thread.new { stderr.read }

        if wait_thr.join(timeout)
          stdout_str = stdout_thread.value
          stderr_str = stderr_thread.value
          elapsed = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - t0).round(2)

          unless wait_thr.value.success?
            error_tail = stderr_str.to_s.split("\n").last(20).join("\n")
            Rails.logger.error("[FFmpeg] FAILED #{label} after #{elapsed}s (exit #{wait_thr.value.exitstatus}):\n#{error_tail}")
            raise FfmpegError, "#{label} failed (exit #{wait_thr.value.exitstatus}):\n#{error_tail}"
          end

          Rails.logger.info("[FFmpeg] DONE #{label} in #{elapsed}s")
          return { stdout: stdout_str, stderr: stderr_str }
        else
          # Timeout — kill the process
          Process.kill("TERM", wait_thr.pid) rescue nil
          sleep 1
          Process.kill("KILL", wait_thr.pid) rescue nil
          elapsed = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - t0).round(2)
          Rails.logger.error("[FFmpeg] TIMEOUT #{label} after #{elapsed}s — killed pid #{wait_thr.pid}")
          raise FfmpegError, "#{label} timed out after #{timeout}s"
        end
      end
    end

    # Get duration of an audio or video file in seconds
    def probe_duration(file_path)
      cmd = "ffprobe -v quiet -show_entries format=duration -of csv=p=0 #{Shellwords.escape(file_path)}"
      result = run(cmd, label: "probe_duration", timeout: PROBE_TIMEOUT)
      duration = result[:stdout].strip.to_f
      raise FfmpegError, "Could not determine duration for #{file_path}" if duration <= 0
      duration
    end

    # Get video dimensions
    def probe_dimensions(file_path)
      cmd = "ffprobe -v quiet -select_streams v:0 -show_entries stream=width,height -of csv=p=0 #{Shellwords.escape(file_path)}"
      result = run(cmd, label: "probe_dimensions", timeout: PROBE_TIMEOUT)
      parts = result[:stdout].strip.split(",")
      { width: parts[0].to_i, height: parts[1].to_i }
    end
  end
end
