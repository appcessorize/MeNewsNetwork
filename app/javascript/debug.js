// ──────────────────────────────────────────────
//  Debug Page — Notifications & Web Push
// ──────────────────────────────────────────────

let swRegistration = null;
let pushSubscription = null;

document.addEventListener("DOMContentLoaded", () => {
  checkStatus();
  bindButtons();
});

// ── Status checks ─────────────────────────────
function checkStatus() {
  // Notification API
  const notifEl = document.getElementById("stat-notification");
  const notifDesc = document.getElementById("stat-notification-desc");
  if (!("Notification" in window)) {
    notifEl.textContent = "Not supported";
    notifEl.classList.add("text-error");
  } else {
    notifEl.textContent = Notification.permission;
    notifEl.classList.add(Notification.permission === "granted" ? "text-success" : "text-warning");
    notifDesc.textContent = Notification.permission === "granted" ? "Ready" : "Need permission";
  }

  // Service Worker
  const swEl = document.getElementById("stat-sw");
  const swDesc = document.getElementById("stat-sw-desc");
  if (!("serviceWorker" in navigator)) {
    swEl.textContent = "Not supported";
    swEl.classList.add("text-error");
  } else {
    navigator.serviceWorker.getRegistration("/service-worker.js").then((reg) => {
      if (reg) {
        swRegistration = reg;
        swEl.textContent = "Registered";
        swEl.classList.add("text-success");
        swDesc.textContent = "Scope: " + reg.scope;
        checkPushSubscription();
      } else {
        swEl.textContent = "Not registered";
        swEl.classList.add("text-warning");
      }
    });
  }
}

function checkPushSubscription() {
  const pushEl = document.getElementById("stat-push");
  const pushDesc = document.getElementById("stat-push-desc");

  if (!swRegistration) {
    pushEl.textContent = "No SW";
    pushEl.classList.add("text-warning");
    return;
  }

  swRegistration.pushManager.getSubscription().then((sub) => {
    pushSubscription = sub;
    if (sub) {
      pushEl.textContent = "Subscribed";
      pushEl.classList.add("text-success");
      pushDesc.textContent = "Endpoint registered";
    } else {
      pushEl.textContent = "Not subscribed";
      pushEl.classList.add("text-warning");
      pushDesc.textContent = "Click Subscribe to Push";
    }
  });
}

// ── Button bindings ───────────────────────────
function bindButtons() {
  // Local notification
  document.getElementById("btn-request-permission").addEventListener("click", requestPermission);
  document.getElementById("btn-local-notify").addEventListener("click", sendLocalNotification);

  // Service worker + push
  document.getElementById("btn-register-sw").addEventListener("click", registerServiceWorker);
  document.getElementById("btn-subscribe-push").addEventListener("click", subscribeToPush);
  document.getElementById("btn-unsubscribe-push").addEventListener("click", unsubscribePush);

  // Push triggers
  document.getElementById("btn-push-now").addEventListener("click", sendPushNow);
  document.getElementById("btn-push-schedule").addEventListener("click", schedulePush);

  // Email
  document.getElementById("btn-send-email").addEventListener("click", sendTestEmail);

  // Log
  document.getElementById("btn-clear-log").addEventListener("click", () => {
    document.getElementById("event-log").textContent = "";
  });
}

// ── Apple-style Toast Notification ───────────
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

  // Auto-dismiss after 5s
  setTimeout(() => {
    toast.classList.remove("opacity-100", "translate-y-0", "scale-100");
    toast.classList.add("opacity-0", "translate-y-[-8px]", "scale-95");
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// ── Local Notification ────────────────────────
async function requestPermission() {
  log("Requesting notification permission...");
  const result = await Notification.requestPermission();
  log("Permission: " + result);
  logTo("local-log", "Permission: " + result);
  checkStatus();
}

function sendLocalNotification() {
  const title = document.getElementById("local-title").value || "Newsroom";
  const body = document.getElementById("local-body").value || "Test notification";

  // Always show the DaisyUI toast in the UI
  showToast(title, body, "info");
  log("Toast shown in UI: " + title);
  logTo("local-log", "Toast shown: " + title + " — " + body);

  // Also try the native browser Notification API
  if (Notification.permission === "granted") {
    const notification = new Notification(title, {
      body: body,
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📺</text></svg>",
      tag: "local-debug-" + Date.now()
    });

    notification.onclick = () => {
      window.focus();
      window.location.href = "/studio";
      notification.close();
    };

    log("Native notification also sent");
    logTo("local-log", "Native browser notification sent");
  } else {
    logTo("local-log", "Native notification skipped (permission: " + Notification.permission + "). Click 'Request Permission' to enable.");
  }
}

// ── Service Worker ────────────────────────────
async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    logTo("push-sub-log", "ERROR: Service workers not supported.");
    return;
  }

  try {
    log("Registering service worker...");
    swRegistration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    log("Service worker registered. Scope: " + swRegistration.scope);
    logTo("push-sub-log", "Registered. Scope: " + swRegistration.scope);
    checkStatus();
  } catch (err) {
    log("SW registration failed: " + err.message);
    logTo("push-sub-log", "ERROR: " + err.message);
  }
}

