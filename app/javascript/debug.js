// ──────────────────────────────────────────────
//  Debug Page
// ──────────────────────────────────────────────

console.log("[Debug] Module loaded");

function init() {
  console.log("[Debug] Initializing...");
  bindButtons();
  console.log("[Debug] Initialization complete");
}

// Handle both cases: DOM already loaded or still loading
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  // DOM already loaded, run immediately
  init();
}

// ── Button bindings ───────────────────────────
function bindButtons() {
  // Email
  const emailBtn = document.getElementById("btn-send-email");
  if (emailBtn) {
    emailBtn.addEventListener("click", sendTestEmail);
    console.log("[Debug] Email button bound");
  } else {
    console.error("[Debug] Email button not found!");
  }

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

// ── Email ─────────────────────────────────────
async function sendTestEmail() {
  console.log("[Debug] sendTestEmail called");
  const btn = document.getElementById("btn-send-email");
  const to = document.getElementById("email-to").value.trim();
  const subject = document.getElementById("email-subject").value.trim();
  console.log("[Debug] Email params:", { to, subject });

  if (!to) {
    showToast("Email Error", "Enter an email address.", "error");
    logTo("email-log", "ERROR: Enter an email address.");
    return;
  }

  // Show loading state
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Sending...';

  log("Sending test email to " + to + "...");
  logTo("email-log", "Sending to " + to + "...");

  try {
    const resp = await fetch("/api/email/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector("meta[name='csrf-token']")?.content || ""
      },
      body: JSON.stringify({ to, subject: subject || undefined })
    });

    const data = await resp.json();
    log("Email result: " + JSON.stringify(data));

    if (data.ok) {
      showToast("Email Sent", data.message || `Test email sent to ${to}`, "success");
      logTo("email-log", "✓ " + (data.message || "Email sent successfully."));
    } else {
      const errorMsg = data.error || "Unknown error";
      showToast("Email Failed", errorMsg, "error");
      logTo("email-log", "✗ Error: " + errorMsg);

      // Provide helpful hints based on error
      if (errorMsg.includes("API key") || errorMsg.includes("Resend")) {
        logTo("email-log", "→ Hint: Check that RESEND_API_KEY is set in your environment variables.");
      } else if (errorMsg.includes("Access denied")) {
        logTo("email-log", "→ Hint: Make sure you're logged in as the admin user.");
      } else if (errorMsg.includes("domain") || errorMsg.includes("verified")) {
        logTo("email-log", "→ Hint: Ensure your sending domain is verified in Resend dashboard.");
      }
    }
  } catch (err) {
    log("Email failed: " + err.message);
    showToast("Email Failed", err.message, "error");
    logTo("email-log", "✗ ERROR: " + err.message);
    logTo("email-log", "→ Hint: Check browser console and server logs for details.");
  } finally {
    // Reset button
    btn.disabled = false;
    btn.textContent = originalText;
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
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
