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
  TEST_ASKING_NAME: "test_asking_name",
  TEST_WAITING_VIDEO: "test_waiting_video",
  TEST_GENERATING_BULLETIN: "test_generating_bulletin",
  TEST_MULTI_UPLOAD: "test_multi_upload",
  TEST_MULTI_CHOOSING: "test_multi_choosing",
};

const JOURNALIST_QUESTIONS = [
  { key: "who",     text: "Who's in this?" },
  { key: "when",    text: "When did this happen?" },
  { key: "where",   text: "Where was this taken?" },
  { key: "context", text: "What's the story here? Any extra context?" },
];

const SUGGESTION_MAP = {
  who: "members",
  when: ["Just now", "Today", "Yesterday", "This week"],
  where: ["Home", "Work", "Out and about"],
};

let state = STATE.IDLE;
let currentAnalysis = null;
let currentSessionId = null;
let currentMediaFile = null;
let currentMediaType = null;
let contextAnswers = {};
let contextQuestionIndex = 0;
let followUpQuestions = [];
let followUpIndex = 0;

// Background upload state
let analysisPromise = null;
let analysisComplete = false;
let questionsComplete = false;
let storyGenerationStarted = false;

let USER_AVATAR = "";
let USER_NAME = "You";
let GROUP_NAME = "";
let GROUP_MEMBERS = [];
let bulletinMode = false;
let isTestUser = false;
let testUserName = "";
let testMultiMode = false;
let testBulletinId = null;
let testVideoCount = 0;

// ── Init ─────────────────────────────────────
function init() {
  const page = document.getElementById("chat-page");
  if (!page) return;

  USER_AVATAR = page.dataset.userAvatar || "";
  USER_NAME = page.dataset.userName || "You";
  GROUP_NAME = page.dataset.groupName || "";
  try { GROUP_MEMBERS = JSON.parse(page.dataset.groupMembers || "[]"); } catch { GROUP_MEMBERS = []; }
  bulletinMode = GROUP_NAME.length > 0;

  isTestUser = page.dataset.testUser === "true";

  initTextInput();
  initMediaButtons();
  initSkipButton();
  initKeyboardHandling();
  scrollToBottom();

  if (isTestUser) {
    startTestUserFlow();
  }
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
  if (!textarea || !btnSend) return;

  // Auto-grow
  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 100) + "px";
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

function handleSend(overrideText) {
  const textarea = document.getElementById("chat-textarea");
  if (!textarea) return;

  const text = (typeof overrideText === "string" ? overrideText : textarea.value.trim());
  if (!text) return;

  textarea.value = "";
  textarea.style.height = "auto";

  appendUserMessage(text);

  if (state === STATE.TEST_ASKING_NAME) {
    handleTestNameAnswer(text);
  } else if (state === STATE.ASKING_CONTEXT) {
    handleContextAnswer(text);
  } else if (state === STATE.ASKING_FOLLOWUP) {
    handleFollowUpAnswer(text);
  } else if (state === STATE.SUGGESTING_COMMENTERS) {
    finishStory();
  } else {
    handleTextSubmission(text);
  }
}

// ── Skip Button ──────────────────────────────
function initSkipButton() {
  const btnSkip = document.getElementById("btn-skip");
  if (!btnSkip) return;

  btnSkip.addEventListener("click", () => {
    if (state === STATE.ASKING_CONTEXT) {
      appendUserMessage("skip");
      handleContextAnswer("skip");
    } else if (state === STATE.ASKING_FOLLOWUP) {
      appendUserMessage("skip");
      handleFollowUpAnswer("skip");
    }
  });
}

function updateSkipButton() {
  const btnSkip = document.getElementById("btn-skip");
  if (!btnSkip) return;

  const isAsking = state === STATE.ASKING_CONTEXT || state === STATE.ASKING_FOLLOWUP;
  btnSkip.classList.toggle("hidden", !isAsking);
}

// ── Media Buttons ────────────────────────────
function initMediaButtons() {
  const btnVideo = document.getElementById("btn-video");
  const videoPicker = document.getElementById("video-picker");

  if (btnVideo && videoPicker) {
    btnVideo.addEventListener("click", () => {
      if (state !== STATE.IDLE && state !== STATE.TEST_WAITING_VIDEO && state !== STATE.TEST_MULTI_UPLOAD) return;
      videoPicker.click();
    });
    videoPicker.addEventListener("change", (e) => {
      if (e.target.files[0]) handleMediaSelected(e.target.files[0], "video");
      e.target.value = "";
    });
  }
}

