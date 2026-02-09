// ──────────────────────────────────────────────
//  Me News Report — Debug Flow
// ──────────────────────────────────────────────
import Hls from "hls.js";

const LOG_START = performance.now();

let bulletinId = null;
let masterJson = null;

// Accumulated video files (File objects — lost on reload, but context survives)
let collectedFiles = [];

// Video context map: { filename: { who, where, extra, step } }
const STORAGE_KEY = "mockNewsContexts";

function loadContexts() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function saveContexts(contexts) { localStorage.setItem(STORAGE_KEY, JSON.stringify(contexts)); }
function getContext(filename) {
  const all = loadContexts();
  return all[filename] || { who: null, where: null, extra: null, step: 0 };
}
function setContext(filename, data) {
  const all = loadContexts();
  all[filename] = data;
  saveContexts(all);
}
function buildContextString(ctx) {
  const parts = [];
  if (ctx.who) parts.push("People: " + ctx.who);
  if (ctx.where) parts.push("Location: " + ctx.where);
  if (ctx.extra) parts.push("Notes: " + ctx.extra);
  return parts.join(". ");
}

// ── Interview questions ─────────────────────
const QUESTIONS = [
  { key: "who",   text: "Who is in this video?",         placeholder: "e.g. Hugo the dog, kids playing...", skip: "Don't know" },
  { key: "where", text: "Where is this?",                placeholder: "e.g. Regent's Park, London...",      skip: "Don't know" },
  { key: "extra", text: "Anything else we should know?",  placeholder: "e.g. happened yesterday, birthday party...", skip: "No" }
];

function init() {
  bindFileInput();
  bindButtons();
  restoreSavedVideos();
  log("Me News debug page ready.");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// ── CSRF Token ────────────────────────────────
function csrfToken() {
  return document.querySelector("meta[name='csrf-token']")?.content || "";
}

// ── Restore saved video names on reload ───────
function restoreSavedVideos() {
  if (Object.keys(loadContexts()).length > 0) renderVideoList();
}

// ── File Input — accumulate across picks ──────
function bindFileInput() {
  const input = document.getElementById("video-input");
  input.addEventListener("change", () => {
    Array.from(input.files).forEach(f => {
      log(`File picked: "${f.name}" (${(f.size / 1e6).toFixed(2)} MB, type="${f.type || "none"}", lastModified=${new Date(f.lastModified).toISOString()})`);
      const clone = new File([f], f.name, { type: f.type, lastModified: f.lastModified });
      collectedFiles.push(clone);
      const ctx = getContext(clone.name);
      if (ctx.step === 0 && !ctx.who && !ctx.where && !ctx.extra) {
        setContext(clone.name, { who: null, where: null, extra: null, step: 0 });
      }
    });
    input.value = "";
    renderVideoList();
    updateUploadButton();
  });
}

function updateUploadButton() {
  document.getElementById("btn-upload-videos").disabled = !collectedFiles.length;
}

// ── Render video list with chat interviews ────
function renderVideoList() {
  const container = document.getElementById("video-list");
  container.innerHTML = "";
  const all = loadContexts();
  const savedNames = Object.keys(all);

  if (collectedFiles.length === 0 && savedNames.length > 0) {
    const hint = document.createElement("div");
    hint.className = "p-3 bg-base-200 rounded-lg";
    hint.innerHTML = `
      <p class="text-xs text-base-content/60 mb-2">You have saved context for <strong>${savedNames.length}</strong> video(s) from before. Re-add the files to upload them.</p>
      <div class="flex flex-wrap gap-2">
        ${savedNames.map(name => `<span class="badge badge-sm badge-outline">${escapeHtml(name)}</span>`).join("")}
      </div>
      <button class="btn btn-xs btn-ghost btn-error mt-2" id="btn-clear-saved">Clear all saved</button>
    `;
    container.appendChild(hint);
    document.getElementById("btn-clear-saved")?.addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEY);
      renderVideoList();
    });
    return;
  }

  if (collectedFiles.length === 0) {
    container.innerHTML = '<p class="text-xs text-base-content/40 italic">No videos added yet. Use the file picker above.</p>';
    return;
  }

  collectedFiles.forEach((file, i) => {
    const ctx = getContext(file.name);
    const card = document.createElement("div");
    card.className = "bg-base-200 rounded-xl overflow-hidden";

    const header = document.createElement("div");
    header.className = "flex items-center gap-3 p-3";
    header.innerHTML = `
      <span class="badge badge-neutral badge-sm font-bold">${i + 1}</span>
      <div class="flex-1 min-w-0">
        <span class="text-sm font-medium truncate block">${escapeHtml(file.name)}</span>
        <span class="text-xs text-base-content/40">${(file.size / 1e6).toFixed(1)} MB</span>
      </div>
      <button class="btn btn-xs btn-ghost btn-error" data-remove-index="${i}">Remove</button>
    `;
    card.appendChild(header);

    const chat = document.createElement("div");
    chat.className = "px-3 pb-3";
    chat.id = "chat-" + i;
    renderChat(chat, file.name, ctx, i);
    card.appendChild(chat);
    container.appendChild(card);
  });

  container.querySelectorAll("[data-remove-index]").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.removeIndex, 10);
      const filename = collectedFiles[idx].name;
      collectedFiles.splice(idx, 1);
      const all = loadContexts();
      delete all[filename];
      saveContexts(all);
      renderVideoList();
      updateUploadButton();
    });
  });
}

