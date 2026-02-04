class CreateDebugStories < ActiveRecord::Migration[8.1]
  def change
    create_table :debug_stories do |t|
      t.references :debug_bulletin, null: false, foreign_key: true
      t.integer :story_number, null: false
      t.string :story_type, default: "video", null: false
      t.text :user_context
      t.json :gemini_json
      t.string :story_title
      t.string :story_emoji
      t.text :intro_text
      t.json :subtitle_segments
      t.string :status, default: "pending", null: false
      t.text :error_message

      t.timestamps
    end

    add_index :debug_stories, [:debug_bulletin_id, :story_number], unique: true
    add_index :debug_stories, :status
  end
end
