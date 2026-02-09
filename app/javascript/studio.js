// ──────────────────────────────────────────────
//  Studio Page — Bulletin Build & Render
// ──────────────────────────────────────────────

let bulletinId = null;
let pollTimer = null;
let hlsPlayer = null;

function init() {
  const page = document.getElementById("studio-page");
  if (!page) return;

  bulletinId = page.dataset.bulletinId;
  if (!bulletinId) return;

  const btnBuild = document.getElementById("btn-build");
  const btnRender = document.getElementById("btn-render");

  if (btnBuild) btnBuild.addEventListener("click", buildBulletin);
  if (btnRender) btnRender.addEventListener("click", startRender);

  // Start polling if stories are still analyzing or render in progress
  const bulletinStatus = page.dataset.bulletinStatus;
  const renderStatus = page.dataset.renderStatus;

  if (bulletinStatus === "draft") {
    startPolling();
  } else if (renderStatus === "rendering" || renderStatus === "queued") {
    startPolling();
  } else if (renderStatus === "done") {
    loadVideo();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// ── Polling ─────────────────────────────────
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(pollStatus, 3000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollStatus() {
  try {
    const resp = await fetch(`/studio/bulletin_status/${bulletinId}`);
    const data = await resp.json();
    if (!data.ok) return;

    updateStories(data.stories);
    updateBulletinStatus(data);

    // Check if render is done
    if (data.render_status === "done" && data.video_url) {
      stopPolling();
      showVideoPlayer(data.video_url);
    }

    // Check if render failed
    if (data.render_status === "failed") {
      stopPolling();
      showRenderError(data.render_error);
    }

    // Enable build button if all stories done and still draft
    const btnBuild = document.getElementById("btn-build");
    if (btnBuild) {
      const allDone = data.stories.every(s => s.status === "done" || s.status === "failed");
      const isDraft = data.bulletin_status === "draft";
      btnBuild.disabled = !(allDone && isDraft);
    }

    // Enable render button if ready
    const btnRender = document.getElementById("btn-render");
    if (btnRender) {
      const isReady = data.bulletin_status === "ready";
      const notRendering = data.render_status !== "rendering" && data.render_status !== "queued";
      btnRender.disabled = !(isReady && notRendering);
    }
  } catch (e) {
    // Silently retry on next interval
  }
}

function updateStories(stories) {
  const list = document.getElementById("stories-list");
  const countEl = document.getElementById("story-count");
  if (!list) return;

  if (countEl) countEl.textContent = stories.length;

  stories.forEach(s => {
    const el = list.querySelector(`[data-story-id="${s.id}"]`);
    if (!el) return;

    const titleEl = el.querySelector(".story-title");
    const emojiEl = el.querySelector(".story-emoji");
    const badgeEl = el.querySelector(".story-status-badge");

    if (titleEl && s.story_title) titleEl.textContent = s.story_title;
    if (emojiEl && s.story_emoji) emojiEl.textContent = s.story_emoji;
    if (badgeEl) {
      badgeEl.textContent = s.status.charAt(0).toUpperCase() + s.status.slice(1);
      badgeEl.className = `story-status-badge badge badge-sm ${statusBadgeClass(s.status)}`;
    }
  });
}

function statusBadgeClass(status) {
  switch (status) {
    case "pending":   return "badge-ghost";
    case "analyzing": return "badge-warning";
    case "done":      return "badge-success";
    case "failed":    return "badge-error";
    default:          return "badge-ghost";
  }
}

function updateBulletinStatus(data) {
  // Update render progress
  if (data.render_status === "rendering" || data.render_status === "queued") {
    const container = document.getElementById("progress-container");
    const bar = document.getElementById("progress-bar");
    const step = document.getElementById("progress-step");
    const pct = document.getElementById("progress-pct");

    if (container) container.classList.remove("hidden");
    if (bar) bar.value = data.render_progress;
    if (step) step.textContent = data.render_step || "Rendering...";
    if (pct) pct.textContent = `${data.render_progress}%`;
  }
}

// ── Build ───────────────────────────────────
async function buildBulletin() {
  const btn = document.getElementById("btn-build");
  if (!btn) return;

  btn.disabled = true;
  btn.innerHTML = '<span class="loading loading-spinner loading-sm"></span> Building...';

  try {
    const resp = await fetch(`/studio/build/${bulletinId}`, {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken() }
    });
    const data = await resp.json();

    if (data.ok) {
      btn.textContent = "Built!";
      btn.classList.add("btn-success");
      // Enable render button
      const btnRender = document.getElementById("btn-render");
      if (btnRender) btnRender.disabled = false;
    } else {
      btn.textContent = "Build Failed";
      btn.classList.add("btn-error");
      btn.disabled = false;
    }
  } catch (e) {
    btn.textContent = "Build Failed";
    btn.classList.add("btn-error");
    btn.disabled = false;
  }
}

// ── Render ──────────────────────────────────
async function startRender() {
  const btn = document.getElementById("btn-render");
  if (!btn) return;

  btn.disabled = true;
  btn.innerHTML = '<span class="loading loading-spinner loading-sm"></span> Starting...';

  try {
    const resp = await fetch(`/studio/render/${bulletinId}`, {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken() }
    });
    const data = await resp.json();

    if (data.ok) {
      btn.textContent = "Rendering...";
      const container = document.getElementById("progress-container");
      if (container) container.classList.remove("hidden");
      startPolling();
    } else {
      btn.textContent = "Render Failed";
      btn.classList.add("btn-error");
      btn.disabled = false;
    }
  } catch (e) {
    btn.textContent = "Render Failed";
    btn.classList.add("btn-error");
    btn.disabled = false;
  }
}

// ── Video Player ────────────────────────────
function loadVideo() {
  // On page load if render is done, fetch the URL
  pollStatus().then(() => {});
}

function showVideoPlayer(videoUrl) {
  const container = document.getElementById("player-container");
  const video = document.getElementById("bulletin-video");
  if (!container || !video) return;

  container.classList.remove("hidden");

  if (videoUrl.includes(".m3u8")) {
    import("hls.js").then(({ default: Hls }) => {
      if (Hls.isSupported()) {
        if (hlsPlayer) hlsPlayer.destroy();
        hlsPlayer = new Hls();
        hlsPlayer.loadSource(videoUrl);
        hlsPlayer.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = videoUrl;
      }
    });
  } else {
    video.src = videoUrl;
  }
}

function showRenderError(error) {
  const container = document.getElementById("progress-container");
  if (container) {
    container.innerHTML = `<div class="alert alert-error"><span>${escapeHtml(error || "Render failed")}</span></div>`;
    container.classList.remove("hidden");
  }
}

// ── Utility ─────────────────────────────────
function csrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.content : "";
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
