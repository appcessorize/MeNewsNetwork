// ── DOM refs ───────────────────────────────────────────────────────────────────
const btnHealth = document.getElementById("btn-health");
const btnAnalyze = document.getElementById("btn-analyze");
const btnChoose = document.getElementById("btn-choose");
const fileInput = document.getElementById("file-input");
const fileName = document.getElementById("file-name");
const videoPreviewWrap = document.getElementById("video-preview-wrap");
const videoPreview = document.getElementById("video-preview");
const debugEl = document.getElementById("debug");
const resultsEl = document.getElementById("results");
const progressWrap = document.getElementById("progress-bar-wrap");
const progressBar = document.getElementById("progress-bar");
const scriptSection = document.getElementById("script-section");
const newsScriptEl = document.getElementById("news-script");
const querySection = document.getElementById("query-section");
const queryInput = document.getElementById("query-input");
const btnQuery = document.getElementById("btn-query");
const queryResult = document.getElementById("query-result");
const voiceSelect = document.getElementById("voice-select");
const btnTts = document.getElementById("btn-tts");
const ttsStatus = document.getElementById("tts-status");
const ttsAudio = document.getElementById("tts-audio");
const btnCfUpload = document.getElementById("btn-cf-upload");
const cfProgressWrap = document.getElementById("cf-progress-wrap");
const cfProgressBar = document.getElementById("cf-progress-bar");
const cfStreamSection = document.getElementById("cf-stream-section");
const cfStatus = document.getElementById("cf-status");
const cfPlayerWrap = document.getElementById("cf-player-wrap");
const cfPlayer = document.getElementById("cf-player");
const cfUrl = document.getElementById("cf-url");
const cfUrlLink = document.getElementById("cf-url-link");

let currentSessionId = null;
let currentNewsScript = null;
let cfCustomerCode = null;

// ── Load voices + CF config on startup ─────────────────────────────────────────
(async () => {
  try {
    const res = await fetch("/api/voices");
    const data = await res.json();
    if (data.ok) {
      for (const v of data.voices) {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        if (v === "Orus") opt.selected = true;
        voiceSelect.appendChild(opt);
      }
    }
  } catch {}

  try {
    const res = await fetch("/api/cf/config");
    const data = await res.json();
    if (data.ok && data.configured) {
      cfCustomerCode = data.customerCode;
      log("Cloudflare Stream configured", "ok");
    } else {
      btnCfUpload.title = "Cloudflare Stream not configured";
      log("Cloudflare Stream not configured — set env vars to enable", "warn");
    }
  } catch {}
})();

// ── Debug logger ───────────────────────────────────────────────────────────────
function log(msg, level = "info") {
  const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
  const prefix = { info: "\u2139", ok: "\u2713", err: "\u2717", warn: "\u26A0" }[level] || "\u00B7";
  debugEl.textContent += `[${ts}] ${prefix} ${msg}\n`;
  debugEl.scrollTop = debugEl.scrollHeight;
}

function logUsage(usage) {
  if (!usage) return;
  const parts = [];
  if (usage.promptTokenCount) parts.push(`prompt: ${usage.promptTokenCount}`);
  if (usage.candidatesTokenCount) parts.push(`response: ${usage.candidatesTokenCount}`);
  if (usage.totalTokenCount) parts.push(`total: ${usage.totalTokenCount}`);
  if (parts.length) {
    log(`Tokens used \u2014 ${parts.join(", ")}`, "info");
  }
}

// ── Test Gemini ────────────────────────────────────────────────────────────────
const btnTestGemini = document.getElementById("btn-test-gemini");
btnTestGemini.addEventListener("click", async () => {
  log("Testing Gemini API (text-only call)...");
  btnTestGemini.disabled = true;
  try {
    const res = await fetch("/api/test-gemini");
    const data = await res.json();
    if (data.ok) {
      log(`Gemini OK \u2014 "${data.reply}"`, "ok");
    } else {
      log(`Gemini error: ${data.error}`, "err");
    }
  } catch (e) {
    log(`Gemini test failed: ${e.message}`, "err");
  } finally {
    btnTestGemini.disabled = false;
  }
});

// ── Weather ────────────────────────────────────────────────────────────────────
const btnWeather = document.getElementById("btn-weather");
const weatherSection = document.getElementById("weather-section");
const weatherCard = document.getElementById("weather-card");

