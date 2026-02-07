class AddTempFileFieldsToDebugStories < ActiveRecord::Migration[8.0]
  def change
    add_column :debug_stories, :temp_file_path, :string
    add_column :debug_stories, :original_filename, :string
    add_column :debug_stories, :content_type, :string
  end
end