function updateToolbarState() {
  const btnVideo = document.getElementById("btn-video");

  const disabled = state !== STATE.IDLE && state !== STATE.TEST_WAITING_VIDEO && state !== STATE.TEST_MULTI_UPLOAD;
  if (btnVideo) btnVideo.style.opacity = disabled ? "0.3" : "1";

  updateSkipButton();
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

// ── Suggestion Pills ─────────────────────────
function showSuggestionPills(questionKey) {
  const container = document.getElementById("suggestion-pills");
  if (!container) return;

  container.innerHTML = "";
  const suggestions = SUGGESTION_MAP[questionKey];
  if (!suggestions) {
    container.classList.add("hidden");
    return;
  }

  let pills = [];
  if (suggestions === "members") {
    // "Me" pill
    pills.push({ text: USER_NAME, avatar: USER_AVATAR, label: "Me" });
    // Group member pills
    GROUP_MEMBERS.forEach((m) => {
      pills.push({ text: m.name, avatar: m.avatar_url, label: m.name });
    });
  } else {
    pills = suggestions.map((s) => ({ text: s, label: s }));
  }

  if (pills.length === 0) {
    container.classList.add("hidden");
    return;
  }

  pills.forEach((p) => {
    const pill = document.createElement("button");
    pill.className = "suggestion-pill";
    pill.type = "button";

    let inner = "";
    if (p.avatar) {
      inner += `<img src="${escapeAttr(p.avatar)}" class="w-5 h-5 rounded-full" alt="" referrerpolicy="no-referrer" />`;
    }
    inner += `<span>${escapeHtml(p.label)}</span>`;
    pill.innerHTML = inner;

    pill.addEventListener("click", () => {
      hideSuggestionPills();
      handleSend(p.text);
    });
    container.appendChild(pill);
  });

  container.classList.remove("hidden");
}

function hideSuggestionPills() {
  const container = document.getElementById("suggestion-pills");
  if (container) {
    container.innerHTML = "";
    container.classList.add("hidden");
  }
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
    vid.addEventListener("loadeddata", () => { vid.currentTime = 0.1; });
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
  analysisComplete = true;

  await appendBotMessage("Got it! Let me ask you a few journalist questions about this.");
  startContextQuestions();
}

// ── Media Flow (Background Upload) ──────────
async function handleMediaSelected(file, type) {
  if ((state === STATE.TEST_WAITING_VIDEO || state === STATE.TEST_MULTI_UPLOAD) && type === "video") {
    handleMediaSelectedTestUser(file);
    return;
  }

  if (state !== STATE.IDLE) return;

  if (bulletinMode && type !== "video") {
    await appendBotMessage("For the daily bulletin, please share a video clip.");
    return;
  }

  currentMediaFile = file;
  currentMediaType = type;

  appendMediaPreview(file, type);

  if (bulletinMode) {
    analysisComplete = true;
    await appendBotMessage("Got it! Let me ask you a few quick questions for the bulletin.");
  } else {
    await appendBotMessage(`Got it! I'll analyze your ${type} while we chat.`);
    startBackgroundAnalysis(file, type);
  }

  startContextQuestions();
}

function startBackgroundAnalysis(file, type) {
  analysisComplete = false;

  const formData = new FormData();
  formData.append("media", file);
  formData.append("media_type", type);

  analysisPromise = fetch("/api/chat/analyze", {
    method: "POST",
    body: formData,
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.ok) {
        currentAnalysis = data.analysis;
        currentSessionId = data.session_id;
        followUpQuestions = data.follow_up_questions || [];
      } else {
        currentAnalysis = currentAnalysis || `[${type} uploaded — analysis unavailable]`;
        followUpQuestions = [];
      }
      analysisComplete = true;

      if (questionsComplete && !storyGenerationStarted) {
        generateStory();
      }
    })
    .catch(() => {
      currentAnalysis = currentAnalysis || `[${type} uploaded — analysis failed]`;
      followUpQuestions = [];
      analysisComplete = true;

      if (questionsComplete && !storyGenerationStarted) {
        generateStory();
      }
    });
}