// ── Push Subscription ─────────────────────────
async function subscribeToPush() {
  if (!swRegistration) {
    logTo("push-sub-log", "ERROR: Register the service worker first.");
    return;
  }

  if (Notification.permission !== "granted") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      logTo("push-sub-log", "ERROR: Notification permission denied.");
      return;
    }
  }

  try {
    const vapidPublic = document.querySelector("[data-vapid-public]")?.dataset?.vapidPublic || "";

    if (!vapidPublic) {
      logTo("push-sub-log", "ERROR: VAPID public key is empty. Restart the server after setting VAPID keys in .env");
      log("VAPID key is empty — server needs restart");
      return;
    }

    log("VAPID key length: " + vapidPublic.length + " chars");
    const applicationServerKey = urlBase64ToUint8Array(vapidPublic);
    log("Decoded key: " + applicationServerKey.length + " bytes (expect 65)");

    if (applicationServerKey.length !== 65) {
      logTo("push-sub-log", "ERROR: VAPID key decoded to " + applicationServerKey.length + " bytes, expected 65.");
      return;
    }

    log("Subscribing to push...");
    pushSubscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey
    });

    log("Push subscription created.");
    logTo("push-sub-log", "Subscribed. Sending to server...");

    // Send subscription to server
    const keys = pushSubscription.toJSON().keys;
    const resp = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector("meta[name='csrf-token']").content
      },
      body: JSON.stringify({
        endpoint: pushSubscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth
      })
    });

    const data = await resp.json();
    log("Server response: " + JSON.stringify(data));
    logTo("push-sub-log", data.ok ? "Subscription saved on server." : "Error: " + data.error);
    checkStatus();
  } catch (err) {
    log("Push subscribe failed: " + err.message);
    logTo("push-sub-log", "ERROR: " + err.message);
  }
}

async function unsubscribePush() {
  if (!pushSubscription) {
    logTo("push-sub-log", "Not currently subscribed.");
    return;
  }

  try {
    await pushSubscription.unsubscribe();
    pushSubscription = null;
    log("Unsubscribed from push.");
    logTo("push-sub-log", "Unsubscribed.");
    checkStatus();
  } catch (err) {
    log("Unsubscribe failed: " + err.message);
    logTo("push-sub-log", "ERROR: " + err.message);
  }
}

// ── Push Triggers ─────────────────────────────
async function sendPushNow() {
  const title = document.getElementById("push-title").value || "Studio Alert";
  const body = document.getElementById("push-body").value || "Test push";

  log("Sending push via server...");
  logTo("push-trigger-log", "Sending...");

  try {
    const resp = await fetch("/api/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector("meta[name='csrf-token']").content
      },
      body: JSON.stringify({ title, body })
    });

    const data = await resp.json();
    log("Push send result: " + JSON.stringify(data));
    logTo("push-trigger-log", data.ok ? "Push sent! Check your notifications." : "Error: " + JSON.stringify(data));
  } catch (err) {
    log("Push send failed: " + err.message);
    logTo("push-trigger-log", "ERROR: " + err.message);
  }
}

async function schedulePush() {
  const title = document.getElementById("push-title").value || "Scheduled Alert";
  const body = document.getElementById("push-body").value || "Scheduled push";

  log("Scheduling push for 60 seconds...");
  logTo("push-trigger-log", "Scheduling for 1 minute...");

  try {
    const resp = await fetch("/api/push/schedule", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector("meta[name='csrf-token']").content
      },
      body: JSON.stringify({ title, body, delay: 60 })
    });

    const data = await resp.json();
    log("Schedule result: " + JSON.stringify(data));
    logTo("push-trigger-log", data.ok ? "Scheduled! Push arrives in ~60s." : "Error: " + JSON.stringify(data));

    if (data.ok) startCountdown();
  } catch (err) {
    log("Schedule failed: " + err.message);
    logTo("push-trigger-log", "ERROR: " + err.message);
  }
}

function startCountdown() {
  const container = document.getElementById("schedule-countdown");
  const progress = document.getElementById("schedule-progress");
  const timer = document.getElementById("schedule-timer");
  container.classList.remove("hidden");

  let remaining = 60;
  const interval = setInterval(() => {
    remaining--;
    progress.value = 60 - remaining;
    timer.textContent = remaining + "s";

    if (remaining <= 0) {
      clearInterval(interval);
      timer.textContent = "Sent!";
      setTimeout(() => container.classList.add("hidden"), 3000);
    }
  }, 1000);
}

// ── Email ─────────────────────────────────────
async function sendTestEmail() {
  const to = document.getElementById("email-to").value.trim();
  const subject = document.getElementById("email-subject").value.trim();

  if (!to) {
    logTo("email-log", "ERROR: Enter an email address.");
    return;
  }

  log("Sending test email to " + to + "...");
  logTo("email-log", "Sending to " + to + "...");

  try {
    const resp = await fetch("/api/email/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector("meta[name='csrf-token']").content
      },
      body: JSON.stringify({ to, subject: subject || undefined })
    });

    const data = await resp.json();
    log("Email result: " + JSON.stringify(data));
    logTo("email-log", data.ok ? data.message : "Error: " + (data.error || "Unknown error"));
  } catch (err) {
    log("Email failed: " + err.message);
    logTo("email-log", "ERROR: " + err.message);
  }
}

// ── Logging ───────────────────────────────────
function log(message) {
  const el = document.getElementById("event-log");
  const time = new Date().toLocaleTimeString();
  el.textContent += `[${time}] ${message}\n`;
  el.scrollTop = el.scrollHeight;
}

function logTo(containerId, message) {
  const container = document.getElementById(containerId);
  container.classList.remove("hidden");
  const pre = container.querySelector("pre");
  const time = new Date().toLocaleTimeString();
  pre.textContent += `[${time}] ${message}\n`;
  pre.scrollTop = pre.scrollHeight;
}

// ── Utils ─────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
