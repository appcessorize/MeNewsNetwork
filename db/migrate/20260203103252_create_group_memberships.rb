class CreateGroupMemberships < ActiveRecord::Migration[8.1]
  def change
    create_table :group_memberships, id: :uuid do |t|
      t.references :group, null: false, type: :uuid, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.string :role, default: "member", null: false

      t.timestamps
    end

    add_index :group_memberships, [ :group_id, :user_id ], unique: true
  end
end
