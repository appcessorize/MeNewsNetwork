class CreatePushSubscriptions < ActiveRecord::Migration[8.1]
  def change
    create_table :push_subscriptions do |t|
      t.references :user, null: false, foreign_key: true
      t.text :endpoint
      t.text :p256dh
      t.text :auth

      t.timestamps
    end
  end
end
