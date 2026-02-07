// ──────────────────────────────────────────────
//  Chat Page — Robot Journalist Conversation
// ──────────────────────────────────────────────

// ── State ────────────────────────────────────
const STATE = {
  IDLE: "idle",
  UPLOADING: "uploading",
  ANALYZING: "analyzing",
  ASKING_CONTEXT: "asking_context",
  ASKING_FOLLOWUP: "asking_followup",
  GENERATING: "generating",
  SUGGESTING_COMMENTERS: "suggesting_commenters",
};

const JOURNALIST_QUESTIONS = [
  { key: "who",     text: "Who's in this?" },
  { key: "when",    text: "When did this happen?" },
  { key: "where",   text: "Where was this taken?" },
  { key: "context", text: "What's the story here? Any extra context?" },
];

let state = STATE.IDLE;
let currentAnalysis = null;
let currentSessionId = null;
let currentMediaFile = null;
let currentMediaType = null;
let contextAnswers = {};
let contextQuestionIndex = 0;
let followUpQuestions = [];
let followUpIndex = 0;

let USER_AVATAR = "";
let USER_NAME = "You";
let GROUP_NAME = "";
let GROUP_MEMBERS = [];

// ── Voice Recording ──────────────────────────
let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;
const MAX_RECORDING_SECONDS = 30;

// ── Init ─────────────────────────────────────
function init() {
  const page = document.getElementById("chat-page");
  if (!page) return;

  USER_AVATAR = page.dataset.userAvatar || "";
  USER_NAME = page.dataset.userName || "You";
  GROUP_NAME = page.dataset.groupName || "";
  try { GROUP_MEMBERS = JSON.parse(page.dataset.groupMembers || "[]"); } catch { GROUP_MEMBERS = []; }

  initTextInput();
  initMediaButtons();
  initVoiceRecording();
  initKeyboardHandling();
  scrollToBottom();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// ── Text Input ───────────────────────────────
function initTextInput() {
  const textarea = document.getElementById("chat-textarea");
  const btnSend = document.getElementById("btn-send");
  const btnMic = document.getElementById("btn-mic");
  if (!textarea || !btnSend || !btnMic) return;

  // Auto-grow
  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 100) + "px";
    toggleSendMic();
  });

  // Send on Enter
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  btnSend.addEventListener("click", handleSend);
}

function toggleSendMic() {
  const textarea = document.getElementById("chat-textarea");
  const btnSend = document.getElementById("btn-send");
  const btnMic = document.getElementById("btn-mic");
  if (!textarea || !btnSend || !btnMic) return;

  if (textarea.value.trim()) {
    btnMic.classList.add("hidden");
    btnSend.classList.remove("hidden");
  } else {
    btnSend.classList.add("hidden");
    btnMic.classList.remove("hidden");
  }
}

function handleSend() {
  const textarea = document.getElementById("chat-textarea");
  if (!textarea) return;
  const text = textarea.value.trim();
  if (!text) return;

  textarea.value = "";
  textarea.style.height = "auto";
  toggleSendMic();

  appendUserMessage(text);

  if (state === STATE.ASKING_CONTEXT) {
    handleContextAnswer(text);
  } else if (state === STATE.ASKING_FOLLOWUP) {
    handleFollowUpAnswer(text);
  } else if (state === STATE.SUGGESTING_COMMENTERS) {
    // Text during commenter suggestion — treat as "done"
    finishStory();
  } else {
    // IDLE — treat as a text story
    handleTextSubmission(text);
  }
}

// ── Media Buttons ────────────────────────────
function initMediaButtons() {
  const btnPhoto = document.getElementById("btn-photo");
  const btnVideo = document.getElementById("btn-video");
  const imagePicker = document.getElementById("image-picker");
  const videoPicker = document.getElementById("video-picker");

  if (btnPhoto && imagePicker) {
    btnPhoto.addEventListener("click", () => {
      if (state !== STATE.IDLE) return;
      imagePicker.click();
    });
    imagePicker.addEventListener("change", (e) => {
      if (e.target.files[0]) handleMediaSelected(e.target.files[0], "image");
      e.target.value = "";
    });
  }

  if (btnVideo && videoPicker) {
    btnVideo.addEventListener("click", () => {
      if (state !== STATE.IDLE) return;
      videoPicker.click();
    });
    videoPicker.addEventListener("change", (e) => {
      if (e.target.files[0]) handleMediaSelected(e.target.files[0], "video");
      e.target.value = "";
    });
  }
}

