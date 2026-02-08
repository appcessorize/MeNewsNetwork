// ──────────────────────────────────────────────
//  Mock News Report — Debug Flow
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
  initBuffers();
  restoreSavedVideos();
  log("Mock News debug page ready.");
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
      // Clone File so it survives input.value="" on iOS Safari
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
  document.getElementById("btn-play").addEventListener("click", playBulletin);
  document.getElementById("btn-clear-log").addEventListener("click", () => {
    document.getElementById("event-log").textContent = "";
  });
  document.getElementById("btn-player-pause")?.addEventListener("click", togglePause);
  document.getElementById("btn-player-next")?.addEventListener("click", skipToNextSegment);
  document.getElementById("btn-player-stop")?.addEventListener("click", stopPlayer);
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
    const fileMap = {}; // storyNumber -> filename
    for (let i = 0; i < collectedFiles.length; i++) {
      const file = collectedFiles[i];
      const storyNumber = i + 1;
      const userContext = buildContextString(getContext(file.name));
      fileMap[storyNumber] = file.name;

      // Show "uploading" status with 0%
      renderStoryStatus(statusList, {
        story_number: storyNumber,
        status: "uploading",
        uploadPct: 0,
        story_emoji: null,
        story_title: null,
        filename: file.name,
        error_message: null
      });

      log(`[${storyNumber}/${collectedFiles.length}] Uploading "${file.name}" (${(file.size / 1e6).toFixed(1)} MB)...`);

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
          log(`[${storyNumber}] Uploaded — analyzing in background...`);
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

        // Show toast for each completed story
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
    xhr.open("POST", url);
    xhr.setRequestHeader("X-CSRF-Token", csrfToken());
    xhr.timeout = 600000; // 10 minutes

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid JSON response"));
        }
      } else {
        reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText.substring(0, 200)}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.addEventListener("timeout", () => reject(new Error("Upload timed out (10 min)")));
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

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
    ${s.error_message ? `<span class="text-xs text-error max-w-xs truncate">${escapeHtml(s.error_message)}</span>` : ""}
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
      document.getElementById("btn-play").disabled = false;
      showToast("Bulletin Ready", "Press Play!", "success");
    } else {
      log("Build error: " + data.error);
      showToast("Build Failed", data.error, "error");
    }
  } catch (err) { log("Build failed: " + err.message); }
  finally { setButtonLoading("btn-build", false); }
}

// ══════════════════════════════════════════════
//  BULLETIN PLAYER
// ══════════════════════════════════════════════
let playerQueue = [];
let playerIndex = 0;
let playerPaused = false;
let subtitleTimer = null;
let studioTimeout = null;
let bgMusic = null;
let currentAudio = null;

// Preload caches
const preloadedImages = new Map();  // url → Image element (loaded)

// ── Activate player (responsive placement) ───
function activatePlayer() {
  const section = document.getElementById("player-section");
  const screen = document.getElementById("player-screen");
  const isMobile = window.matchMedia("(max-width: 767px)").matches;

  section.classList.remove("hidden");

  if (isMobile) {
    document.getElementById("mobile-slot").appendChild(screen);
    screen.style.cssText = "position:fixed;inset:0;z-index:50;display:block;";
  } else {
    document.getElementById("desktop-display").appendChild(screen);
    screen.style.cssText = "width:100%;height:100%;display:block;position:relative;";
  }
}

function deactivatePlayer() {
  const screen = document.getElementById("player-screen");
  const section = document.getElementById("player-section");
  section.appendChild(screen);
  screen.style.cssText = "display:none;";
  section.classList.add("hidden");
}

// ── Background Music ──────────────────────────
function initBgMusic() {
  bgMusic = document.getElementById("bg-music");
  if (!bgMusic) return;
  bgMusic.volume = 0;
  bgMusic.currentTime = 0;
}

