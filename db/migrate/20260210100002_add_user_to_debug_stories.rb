class AddUserToDebugStories < ActiveRecord::Migration[8.1]
  def change
    add_column :debug_stories, :user_id, :integer
    add_index :debug_stories, :user_id
    add_foreign_key :debug_stories, :users
  end
end