// ── Voice Recording ──────────────────────────
function initVoiceRecording() {
  const btnMic = document.getElementById("btn-mic");
  const btnStop = document.getElementById("btn-stop-recording");
  if (!btnMic) return;

  btnMic.addEventListener("click", () => {
    if (state !== STATE.IDLE) return;
    startRecording();
  });

  if (btnStop) {
    btnStop.addEventListener("click", stopRecording);
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: getSupportedAudioMime() });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      const file = new File([blob], "voice-note.webm", { type: mediaRecorder.mimeType });
      handleMediaSelected(file, "audio");
    };

    mediaRecorder.start();
    recordingSeconds = 0;
    updateRecordingUI(true);
    recordingTimer = setInterval(() => {
      recordingSeconds++;
      const timerEl = document.getElementById("recording-timer");
      if (timerEl) timerEl.textContent = formatDuration(recordingSeconds);
      if (recordingSeconds >= MAX_RECORDING_SECONDS) stopRecording();
    }, 1000);
  } catch (err) {
    appendBotMessage("I couldn't access your microphone. Please check your browser permissions.");
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
  clearInterval(recordingTimer);
  updateRecordingUI(false);
}

function updateRecordingUI(isRecording) {
  const indicator = document.getElementById("recording-indicator");
  const btnMic = document.getElementById("btn-mic");
  const btnPhoto = document.getElementById("btn-photo");
  const btnVideo = document.getElementById("btn-video");
  const textarea = document.getElementById("chat-textarea");

  if (indicator) indicator.classList.toggle("hidden", !isRecording);
  if (btnMic) btnMic.classList.toggle("recording", isRecording);
  if (btnMic) btnMic.classList.toggle("hidden", isRecording);
  if (btnPhoto) btnPhoto.classList.toggle("hidden", isRecording);
  if (btnVideo) btnVideo.classList.toggle("hidden", isRecording);
  if (textarea) textarea.classList.toggle("hidden", isRecording);
}

function getSupportedAudioMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return types.find(t => MediaRecorder.isTypeSupported(t)) || "";
}

// ── iOS Keyboard Handling ────────────────────
function initKeyboardHandling() {
  if (!window.visualViewport) return;

  const inputBar = document.getElementById("chat-input-bar");
  const chatScroll = document.getElementById("chat-messages");
  if (!inputBar || !chatScroll) return;

  let originalHeight = window.visualViewport.height;

  window.visualViewport.addEventListener("resize", () => {
    const heightDiff = originalHeight - window.visualViewport.height;
    if (heightDiff > 50) {
      // Keyboard is open
      inputBar.style.transform = `translateY(-${heightDiff}px)`;
      chatScroll.style.paddingBottom = `${heightDiff}px`;
      scrollToBottom();
    } else {
      // Keyboard is closed
      inputBar.style.transform = "";
      chatScroll.style.paddingBottom = "";
    }
  });

  window.visualViewport.addEventListener("scroll", () => {
    inputBar.style.transform = `translateY(${window.visualViewport.offsetTop}px)`;
  });
}

// ── Message Rendering ────────────────────────
function appendUserMessage(text) {
  const container = document.getElementById("chat-messages");
  if (!container) return;

  const bubble = createBubble("user", text);
  container.appendChild(bubble);
  animateIn(bubble);
  scrollToBottom();
}

function appendBotMessage(text) {
  return new Promise((resolve) => {
    const container = document.getElementById("chat-messages");
    if (!container) { resolve(); return; }

    const typing = showTypingIndicator();
    const delay = 400 + Math.random() * 600;

    setTimeout(() => {
      typing.remove();
      const bubble = createBubble("bot", text);
      container.appendChild(bubble);
      animateIn(bubble);
      scrollToBottom();
      resolve();
    }, delay);
  });
}

function appendBotMessageInstant(text) {
  const container = document.getElementById("chat-messages");
  if (!container) return;

  const bubble = createBubble("bot", text);
  container.appendChild(bubble);
  animateIn(bubble);
  scrollToBottom();
}