function setBgMusicVolume(targetVol, fadeDuration = 500) {
  if (!bgMusic) return;
  const startVol = bgMusic.volume;
  const startTime = performance.now();

  if (bgMusic.paused && targetVol > 0) {
    bgMusic.play().catch(err => console.warn("[bgMusic] play() failed:", err.message));
  }

  function fade(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / fadeDuration, 1);
    bgMusic.volume = Math.min(1, Math.max(0, startVol + (targetVol - startVol) * progress));
    if (progress < 1) requestAnimationFrame(fade);
    else if (targetVol === 0) bgMusic.pause();
  }
  requestAnimationFrame(fade);
}

// ── Double-buffer HLS video player ────────────
const buffers = {
  a: { el: null, hls: null, src: null, ready: false },
  b: { el: null, hls: null, src: null, ready: false },
};
let front = null; // currently visible/playing buffer
let back = null;  // hidden buffer for preloading

function initBuffers() {
  buffers.a.el = document.getElementById("video-a");
  buffers.b.el = document.getElementById("video-b");
  front = buffers.a;
  back = buffers.b;
}

function isHlsUrl(url) {
  return url && (url.endsWith(".m3u8") || url.includes("/manifest/video.m3u8"));
}

function attachSource(buf, src) {
  detachSource(buf);
  buf.src = src;
  buf.ready = false;

  if (isHlsUrl(src)) {
    // Prefer native HLS (Safari/iOS) — more reliable than hls.js on Apple
    if (buf.el.canPlayType("application/vnd.apple.mpegurl")) {
      buf.el.src = src;
    } else if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: false });
      buf.hls = hls;
      hls.attachMedia(buf.el);
      hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(src));
      hls.on(Hls.Events.ERROR, (_, data) => {
        log(`[HLS] error: ${data.type} / ${data.details}`);
        if (data.fatal) {
          log(`[HLS] fatal — attempting recovery`);
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else detachSource(buf);
        }
      });
    }
  } else {
    // Local MP4
    buf.el.src = src;
  }
}

function detachSource(buf) {
  if (buf.hls) {
    buf.hls.destroy();
    buf.hls = null;
  }
  buf.el.removeAttribute("src");
  buf.el.load(); // reset the element
  buf.src = null;
  buf.ready = false;
}

function showBuffer(buf) { buf.el.style.visibility = "visible"; }
function hideBuffer(buf) { buf.el.style.visibility = "hidden"; }

function preloadNext(src) {
  if (back.src === src) {
    log(`[Player] Already preloading: ${src.substring(0, 60)}...`);
    return;
  }

  log(`[Player] Preloading into back buffer: ${src.substring(0, 60)}...`);
  attachSource(back, src);
  back.el.muted = true;

  function checkReady() {
    back.ready = true;
    log("[Player] Back buffer READY");
  }

  // For HLS via hls.js: FRAG_BUFFERED fires as segments download
  if (back.hls) {
    back.hls.on(Hls.Events.FRAG_BUFFERED, function h() {
      if (back.ready) return;
      const b = back.el.buffered;
      if (b.length > 0 && b.end(0) >= 1.5) {
        back.hls.off(Hls.Events.FRAG_BUFFERED, h);
        checkReady();
      }
    });
  }

  // For native HLS (Safari) and MP4: use canplay
  back.el.addEventListener("canplay", function h() {
    back.el.removeEventListener("canplay", h);
    checkReady();
  });
}