// ── Render chat bubbles for one video ─────────
function renderChat(chatEl, filename, ctx, fileIndex) {
  chatEl.innerHTML = "";
  const currentStep = ctx.step || 0;

  for (let q = 0; q < QUESTIONS.length && q < currentStep; q++) {
    const question = QUESTIONS[q];
    chatEl.appendChild(makeBubble("question", question.text));
    chatEl.appendChild(makeBubble("answer", ctx[question.key] || "—"));
  }

  if (currentStep < QUESTIONS.length) {
    const question = QUESTIONS[currentStep];
    chatEl.appendChild(makeBubble("question", question.text));
    chatEl.appendChild(makeInputRow(filename, question, currentStep, fileIndex));
  } else {
    const summary = buildContextString(ctx);
    const done = document.createElement("div");
    done.className = "flex items-center gap-2 mt-2";
    done.innerHTML = summary
      ? `<span class="badge badge-success badge-xs">done</span>
         <span class="text-xs text-base-content/50">${escapeHtml(summary)}</span>
         <button class="btn btn-xs btn-ghost" data-redo-file="${escapeHtml(filename)}">Redo</button>`
      : `<span class="badge badge-ghost badge-xs">skipped</span>
         <span class="text-xs text-base-content/40">No context provided</span>
         <button class="btn btn-xs btn-ghost" data-redo-file="${escapeHtml(filename)}">Redo</button>`;
    chatEl.appendChild(done);
    done.querySelector("[data-redo-file]")?.addEventListener("click", () => {
      setContext(filename, { who: null, where: null, extra: null, step: 0 });
      renderVideoList();
    });
  }
}

function makeBubble(type, text) {
  const wrapper = document.createElement("div");
  if (type === "question") {
    wrapper.className = "chat chat-start mt-2";
    wrapper.innerHTML = `<div class="chat-bubble text-sm py-2 px-3" style="background:#e5e5ea;color:#000;">${escapeHtml(text)}</div>`;
  } else {
    wrapper.className = "chat chat-end";
    wrapper.innerHTML = `<div class="chat-bubble text-sm py-2 px-3" style="background:#007aff;color:#fff;">${escapeHtml(text)}</div>`;
  }
  return wrapper;
}

function makeInputRow(filename, question, step, fileIndex) {
  const row = document.createElement("div");
  row.className = "flex items-end gap-2 mt-1 ml-2";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = question.placeholder;
  input.className = "input input-bordered input-sm flex-1 text-sm";

  const sendBtn = document.createElement("button");
  sendBtn.className = "btn btn-sm btn-primary";
  sendBtn.textContent = "Send";

  const skipBtn = document.createElement("button");
  skipBtn.className = "btn btn-sm btn-ghost";
  skipBtn.textContent = question.skip;

  function submitAnswer(value) {
    const ctx = getContext(filename);
    ctx[question.key] = value || null;
    ctx.step = step + 1;
    setContext(filename, ctx);
    const chatEl = document.getElementById("chat-" + fileIndex);
    if (chatEl) renderChat(chatEl, filename, ctx, fileIndex);
  }

  sendBtn.addEventListener("click", () => submitAnswer(input.value.trim()));
  skipBtn.addEventListener("click", () => submitAnswer(null));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submitAnswer(input.value.trim()); }
  });

  row.appendChild(input);
  row.appendChild(sendBtn);
  row.appendChild(skipBtn);
  setTimeout(() => input.focus(), 50);
  return row;
}