function appendMediaPreview(file, type) {
  const container = document.getElementById("chat-messages");
  if (!container) return;

  const wrapper = document.createElement("div");
  wrapper.className = "chat chat-end";

  let avatarInner;
  if (USER_AVATAR) {
    avatarInner = `<div class="w-10 rounded-full"><img src="${escapeAttr(USER_AVATAR)}" alt="" referrerpolicy="no-referrer" /></div>`;
  } else {
    avatarInner = `<div class="bg-base-300 text-base-content w-10 rounded-full flex items-center justify-center"><span class="text-sm font-bold">${escapeHtml(USER_NAME.charAt(0).toUpperCase())}</span></div>`;
  }

  const previewEl = document.createElement("div");
  previewEl.className = "chat-media-preview";

  if (type === "image") {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.alt = "Photo";
    previewEl.appendChild(img);
  } else if (type === "video") {
    const vid = document.createElement("video");
    vid.src = URL.createObjectURL(file);
    vid.muted = true;
    vid.playsInline = true;
    vid.autoplay = false;
    vid.controls = false;
    vid.poster = "";
    previewEl.appendChild(vid);
    // Auto-grab first frame
    vid.addEventListener("loadeddata", () => { vid.currentTime = 0.1; });
  } else if (type === "audio") {
    previewEl.innerHTML = `<div class="flex items-center gap-2 px-3 py-2 bg-base-200 rounded-xl">
      <span class="text-lg">&#x1F3A4;</span>
      <span class="text-sm">Voice note</span>
      <span class="text-xs text-base-content/50">${formatDuration(recordingSeconds)}</span>
    </div>`;
  }

  wrapper.innerHTML = `
    <div class="chat-image avatar">
      ${avatarInner}
    </div>
    <div class="chat-header text-xs text-base-content/50 mb-1">
      ${escapeHtml(USER_NAME)}
      <time class="text-xs opacity-50">just now</time>
    </div>
  `;
  const bubbleDiv = document.createElement("div");
  bubbleDiv.className = "chat-bubble imessage-sent p-1";
  bubbleDiv.appendChild(previewEl);
  wrapper.appendChild(bubbleDiv);

  container.appendChild(wrapper);
  animateIn(wrapper);
  scrollToBottom();
}

function createBubble(from, text) {
  const isBot = from === "bot";
  const wrapper = document.createElement("div");
  wrapper.className = `chat ${isBot ? "chat-start" : "chat-end"}`;

  let avatarInner;
  if (isBot) {
    avatarInner = `<div class="bg-neutral text-neutral-content w-10 rounded-full flex items-center justify-center"><span class="text-2xl leading-none">\u{1F916}</span></div>`;
  } else if (USER_AVATAR) {
    avatarInner = `<div class="w-10 rounded-full"><img src="${escapeAttr(USER_AVATAR)}" alt="" referrerpolicy="no-referrer" /></div>`;
  } else {
    avatarInner = `<div class="bg-base-300 text-base-content w-10 rounded-full flex items-center justify-center"><span class="text-sm font-bold">${escapeHtml(USER_NAME.charAt(0).toUpperCase())}</span></div>`;
  }

  const displayName = isBot ? "Robot Journalist" : USER_NAME;
  wrapper.innerHTML = `
    <div class="chat-image avatar ${isBot ? "placeholder" : ""}">
      ${avatarInner}
    </div>
    <div class="chat-header text-xs text-base-content/50 mb-1">
      ${escapeHtml(displayName)}
      <time class="text-xs opacity-50">just now</time>
    </div>
    <div class="chat-bubble ${isBot ? "imessage-received" : "imessage-sent"}" style="white-space: pre-wrap;">${escapeHtml(text)}</div>
  `;
  return wrapper;
}

function showTypingIndicator() {
  const container = document.getElementById("chat-messages");
  const el = document.createElement("div");
  el.className = "chat chat-start typing-indicator";
  el.innerHTML = `
    <div class="chat-image avatar placeholder">
      <div class="bg-neutral text-neutral-content w-10 rounded-full flex items-center justify-center">
        <span class="text-2xl leading-none">\u{1F916}</span>
      </div>
    </div>
    <div class="chat-bubble imessage-received">
      <span class="loading loading-dots loading-sm"></span>
    </div>
  `;
  container.appendChild(el);
  scrollToBottom();
  return el;
}

function animateIn(el) {
  el.style.opacity = "0";
  el.style.transform = "translateY(12px)";
  requestAnimationFrame(() => {
    el.style.transition = "opacity 0.3s ease, transform 0.3s ease";
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  });
}

