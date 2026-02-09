class AddR2KeysToDebugStories < ActiveRecord::Migration[8.1]
  def change
    add_column :debug_stories, :r2_video_key, :string
    add_column :debug_stories, :r2_tts_key, :string
    add_column :debug_stories, :r2_poster_key, :string
  end
end
