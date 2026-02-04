class AddFieldsToStories < ActiveRecord::Migration[8.1]
  def change
    add_column :stories, :story_type, :string
    add_column :stories, :broadcast_at, :datetime
    add_column :stories, :expires_at, :datetime
    add_column :stories, :analysis, :text
  end
end
