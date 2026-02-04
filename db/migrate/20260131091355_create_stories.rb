class CreateStories < ActiveRecord::Migration[8.1]
  def change
    create_table :stories do |t|
      t.references :user, null: false, foreign_key: true
      t.string :title
      t.text :body
      t.string :gemini_session_id
      t.string :video_uid

      t.timestamps
    end
  end
end