// ── Context Questions ────────────────────────
function startContextQuestions() {
  state = STATE.ASKING_CONTEXT;
  contextAnswers = {};
  contextQuestionIndex = 0;
  updateToolbarState();
  askNextContextQuestion();
}

async function askNextContextQuestion() {
  if (contextQuestionIndex >= JOURNALIST_QUESTIONS.length) {
    // In bulletin mode, skip follow-ups — go straight to submission
    if (bulletinMode) {
      onQuestionsComplete();
      return;
    }
    // All base questions asked — check for follow-ups
    if (analysisComplete && followUpQuestions.length > 0) {
      followUpIndex = 0;
      state = STATE.ASKING_FOLLOWUP;
      updateToolbarState();
      await appendBotMessage("A couple more specific questions...");
      askNextFollowUp();
    } else {
      onQuestionsComplete();
    }
    return;
  }

  const q = JOURNALIST_QUESTIONS[contextQuestionIndex];
  await appendBotMessage(q.text);
  showSuggestionPills(q.key);
  updateToolbarState();
}

function handleContextAnswer(text) {
  hideSuggestionPills();
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
    onQuestionsComplete();
    return;
  }
  await appendBotMessage(followUpQuestions[followUpIndex]);
  updateToolbarState();
}

function handleFollowUpAnswer(text) {
  hideSuggestionPills();
  if (text.toLowerCase() !== "skip") {
    contextAnswers[`followup_${followUpIndex}`] = text;
  }
  followUpIndex++;
  askNextFollowUp();
}

// ── Questions Complete — Wait or Generate ────
async function onQuestionsComplete() {
  questionsComplete = true;
  hideSuggestionPills();
  state = STATE.GENERATING;
  updateToolbarState();

  if (bulletinMode) {
    contributeToBulletin();
    return;
  }

  if (analysisComplete) {
    generateStory();
  } else {
    await appendBotMessage("Just finishing up the analysis...");
    // The background promise will call generateStory() when it resolves
  }
}

// ── Story Generation ─────────────────────────
async function generateStory() {
  if (storyGenerationStarted) return;
  storyGenerationStarted = true;

  state = STATE.GENERATING;
  updateToolbarState();
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
      updateToolbarState();
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
    updateToolbarState();
    await appendBotMessage("Something went wrong generating the story. Please try again.");
  }
}

// ── Bulletin Contribution ─────────────────────
async function contributeToBulletin() {
  if (storyGenerationStarted) return;
  storyGenerationStarted = true;

  state = STATE.GENERATING;
  updateToolbarState();
  await appendBotMessage("Submitting your clip to today's bulletin...");
  const typing = showTypingIndicator();

  try {
    const formData = new FormData();
    formData.append("video", currentMediaFile);
    if (contextAnswers.who) formData.append("who", contextAnswers.who);
    if (contextAnswers.when) formData.append("when_answer", contextAnswers.when);
    if (contextAnswers.where) formData.append("where_answer", contextAnswers.where);
    if (contextAnswers.context) formData.append("context", contextAnswers.context);

    const response = await fetch("/api/bulletin/contribute", {
      method: "POST",
      body: formData,
    });

    typing.remove();
    const data = await response.json();

    if (!data.ok) {
      state = STATE.IDLE;
      updateToolbarState();
      await appendBotMessage(`Couldn't submit your clip: ${data.error}`);
      return;
    }

    if (isTestUser && testMultiMode) {
      testVideoCount++;
      testBulletinId = data.bulletin_id;
      await appendBotMessage(`Video ${testVideoCount} submitted! You can add more videos or generate your multi-story bulletin now.`);
      showMultiUploadChoiceButtons();
      return;
    }

    if (isTestUser) {
      await appendBotMessage("Your video has been submitted! Now let's generate your bulletin video.");
      showGenerateBulletinButton(data.bulletin_id);
      return;
    }

    await appendBotMessage(
      "Your video has been submitted to today's bulletin! " +
      "Check the Studio to watch when it's ready."
    );
    resetState();
  } catch (err) {
    typing.remove();
    state = STATE.IDLE;
    updateToolbarState();
    await appendBotMessage("Something went wrong submitting your clip. Please try again.");
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
  updateToolbarState();

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
    // TODO: notify selected members
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
  analysisPromise = null;
  analysisComplete = false;
  questionsComplete = false;
  storyGenerationStarted = false;
  testMultiMode = false;
  testBulletinId = null;
  testVideoCount = 0;
  hideSuggestionPills();
  updateToolbarState();
}

// ── Test User Flow ───────────────────────────
async function startTestUserFlow() {
  // Clear existing welcome messages
  const container = document.getElementById("chat-messages");
  if (container) container.innerHTML = "";

  state = STATE.TEST_ASKING_NAME;
  await appendBotMessage("Hi! Welcome to the Me News demo. What's your name?");
}

async function handleTestNameAnswer(text) {
  testUserName = text;
  state = STATE.TEST_WAITING_VIDEO;
  await appendBotMessage(`Nice to meet you, ${testUserName}! Please upload a short video clip using the video button below.`);
}

async function handleMediaSelectedTestUser(file) {
  currentMediaFile = file;
  currentMediaType = "video";
  appendMediaPreview(file, "video");

  analysisComplete = true;
  await appendBotMessage("Great clip! Let me ask you a few quick questions for the bulletin.");
  startContextQuestions();
}

function showGenerateBulletinButton(bulletinId) {
  const container = document.getElementById("chat-messages");
  if (!container) return;

  const wrapper = document.createElement("div");
  wrapper.className = "flex justify-center py-3";

  const btn = document.createElement("button");
  btn.className = "btn btn-primary btn-lg gap-2";
  btn.innerHTML = `<span>Generate Bulletin Video</span>`;
  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.innerHTML = `<span class="loading loading-spinner loading-sm"></span> Generating...`;
    generateTestBulletin(bulletinId);
  });

  wrapper.appendChild(btn);
  container.appendChild(wrapper);
  animateIn(wrapper);
  scrollToBottom();
}

