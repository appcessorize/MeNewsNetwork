class CreateDebugBulletins < ActiveRecord::Migration[8.1]
  def change
    create_table :debug_bulletins do |t|
      t.string :location, default: "London, UK", null: false
      t.json :weather_json
      t.string :status, default: "draft", null: false
      t.json :master_json

      t.timestamps
    end

    add_index :debug_bulletins, :status
  end
end
