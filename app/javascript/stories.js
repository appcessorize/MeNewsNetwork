// ──────────────────────────────────────────────
//  Stories Page — Chat Interface & Broadcast Timer
// ──────────────────────────────────────────────

const MOCK_CONVERSATION = [
  {
    from: "user",
    name: "You",
    text: "Can you summarise today's top stories for me?",
    time: "2 min ago"
  },
  {
    from: "ai",
    name: "AI Journalist",
    text: "Of course! Today we have 3 developing stories. The main headline covers the city council's new green energy initiative — a \u00a3200M investment plan. There's also breaking coverage of the tech summit keynote, and a community piece about the new riverside park opening this weekend.",
    time: "2 min ago"
  },
  {
    from: "user",
    name: "You",
    text: "What's the sentiment around the green energy initiative?",
    time: "1 min ago"
  },
  {
    from: "ai",
    name: "AI Journalist",
    text: "Based on my analysis of the uploaded footage and related sources, sentiment is largely positive. 73% of social mentions are favourable, with residents welcoming the solar panel subsidies. The main concern raised is the timeline — some councillors want faster implementation. I'd recommend leading tonight's broadcast with this story given the engagement levels.",
    time: "1 min ago"
  },
  {
    from: "user",
    name: "You",
    text: "Great, let's lead with that. Can you draft an intro script?",
    time: "just now"
  },
  {
    from: "ai",
    name: "AI Journalist",
    text: "Here's a draft intro:\n\n\"Good evening. Tonight, a landmark decision from city hall as councillors green-light a two hundred million pound investment in renewable energy. We have full coverage of what this means for residents, plus reaction from the community. Also ahead — highlights from the Global Tech Summit, and why your weekend plans might include a brand new park. Stay with us.\"",
    time: "just now"
  }
];

const AI_RESPONSES = [
  "That's an interesting angle. Let me cross-reference that with the footage we have. Based on the video analysis, I can confirm there are 3 key moments that support this narrative. Shall I timestamp them for the broadcast?",
  "I've analysed the audio from that clip and detected elevated crowd noise at the 2:15 mark — likely the moment the announcement was made. This could make for a compelling soundbite in tonight's segment.",
  "Looking at the data, viewer engagement tends to peak with stories that have a human interest angle. I'd suggest we pair the hard news with the community reaction footage for maximum impact.",
  "I can generate a teleprompter-ready script for that segment. Would you like it in a formal news anchor style, or something more conversational for the evening broadcast?",
  "Based on today's uploaded content, I've identified 5 distinct story threads. The strongest narrative arc connects the infrastructure investment to last month's community survey results.",
  "Good question. Let me pull up the sentiment analysis... The social media response is running 4:1 positive. Most negative feedback centres on implementation timeline rather than the initiative itself."
];

// Read user info from the chat container's data attributes
let USER_AVATAR = "";
let USER_NAME = "You";

document.addEventListener("DOMContentLoaded", () => {
  const chatEl = document.getElementById("chat-messages");
  if (chatEl) {
    USER_AVATAR = chatEl.dataset.userAvatar || "";
    USER_NAME = chatEl.dataset.userName || "You";
  }
  initBroadcastCountdown();
  renderMockMessages();
  initChatInput();
});

// ── Broadcast Countdown ──────────────────────
function initBroadcastCountdown() {
  const el = document.getElementById("broadcast-countdown");
  if (!el) return;

  function update() {
    const now = new Date();
    const broadcast = new Date();
    broadcast.setHours(19, 0, 0, 0);

    // If past 7 PM, show next day
    if (now > broadcast) {
      broadcast.setDate(broadcast.getDate() + 1);
    }

    const diff = broadcast - now;
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);

    el.textContent =
      String(hours).padStart(2, "0") + ":" +
      String(mins).padStart(2, "0") + ":" +
      String(secs).padStart(2, "0");
  }

  update();
  setInterval(update, 1000);
}