function playVideo(src, muted, onReady, onEnded) {
  let readyFired = false;
  let endedFired = false;
  let timeoutId = null;
  let retried = false;

  function fireReady(via) {
    if (readyFired) return;
    readyFired = true;
    if (timeoutId) clearTimeout(timeoutId);
    log(`[Player] READY via: ${via}`);
    onReady();
  }

  function fireEnded(via) {
    if (endedFired) return;
    endedFired = true;
    if (timeoutId) clearTimeout(timeoutId);
    log(`[Player] ENDED via: ${via}`);
    onEnded();
  }

  // ── Fast path: back buffer already has this video loaded ──
  if (back.src === src && back.ready) {
    log("[Player] Fast path — swapping buffers");
    try { front.el.pause(); } catch {}
    hideBuffer(front);

    [front, back] = [back, front];

    showBuffer(front);
    front.el.muted = muted;
    front.el.currentTime = 0;

    front.el.addEventListener("ended", function h() {
      front.el.removeEventListener("ended", h);
      fireEnded("ended");
    });
    front.el.addEventListener("error", function h() {
      front.el.removeEventListener("error", h);
      fireEnded("error");
    });

    front.el.play()
      .then(() => fireReady("swap-play"))
      .catch(() => fireReady("swap-play-fallback"));

    timeoutId = setTimeout(() => {
      log("[Player] TIMEOUT (5s fast-path) — force-firing ready");
      fireReady("timeout");
    }, 5000);
    return;
  }

  // ── Slow path: load from scratch ──
  log(`[Player] Slow path — loading: ${src.substring(0, 60)}...`);

  try { front.el.pause(); } catch {}
  hideBuffer(front);

  [front, back] = [back, front];
  detachSource(front);

  attachSource(front, src);
  showBuffer(front);
  front.el.muted = muted;

  // 15s timeout: retry once, then skip
  timeoutId = setTimeout(() => {
    if (!retried) {
      retried = true;
      log("[Player] TIMEOUT (15s) — retrying with fresh HLS instance");
      detachSource(front);
      attachSource(front, src);
      front.el.muted = muted;

      ["canplay", "loadeddata", "playing"].forEach(evt => {
        front.el.addEventListener(evt, function h() {
          front.el.removeEventListener(evt, h);
          fireReady(evt);
        });
      });
      front.el.addEventListener("ended", function h() {
        front.el.removeEventListener("ended", h);
        fireEnded("ended");
      });

      front.el.play().catch(err => log(`[Player] retry play() error: ${err?.message || err}`));

      timeoutId = setTimeout(() => {
        log("[Player] TIMEOUT (25s total) — skipping segment");
        fireReady("timeout-skip");
        setTimeout(() => fireEnded("timeout-skip"), 500);
      }, 10000);
    }
  }, 15000);

  ["canplay", "loadeddata", "playing"].forEach(evt => {
    front.el.addEventListener(evt, function h() {
      front.el.removeEventListener(evt, h);
      fireReady(evt);
    });
  });

  front.el.addEventListener("ended", function h() {
    front.el.removeEventListener("ended", h);
    fireEnded("ended");
  });
  front.el.addEventListener("error", function h(e) {
    front.el.removeEventListener("error", h);
    log(`[Player] ERROR: ${e?.message || "unknown"}`);
    fireEnded("error");
  });

  front.el.play().catch(err => log(`[Player] play() error: ${err?.message || err}`));
}

function destroyPlayer() {
  try { front.el.pause(); } catch {}
  hideBuffer(front);
  hideBuffer(back);
  detachSource(front);
  detachSource(back);
}

// ── TTS Audio (pre-generated, play from URL) ──
function playTtsAudio(url, onPlaying) {
  if (!url) return Promise.resolve();
  stopTTS();
  return new Promise((resolve) => {
    const audio = new Audio(url);
    currentAudio = audio;
    let playingFired = false;
    audio.addEventListener("playing", function handler() {
      audio.removeEventListener("playing", handler);
      if (!playingFired) {
        playingFired = true;
        log("[TTS] playing");
        if (onPlaying) onPlaying();
      }
    });
    audio.onended = () => { log("[TTS] ended"); currentAudio = null; resolve(); };
    audio.onerror = (e) => { log(`[TTS] error: ${e?.message || "unknown"}`); currentAudio = null; resolve(); };
    audio.play().catch((err) => { log(`[TTS] play() failed: ${err.message}`); currentAudio = null; resolve(); });
  });
}

function stopTTS() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  window.speechSynthesis.cancel();
}