// ── Button Bindings ───────────────────────────
function bindButtons() {
  document.getElementById("btn-upload-videos").addEventListener("click", uploadAndAnalyze);
  document.getElementById("btn-fetch-weather").addEventListener("click", fetchWeather);
  document.getElementById("btn-build").addEventListener("click", buildBulletin);
  document.getElementById("btn-render")?.addEventListener("click", startRender);
  document.getElementById("btn-clear-log").addEventListener("click", () => {
    document.getElementById("event-log").textContent = "";
  });
}

// ── Upload & Analyze (fire-and-forget + poll) ───
let pollTimer = null;

async function uploadAndAnalyze() {
  if (!collectedFiles.length) return;

  setButtonLoading("btn-upload-videos", true);
  const statusList = document.getElementById("story-status-list");
  statusList.classList.remove("hidden");
  statusList.innerHTML = "";

  try {
    // 1. Create lightweight bulletin (no files)
    log("Creating bulletin...");
    const bulletinResp = await fetch("/debug/mock_news/bulletins", {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken(), "Content-Type": "application/json" }
    });
    const bulletinData = await bulletinResp.json();
    if (!bulletinData.ok) {
      log("ERROR: " + bulletinData.error);
      showToast("Create Failed", bulletinData.error, "error");
      setButtonLoading("btn-upload-videos", false);
      return;
    }

    bulletinId = bulletinData.bulletin_id;
    log("Bulletin #" + bulletinId + " created.");
    document.getElementById("upload-status").textContent = "Bulletin #" + bulletinId;
    document.getElementById("btn-fetch-weather").disabled = false;

    // 2. Upload each video (server returns immediately, analysis is background)
    const fileMap = {};
    for (let i = 0; i < collectedFiles.length; i++) {
      const file = collectedFiles[i];
      const storyNumber = i + 1;
      const userContext = buildContextString(getContext(file.name));
      fileMap[storyNumber] = file.name;

      renderStoryStatus(statusList, {
        story_number: storyNumber,
        status: "uploading",
        uploadPct: 0,
        story_emoji: null,
        story_title: null,
        filename: file.name,
        error_message: null
      });

      log(`[${storyNumber}/${collectedFiles.length}] Uploading "${file.name}" (${(file.size / 1e6).toFixed(1)} MB, type=${file.type || "unknown"})...`);

      try {
        const formData = new FormData();
        formData.append("video", file);
        formData.append("story_number", storyNumber);
        if (userContext) formData.append("user_context", userContext);

        const data = await uploadWithProgress(
          `/debug/mock_news/bulletins/${bulletinId}/stories`,
          formData,
          (pct) => {
            updateStoryStatus(statusList, storyNumber, {
              story_number: storyNumber,
              status: "uploading",
              uploadPct: pct,
              story_emoji: null,
              story_title: null,
              filename: file.name,
              error_message: null
            });
          }
        );

        if (data.ok) {
          log(`[${storyNumber}] Uploaded — analyzing in background (story_id=${data.story?.id})...`);
          updateStoryStatus(statusList, storyNumber, {
            story_number: storyNumber,
            status: "analyzing",
            story_emoji: null,
            story_title: null,
            filename: file.name,
            error_message: null
          });
        } else {
          throw new Error(data.error);
        }
      } catch (err) {
        log(`[${storyNumber}] Upload FAILED: ${err.message}`);
        updateStoryStatus(statusList, storyNumber, {
          story_number: storyNumber,
          status: "failed",
          story_emoji: null,
          story_title: null,
          filename: file.name,
          error_message: err.message
        });
        showToast("Upload Failed", `Story ${storyNumber}: ${err.message}`, "error");
      }
    }

    // 3. Start polling for status updates
    log("All videos uploaded. Polling for analysis results...");
    startStatusPolling(statusList, fileMap);

  } catch (err) {
    log("Upload failed: " + err.message);
    showToast("Upload Failed", err.message, "error");
    setButtonLoading("btn-upload-videos", false);
  }
}