btnWeather.addEventListener("click", async () => {
  log("Fetching London weather...");
  btnWeather.disabled = true;
  weatherCard.innerHTML = '<div class="weather-loading">Loading forecast...</div>';
  weatherSection.hidden = false;

  try {
    const res = await fetch("/api/weather");
    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.error);
    }
    log("Weather report received", "ok");
    logUsage(data.usage);
    renderWeather(data.report);
  } catch (e) {
    log(`Weather failed: ${e.message}`, "err");
    weatherCard.innerHTML = `<div class="weather-loading">Error: ${e.message}</div>`;
  } finally {
    btnWeather.disabled = false;
  }
});

function renderWeather(r) {
  const dailyHtml = (r.daily || []).map(d => `
    <div class="forecast-day">
      <div class="forecast-day-name">${d.day}</div>
      <div class="forecast-day-emoji">${d.emoji}</div>
      <div class="forecast-temps">
        <span class="temp-high">${Math.round(d.high_c)}\u00B0</span>
        <span class="temp-low">${Math.round(d.low_c)}\u00B0</span>
      </div>
      <div class="forecast-summary">${d.summary}</div>
    </div>
  `).join("");

  weatherCard.innerHTML = `
    <div class="weather-headline">${r.headline}</div>
    <div class="weather-current">
      <div class="current-emoji">${r.current.emoji}</div>
      <div class="current-info">
        <div class="current-temp">${Math.round(r.current.temp_c)}\u00B0C</div>
        <div class="current-summary">${r.current.summary}</div>
        <div class="current-details">
          <span>Feels: ${r.current.feels_like}</span>
          <span>Wind: ${r.current.wind_kmh} km/h</span>
          <span>Humidity: ${r.current.humidity_pct}%</span>
        </div>
      </div>
    </div>
    <div class="forecast-grid">${dailyHtml}</div>
    <div class="weather-advice">${r.advice}</div>
  `;
}

// ── Health check ───────────────────────────────────────────────────────────────
btnHealth.addEventListener("click", async () => {
  log("Testing API connection...");
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    if (data.ok) {
      log(`Health OK \u2014 server time: ${data.time}`, "ok");
    } else {
      log(`Health check returned unexpected data: ${JSON.stringify(data)}`, "warn");
    }
  } catch (e) {
    log(`Health check failed: ${e.message}`, "err");
  }
});

// ── File picker ────────────────────────────────────────────────────────────────
btnChoose.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) {
    fileName.textContent = `${file.name} (${(file.size / 1e6).toFixed(1)} MB)`;
    btnAnalyze.disabled = false;
    btnCfUpload.disabled = false;
    log(`Selected: ${file.name}`, "info");

    const url = URL.createObjectURL(file);
    videoPreview.src = url;
    videoPreviewWrap.hidden = false;
    videoPreview.onloadedmetadata = () => {
      const dur = videoPreview.duration;
      const m = Math.floor(dur / 60);
      const s = Math.floor(dur % 60);
      log(`Duration: ${m}m ${s}s`, "info");
    };

    querySection.hidden = true;
    cfStreamSection.hidden = true;
    currentSessionId = null;
  } else {
    fileName.textContent = "No file selected";
    btnAnalyze.disabled = true;
    btnCfUpload.disabled = true;
    videoPreviewWrap.hidden = true;
    videoPreview.src = "";
  }
});

// ── Analyze ────────────────────────────────────────────────────────────────────
btnAnalyze.addEventListener("click", async () => {
  const file = fileInput.files[0];
  if (!file) {
    log("No file selected.", "warn");
    return;
  }

  resultsEl.textContent = "";
  scriptSection.hidden = true;
  newsScriptEl.textContent = "";
  querySection.hidden = true;
  currentSessionId = null;
  btnAnalyze.disabled = true;
  progressWrap.hidden = false;
  progressBar.style.width = "0%";

  log(`Upload started: ${file.name} (${(file.size / 1e6).toFixed(1)} MB)`);

  try {
    const form = new FormData();
    form.append("video", file);

    const data = await uploadWithProgress(form);

    if (!data.ok) {
      log(`Server error: ${data.error}`, "err");
      resultsEl.textContent = `Error: ${data.error}`;
      return;
    }

    log(`Analysis complete \u2014 ${data.segments.length} segments returned`, "ok");
    logUsage(data.usage);
    resultsEl.textContent = data.segmentsText;

    if (data.newsScript) {
      currentNewsScript = data.newsScript;
      newsScriptEl.textContent = data.newsScript;
      scriptSection.hidden = false;
      ttsAudio.hidden = true;
      ttsAudio.src = "";
      ttsStatus.textContent = "";
      log("Newsreader script generated", "ok");
    }

    if (data.sessionId) {
      currentSessionId = data.sessionId;
      querySection.hidden = false;
      queryResult.textContent = "";
      log("Session active \u2014 you can now ask follow-up questions about this video", "ok");
    }
  } catch (e) {
    log(`Request failed: ${e.message}`, "err");
    resultsEl.textContent = `Error: ${e.message}`;
  } finally {
    btnAnalyze.disabled = false;
    progressWrap.hidden = true;
  }
});