function scrollToBottom() {
  const chatBox = document.getElementById("chat-messages");
  if (chatBox) {
    requestAnimationFrame(() => {
      chatBox.scrollTop = chatBox.scrollHeight;
    });
  }
}

// ── Text Story Flow ──────────────────────────
async function handleTextSubmission(text) {
  currentMediaType = "text";
  currentAnalysis = text;
  currentMediaFile = null;

  await appendBotMessage("Got it! Let me ask you a few journalist questions about this.");
  startContextQuestions();
}

// ── Media Flow ───────────────────────────────
async function handleMediaSelected(file, type) {
  if (state !== STATE.IDLE) return;

  currentMediaFile = file;
  currentMediaType = type;

  appendMediaPreview(file, type);

  state = STATE.UPLOADING;
  await appendBotMessage(`Uploading your ${type}...`);

  try {
    state = STATE.ANALYZING;
    const typing = showTypingIndicator();

    const formData = new FormData();
    formData.append("media", file);
    formData.append("media_type", type);

    const response = await fetch("/api/chat/analyze", {
      method: "POST",
      body: formData,
    });

    typing.remove();

    const data = await response.json();
    if (!data.ok) {
      state = STATE.IDLE;
      await appendBotMessage(`Hmm, I had trouble analyzing that: ${data.error}`);
      return;
    }

    currentAnalysis = data.analysis;
    currentSessionId = data.session_id;
    followUpQuestions = data.follow_up_questions || [];

    await appendBotMessage(data.analysis);
    await appendBotMessage("Let me ask you a few journalist questions about this.");
    startContextQuestions();
  } catch (err) {
    state = STATE.IDLE;
    await appendBotMessage("Something went wrong with the upload. Please try again.");
  }
}

// ── Context Questions ────────────────────────
function startContextQuestions() {
  state = STATE.ASKING_CONTEXT;
  contextAnswers = {};
  contextQuestionIndex = 0;
  askNextContextQuestion();
}

async function askNextContextQuestion() {
  if (contextQuestionIndex >= JOURNALIST_QUESTIONS.length) {
    // All base questions asked — check for Gemini follow-ups
    if (followUpQuestions.length > 0) {
      followUpIndex = 0;
      state = STATE.ASKING_FOLLOWUP;
      await appendBotMessage("A couple more specific questions...");
      askNextFollowUp();
    } else {
      generateStory();
    }
    return;
  }

  const q = JOURNALIST_QUESTIONS[contextQuestionIndex];
  await appendBotMessage(q.text + ' (Type "skip" to skip)');
}

function handleContextAnswer(text) {
  const q = JOURNALIST_QUESTIONS[contextQuestionIndex];
  if (text.toLowerCase() !== "skip") {
    contextAnswers[q.key] = text;
  }
  contextQuestionIndex++;
  askNextContextQuestion();
}

// ── Follow-up Questions ──────────────────────
async function askNextFollowUp() {
  if (followUpIndex >= followUpQuestions.length) {
    generateStory();
    return;
  }
  await appendBotMessage(followUpQuestions[followUpIndex] + ' (Type "skip" to skip)');
}

function handleFollowUpAnswer(text) {
  if (text.toLowerCase() !== "skip") {
    contextAnswers[`followup_${followUpIndex}`] = text;
  }
  followUpIndex++;
  askNextFollowUp();
}

// ── Story Generation ─────────────────────────
async function generateStory() {
  state = STATE.GENERATING;
  await appendBotMessage("Alright, putting your story together...");
  const typing = showTypingIndicator();

  try {
    const response = await fetch("/api/chat/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: currentSessionId,
        analysis: currentAnalysis,
        answers: contextAnswers,
        media_type: currentMediaType,
      }),
    });

    typing.remove();
    const data = await response.json();

    if (!data.ok) {
      state = STATE.IDLE;
      await appendBotMessage(`I had trouble generating the story: ${data.error}`);
      return;
    }

    // Show the generated news item as a styled card
    appendNewsCard(data.headline, data.news_text);
    await appendBotMessage("Here's your story! Looking good?");

    // Suggest commenters if user is in a group
    if (GROUP_MEMBERS.length > 0) {
      suggestCommenters(data.story_id);
    } else {
      await appendBotMessage("Story saved! Got anything else for today's report?");
      resetState();
    }
  } catch (err) {
    typing.remove();
    state = STATE.IDLE;
    await appendBotMessage("Something went wrong generating the story. Please try again.");
  }
}

