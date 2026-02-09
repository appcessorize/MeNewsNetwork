class AddGroupFieldsToBulletins < ActiveRecord::Migration[8.1]
  def change
    add_column :debug_bulletins, :group_id, :string
    add_column :debug_bulletins, :bulletin_date, :date

    add_index :debug_bulletins, [:group_id, :bulletin_date], unique: true,
              where: "group_id IS NOT NULL AND bulletin_date IS NOT NULL",
              name: "index_debug_bulletins_on_group_date"
    add_foreign_key :debug_bulletins, :groups
  end
end