function startStatusPolling(statusList, fileMap) {
  if (pollTimer) clearInterval(pollTimer);

  pollTimer = setInterval(async () => {
    try {
      const resp = await fetch(`/debug/mock_news/bulletins/${bulletinId}/status`);
      const data = await resp.json();
      if (!data.ok) return;

      let allDone = true;
      data.stories.forEach(s => {
        const filename = fileMap[s.story_number] || "";
        updateStoryStatus(statusList, s.story_number, {
          story_number: s.story_number,
          status: s.status,
          story_emoji: s.story_emoji,
          story_title: s.story_title,
          filename: filename,
          error_message: s.error_message
        });

        if (s.status === "analyzing") allDone = false;
        if (s.status === "failed" && s.error_message) {
          log(`  ↳ Story ${s.story_number} FAILED: ${s.error_message}`);
        }
      });

      if (allDone) {
        clearInterval(pollTimer);
        pollTimer = null;
        setButtonLoading("btn-upload-videos", false);

        const doneCount = data.stories_done;
        const failedCount = data.stories_failed;
        log(`All stories processed: ${doneCount} done, ${failedCount} failed.`);

        if (doneCount > 0) {
          document.getElementById("btn-build").disabled = false;
          showToast("All Analyzed", `${doneCount} stories ready to build`, "success");
        }

        data.stories.forEach(s => {
          if (s.status === "done") {
            showToast("Story Analyzed", `${s.story_emoji || "✅"} ${s.story_title}`, "success");
          } else if (s.status === "failed") {
            showToast("Analysis Failed", `Story ${s.story_number}: ${s.error_message}`, "error");
          }
        });
      }
    } catch (err) {
      log("Polling error: " + err.message);
    }
  }, 3000);
}