// ── Follow-up query ────────────────────────────────────────────────────────────
btnQuery.addEventListener("click", () => sendQuery());
queryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendQuery();
});

async function sendQuery() {
  const question = queryInput.value.trim();
  if (!question) return;
  if (!currentSessionId) {
    log("No active session. Analyze a video first.", "warn");
    return;
  }

  btnQuery.disabled = true;
  queryResult.textContent = "Thinking...";
  log(`Query: "${question}"`);

  try {
    const res = await fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId, question }),
    });

    const data = await res.json();
    if (!data.ok) {
      log(`Query error: ${data.error}`, "err");
      queryResult.textContent = `Error: ${data.error}`;
      return;
    }

    log("Query response received", "ok");
    logUsage(data.usage);
    queryResult.textContent = data.answer;
  } catch (e) {
    log(`Query failed: ${e.message}`, "err");
    queryResult.textContent = `Error: ${e.message}`;
  } finally {
    btnQuery.disabled = false;
  }
}

// ── TTS generation ─────────────────────────────────────────────────────────────
btnTts.addEventListener("click", async () => {
  if (!currentNewsScript) {
    log("No script to read. Analyze a video first.", "warn");
    return;
  }

  const voice = voiceSelect.value;
  btnTts.disabled = true;
  ttsStatus.textContent = "Generating audio...";
  ttsAudio.hidden = true;
  log(`TTS: generating with voice "${voice}"...`);

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: currentNewsScript, voice }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    ttsAudio.src = url;
    ttsAudio.hidden = false;
    ttsStatus.textContent = `${(blob.size / 1024).toFixed(0)} KB WAV`;
    log(`TTS complete \u2014 ${(blob.size / 1024).toFixed(0)} KB`, "ok");
    ttsAudio.play();
  } catch (e) {
    log(`TTS failed: ${e.message}`, "err");
    ttsStatus.textContent = "Failed";
  } finally {
    btnTts.disabled = false;
  }
});

// ── Cloudflare Stream upload ──────────────────────────────────────────────────
btnCfUpload.addEventListener("click", async () => {
  const file = fileInput.files[0];
  if (!file) {
    log("No file selected.", "warn");
    return;
  }

  btnCfUpload.disabled = true;
  cfStreamSection.hidden = false;
  cfPlayerWrap.hidden = true;
  cfUrl.hidden = true;
  cfStatus.textContent = "Requesting upload URL...";
  cfProgressWrap.hidden = false;
  cfProgressBar.style.width = "0%";

  log(`Cloudflare upload started: ${file.name}`);

  try {
    const createRes = await fetch("/api/cf/create-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name }),
    });
    const createData = await createRes.json();

    if (!createData.ok) {
      throw new Error(createData.error || "Failed to create upload URL");
    }

    const { uploadURL, uid } = createData;
    log(`Got upload URL, uid=${uid}`, "ok");
    cfStatus.textContent = "Uploading to Cloudflare...";

    await cfUploadWithProgress(uploadURL, file);

    log("Upload to Cloudflare complete, waiting for encoding...", "ok");
    cfStatus.textContent = "Encoding video...";
    cfProgressBar.style.width = "100%";
    cfProgressWrap.hidden = true;

    let ready = false;
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const statusRes = await fetch(`/api/cf/video/${uid}`);
      const statusData = await statusRes.json();

      if (!statusData.ok) {
        log(`Status check failed: ${statusData.error}`, "warn");
        continue;
      }

      const { readyToStream, status: st, preview, meta } = statusData.result;
      const state = st?.state || "unknown";
      cfStatus.textContent = `Encoding... (${state})`;
      log(`Cloudflare: state=${state} readyToStream=${readyToStream}`);

      if (readyToStream) {
        ready = true;
        const title = meta?.name || file.name;
        cfStatus.textContent = `Ready: ${title}`;

        if (cfCustomerCode) {
          cfPlayer.innerHTML = `
            <div style="position:relative;padding-top:56.25%">
              <iframe
                src="https://customer-${cfCustomerCode}.cloudflarestream.com/${uid}/iframe"
                style="border:none;position:absolute;top:0;left:0;height:100%;width:100%;"
                allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture"
                allowfullscreen
              ></iframe>
            </div>`;
          cfPlayerWrap.hidden = false;
        }

        if (preview) {
          cfUrlLink.href = preview;
          cfUrlLink.textContent = preview;
          cfUrl.hidden = false;
        }

        log(`Cloudflare Stream ready: ${title}`, "ok");
        break;
      }
    }

    if (!ready) {
      cfStatus.textContent = "Timed out waiting for encoding.";
      log("Cloudflare encoding timed out after ~3 minutes", "err");
    }
  } catch (e) {
    log(`Cloudflare upload failed: ${e.message}`, "err");
    cfStatus.textContent = `Error: ${e.message}`;
  } finally {
    btnCfUpload.disabled = false;
    cfProgressWrap.hidden = true;
  }
});

