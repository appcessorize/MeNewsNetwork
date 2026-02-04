class CreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.string :email
      t.string :name
      t.string :avatar_url
      t.string :google_uid

      t.timestamps
    end
    add_index :users, :email, unique: true
    add_index :users, :google_uid, unique: true
  end
end