// ── Mock Messages (animated) ─────────────────
function renderMockMessages() {
  const container = document.getElementById("mock-messages");
  if (!container) return;

  MOCK_CONVERSATION.forEach((msg, i) => {
    setTimeout(() => {
      const bubble = createChatBubble(msg);
      bubble.style.opacity = "0";
      bubble.style.transform = "translateY(12px)";
      container.appendChild(bubble);

      // Animate in
      requestAnimationFrame(() => {
        bubble.style.transition = "opacity 0.3s ease, transform 0.3s ease";
        bubble.style.opacity = "1";
        bubble.style.transform = "translateY(0)";
      });

      // Scroll to bottom
      const chatBox = document.getElementById("chat-messages");
      if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
    }, (i + 1) * 800);
  });
}

function createChatBubble({ from, name, text, time }) {
  const isAI = from === "ai";
  const wrapper = document.createElement("div");
  wrapper.className = `chat ${isAI ? "chat-start" : "chat-end"}`;

  // Build avatar HTML — use Gmail photo for user, robot emoji for AI
  let avatarInner;
  if (isAI) {
    avatarInner = `<div class="bg-neutral text-neutral-content w-10 rounded-full flex items-center justify-center">
        <span class="text-2xl leading-none">\u{1F916}</span>
      </div>`;
  } else if (USER_AVATAR) {
    avatarInner = `<div class="w-10 rounded-full">
        <img src="${escapeAttr(USER_AVATAR)}" alt="" referrerpolicy="no-referrer" />
      </div>`;
  } else {
    avatarInner = `<div class="bg-base-300 text-base-content w-10 rounded-full flex items-center justify-center">
        <span class="text-sm font-bold">${escapeHtml(USER_NAME.charAt(0).toUpperCase())}</span>
      </div>`;
  }

  const displayName = isAI ? "AI Journalist" : USER_NAME;

  wrapper.innerHTML = `
    <div class="chat-image avatar ${isAI ? "placeholder" : ""}">
      ${avatarInner}
    </div>
    <div class="chat-header text-xs text-base-content/50 mb-1">
      ${escapeHtml(displayName)}
      <time class="text-xs opacity-50">${escapeHtml(time)}</time>
    </div>
    <div class="chat-bubble ${isAI ? "imessage-received" : "imessage-sent"}" style="white-space: pre-wrap;">${escapeHtml(text)}</div>
  `;

  return wrapper;
}

// ── Live Chat Input ──────────────────────────
function initChatInput() {
  const input = document.getElementById("chat-input");
  const btn = document.getElementById("btn-chat-send");
  if (!input || !btn) return;

  function send() {
    const text = input.value.trim();
    if (!text) return;

    // Add user message
    appendMessage({ from: "user", name: "You", text, time: "just now" });
    input.value = "";

    // Show typing indicator
    const typingEl = showTypingIndicator();

    // Simulate AI response after delay
    const delay = 1200 + Math.random() * 1500;
    setTimeout(() => {
      typingEl.remove();
      const response = AI_RESPONSES[Math.floor(Math.random() * AI_RESPONSES.length)];
      appendMessage({ from: "ai", name: "AI Journalist", text: response, time: "just now" });
    }, delay);
  }

  btn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
}

function appendMessage(msg) {
  const container = document.getElementById("mock-messages") || document.getElementById("chat-messages");
  if (!container) return;

  const bubble = createChatBubble(msg);
  bubble.style.opacity = "0";
  bubble.style.transform = "translateY(12px)";
  container.appendChild(bubble);

  requestAnimationFrame(() => {
    bubble.style.transition = "opacity 0.3s ease, transform 0.3s ease";
    bubble.style.opacity = "1";
    bubble.style.transform = "translateY(0)";
  });

  const chatBox = document.getElementById("chat-messages");
  if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
}

function showTypingIndicator() {
  const container = document.getElementById("mock-messages") || document.getElementById("chat-messages");
  const el = document.createElement("div");
  el.className = "chat chat-start";
  el.innerHTML = `
    <div class="chat-image avatar placeholder">
      <div class="bg-neutral text-neutral-content w-10 rounded-full flex items-center justify-center">
        <span class="text-2xl leading-none">\u{1F916}</span>
      </div>
    </div>
    <div class="chat-bubble chat-bubble-neutral">
      <span class="loading loading-dots loading-sm"></span>
    </div>
  `;
  container.appendChild(el);

  const chatBox = document.getElementById("chat-messages");
  if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;

  return el;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
