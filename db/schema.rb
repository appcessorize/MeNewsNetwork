# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_02_03_103253) do
  create_table "active_storage_attachments", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.bigint "record_id", null: false
    t.string "record_type", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.string "content_type"
    t.datetime "created_at", null: false
    t.string "filename", null: false
    t.string "key", null: false
    t.text "metadata"
    t.string "service_name", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_db_files", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.binary "data", null: false
    t.string "ref", null: false
    t.index ["ref"], name: "index_active_storage_db_files_on_ref", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "comments", force: :cascade do |t|
    t.text "body"
    t.string "comment_type"
    t.datetime "created_at", null: false
    t.string "emoji"
    t.integer "story_id", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["story_id"], name: "index_comments_on_story_id"
    t.index ["user_id"], name: "index_comments_on_user_id"
  end

  create_table "debug_bulletins", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "location", default: "London, UK", null: false
    t.json "master_json"
    t.string "status", default: "draft", null: false
    t.datetime "updated_at", null: false
    t.json "weather_json"
    t.index ["status"], name: "index_debug_bulletins_on_status"
  end

  create_table "debug_stories", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "debug_bulletin_id", null: false
    t.text "error_message"
    t.json "gemini_json"
    t.text "intro_text"
    t.string "status", default: "pending", null: false
    t.string "story_emoji"
    t.integer "story_number", null: false
    t.string "story_title"
    t.string "story_type", default: "video", null: false
    t.json "subtitle_segments"
    t.datetime "updated_at", null: false
    t.text "user_context"
    t.index ["debug_bulletin_id", "story_number"], name: "index_debug_stories_on_debug_bulletin_id_and_story_number", unique: true
    t.index ["debug_bulletin_id"], name: "index_debug_stories_on_debug_bulletin_id"
    t.index ["status"], name: "index_debug_stories_on_status"
  end

# Could not dump table "group_invites" because of following StandardError
#   Unknown type 'uuid' for column 'group_id'


# Could not dump table "group_memberships" because of following StandardError
#   Unknown type 'uuid' for column 'group_id'


# Could not dump table "groups" because of following StandardError
#   Unknown type 'uuid' for column 'id'


  create_table "push_subscriptions", force: :cascade do |t|
    t.text "auth"
    t.datetime "created_at", null: false
    t.text "endpoint"
    t.text "p256dh"
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["user_id"], name: "index_push_subscriptions_on_user_id"
  end

  create_table "stories", force: :cascade do |t|
    t.text "analysis"
    t.text "body"
    t.datetime "broadcast_at"
    t.datetime "created_at", null: false
    t.datetime "expires_at"
    t.string "gemini_session_id"
    t.string "story_type"
    t.string "title"
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.string "video_uid"
    t.index ["user_id"], name: "index_stories_on_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.string "avatar_url"
    t.datetime "created_at", null: false
    t.string "email"
    t.string "google_uid"
    t.string "name"
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["google_uid"], name: "index_users_on_google_uid", unique: true
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "comments", "stories"
  add_foreign_key "comments", "users"
  add_foreign_key "debug_stories", "debug_bulletins"
  add_foreign_key "group_invites", "groups"
  add_foreign_key "group_invites", "users", column: "created_by_id"
  add_foreign_key "group_memberships", "groups"
  add_foreign_key "group_memberships", "users"
  add_foreign_key "groups", "users", column: "creator_id"
  add_foreign_key "push_subscriptions", "users"
  add_foreign_key "stories", "users"
end