// ── Browser TTS (SpeechSynthesis API) ──────────
function playBrowserTts(text, onPlaying) {
  if (!text) return Promise.resolve();
  stopTTS();
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Pick an English voice (prefer en-GB, then en-US, then default)
    const voices = window.speechSynthesis.getVoices();
    const enGB = voices.find(v => v.lang === "en-GB");
    const enUS = voices.find(v => v.lang === "en-US");
    if (enGB) utterance.voice = enGB;
    else if (enUS) utterance.voice = enUS;

    utterance.onstart = () => {
      log("[BrowserTTS] speaking");
      if (onPlaying) onPlaying();
    };
    utterance.onend = () => { log("[BrowserTTS] ended"); resolve(); };
    utterance.onerror = (e) => { log(`[BrowserTTS] error: ${e?.error || "unknown"}`); resolve(); };

    window.speechSynthesis.speak(utterance);
  });
}

// ── News Ticker ───────────────────────────────
function showTicker(headline) {
  const ticker = document.getElementById("news-ticker");
  const el = document.getElementById("ticker-headline");
  if (!ticker) return;
  if (el) el.textContent = headline || "";
  ticker.style.display = "flex";
}
function hideTicker() {
  const ticker = document.getElementById("news-ticker");
  if (ticker) ticker.style.display = "none";
}

// ── Poster Display (from pre-computed URL) ────
function showPoster(posterUrl) {
  const canvas = document.getElementById("poster-canvas");
  if (!canvas || !posterUrl) return;
  const ctx = canvas.getContext("2d");

  if (preloadedImages.has(posterUrl)) {
    log("[Poster] Using preloaded image");
    ctx.drawImage(preloadedImages.get(posterUrl), 0, 0, canvas.width, canvas.height);
    return;
  }

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.onerror = () => {
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };
  img.src = posterUrl;
}

// ── Weather Display ───────────────────────────
function renderWeatherDisplay(weather) {
  const container = document.getElementById("weather-display");
  if (!container) return;

  const report = weather?.report;
  const narration = weather?.narration;

  if (!report && !narration) {
    container.innerHTML = '<div class="text-center text-white/50 text-sm">No weather data</div>';
    return;
  }

  const emoji = narration?.weatherEmoji || report?.current?.emoji || "🌤️";
  const headline = narration?.weatherHeadline || report?.headline || "Weather";
  const temp = report?.current?.temp_c != null ? Math.round(report.current.temp_c) + "°C" : "";
  const summary = report?.current?.summary || "";
  const feelsLike = report?.current?.feels_like || "";
  const wind = report?.current?.wind_kmh ? report.current.wind_kmh + " km/h" : "";

  const dailyHtml = (report?.daily || []).slice(0, 5).map(d => `
    <div class="text-center">
      <div class="text-[10px] text-white/50 uppercase">${escapeHtml(d.day || "")}</div>
      <div class="text-lg">${d.emoji || ""}</div>
      <div class="text-xs">
        <span class="text-red-300">${d.high_c != null ? Math.round(d.high_c) + "°" : ""}</span>
        <span class="text-blue-300">${d.low_c != null ? Math.round(d.low_c) + "°" : ""}</span>
      </div>
    </div>
  `).join("");

  container.innerHTML = `
    <div class="text-center mb-3">
      <div class="text-4xl mb-1">${emoji}</div>
      <div class="text-3xl font-bold">${escapeHtml(temp)}</div>
      <div class="text-sm text-white/70 mt-1">${escapeHtml(summary)}</div>
      <div class="text-xs text-white/40 mt-1">${escapeHtml(headline)}</div>
    </div>
    ${feelsLike || wind ? `
      <div class="flex justify-center gap-4 text-xs text-white/50 mb-3">
        ${feelsLike ? `<span>Feels ${escapeHtml(feelsLike)}</span>` : ""}
        ${wind ? `<span>Wind ${escapeHtml(wind)}</span>` : ""}
      </div>
    ` : ""}
    ${dailyHtml ? `<div class="flex justify-around px-1">${dailyHtml}</div>` : ""}
  `;
}