// ── Upload with progress (XHR for upload events) ──
function uploadWithProgress(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startTime = performance.now();
    xhr.open("POST", url);
    xhr.setRequestHeader("X-CSRF-Token", csrfToken());
    xhr.timeout = 600000;

    let lastProgressLog = 0;
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        if (onProgress) onProgress(pct);
        // Log at 25% intervals to avoid spam
        if (pct >= lastProgressLog + 25 || pct === 100) {
          const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
          log(`  ↳ upload progress: ${pct}% (${(e.loaded / 1e6).toFixed(1)}/${(e.total / 1e6).toFixed(1)} MB, ${elapsed}s)`);
          lastProgressLog = pct;
        }
      }
    });

    xhr.upload.addEventListener("error", () => {
      log("  ↳ upload stream error (network dropped during send)");
    });

    xhr.addEventListener("load", () => {
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      log(`  ↳ server responded: HTTP ${xhr.status} after ${elapsed}s`);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          log(`  ↳ invalid JSON response body: ${xhr.responseText.substring(0, 100)}`);
          reject(new Error("Invalid JSON response"));
        }
      } else {
        log(`  ↳ error body: ${xhr.responseText.substring(0, 300)}`);
        reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText.substring(0, 200)}`));
      }
    });

    xhr.addEventListener("error", () => {
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      log(`  ↳ XHR network error after ${elapsed}s (connection lost or CORS issue)`);
      reject(new Error("Network error"));
    });
    xhr.addEventListener("timeout", () => {
      log("  ↳ XHR timeout after 600s");
      reject(new Error("Upload timed out (10 min)"));
    });
    xhr.addEventListener("abort", () => {
      log("  ↳ XHR aborted (page navigated away or manual cancel)");
      reject(new Error("Upload aborted"));
    });

    // Log FormData details for debugging
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        log(`  ↳ FormData: ${key} = File("${value.name}", size=${(value.size / 1e6).toFixed(2)}MB, type="${value.type}")`);
      }
    }

    xhr.send(formData);
  });
}

// ── Story status rendering helpers ───────────
function renderStoryStatus(container, s) {
  const div = document.createElement("div");
  div.className = "flex items-center gap-3 p-2 rounded bg-base-200";
  div.dataset.storyNumber = s.story_number;
  div.innerHTML = storyStatusHtml(s);
  container.appendChild(div);
}

function updateStoryStatus(container, storyNumber, s) {
  const div = container.querySelector(`[data-story-number="${storyNumber}"]`);
  if (div) {
    div.innerHTML = storyStatusHtml(s);
  }
}

function storyStatusHtml(s) {
  const bc = { pending: "badge-ghost", uploading: "badge-info", analyzing: "badge-warning", done: "badge-success", failed: "badge-error" }[s.status] || "badge-ghost";
  const spinner = (s.status === "analyzing" || s.status === "uploading") ? '<span class="loading loading-spinner loading-xs"></span>' : '';
  const statusLabel = s.status === "uploading" ? `uploading ${s.uploadPct || 0}%` : s.status;
  const titleText = s.status === "uploading" ? "Uploading..." : (s.story_title || "Analyzing...");

  let progressBar = "";
  if (s.status === "uploading") {
    progressBar = `<div class="w-full bg-base-300 rounded-full h-1.5 mt-1">
      <div class="h-full bg-info rounded-full transition-all duration-300" style="width: ${s.uploadPct || 0}%"></div>
    </div>`;
  }

  return `
    <span class="badge ${bc} badge-sm gap-1">${spinner}${statusLabel}</span>
    <span class="text-sm flex-1">
      ${s.story_emoji || "📹"} Story ${s.story_number}:
      <strong>${escapeHtml(titleText)}</strong>
      ${s.filename ? `<span class="text-xs text-base-content/40">(${escapeHtml(s.filename)})</span>` : ""}
      ${progressBar}
    </span>
    ${s.error_message ? `<span class="text-xs text-error break-all">${escapeHtml(s.error_message)}</span>` : ""}
  `;
}

// ── Fetch Weather ─────────────────────────────
async function fetchWeather() {
  if (!bulletinId) return log("ERROR: Create a bulletin first");
  log("Fetching weather for London, UK...");
  setButtonLoading("btn-fetch-weather", true);
  document.getElementById("weather-status").textContent = "Fetching...";

  try {
    const resp = await fetch(`/debug/mock_news/bulletins/${bulletinId}/weather`, {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken(), "Accept": "application/json" }
    });
    const data = await resp.json();
    if (data.ok) {
      log("Weather fetched successfully.");
      document.getElementById("weather-status").textContent = "Done";
      const output = document.getElementById("weather-output");
      output.classList.remove("hidden");
      output.querySelector("pre").textContent = JSON.stringify(data.weather, null, 2);
      showToast("Weather Ready", data.weather?.narration?.weatherHeadline || "London weather loaded", "success");
    } else {
      log("Weather error: " + data.error);
      document.getElementById("weather-status").textContent = "Failed";
      showToast("Weather Failed", data.error, "error");
    }
  } catch (err) {
    log("Weather failed: " + err.message);
    document.getElementById("weather-status").textContent = "Failed";
  } finally {
    setButtonLoading("btn-fetch-weather", false);
  }
}

// ── Build Bulletin ────────────────────────────
async function buildBulletin() {
  if (!bulletinId) return log("ERROR: Create a bulletin first");
  log("Building master bulletin JSON...");
  setButtonLoading("btn-build", true);

  try {
    const resp = await fetch(`/debug/mock_news/bulletins/${bulletinId}/build`, {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken(), "Accept": "application/json" }
    });
    const data = await resp.json();
    if (data.ok) {
      masterJson = data.master;
      log("Bulletin built: " + masterJson.stories.length + " stories.");
      document.getElementById("master-json-output").textContent = JSON.stringify(masterJson, null, 2);
      document.getElementById("btn-render").disabled = false;
      showToast("Bulletin Ready", "Press Render Video to start server-side rendering!", "success");
    } else {
      log("Build error: " + data.error);
      showToast("Build Failed", data.error, "error");
    }
  } catch (err) { log("Build failed: " + err.message); }
  finally { setButtonLoading("btn-build", false); }
}

// ══════════════════════════════════════════════
//  SERVER-SIDE RENDER
// ══════════════════════════════════════════════
let renderPollTimer = null;

async function startRender() {
  if (!bulletinId) return log("ERROR: Build the bulletin first");
  log("Starting server-side render...");
  setButtonLoading("btn-render", true);

  try {
    const resp = await fetch(`/debug/mock_news/bulletins/${bulletinId}/render`, {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken(), "Accept": "application/json" }
    });
    const data = await resp.json();

    if (data.ok) {
      log("Render job enqueued.");
      showRenderProgress();
      startRenderPolling();
    } else {
      log("Render error: " + data.error);
      showToast("Render Failed", data.error, "error");
      setButtonLoading("btn-render", false);
    }
  } catch (err) {
    log("Render start failed: " + err.message);
    showToast("Render Failed", err.message, "error");
    setButtonLoading("btn-render", false);
  }
}

function showRenderProgress() {
  const section = document.getElementById("render-progress-section");
  if (section) section.classList.remove("hidden");
}

function startRenderPolling() {
  if (renderPollTimer) clearInterval(renderPollTimer);

  renderPollTimer = setInterval(async () => {
    try {
      const resp = await fetch(`/debug/mock_news/bulletins/${bulletinId}/render_status`);
      const data = await resp.json();
      if (!data.ok) return;

      // Update progress bar
      const bar = document.getElementById("render-bar");
      const stepEl = document.getElementById("render-step");
      const pctEl = document.getElementById("render-pct");

      if (bar) bar.style.width = (data.render_progress || 0) + "%";
      if (stepEl) stepEl.textContent = data.render_step || "Working...";
      if (pctEl) pctEl.textContent = (data.render_progress || 0) + "%";

      log(`[Render] ${data.render_progress}% — ${data.render_step}`);

      if (data.render_status === "done") {
        clearInterval(renderPollTimer);
        renderPollTimer = null;
        setButtonLoading("btn-render", false);

        log("Render complete! Video UID: " + data.rendered_video_uid);
        showToast("Render Complete", "Your bulletin video is ready!", "success");

        if (data.video_url) {
          showVideoPlayer(data.video_url);
        }
      } else if (data.render_status === "failed") {
        clearInterval(renderPollTimer);
        renderPollTimer = null;
        setButtonLoading("btn-render", false);

        log("Render FAILED: " + data.render_error);
        showToast("Render Failed", data.render_error || "Unknown error", "error");

        if (stepEl) stepEl.textContent = "Failed: " + (data.render_error || "Unknown error");
      }
    } catch (err) {
      log("Render poll error: " + err.message);
    }
  }, 3000);
}

// ── Simple HLS Video Player ───────────────────
let playerHls = null;

function showVideoPlayer(videoUrl) {
  const section = document.getElementById("player-section");
  section.classList.remove("hidden");
  section.scrollIntoView({ behavior: "smooth" });

  // Pick the visible video element (desktop or mobile)
  const isMobile = window.matchMedia("(max-width: 767px)").matches;
  const video = document.getElementById(isMobile ? "rendered-video-mobile" : "rendered-video");

  if (playerHls) {
    playerHls.destroy();
    playerHls = null;
  }

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    // Native HLS (Safari/iOS)
    video.src = videoUrl;
    video.play().catch(() => {});
  } else if (Hls.isSupported()) {
    playerHls = new Hls();
    playerHls.loadSource(videoUrl);
    playerHls.attachMedia(video);
    playerHls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });
    playerHls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        log("[Player] HLS fatal error: " + data.details);
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) playerHls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) playerHls.recoverMediaError();
      }
    });
  } else {
    video.src = videoUrl;
    video.play().catch(() => {});
  }

  log("[Player] Playing rendered bulletin: " + videoUrl.substring(0, 80));
}

// ── Apple-style Toast ─────────────────────────
function showToast(title, body, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const emojis = { info: "📺", success: "✅", error: "❌", warning: "⚠️" };
  const toast = document.createElement("div");
  toast.setAttribute("role", "alert");
  toast.className = "bg-base-100 rounded-2xl shadow-2xl border border-base-300/50 backdrop-blur-sm cursor-pointer transition-all duration-300 ease-out opacity-0 translate-y-[-8px] scale-95 w-80 overflow-hidden";
  toast.innerHTML = `
    <div class="flex items-start gap-3 p-4">
      <div class="text-2xl shrink-0 mt-0.5">${emojis[type] || emojis.info}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-2">
          <h3 class="font-semibold text-sm text-base-content truncate">${escapeHtml(title)}</h3>
          <span class="text-[10px] text-base-content/40 shrink-0">now</span>
        </div>
        <p class="text-xs text-base-content/60 mt-0.5 line-clamp-2">${escapeHtml(body)}</p>
      </div>
    </div>
  `;
  toast.addEventListener("click", () => {
    toast.classList.add("opacity-0", "translate-y-[-8px]", "scale-95");
    setTimeout(() => toast.remove(), 300);
  });
  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove("opacity-0", "translate-y-[-8px]", "scale-95");
    toast.classList.add("opacity-100", "translate-y-0", "scale-100");
  });
  setTimeout(() => {
    toast.classList.remove("opacity-100", "translate-y-0", "scale-100");
    toast.classList.add("opacity-0", "translate-y-[-8px]", "scale-95");
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// ── Logging ───────────────────────────────────
function log(message) {
  const el = document.getElementById("event-log");
  if (!el) return;
  const elapsed = ((performance.now() - LOG_START) / 1000).toFixed(1);
  const time = new Date().toLocaleTimeString();
  const line = `[${time} +${elapsed}s] ${message}`;
  el.textContent += line + "\n";
  el.scrollTop = el.scrollHeight;
  console.log(`[MeNews +${elapsed}s]`, message);
}

// ── Utilities ─────────────────────────────────
function setButtonLoading(id, loading) {
  const btn = document.getElementById(id);
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent;
    btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Working...';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.originalText || btn.textContent;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
