module Gemini
  class FileManager
    BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
    UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta"

    def initialize(api_key: Rails.configuration.x.gemini.api_key)
      @api_key = api_key
      @conn = Faraday.new do |f|
        f.options.timeout = 300
        f.options.open_timeout = 30
        f.adapter Faraday.default_adapter
      end
    end

    # Two-step resumable upload to Gemini File API
    def upload_file(file_path, mime_type:, display_name:)
      file_size = File.size(file_path)

      # Step 1: Initiate resumable upload
      init_response = @conn.post("#{UPLOAD_URL}/files") do |req|
        req.headers["X-Goog-Upload-Protocol"] = "resumable"
        req.headers["X-Goog-Upload-Command"] = "start"
        req.headers["X-Goog-Upload-Header-Content-Length"] = file_size.to_s
        req.headers["X-Goog-Upload-Header-Content-Type"] = mime_type
        req.headers["Content-Type"] = "application/json"
        req.params["key"] = @api_key
        req.body = { file: { display_name: display_name } }.to_json
      end

      unless init_response.success?
        Rails.logger.error("[gemini] Upload init failed: HTTP #{init_response.status} — #{init_response.body&.first(500)}")
        raise "Gemini upload init failed: HTTP #{init_response.status}"
      end

      upload_url = init_response.headers["x-goog-upload-url"]
      raise "Failed to get upload URL from Gemini" unless upload_url

      # Step 2: Upload the actual bytes
      Rails.logger.info("[gemini] Uploading #{(file_size / 1e6).round(1)} MB to Gemini...")
      file_data = File.binread(file_path)
      upload_response = @conn.post(upload_url) do |req|
        req.headers["X-Goog-Upload-Offset"] = "0"
        req.headers["X-Goog-Upload-Command"] = "upload, finalize"
        req.headers["Content-Length"] = file_size.to_s
        req.body = file_data
      end

      unless upload_response.success?
        Rails.logger.error("[gemini] Upload failed: HTTP #{upload_response.status} — #{upload_response.body&.first(500)}")
        raise "Gemini upload failed: HTTP #{upload_response.status}"
      end

      Rails.logger.info("[gemini] Upload complete, parsing response...")
      JSON.parse(upload_response.body, symbolize_names: true)
    end

    # Get file status (for polling)
    def get_file(file_name)
      response = @conn.get("#{BASE_URL}/#{file_name}") do |req|
        req.params["key"] = @api_key
      end

      unless response.success?
        Rails.logger.error("[gemini] get_file failed: HTTP #{response.status} — #{response.body&.first(500)}")
        raise "Gemini get_file failed: HTTP #{response.status}"
      end

      JSON.parse(response.body, symbolize_names: true)
    end

    # Delete a file
    def delete_file(file_name)
      @conn.delete("#{BASE_URL}/#{file_name}") do |req|
        req.params["key"] = @api_key
      end
    end

    # Upload and poll until ACTIVE (max 5 minutes)
    MAX_POLL_SECONDS = 300

    def upload_and_wait(file_path, mime_type:, display_name:)
      result = upload_file(file_path, mime_type: mime_type, display_name: display_name)
      file = result[:file]

      Rails.logger.info("[gemini] File uploaded: name=#{file[:name]}, state=#{file[:state]}, mimeType=#{file[:mimeType]}, sizeBytes=#{file[:sizeBytes]}, uri=#{file[:uri]}")

      poll_start = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      polls = 0

      while file[:state] == "PROCESSING"
        polls += 1
        elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - poll_start
        if elapsed > MAX_POLL_SECONDS
          raise "Gemini file processing timed out after #{elapsed.round}s (#{polls} polls). State still: #{file[:state]}"
        end
        Rails.logger.info("[gemini] File still processing (#{elapsed.round}s elapsed, poll ##{polls}), waiting 3s...")
        sleep(3)
        file = get_file(file[:name])
        if file[:error]
          Rails.logger.warn("[gemini] Poll ##{polls} error field present: #{file[:error].inspect}")
        end
      end

      unless file[:state] == "ACTIVE"
        Rails.logger.error("[gemini] File processing FAILED. Full response: state=#{file[:state]}, error=#{file[:error].inspect}, mimeType=#{file[:mimeType]}, sizeBytes=#{file[:sizeBytes]}, videoMetadata=#{file[:videoMetadata].inspect}, name=#{file[:name]}")
        error_detail = file[:error]&.dig(:message) || file[:error].inspect
        raise "File processing failed. State: #{file[:state]}. Error: #{error_detail}"
      end

      Rails.logger.info("[gemini] File is ACTIVE after #{polls} polls")
      file
    end

    private

    attr_reader :api_key, :conn
  end
end