// ── Subtitle Timer ────────────────────────────
function startSubtitleTimer(subtitles) {
  clearSubtitles();
  if (!subtitles?.length) return;

  const subtitleEl = document.getElementById("subtitle-text");
  const startTime = performance.now();

  subtitleTimer = setInterval(() => {
    const elapsed = (performance.now() - startTime) / 1000;
    const active = subtitles.find(s => elapsed >= s.start && elapsed <= s.end);
    if (active) {
      subtitleEl.textContent = active.text;
      subtitleEl.style.display = "inline-block";
    } else {
      subtitleEl.style.display = "none";
    }
  }, 150);
}

function clearSubtitles() {
  if (subtitleTimer) { clearInterval(subtitleTimer); subtitleTimer = null; }
  const el = document.getElementById("subtitle-text");
  if (el) el.style.display = "none";
}

// ── Build Playback Queue ──────────────────────
function buildPlaybackQueue(master) {
  const queue = [];

  // Opening bumper
  if (master.assets?.bumperUrl) {
    queue.push({ type: "bumper", src: master.assets.bumperUrl, label: "Opening Bumper" });
  }

  // Per-story: studio intro → video
  (master.stories || []).forEach(story => {
    queue.push({
      type: "studio",
      mode: "story",
      headline: story.studioHeadline || story.storyTitle,
      emoji: story.storyEmoji,
      ttsText: story.introText,
      ttsUrl: story.ttsUrl,
      subtitles: story.subtitleSegments,
      posterUrl: story.posterUrl,
      background: master.assets?.studioBgUrl,
      label: "Intro: " + (story.storyTitle || "Story " + story.storyNumber)
    });

    if (story.videoUrl) {
      queue.push({
        type: "video",
        src: story.videoUrl,
        headline: story.studioHeadline || story.storyTitle,
        label: "Video: " + (story.storyTitle || "Story " + story.storyNumber)
      });
    }
  });

  // Weather segment
  const weather = master.weather;
  if (weather?.report || weather?.narration) {
    queue.push({
      type: "studio",
      mode: "weather",
      weather: weather,
      ttsText: weather?.narration?.weatherNarration,
      ttsUrl: weather.ttsUrl,
      subtitles: weather.narration?.subtitleSegments,
      background: master.assets?.studioBgUrl,
      label: "Weather Report"
    });
  }

  // Closing bumper
  if (master.assets?.bumperUrl) {
    queue.push({ type: "bumper", src: master.assets.bumperUrl, label: "Closing Bumper" });
  }

  return queue;
}

// ── Preload Bulletin Assets ───────────────────
async function preloadBulletin(master) {
  const prepOverlay = document.getElementById("prep-overlay");
  const prepBar = document.getElementById("prep-bar");
  const prepStatus = document.getElementById("prep-status");
  const prepDetail = document.getElementById("prep-detail");

  prepOverlay.style.display = "flex";
  prepBar.style.width = "0%";
  prepStatus.textContent = "Preparing bulletin...";
  prepDetail.textContent = "";

  // Collect image URLs to preload (TTS now handled by browser SpeechSynthesis)
  const imageUrls = [];

  (master.stories || []).forEach(story => {
    if (story.posterUrl) imageUrls.push(story.posterUrl);
  });
  if (master.assets?.studioBgUrl) imageUrls.push(master.assets.studioBgUrl);

  // Total items: images + bgMusic(1)
  const totalItems = imageUrls.length + 1;
  let loadedItems = 0;

  function updateProgress(detail) {
    loadedItems++;
    const pct = Math.round((loadedItems / totalItems) * 100);
    prepBar.style.width = pct + "%";
    prepDetail.textContent = detail;
    log(`[Preload] (${loadedItems}/${totalItems}) ${detail}`);
  }

  // 1. Preload poster images + studio background
  prepStatus.textContent = "Loading images...";
  const imgPromises = imageUrls.map(url => {
    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        preloadedImages.set(url, img);
        updateProgress(`Image ready`);
        resolve();
      };
      img.onerror = () => {
        log(`[Preload] Image failed: ${url.substring(0, 60)}`);
        updateProgress(`Image failed`);
        resolve();
      };
      img.src = url;
    });
  });
  await Promise.all(imgPromises);

  // 2. Preload background music
  prepStatus.textContent = "Loading music...";
  initBgMusic();
  if (bgMusic) {
    await new Promise(resolve => {
      if (bgMusic.readyState >= 4) {
        updateProgress("Music ready");
        resolve();
        return;
      }
      bgMusic.addEventListener("canplaythrough", function handler() {
        bgMusic.removeEventListener("canplaythrough", handler);
        updateProgress("Music ready");
        resolve();
      }, { once: true });
      bgMusic.addEventListener("error", function handler() {
        bgMusic.removeEventListener("error", handler);
        updateProgress("Music failed");
        resolve();
      }, { once: true });
      bgMusic.load();
    });
  } else {
    updateProgress("No music element");
  }

  // 3. Kick off bumper prewarm (non-blocking)
  preloadNext(master.assets.bumperUrl);

  prepStatus.textContent = "Ready!";
  prepBar.style.width = "100%";
  log("[Preload] All assets loaded");
  await new Promise(r => setTimeout(r, 400));
  prepOverlay.style.display = "none";
}