async function generateTestBulletin(bulletinId) {
  state = STATE.TEST_GENERATING_BULLETIN;
  updateToolbarState();

  await appendBotMessage(
    "We'll mix your video with some test footage from my friends and family to show you what a typical bulletin looks like " +
    "when you add your friends to Me News. This will take a few minutes — for a real user this happens in the background " +
    "before the daily 8pm report, but since this is a test we're doing it live. Please don't close the tab!"
  );

  const typing = showTypingIndicator();
  // Show a spinner message while we wait for the server
  const bubble = typing.querySelector(".chat-bubble");
  if (bubble) {
    bubble.innerHTML = `<div class="flex items-center gap-2"><span class="loading loading-spinner loading-sm"></span><span class="text-sm">Generating your bulletin...</span></div>`;
  }

  try {
    const response = await fetch("/api/test/generate_bulletin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await response.json();

    if (!data.ok) {
      typing.remove();
      await appendBotMessage(`Something went wrong: ${data.error}`);
      resetState();
      return;
    }

    // Poll for render completion
    pollBulletinRender(data.bulletin_id, typing);
  } catch (err) {
    typing.remove();
    await appendBotMessage("Something went wrong generating the bulletin. Please try again.");
    resetState();
  }
}

async function pollBulletinRender(bulletinId, typing) {
  const maxAttempts = 120; // 2 minutes
  let attempts = 0;
  let lastStep = "";

  const poll = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(poll);
      typing.remove();
      await appendBotMessage("The bulletin is taking longer than expected. You can check the Studio page for updates.");
      resetState();
      return;
    }

    try {
      const response = await fetch(`/studio/bulletin_status/${bulletinId}`);
      const data = await response.json();

      // Update progress message
      if (data.render_step && data.render_step !== lastStep) {
        lastStep = data.render_step;
        const progress = data.render_progress || 0;
        // Update the typing indicator with progress
        const bubble = typing.querySelector(".chat-bubble");
        if (bubble) {
          bubble.innerHTML = `<div class="text-sm">${escapeHtml(data.render_step)} (${progress}%)</div><progress class="progress progress-primary w-full mt-1" value="${progress}" max="100"></progress>`;
        }
      }

      if (data.render_status === "done" && data.video_url) {
        clearInterval(poll);
        typing.remove();
        await showBulletinVideo(data.video_url);

        if (testMultiMode) {
          await appendBotMessage(
            `Here's your multi-story bulletin, ${testUserName || "friend"}! ` +
            "Thanks for trying out the full experience."
          );
          resetState();
        } else {
          await appendBotMessage(
            `There you go, ${testUserName || "friend"}! That was a single-story bulletin. ` +
            "Want to see what a multi-story report looks like? Upload a few more videos and we'll generate a full bulletin."
          );
          showMakeYourOwnReportButton();
        }
      } else if (data.render_status === "failed") {
        clearInterval(poll);
        typing.remove();
        await appendBotMessage(`Rendering failed: ${data.render_error || "Unknown error"}. Please try the Studio page.`);
        resetState();
      }
    } catch {
      // Silently retry on network errors
    }
  }, 2000);
}

