# Restructure Mock News: Synchronous Analysis, Background Storage

## Context

The `/debug/mock_news` upload flow is stuck because `story.media.attach(video)` writes large video blobs to Postgres synchronously (via `active_storage_db`). Meanwhile, `/newsroom` works fine because it sends the video directly to Gemini API using the temp file — no ActiveStorage involved.

**Goal**: Analyze videos synchronously on the request thread (like newsroom), defer the slow ActiveStorage/Postgres write to a background job.

## New Flow

```
User clicks "Upload & Analyze"
  → JS creates bulletin (lightweight POST, no files)
  → JS loops through videos ONE AT A TIME:
      → POST video + context to /debug/mock_news/bulletins/:id/stories
      → Controller uses temp file directly:
          1. Upload to Gemini File API
          2. Run analysis prompt (synchronous, ~30-120s)
          3. Save results to DB
          4. Copy temp file to tmp/debug_videos/
          5. Enqueue StoreDebugVideoJob
          6. Return analysis results
      → JS updates per-video progress (emoji + title appear immediately)
  → "Build Bulletin" button enables when all analyzed
```

## Files to Modify

### 1. Migration: `db/migrate/XXXX_add_temp_file_fields_to_debug_stories.rb` (new)

Add columns for background storage handoff:
- `temp_file_path` (string) — persistent tmp path for background job + video serving fallback
- `original_filename` (string) — preserve upload filename for ActiveStorage attach
- `content_type` (string) — preserve MIME type

### 2. Routes: `config/routes.rb`

Add inside `scope :debug`:
```ruby
post "mock_news/bulletins/:id/stories", to: "debug/mock_news#analyze_story"
get  "mock_news/stories/:id/video",    to: "debug/mock_news#serve_video"
```

Remove:
```ruby
post "mock_news/bulletins/:id/analyze", to: "debug/mock_news#analyze"
```

### 3. Controller: `app/controllers/debug/mock_news_controller.rb`

**Simplify `create_bulletin`** — no files, just creates DebugBulletin:
```ruby
def create_bulletin
  bulletin = DebugBulletin.create!(status: "draft")
  render json: { ok: true, bulletin_id: bulletin.id }
end
```

**New `analyze_story`** — receives ONE video, analyzes synchronously, enqueues storage:
- Validate file type/size
- Create DebugStory record
- Upload to Gemini via `Gemini::FileManager.new.upload_and_wait(video.tempfile.path, ...)`
- Analyze via `Gemini::ContentGenerator.new.generate_with_file(...)`
  Using `DebugNews::PromptBuilder.story_analysis_prompt(...)` (same prompt as current job)
- Save parsed results (gemini_json, story_title, story_emoji, intro_text, subtitle_segments)
- `FileUtils.cp(video.tempfile.path, staging_path)` — copy to `tmp/debug_videos/`
- `StoreDebugVideoJob.perform_later(story.id)`
- Delete Gemini file
- Return analysis results JSON

**New `serve_video`** — stable video URL that works pre/post ActiveStorage:
- If `story.media.attached?` → redirect to `rails_blob_path`
- Elsif temp file exists → `send_file` directly
- Else → 404

**Update `assemble_master_json`** — use new `serve_video` URL instead of `rails_blob_path`:
```ruby
video_url = "/debug/mock_news/stories/#{story.id}/video"
```

**Remove `analyze` action** (replaced by `analyze_story`)

**Add `analyze_story` and `serve_video` to `skip_forgery_protection`**

### 4. New Job: `app/jobs/store_debug_video_job.rb`

Reads from `story.temp_file_path`, attaches to ActiveStorage, cleans up:
```ruby
story.media.attach(io: File.open(path, "rb"), filename: story.original_filename, content_type: story.content_type)
story.update!(temp_file_path: nil)
File.delete(path) if File.exist?(path)
```

### 5. JS: `app/javascript/mock_news.js`

**Rewrite `uploadVideos()`** → sequential per-video flow:
1. `POST /debug/mock_news/bulletins` (lightweight, returns `bulletin_id`)
2. Loop through `collectedFiles`:
   - Build FormData with one video + `user_context` + `story_number`
   - `POST /debug/mock_news/bulletins/${bulletinId}/stories`
   - 600s timeout via `AbortSignal.timeout(600000)`
   - Update UI per story (show emoji + title as each completes)
3. Enable "Build Bulletin" when loop finishes

**Remove**:
- `analyzeVideos()` function
- `startPolling()` / `pollStatus()` — no longer needed
- `btn-analyze` event listener

**Keep**: `fetchWeather`, `buildBulletin`, `playBulletin` — unchanged (weather button enabled after bulletin creation)

### 6. View: `app/views/debug/mock_news/show.html.erb`

- Rename "Upload & Create Bulletin" button to **"Upload & Analyze"**
- Remove "Analyze Videos" button (`btn-analyze`)
- Move `story-status-list` div into the Video Stories card (shows progress inline during upload+analyze)
- Keep "Build Bulletin JSON" and "Play Bulletin" buttons as-is
- Enable weather button after bulletin creation (same as now)

### 7. Delete: `app/jobs/analyze_debug_story_job.rb`

No longer needed — analysis moved to controller.

## Key Reuse

- `Gemini::FileManager` (`app/services/gemini/file_manager.rb`) — `upload_and_wait`, `delete_file`
- `Gemini::ContentGenerator` (`app/services/gemini/content_generator.rb`) — `generate_with_file`
- `DebugNews::PromptBuilder` (`app/services/debug_news/prompt_builder.rb`) — `story_analysis_prompt`
- All analysis logic lifted directly from `AnalyzeDebugStoryJob` lines 18-59

## Verification

1. Deploy to Coolify
2. Go to `/debug/mock_news`, add 1-2 short videos
3. Click "Upload & Analyze" — should see per-video progress, each completing with emoji + title
4. Click "Build Bulletin JSON" → "Play Bulletin" — video playback should work
5. Check logs: `StoreDebugVideoJob` should complete in background