// ── Play Bulletin ─────────────────────────────
async function playBulletin() {
  if (!masterJson) return log("ERROR: Build the bulletin first");

  log("Starting bulletin playback...");
  playerQueue = buildPlaybackQueue(masterJson);
  playerIndex = 0;
  playerPaused = false;

  log("Queue: " + playerQueue.length + " segments");
  playerQueue.forEach((seg, i) => log("  " + (i + 1) + ". [" + seg.type + "] " + seg.label));

  activatePlayer();
  document.getElementById("player-section").scrollIntoView({ behavior: "smooth" });

  // Preload all assets before starting playback
  await preloadBulletin(masterJson);

  if (bgMusic) {
    bgMusic.volume = 0.01;
    bgMusic.play().catch(() => log("  bg music autoplay blocked"));
  }
  playNextSegment();
}

// ── Play Next Segment ─────────────────────────
function playNextSegment() {
  if (playerPaused) return;

  if (playerIndex >= playerQueue.length) {
    log("Bulletin playback complete.");
    document.getElementById("player-segment-label").textContent = "Complete";
    setBgMusicVolume(0, 1000);
    showToast("Playback Complete", "The bulletin has finished.", "success");
    setTimeout(() => stopPlayer(), 2000);
    return;
  }

  const segment = playerQueue[playerIndex];
  document.getElementById("player-segment-label").textContent =
    `[${playerIndex + 1}/${playerQueue.length}] ${segment.label}`;
  log("Segment " + (playerIndex + 1) + ": " + segment.label);

  if (segment.type === "bumper") {
    playBumperSegment(segment);
  } else if (segment.type === "video") {
    playVideoSegment(segment);
  } else if (segment.type === "studio") {
    showStudioSegment(segment);
  }
}

// ── Bumper Segment (bg music full volume) ─────
function playBumperSegment(segment) {
  const overlay = document.getElementById("studio-overlay");

  clearSubtitles();
  stopTTS();
  setBgMusicVolume(1.0, 300);
  hideTicker();

  const onReady = () => { overlay.style.display = "none"; };
  const advance = () => { playerIndex++; playNextSegment(); };

  playVideo(segment.src, true, onReady, advance);
}

// ── Video Segment (bg music off) ──────────────
function playVideoSegment(segment) {
  const overlay = document.getElementById("studio-overlay");

  clearSubtitles();
  stopTTS();
  setBgMusicVolume(0, 500);
  hideTicker();

  const onReady = () => { overlay.style.display = "none"; };
  const advance = () => { playerIndex++; playNextSegment(); };

  playVideo(segment.src, false, onReady, advance);
}