function appendNewsCard(headline, body) {
  const container = document.getElementById("chat-messages");
  if (!container) return;

  const wrapper = document.createElement("div");
  wrapper.className = "chat chat-start";
  wrapper.innerHTML = `
    <div class="chat-image avatar placeholder">
      <div class="bg-neutral text-neutral-content w-10 rounded-full flex items-center justify-center">
        <span class="text-2xl leading-none">\u{1F916}</span>
      </div>
    </div>
    <div class="chat-header text-xs text-base-content/50 mb-1">
      Robot Journalist
      <time class="text-xs opacity-50">just now</time>
    </div>
  `;

  const card = document.createElement("div");
  card.className = "news-card-bubble";
  card.innerHTML = `
    <div class="flex items-center gap-1 mb-2">
      <span class="text-sm">\u{1F4F0}</span>
      <span class="text-xs font-semibold uppercase tracking-wider text-blue-600">Breaking</span>
    </div>
    <h3>${escapeHtml(headline || "Your Story")}</h3>
    <p>${escapeHtml(body || "").replace(/\n/g, "<br>")}</p>
  `;

  wrapper.appendChild(card);
  container.appendChild(wrapper);
  animateIn(wrapper);
  scrollToBottom();
}

// ── Commenter Suggestions ────────────────────
async function suggestCommenters(storyId) {
  state = STATE.SUGGESTING_COMMENTERS;

  await appendBotMessage(`Want anyone from ${GROUP_NAME || "your group"} to comment on this?`);

  const container = document.getElementById("chat-messages");
  if (!container) return;

  const wrapper = document.createElement("div");
  wrapper.className = "chat chat-start";

  const pillsDiv = document.createElement("div");
  pillsDiv.className = "flex flex-wrap gap-2 py-2 pl-12";

  GROUP_MEMBERS.forEach((member) => {
    const pill = document.createElement("button");
    pill.className = "member-pill";
    pill.dataset.memberId = member.id;

    let avatarHtml;
    if (member.avatar_url) {
      avatarHtml = `<img src="${escapeAttr(member.avatar_url)}" class="w-6 h-6 rounded-full" alt="" referrerpolicy="no-referrer" />`;
    } else {
      avatarHtml = `<div class="w-6 h-6 rounded-full bg-neutral text-neutral-content flex items-center justify-center text-xs font-bold">${escapeHtml((member.name || "?").charAt(0).toUpperCase())}</div>`;
    }

    pill.innerHTML = `${avatarHtml}<span>${escapeHtml(member.name || "Friend")}</span>`;
    pill.addEventListener("click", () => {
      pill.classList.toggle("selected");
    });
    pillsDiv.appendChild(pill);
  });

  // Done button
  const doneBtn = document.createElement("button");
  doneBtn.className = "member-pill bg-primary text-primary-content";
  doneBtn.innerHTML = `<span>Done</span>`;
  doneBtn.addEventListener("click", () => {
    const selected = pillsDiv.querySelectorAll(".member-pill.selected");
    const memberIds = Array.from(selected).map(p => p.dataset.memberId).filter(Boolean);
    handleCommentersSelected(memberIds, storyId);
  });
  pillsDiv.appendChild(doneBtn);

  container.appendChild(pillsDiv);
  animateIn(pillsDiv);
  scrollToBottom();
}

async function handleCommentersSelected(memberIds, storyId) {
  if (memberIds.length > 0) {
    await appendBotMessage(`Great! I'll let ${memberIds.length} group member${memberIds.length > 1 ? "s" : ""} know about this story.`);
    // TODO: send push notifications to selected members
  }
  await appendBotMessage("Story saved! Got anything else for today's report?");
  resetState();
}

function finishStory() {
  appendBotMessage("Story saved! Got anything else for today's report?");
  resetState();
}

function resetState() {
  state = STATE.IDLE;
  currentAnalysis = null;
  currentSessionId = null;
  currentMediaFile = null;
  currentMediaType = null;
  contextAnswers = {};
  contextQuestionIndex = 0;
  followUpQuestions = [];
  followUpIndex = 0;
}

// ── Utility ──────────────────────────────────
function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDuration(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
