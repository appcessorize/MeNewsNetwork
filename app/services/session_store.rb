class SessionStore
  EXPIRY_SECONDS = 30 * 60 # 30 minutes

  def initialize
    @store = Concurrent::Map.new
    start_reaper_thread
  end

  def set(id, data)
    @store[id] = data.merge(created_at: Time.now.to_f)
  end

  def get(id)
    entry = @store[id]
    return nil unless entry

    if Time.now.to_f - entry[:created_at] > EXPIRY_SECONDS
      delete(id)
      return nil
    end

    entry
  end

  def delete(id)
    entry = @store.delete(id)
    return unless entry

    # Clean up Gemini file in background
    Thread.new do
      begin
        Gemini::FileManager.new.delete_file(entry[:gemini_file_name])
        Rails.logger.info("[session-store] Deleted Gemini file for session #{id}")
      rescue => e
        Rails.logger.warn("[session-store] Failed to delete Gemini file: #{e.message}")
      end
    end
  end

  private

  def start_reaper_thread
    Thread.new do
      loop do
        sleep 60
        now = Time.now.to_f
        @store.each_pair do |key, val|
          if now - val[:created_at] > EXPIRY_SECONDS
            delete(key)
            Rails.logger.info("[session-reaper] Expired session #{key}")
          end
        end
      rescue => e
        Rails.logger.warn("[session-reaper] Error: #{e.message}")
      end
    end
  end
end