function cfUploadWithProgress(uploadURL, file) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadURL);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        cfProgressBar.style.width = `${pct}%`;
        if (pct % 20 === 0 || pct === 100) {
          log(`Cloudflare upload: ${pct}%`);
        }
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed: HTTP ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error during Cloudflare upload")));
    xhr.addEventListener("abort", () => reject(new Error("Cloudflare upload aborted")));
    xhr.addEventListener("timeout", () => reject(new Error("Cloudflare upload timed out")));

    xhr.timeout = 300000;
    const fd = new FormData();
    fd.append("file", file, file.name);
    xhr.send(fd);
  });
}

// ── XHR upload with progress ───────────────────────────────────────────────────
function uploadWithProgress(formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/analyze");

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        progressBar.style.width = `${pct}%`;
        if (pct < 100) {
          log(`Upload progress: ${pct}%`);
        } else {
          log("Upload complete, waiting for Gemini analysis...");
        }
      }
    });

    xhr.addEventListener("load", () => {
      try {
        const data = JSON.parse(xhr.responseText);
        resolve(data);
      } catch {
        reject(new Error(`Invalid JSON response (HTTP ${xhr.status})`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));
    xhr.addEventListener("timeout", () => reject(new Error("Request timed out")));

    xhr.timeout = 600000;
    xhr.send(formData);
  });
}

// ═══ Story Debug: Text, Voice, Image ═══════════════════════════════════════════

let currentStoryId = null;

// Auto-create a story if one doesn't exist yet
async function ensureStory() {
  if (currentStoryId) return currentStoryId;

  log("Auto-creating story...");
  const res = await fetch("/api/stories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: "" }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error);

  currentStoryId = data.story.id;
  log(`Story #${data.story.id} created`, "ok");
  return currentStoryId;
}

// ── 1. Text Note ──────────────────────────────────────────────────────────────
const storyTextInput = document.getElementById("story-text-input");
const btnSaveText = document.getElementById("btn-save-text");
const storyTextResult = document.getElementById("story-text-result");
const storyTextDisplay = document.getElementById("story-text-display");

btnSaveText.addEventListener("click", () => saveTextNote());
storyTextInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveTextNote();
});

