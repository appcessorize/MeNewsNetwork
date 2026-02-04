class CreateGroupInvites < ActiveRecord::Migration[8.1]
  def change
    create_table :group_invites, id: :uuid do |t|
      t.references :group, null: false, type: :uuid, foreign_key: true
      t.references :created_by, null: false, foreign_key: { to_table: :users }
      t.string :token_digest, null: false
      t.datetime :expires_at, null: false
      t.integer :max_uses
      t.integer :use_count, default: 0, null: false

      t.timestamps
    end

    add_index :group_invites, :token_digest, unique: true
  end
end