// ── Studio Segment (TTS + bg music low) ───────
async function showStudioSegment(segment) {
  const overlay = document.getElementById("studio-overlay");

  hideTicker();
  destroyPlayer();
  clearSubtitles();
  setBgMusicVolume(0.18, 800);

  overlay.style.display = "flex";
  if (segment.background) overlay.style.backgroundImage = `url(${segment.background})`;

  if (segment.mode === "story") {
    document.getElementById("studio-story-content").style.display = "flex";
    document.getElementById("studio-weather-content").style.display = "none";
    document.getElementById("studio-emoji").textContent = segment.emoji || "";
    document.getElementById("studio-headline").textContent = segment.headline || "";

    // Clear poster canvas then load from pre-computed URL
    const posterCanvas = document.getElementById("poster-canvas");
    if (posterCanvas) {
      const pctx = posterCanvas.getContext("2d");
      pctx.fillStyle = "#1a1a2e";
      pctx.fillRect(0, 0, posterCanvas.width, posterCanvas.height);
    }
    if (segment.posterUrl) showPoster(segment.posterUrl);

  } else if (segment.mode === "weather") {
    document.getElementById("studio-story-content").style.display = "none";
    document.getElementById("studio-weather-content").style.display = "flex";
    renderWeatherDisplay(segment.weather);
  }

  // Peek ahead: preload next video while TTS plays
  const nextSeg = playerQueue[playerIndex + 1];
  if (nextSeg && (nextSeg.type === "video" || nextSeg.type === "bumper")) {
    preloadNext(nextSeg.src);
  }

  // Play browser TTS — show full text as subtitle while speaking
  const ttsStart = Date.now();
  await playBrowserTts(segment.ttsText, () => {
    // onPlaying callback: speech has started — show full text as subtitle
    if (segment.ttsText) {
      const subtitleEl = document.getElementById("subtitle-text");
      if (subtitleEl) {
        subtitleEl.textContent = segment.ttsText;
        subtitleEl.style.display = "inline-block";
        log("[Studio] TTS speaking — showing subtitle");
      }
    }
  });

  const elapsed = Date.now() - ttsStart;
  if (elapsed < 2500) await new Promise(r => setTimeout(r, 2500 - elapsed));

  clearSubtitles();

  if (!playerPaused) { playerIndex++; playNextSegment(); }
}

// ── Pause / Resume ────────────────────────────
function togglePause() {
  const btn = document.getElementById("btn-player-pause");
  playerPaused = !playerPaused;

  if (playerPaused) {
    try { front.el.pause(); } catch {}
    if (bgMusic && !bgMusic.paused) bgMusic.pause();
    stopTTS();
    window.speechSynthesis.cancel();
    clearSubtitles();
    if (studioTimeout) clearTimeout(studioTimeout);
    btn.textContent = "▶";
    log("Paused.");
  } else {
    if (bgMusic) bgMusic.play().catch(() => {});
    const segment = playerQueue[playerIndex];
    if (segment?.type === "video" || segment?.type === "bumper") {
      try { front.el.play(); } catch {}
    } else {
      playerIndex++;
      playNextSegment();
    }
    btn.textContent = "⏸";
    log("Resumed.");
  }
}

// ── Skip to Next Segment ──────────────────────
function skipToNextSegment() {
  if (!playerQueue.length) return;
  log(`[Skip] Skipping segment ${playerIndex + 1}`);

  stopTTS();
  clearSubtitles();
  destroyPlayer();

  playerIndex++;
  if (playerIndex < playerQueue.length) {
    playNextSegment();
  } else {
    log("Bulletin playback complete (skipped to end).");
    stopPlayer();
  }
}

// ── Stop Player ───────────────────────────────
function stopPlayer() {
  destroyPlayer();

  clearSubtitles();
  stopTTS();
  if (studioTimeout) clearTimeout(studioTimeout);

  setBgMusicVolume(0, 300);
  setTimeout(() => { if (bgMusic) { bgMusic.pause(); bgMusic.currentTime = 0; } }, 400);

  document.getElementById("studio-overlay").style.display = "none";
  hideTicker();
  playerQueue = [];
  playerIndex = 0;
  playerPaused = false;

  // Clear preload caches
  preloadedImages.clear();
  window.speechSynthesis.cancel();

  deactivatePlayer();
  document.getElementById("player-segment-label").textContent = "Ready";
  log("Player stopped.");
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
  console.log(`[MockNews +${elapsed}s]`, message);
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