async function saveTextNote() {
  const body = storyTextInput.value.trim();
  if (!body) return;

  btnSaveText.disabled = true;
  log("Saving text note...");

  try {
    const res = await fetch("/api/stories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const data = await res.json();

    if (!data.ok) {
      log(`Text save error: ${data.error}`, "err");
      return;
    }

    currentStoryId = data.story.id;
    const time = new Date(data.story.created_at).toLocaleTimeString("en-GB", { hour12: false });

    storyTextDisplay.innerHTML =
      `<div class="flex items-center gap-2 mb-2">` +
        (data.user.avatar_url ? `<img src="${data.user.avatar_url}" class="w-5 h-5 rounded-full">` : "") +
        `<span class="text-xs font-medium text-gray-700">${data.user.name}</span>` +
        `<span class="text-xs text-gray-400">${time}</span>` +
      `</div>` +
      `<p class="text-sm text-gray-800">${data.story.body}</p>`;
    storyTextResult.hidden = false;
    storyTextInput.value = "";
    log(`Text note saved (story #${data.story.id})`, "ok");
  } catch (e) {
    log(`Text save failed: ${e.message}`, "err");
  } finally {
    btnSaveText.disabled = false;
  }
}

// ── 2. Voice Note ─────────────────────────────────────────────────────────────
const btnRecord = document.getElementById("btn-record");
const recordTimer = document.getElementById("record-timer");
const recordStatus = document.getElementById("record-status");
const voiceNoteResult = document.getElementById("voice-note-result");
const voiceNotePlayer = document.getElementById("voice-note-player");

let mediaRecorder = null;
let audioChunks = [];
let recordInterval = null;
let recordSeconds = 0;
const MAX_RECORD_SECONDS = 25;

btnRecord.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    stopRecording();
  } else {
    startRecording();
  }
});

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.addEventListener("dataavailable", (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    });

    mediaRecorder.addEventListener("stop", async () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(recordInterval);
      recordTimer.hidden = true;
      btnRecord.textContent = "Record";
      btnRecord.classList.remove("bg-red-50", "text-red-600", "border-red-300");

      if (audioChunks.length === 0) return;

      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      log(`Voice recording: ${(blob.size / 1024).toFixed(0)} KB, ${recordSeconds}s`);
      await uploadVoiceNote(blob);
    });

    mediaRecorder.start();
    recordSeconds = 0;
    recordTimer.hidden = false;
    recordTimer.textContent = "0:00 / 0:25";
    recordStatus.textContent = "";
    btnRecord.textContent = "Stop";
    btnRecord.classList.add("bg-red-50", "text-red-600", "border-red-300");
    log("Recording started...");

    recordInterval = setInterval(() => {
      recordSeconds++;
      const m = Math.floor(recordSeconds / 60);
      const s = String(recordSeconds % 60).padStart(2, "0");
      recordTimer.textContent = `${m}:${s} / 0:25`;

      if (recordSeconds >= MAX_RECORD_SECONDS) {
        stopRecording();
      }
    }, 1000);
  } catch (e) {
    log(`Microphone access denied: ${e.message}`, "err");
    recordStatus.textContent = "Mic access denied";
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
}

async function uploadVoiceNote(blob) {
  recordStatus.textContent = "Uploading...";
  btnRecord.disabled = true;

  try {
    const storyId = await ensureStory();
    const fd = new FormData();
    fd.append("voice_note", blob, `voice-${Date.now()}.webm`);

    const res = await fetch(`/api/stories/${storyId}/voice_notes`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json();

    if (!data.ok) {
      log(`Voice upload error: ${data.error}`, "err");
      recordStatus.textContent = "Upload failed";
      return;
    }

    voiceNotePlayer.src = data.voice_note.url;
    voiceNoteResult.hidden = false;
    recordStatus.textContent = "Uploaded";
    log(`Voice note uploaded: ${data.voice_note.filename}`, "ok");
  } catch (e) {
    log(`Voice upload failed: ${e.message}`, "err");
    recordStatus.textContent = "Upload failed";
  } finally {
    btnRecord.disabled = false;
  }
}

// ── 3. Image Upload ───────────────────────────────────────────────────────────
const btnChooseImage = document.getElementById("btn-choose-image");
const imageInput = document.getElementById("image-input");
const imageName = document.getElementById("image-name");
const imageResult = document.getElementById("image-result");
const imagePreview = document.getElementById("image-preview");

btnChooseImage.addEventListener("click", () => imageInput.click());

imageInput.addEventListener("change", async () => {
  const file = imageInput.files[0];
  if (!file) return;

  imageName.textContent = `${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
  log(`Image selected: ${file.name}`);

  btnChooseImage.disabled = true;
  imageName.textContent = "Uploading...";

  try {
    const storyId = await ensureStory();
    const fd = new FormData();
    fd.append("image", file);

    const res = await fetch(`/api/stories/${storyId}/images`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json();

    if (!data.ok) {
      log(`Image upload error: ${data.error}`, "err");
      imageName.textContent = "Upload failed";
      return;
    }

    imagePreview.src = data.image.url;
    imageResult.hidden = false;
    imageName.textContent = `${data.image.filename} — uploaded`;
    log(`Image uploaded: ${data.image.filename}`, "ok");
  } catch (e) {
    log(`Image upload failed: ${e.message}`, "err");
    imageName.textContent = "Upload failed";
  } finally {
    btnChooseImage.disabled = false;
    imageInput.value = "";
  }
});
