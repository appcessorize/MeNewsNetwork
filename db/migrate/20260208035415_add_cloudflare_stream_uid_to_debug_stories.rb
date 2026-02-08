class AddCloudflareStreamUidToDebugStories < ActiveRecord::Migration[8.0]
  def change
    add_column :debug_stories, :cloudflare_stream_uid, :string
  end
end
