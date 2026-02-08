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

// ── CF Stream Player (iframe + SDK) ───────────
let cfPlayer = null;

function isCfStreamUrl(url) {
  return url && url.includes("cloudflarestream.com/") && url.includes("/iframe");
}

function destroyCfPlayer() {
  if (cfPlayer) {
    try { cfPlayer.pause(); } catch {}
    cfPlayer = null;
  }
  const iframe = document.getElementById("cf-stream-player");
  if (iframe) { iframe.src = ""; iframe.style.display = "none"; }
}

function playCfVideo(src, muted, onReady, onEnded) {
  const video = document.getElementById("bulletin-video");
  const iframe = document.getElementById("cf-stream-player");

  video.pause();
  video.style.display = "none";
  iframe.style.display = "block";
  iframe.src = src;

  // Wait for iframe to load before initializing SDK
  const timeout = setTimeout(() => {
    log("CF player timeout, skipping");
    onEnded();
  }, 15000);

  iframe.addEventListener("load", () => {
    cfPlayer = Stream(iframe);
    cfPlayer.muted = muted;

    cfPlayer.addEventListener("canplay", function handler() {
      cfPlayer.removeEventListener("canplay", handler);
      clearTimeout(timeout);
      onReady();
      cfPlayer.play();
    });
    cfPlayer.addEventListener("ended", function handler() {
      cfPlayer.removeEventListener("ended", handler);
      onEnded();
    });
    cfPlayer.addEventListener("error", function handler() {
      cfPlayer.removeEventListener("error", handler);
      clearTimeout(timeout);
      onEnded();
    });
  }, { once: true });
}

function playLocalVideo(src, muted, onReady, onEnded) {
  const video = document.getElementById("bulletin-video");
  destroyCfPlayer();
  video.style.display = "block";
  video.muted = muted;
  video.onended = onEnded;
  video.onerror = onEnded;
  video.src = src;
  video.oncanplay = () => {
    video.oncanplay = null;
    onReady();
    video.play().catch(onEnded);
  };
  video.load();
}

// ── TTS Audio (pre-generated, play from URL) ──
function playTtsAudio(url) {
  if (!url) return Promise.resolve();
  stopTTS();
  return new Promise((resolve) => {
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => { currentAudio = null; resolve(); };
    audio.onerror = () => { currentAudio = null; resolve(); };
    audio.play().catch(() => { currentAudio = null; resolve(); });
  });
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

// ── Poster Display (from pre-computed URL) ────
function showPoster(posterUrl) {
  const canvas = document.getElementById("poster-canvas");
  if (!canvas || !posterUrl) return;
  const ctx = canvas.getContext("2d");
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

// ── Play Bulletin ─────────────────────────────
function playBulletin() {
  if (!masterJson) return log("ERROR: Build the bulletin first");

  log("Starting bulletin playback...");
  playerQueue = buildPlaybackQueue(masterJson);
  playerIndex = 0;
  playerPaused = false;

  log("Queue: " + playerQueue.length + " segments");
  playerQueue.forEach((seg, i) => log("  " + (i + 1) + ". [" + seg.type + "] " + seg.label));

  initBgMusic();
  if (bgMusic) {
    bgMusic.volume = 0.01;
    bgMusic.play().catch(() => log("  bg music autoplay blocked"));
  }
  activatePlayer();
  document.getElementById("player-section").scrollIntoView({ behavior: "smooth" });
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

  if (isCfStreamUrl(segment.src)) {
    playCfVideo(segment.src, true, onReady, advance);
  } else {
    playLocalVideo(segment.src, true, onReady, advance);
  }
}

// ── Video Segment (bg music off) ──────────────
function playVideoSegment(segment) {
  const overlay = document.getElementById("studio-overlay");

  clearSubtitles();
  stopTTS();
  setBgMusicVolume(0, 500);
  showTicker(segment.headline);

  const onReady = () => { overlay.style.display = "none"; };
  const advance = () => { playerIndex++; playNextSegment(); };

  if (isCfStreamUrl(segment.src)) {
    playCfVideo(segment.src, false, onReady, advance);
  } else {
    playLocalVideo(segment.src, false, onReady, advance);
  }
}

// ── Studio Segment (TTS + bg music low) ───────
async function showStudioSegment(segment) {
  const video = document.getElementById("bulletin-video");
  const overlay = document.getElementById("studio-overlay");

  hideTicker();
  video.pause();
  video.style.display = "none";
  destroyCfPlayer();
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

  if (segment.subtitles?.length) startSubtitleTimer(segment.subtitles);

  // Play pre-generated TTS audio
  const ttsStart = Date.now();
  await playTtsAudio(segment.ttsUrl);

  const elapsed = Date.now() - ttsStart;
  if (elapsed < 2500) await new Promise(r => setTimeout(r, 2500 - elapsed));

  clearSubtitles();

  if (!playerPaused) { playerIndex++; playNextSegment(); }
}

// ── Pause / Resume ────────────────────────────
function togglePause() {
  const video = document.getElementById("bulletin-video");
  const btn = document.getElementById("btn-player-pause");
  playerPaused = !playerPaused;

  if (playerPaused) {
    video.pause();
    if (cfPlayer) try { cfPlayer.pause(); } catch {}
    if (bgMusic && !bgMusic.paused) bgMusic.pause();
    stopTTS();
    clearSubtitles();
    if (studioTimeout) clearTimeout(studioTimeout);
    btn.textContent = "▶";
    log("Paused.");
  } else {
    if (bgMusic) bgMusic.play().catch(() => {});
    const segment = playerQueue[playerIndex];
    if (segment?.type === "video" || segment?.type === "bumper") {
      if (cfPlayer) try { cfPlayer.play(); } catch {}
      else if (video.src) video.play();
    } else {
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
  video.pause();
  video.removeAttribute("src");
  video.load();
  video.style.display = "block";
  destroyCfPlayer();

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
