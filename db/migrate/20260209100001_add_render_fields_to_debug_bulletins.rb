class AddRenderFieldsToDebugBulletins < ActiveRecord::Migration[8.1]
  def change
    add_column :debug_bulletins, :render_status, :string
    add_column :debug_bulletins, :render_progress, :integer, default: 0
    add_column :debug_bulletins, :render_step, :string
    add_column :debug_bulletins, :render_error, :text
    add_column :debug_bulletins, :render_log, :text
    add_column :debug_bulletins, :rendered_video_uid, :string
  end
end