async function showBulletinVideo(videoUrl) {
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

  const videoContainer = document.createElement("div");
  videoContainer.className = "chat-bubble imessage-received p-1";
  const video = document.createElement("video");
  video.className = "w-full rounded-lg";
  video.controls = true;
  video.playsInline = true;
  video.autoplay = true;
  video.style.maxHeight = "400px";

  if (videoUrl.includes(".m3u8")) {
    try {
      const { default: Hls } = await import("hls.js");
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(videoUrl);
        hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = videoUrl;
      }
    } catch {
      video.src = videoUrl;
    }
  } else {
    video.src = videoUrl;
  }

  videoContainer.appendChild(video);
  wrapper.appendChild(videoContainer);
  container.appendChild(wrapper);
  animateIn(wrapper);
  scrollToBottom();
}

// ── Multi-Video "Make Your Own Report" ───────
function showMakeYourOwnReportButton() {
  state = STATE.IDLE;
  updateToolbarState();

  const container = document.getElementById("chat-messages");
  if (!container) return;

  const wrapper = document.createElement("div");
  wrapper.className = "flex justify-center py-3";

  const btn = document.createElement("button");
  btn.className = "btn btn-primary btn-lg gap-2";
  btn.innerHTML = `<span>Make Your Own Report</span>`;
  btn.addEventListener("click", () => {
    btn.closest(".flex")?.remove();
    startMultiUploadMode();
  });

  wrapper.appendChild(btn);
  container.appendChild(wrapper);
  animateIn(wrapper);
  scrollToBottom();
}

async function startMultiUploadMode() {
  testMultiMode = true;
  testBulletinId = null;
  testVideoCount = 0;

  await appendBotMessage(
    "Let's make a multi-story bulletin! Upload your first video using the video button below. " +
    "You can add as many stories as you like, then generate the full report."
  );

  state = STATE.TEST_MULTI_UPLOAD;
  updateToolbarState();
}

function showMultiUploadChoiceButtons() {
  state = STATE.TEST_MULTI_CHOOSING;
  updateToolbarState();

  const container = document.getElementById("chat-messages");
  if (!container) return;

  const wrapper = document.createElement("div");
  wrapper.className = "flex justify-center gap-3 py-3";

  const addBtn = document.createElement("button");
  addBtn.className = "btn btn-outline btn-md gap-2";
  addBtn.innerHTML = `<span>Add Another Video</span>`;
  addBtn.addEventListener("click", () => {
    wrapper.remove();
    resetForNextVideo();
  });

  const makeBtn = document.createElement("button");
  makeBtn.className = "btn btn-primary btn-md gap-2";
  makeBtn.innerHTML = `<span>Make Video</span>`;
  makeBtn.addEventListener("click", () => {
    wrapper.remove();
    makeBtn.disabled = true;
    generateTestBulletin(testBulletinId);
  });

  wrapper.appendChild(addBtn);
  wrapper.appendChild(makeBtn);
  container.appendChild(wrapper);
  animateIn(wrapper);
  scrollToBottom();
}

function resetForNextVideo() {
  // Reset per-video state but keep multi-mode variables
  currentAnalysis = null;
  currentSessionId = null;
  currentMediaFile = null;
  currentMediaType = null;
  contextAnswers = {};
  contextQuestionIndex = 0;
  followUpQuestions = [];
  followUpIndex = 0;
  analysisPromise = null;
  analysisComplete = false;
  questionsComplete = false;
  storyGenerationStarted = false;

  state = STATE.TEST_MULTI_UPLOAD;
  updateToolbarState();

  appendBotMessage("Upload your next video using the video button below.");
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
