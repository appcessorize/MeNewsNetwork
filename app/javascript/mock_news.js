// ──────────────────────────────────────────────
//  Mock News Report — Debug Flow
// ──────────────────────────────────────────────

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

      // Show "uploading" status
      renderStoryStatus(statusList, {
        story_number: storyNumber,
        status: "analyzing",
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

        const resp = await fetch(`/debug/mock_news/bulletins/${bulletinId}/stories`, {
          method: "POST",
          headers: { "X-CSRF-Token": csrfToken() },
          body: formData,
          signal: AbortSignal.timeout(120000) // 2 min upload timeout
        });

        if (!resp.ok) {
          const body = await resp.text();
          throw new Error(`HTTP ${resp.status}: ${body.substring(0, 200)}`);
        }

        const data = await resp.json();
        if (data.ok) {
          log(`[${storyNumber}] Uploaded — analyzing in background...`);
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
  const bc = { pending: "badge-ghost", analyzing: "badge-warning", done: "badge-success", failed: "badge-error" }[s.status] || "badge-ghost";
  const spinner = s.status === "analyzing" ? '<span class="loading loading-spinner loading-xs"></span>' : '';
  return `
    <span class="badge ${bc} badge-sm gap-1">${spinner}${s.status}</span>
    <span class="text-sm flex-1">
      ${s.story_emoji || "📹"} Story ${s.story_number}:
      <strong>${escapeHtml(s.story_title || "Analyzing...")}</strong>
      ${s.filename ? `<span class="text-xs text-base-content/40">(${escapeHtml(s.filename)})</span>` : ""}
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
let currentTTS = null;

// ── Preload Cache ─────────────────────────────
const preloadCache = {
  tts: new Map(),     // segmentIndex → { blobUrl, status }
  posters: new Map(), // videoUrl → { dataUrl, status }
};

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

// ── TTS (Text-to-Speech via Gemini) ─────────────────────
let currentAudio = null;

async function prefetchTTS(text, segmentIndex) {
  if (!text) return;
  if (preloadCache.tts.has(segmentIndex)) return;
  preloadCache.tts.set(segmentIndex, { blobUrl: null, status: "loading" });
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
      body: JSON.stringify({ text, voice: "Orus" })
    });
    if (!res.ok) { preloadCache.tts.set(segmentIndex, { blobUrl: null, status: "failed" }); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    preloadCache.tts.set(segmentIndex, { blobUrl: url, status: "ready" });
  } catch {
    preloadCache.tts.set(segmentIndex, { blobUrl: null, status: "failed" });
  }
}

async function speakText(text, segmentIndex) {
  if (!text) return;

  // Stop any currently playing audio
  stopTTS();

  // Check preload cache first
  if (segmentIndex != null) {
    const cached = preloadCache.tts.get(segmentIndex);
    if (cached && cached.status === "ready" && cached.blobUrl) {
      log("  TTS: using preloaded audio");
      return new Promise((resolve) => {
        const audio = new Audio(cached.blobUrl);
        currentAudio = audio;
        audio.onended = () => { currentAudio = null; resolve(); };
        audio.onerror = () => { currentAudio = null; resolve(); };
        audio.play().catch(() => { currentAudio = null; resolve(); });
      });
    }
  }

  // Fallback: fetch live
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken()
      },
      body: JSON.stringify({ text, voice: "Orus" })
    });

    if (!res.ok) {
      console.warn("[TTS] Gemini TTS failed:", res.status);
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    return new Promise((resolve) => {
      const audio = new Audio(url);
      currentAudio = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        currentAudio = null;
        resolve();
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
        currentAudio = null;
        resolve();
      };

      audio.play().catch(() => {
        currentAudio = null;
        resolve();
      });
    });
  } catch (err) {
    console.error("[TTS] Error:", err);
  }
}

function stopTTS() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
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

// ── Poster Capture ────────────────────────────
// Derive Cloudflare Stream thumbnail URL from HLS manifest URL
// e.g. https://customer-xxx.cloudflarestream.com/{uid}/manifest/video.m3u8
//   → https://customer-xxx.cloudflarestream.com/{uid}/thumbnails/thumbnail.jpg?time=1s&height=352&width=352&fit=crop
function cfThumbnailUrl(videoUrl) {
  if (!videoUrl) return null;
  const match = videoUrl.match(/^(https:\/\/customer-[^/]+\.cloudflarestream\.com\/[^/]+)\//);
  if (!match) return null;
  return match[1] + "/thumbnails/thumbnail.jpg?time=1s&height=176&width=176&fit=crop";
}

function prefetchPoster(videoUrl) {
  if (!videoUrl) return Promise.resolve();
  if (preloadCache.posters.has(videoUrl)) return Promise.resolve();
  preloadCache.posters.set(videoUrl, { imgUrl: null, status: "loading" });

  const thumbUrl = cfThumbnailUrl(videoUrl);

  if (thumbUrl) {
    // Cloudflare Stream: preload native thumbnail
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const timeout = setTimeout(() => {
        preloadCache.posters.set(videoUrl, { imgUrl: null, status: "failed" });
        resolve();
      }, 8000);
      img.onload = () => {
        clearTimeout(timeout);
        preloadCache.posters.set(videoUrl, { imgUrl: thumbUrl, status: "ready" });
        resolve();
      };
      img.onerror = () => {
        clearTimeout(timeout);
        preloadCache.posters.set(videoUrl, { imgUrl: null, status: "failed" });
        resolve();
      };
      img.src = thumbUrl;
    });
  }

  // Non-Cloudflare: use temp video + canvas (same-origin only)
  return new Promise((resolve) => {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = 176;
    tempCanvas.height = 176;
    const tctx = tempCanvas.getContext("2d");

    const tempVid = document.createElement("video");
    tempVid.muted = true;
    tempVid.preload = "auto";
    tempVid.playsInline = true;

    const cleanup = () => { tempVid.src = ""; tempVid.remove(); resolve(); };
    const timeout = setTimeout(() => {
      preloadCache.posters.set(videoUrl, { imgUrl: null, status: "failed" });
      cleanup();
    }, 8000);

    tempVid.addEventListener("loadeddata", () => {
      tempVid.currentTime = Math.min(1, tempVid.duration * 0.1);
    }, { once: true });

    tempVid.addEventListener("seeked", () => {
      clearTimeout(timeout);
      const vw = tempVid.videoWidth, vh = tempVid.videoHeight;
      const size = Math.min(vw, vh);
      const sx = (vw - size) / 2, sy = (vh - size) / 2;
      tctx.drawImage(tempVid, sx, sy, size, size, 0, 0, tempCanvas.width, tempCanvas.height);
      try {
        const dataUrl = tempCanvas.toDataURL("image/jpeg", 0.5);
        preloadCache.posters.set(videoUrl, { imgUrl: dataUrl, status: "ready" });
      } catch {
        preloadCache.posters.set(videoUrl, { imgUrl: null, status: "failed" });
      }
      cleanup();
    }, { once: true });

    tempVid.addEventListener("error", () => {
      clearTimeout(timeout);
      preloadCache.posters.set(videoUrl, { imgUrl: null, status: "failed" });
      cleanup();
    }, { once: true });

    tempVid.src = videoUrl;
    tempVid.load();
  });
}

function capturePoster(videoUrl) {
  return new Promise((resolve) => {
    const canvas = document.getElementById("poster-canvas");
    if (!canvas) { resolve(); return; }
    const ctx = canvas.getContext("2d");

    // Check preload cache first
    const cached = preloadCache.posters.get(videoUrl);
    if (cached && cached.status === "ready" && cached.imgUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); resolve(); };
      img.onerror = () => resolve();
      img.src = cached.imgUrl;
      return;
    }

    // Try Cloudflare thumbnail directly (even without cache)
    const thumbUrl = cfThumbnailUrl(videoUrl);
    if (thumbUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); resolve(); };
      img.onerror = () => {
        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        resolve();
      };
      img.src = thumbUrl;
      return;
    }

    // Fallback: dark placeholder + live capture (same-origin videos only)
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const tempVid = document.createElement("video");
    tempVid.muted = true;
    tempVid.preload = "auto";
    tempVid.playsInline = true;

    const cleanup = () => { tempVid.src = ""; tempVid.remove(); resolve(); };
    const timeout = setTimeout(cleanup, 5000);

    tempVid.addEventListener("loadeddata", () => {
      tempVid.currentTime = Math.min(1, tempVid.duration * 0.1);
    }, { once: true });

    tempVid.addEventListener("seeked", () => {
      clearTimeout(timeout);
      const vw = tempVid.videoWidth, vh = tempVid.videoHeight;
      const size = Math.min(vw, vh);
      const sx = (vw - size) / 2, sy = (vh - size) / 2;
      ctx.drawImage(tempVid, sx, sy, size, size, 0, 0, canvas.width, canvas.height);
      cleanup();
    }, { once: true });

    tempVid.addEventListener("error", () => { clearTimeout(timeout); cleanup(); }, { once: true });
    tempVid.src = videoUrl;
    tempVid.load();
  });
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


// ── Preparation Phase ─────────────────────────
function showPreparationScreen() {
  const el = document.getElementById("prep-overlay");
  if (el) el.style.display = "flex";
}

function hidePreparationScreen() {
  const el = document.getElementById("prep-overlay");
  if (el) el.style.display = "none";
}

function updatePreparationProgress(pct, detail) {
  const bar = document.getElementById("prep-bar");
  const detailEl = document.getElementById("prep-detail");
  if (bar) bar.style.width = Math.min(100, Math.round(pct)) + "%";
  if (detailEl) detailEl.textContent = detail || "";
}

async function prepareBulletin() {
  // 1. Gather all TTS segments
  const ttsSegments = [];
  const posterUrls = [];
  playerQueue.forEach((seg, i) => {
    if (seg.type === "studio" && seg.introText) {
      ttsSegments.push({ index: i, text: seg.introText });
    }
    if (seg.type === "studio" && seg.mode === "story" && seg.videoUrl) {
      if (!posterUrls.includes(seg.videoUrl)) posterUrls.push(seg.videoUrl);
    }
  });

  const totalSteps = ttsSegments.length + posterUrls.length;
  let completed = 0;

  // 2. Prefetch all TTS (3 concurrent)
  updatePreparationProgress(0, "Loading voiceovers...");
  const ttsChunks = [];
  for (let i = 0; i < ttsSegments.length; i += 3) {
    ttsChunks.push(ttsSegments.slice(i, i + 3));
  }
  for (const chunk of ttsChunks) {
    await Promise.all(chunk.map(async (s) => {
      await prefetchTTS(s.text, s.index);
      completed++;
      const pct = (completed / totalSteps) * 100;
      updatePreparationProgress(pct, `Voiceover ${completed} of ${ttsSegments.length}...`);
    }));
  }

  // 3. Prefetch posters (2 concurrent)
  updatePreparationProgress((completed / totalSteps) * 100, "Capturing thumbnails...");
  const posterChunks = [];
  for (let i = 0; i < posterUrls.length; i += 2) {
    posterChunks.push(posterUrls.slice(i, i + 2));
  }
  for (const chunk of posterChunks) {
    await Promise.all(chunk.map(async (url) => {
      await prefetchPoster(url);
      completed++;
      const pct = (completed / totalSteps) * 100;
      updatePreparationProgress(pct, "Capturing thumbnails...");
    }));
  }

  updatePreparationProgress(100, "Ready!");

  return true;
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
      introText: story.introText,
      subtitles: story.subtitleSegments,
      videoUrl: story.videoUrl,
      background: master.assets?.studioBgUrl,
      label: "Intro: " + (story.storyTitle || "Story " + story.storyNumber)
    });

    if (story.videoUrl) {
      queue.push({
        type: "video",
        src: story.videoUrl,
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
      introText: weather.narration?.weatherNarration || "",
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

// ── Play Bulletin ─────────────────────────────
async function playBulletin() {
  if (!masterJson) return log("ERROR: Build the bulletin first");

  log("Starting bulletin playback...");
  playerQueue = buildPlaybackQueue(masterJson);
  playerIndex = 0;
  playerPaused = false;

  log("Queue: " + playerQueue.length + " segments");
  playerQueue.forEach((seg, i) => log("  " + (i + 1) + ". [" + seg.type + "] " + seg.label));

  initBgMusic();
  // Start music immediately on user gesture so it's allowed by autoplay policy
  if (bgMusic) {
    bgMusic.volume = 0.01;
    bgMusic.play().catch(() => log("  bg music autoplay blocked"));
  }
  activatePlayer();

  const section = document.getElementById("player-section");
  section.scrollIntoView({ behavior: "smooth" });

  // Preparation phase — preload everything before playback
  showPreparationScreen();
  log("Preparing bulletin (preloading TTS, posters, first video)...");
  await prepareBulletin();
  log("Preparation complete — starting playback.");
  hidePreparationScreen();
  log("  [overlay] prep=hidden, studio=" + document.getElementById("studio-overlay").style.display);

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
  log("  [overlay] prep=" + document.getElementById("prep-overlay").style.display +
      " studio=" + document.getElementById("studio-overlay").style.display +
      " video=" + document.getElementById("bulletin-video").style.display +
      " readyState=" + document.getElementById("bulletin-video").readyState);

  if (segment.type === "bumper") {
    playBumperSegment(segment);
  } else if (segment.type === "video") {
    playVideoSegment(segment);
  } else if (segment.type === "studio") {
    showStudioSegment(segment);
  }
}

// ── Bumper Segment (bg music full volume, HLS support) ─────
function playBumperSegment(segment) {
  const video = document.getElementById("bulletin-video");
  const overlay = document.getElementById("studio-overlay");

  clearSubtitles();
  stopTTS();

  // Background music full volume during bumper
  setBgMusicVolume(1.0, 300);

  hideTicker();

  video.muted = true;

  log("  [bumper] src=" + (segment.src || "none").substring(0, 80));
  log("  [bumper] video.readyState=" + video.readyState + " video.src=" + (video.src || "none").substring(0, 60));
  log("  [bumper] overlay=" + overlay.style.display + " prep=" + document.getElementById("prep-overlay").style.display);

  // Ready gate: only hide overlay and show video when bumper can play
  const showVideoWhenReady = () => {
    log("  [bumper] showVideoWhenReady fired — hiding overlay, showing video");
    overlay.style.display = "none";
    video.style.display = "block";
  };
  video.onended = () => { log("  [bumper] onended"); playerIndex++; playNextSegment(); };
  video.onerror = (e) => { log("Bumper error: " + (e?.message || "unknown") + ", skipping..."); playerIndex++; playNextSegment(); };

  const isHls = segment.src && segment.src.endsWith(".m3u8");
  log("  [bumper] isHls=" + isHls + " activeHls=" + !!activeHls);

  // Check if this source is already loaded (preloaded during studio TTS)
  const alreadyLoaded = activeHls
    ? activeHls._loadedUrl === segment.src
    : video.src && video.src === segment.src;

  log("  [bumper] alreadyLoaded=" + alreadyLoaded + " readyState=" + video.readyState);

  if (alreadyLoaded && video.readyState >= 2) {
    log("  Bumper already buffered, playing immediately");
    showVideoWhenReady();
    video.play().catch(err => {
      log("Bumper play failed: " + err.message);
      playerIndex++;
      playNextSegment();
    });
    return;
  }

  // Load on demand
  destroyHls();

  if (isHls) {
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari native HLS
      video.src = segment.src;
      video.oncanplay = () => {
        video.oncanplay = null;
        showVideoWhenReady();
        video.play().catch(err => {
          log("Bumper play failed: " + err.message);
          playerIndex++;
          playNextSegment();
        });
      };
      video.load();
    } else if (typeof Hls !== "undefined" && Hls.isSupported()) {
      activeHls = new Hls();
      activeHls.loadSource(segment.src);
      activeHls._loadedUrl = segment.src;
      activeHls.attachMedia(video);
      activeHls.on(Hls.Events.MANIFEST_PARSED, () => {
        showVideoWhenReady();
        video.play().catch(err => {
          log("Bumper play failed: " + err.message);
          playerIndex++;
          playNextSegment();
        });
      });
      activeHls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          log("HLS fatal error in bumper: " + data.type + ", skipping...");
          destroyHls();
          playerIndex++;
          playNextSegment();
        }
      });
    } else {
      log("HLS not supported, skipping bumper: " + segment.label);
      playerIndex++;
      playNextSegment();
    }
  } else {
    // MP4 or other direct source
    video.src = segment.src;
    video.oncanplay = () => {
      video.oncanplay = null;
      showVideoWhenReady();
      video.play().catch(err => {
        log("Bumper play failed: " + err.message);
        playerIndex++;
        playNextSegment();
      });
    };
    video.load();
  }
}

// ── HLS.js instance (cleaned up on stop) ─────
let activeHls = null;

// ── Video Segment (bg music off, HLS.js for .m3u8) ──────────────
function playVideoSegment(segment) {
  const video = document.getElementById("bulletin-video");
  const overlay = document.getElementById("studio-overlay");

  clearSubtitles();
  stopTTS();

  // Silence bg music during user video
  setBgMusicVolume(0, 500);

  log("  [video] src=" + (segment.src || "none").substring(0, 80));
  log("  [video] overlay=" + overlay.style.display + " prep=" + document.getElementById("prep-overlay").style.display);
  log("  [video] video.readyState=" + video.readyState + " activeHls=" + !!activeHls);

  video.muted = false;
  video.onended = () => { log("  [video] onended"); playerIndex++; playNextSegment(); };
  video.onerror = (e) => {
    log("Video error: " + segment.label + " (" + (e?.message || "unknown") + "), skipping...");
    playerIndex++;
    playNextSegment();
  };

  // Ready gate: only hide overlay and show video when it can play
  const showVideoWhenReady = () => {
    log("  [video] showVideoWhenReady fired — hiding overlay, showing video");
    overlay.style.display = "none";
    video.style.display = "block";
  };

  const isHls = segment.src && segment.src.endsWith(".m3u8");

  // Check if this source is already loaded (preloaded during studio TTS)
  const alreadyLoaded = activeHls
    ? activeHls._loadedUrl === segment.src
    : video.src && video.src === segment.src;

  log("  [video] alreadyLoaded=" + alreadyLoaded + " isHls=" + isHls);

  if (alreadyLoaded && video.readyState >= 2) {
    log("  Video already buffered, playing immediately");
    showVideoWhenReady();
    video.play().catch(err => {
      log("Autoplay blocked, trying muted: " + err.message);
      video.muted = true;
      video.play().catch(() => { playerIndex++; playNextSegment(); });
    });
    return;
  }

  // Load on demand (studio overlay stays visible as hold frame until ready)
  destroyHls();

  if (isHls) {
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = segment.src;
      video.oncanplay = () => {
        video.oncanplay = null;
        showVideoWhenReady();
        video.play().catch(err => {
          log("Autoplay blocked, trying muted: " + err.message);
          video.muted = true;
          video.play().catch(() => { playerIndex++; playNextSegment(); });
        });
      };
      video.load();
    } else if (typeof Hls !== "undefined" && Hls.isSupported()) {
      activeHls = new Hls();
      activeHls.loadSource(segment.src);
      activeHls._loadedUrl = segment.src;
      activeHls.attachMedia(video);
      activeHls.on(Hls.Events.MANIFEST_PARSED, () => {
        showVideoWhenReady();
        video.play().catch(err => {
          log("Autoplay blocked, trying muted: " + err.message);
          video.muted = true;
          video.play().catch(() => { playerIndex++; playNextSegment(); });
        });
      });
      activeHls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          log("HLS fatal error: " + data.type + ", skipping...");
          destroyHls();
          playerIndex++;
          playNextSegment();
        }
      });
    } else {
      log("HLS not supported, skipping: " + segment.label);
      playerIndex++;
      playNextSegment();
    }
  } else {
    video.src = segment.src;
    video.oncanplay = () => {
      video.oncanplay = null;
      showVideoWhenReady();
      video.play().catch(err => {
        log("Autoplay blocked, trying muted: " + err.message);
        video.muted = true;
        video.play().catch(() => { playerIndex++; playNextSegment(); });
      });
    };
    video.load();
  }
}

function destroyHls() {
  if (activeHls) {
    log("  [hls] destroying activeHls (url=" + (activeHls._loadedUrl || "?").substring(0, 60) + ")");
    activeHls.destroy();
    activeHls = null;
  }
}

// ── Studio Segment (TTS + bg music low) ───────
async function showStudioSegment(segment) {
  const video = document.getElementById("bulletin-video");
  const overlay = document.getElementById("studio-overlay");
  const storyContent = document.getElementById("studio-story-content");
  const weatherContent = document.getElementById("studio-weather-content");

  log("  [studio] mode=" + segment.mode + " overlay=" + overlay.style.display + " prep=" + document.getElementById("prep-overlay").style.display);

  video.pause();
  video.removeAttribute("src");
  video.style.display = "none";
  clearSubtitles();

  // Background music low during studio intros
  setBgMusicVolume(0.18, 800);

  // Setup overlay
  overlay.style.display = "flex";
  if (segment.background) overlay.style.backgroundImage = `url(${segment.background})`;
  log("  [studio] overlay now=" + overlay.style.display + " bg=" + (segment.background ? "yes" : "no"));

  if (segment.mode === "story") {
    storyContent.style.display = "flex";
    weatherContent.style.display = "none";
    showTicker(segment.headline);

    document.getElementById("studio-emoji").textContent = segment.emoji || "";
    document.getElementById("studio-headline").textContent = segment.headline || "";

    // Clear poster canvas immediately to prevent stale flash
    const posterCanvas = document.getElementById("poster-canvas");
    if (posterCanvas) {
      const pctx = posterCanvas.getContext("2d");
      pctx.fillStyle = "#1a1a2e";
      pctx.fillRect(0, 0, posterCanvas.width, posterCanvas.height);
    }

    // Capture poster from video (async, appears when ready)
    if (segment.videoUrl) capturePoster(segment.videoUrl);

  } else if (segment.mode === "weather") {
    storyContent.style.display = "none";
    weatherContent.style.display = "flex";
    showTicker("Weather Report");
    renderWeatherDisplay(segment.weather);
  }

  // Preload the next video/bumper on the primary element while TTS plays (hidden behind overlay)
  const nextSeg = playerQueue[playerIndex + 1];
  if (nextSeg && (nextSeg.type === "video" || nextSeg.type === "bumper")) {
    destroyHls();
    const isHls = nextSeg.src?.endsWith(".m3u8");
    if (isHls && typeof Hls !== "undefined" && Hls.isSupported()) {
      activeHls = new Hls();
      activeHls.loadSource(nextSeg.src);
      activeHls._loadedUrl = nextSeg.src;
      activeHls.attachMedia(video);
      // Don't play yet — just buffer while TTS is speaking
    } else if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = nextSeg.src;
      video.preload = "auto";
      video.load();
    } else if (nextSeg.src) {
      video.src = nextSeg.src;
      video.preload = "auto";
      video.load();
    }
    log("  Preloading next on primary: [" + nextSeg.type + "] " + nextSeg.label);
  }

  // Start subtitles (timed from Gemini's estimated reading pace)
  if (segment.subtitles?.length) {
    startSubtitleTimer(segment.subtitles);
  }

  // Narrate with TTS — await completion
  log("  TTS: " + (segment.introText || "").substring(0, 80) + "...");
  const ttsStart = Date.now();

  await speakText(segment.introText, playerIndex);

  // Ensure minimum display time (4s) even if TTS is very fast/unavailable
  const elapsed = Date.now() - ttsStart;
  const minDuration = 4000;
  log("  [studio] TTS done in " + elapsed + "ms, min=" + minDuration);
  if (elapsed < minDuration) {
    await new Promise(r => setTimeout(r, minDuration - elapsed));
  }

  clearSubtitles();

  // Advance to next segment (unless paused/stopped)
  log("  [studio] advancing — paused=" + playerPaused + " idx=" + playerIndex + " queueLen=" + playerQueue.length);
  log("  [studio] video.readyState=" + video.readyState + " activeHls=" + !!activeHls);
  if (!playerPaused && playerIndex < playerQueue.length) {
    playerIndex++;
    playNextSegment();
  }
}

// ── Pause / Resume ────────────────────────────
function togglePause() {
  const video = document.getElementById("bulletin-video");
  const btn = document.getElementById("btn-player-pause");
  playerPaused = !playerPaused;

  if (playerPaused) {
    video.pause();
    if (bgMusic && !bgMusic.paused) bgMusic.pause();
    stopTTS();
    clearSubtitles();
    if (studioTimeout) clearTimeout(studioTimeout);
    btn.textContent = "▶";
    log("Paused.");
  } else {
    if (bgMusic) bgMusic.play().catch(() => {});
    const segment = playerQueue[playerIndex];
    if ((segment?.type === "video" || segment?.type === "bumper") && video.src) {
      video.play();
    } else {
      // For studio segments, advance to next
      playerIndex++;
      playNextSegment();
    }
    btn.textContent = "⏸";
    log("Resumed.");
  }
}

// ── Stop Player ───────────────────────────────
function stopPlayer() {
  const video = document.getElementById("bulletin-video");
  destroyHls();
  video.pause();
  video.removeAttribute("src");
  video.load();
  video.style.display = "block";

  // Revoke all cached TTS blob URLs
  for (const entry of preloadCache.tts.values()) {
    if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
  }
  preloadCache.tts.clear();
  preloadCache.posters.clear();

  clearSubtitles();
  stopTTS();
  if (studioTimeout) clearTimeout(studioTimeout);

  setBgMusicVolume(0, 300);
  setTimeout(() => { if (bgMusic) { bgMusic.pause(); bgMusic.currentTime = 0; } }, 400);

  document.getElementById("studio-overlay").style.display = "none";
  hideTicker();
  hidePreparationScreen();
  playerQueue = [];
  playerIndex = 0;
  playerPaused = false;

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
  const time = new Date().toLocaleTimeString();
  el.textContent += `[${time}] ${message}\n`;
  el.scrollTop = el.scrollHeight;
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
