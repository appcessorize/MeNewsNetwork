class CreateComments < ActiveRecord::Migration[8.1]
  def change
    create_table :comments do |t|
      t.references :user, null: false, foreign_key: true
      t.references :story, null: false, foreign_key: true
      t.text :body
      t.string :emoji
      t.string :comment_type

      t.timestamps
    end
  end
end
