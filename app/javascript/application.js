// ── Lazy Loader Setup ───────────────────────────────────────────────────────
import "lazy_loader";

// ── Service Worker Registration ─────────────────────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
      .then((reg) => {
        console.log("[SW] Registered:", reg.scope);
      })
      .catch((err) => {
        console.log("[SW] Registration failed:", err);
      });
  });
}

// ── Google Login (Home page) ──────────────────────────────────────────────────
const btnGoogleLogin = document.getElementById("btn-google-login");
if (btnGoogleLogin) {
  btnGoogleLogin.addEventListener("click", () => {
    window.location.href = "/auth/google";
  });
}

// ── Logout (Settings page) ───────────────────────────────────────────────────
const btnLogout = document.getElementById("btn-logout");
if (btnLogout) {
  btnLogout.addEventListener("click", async () => {
    const token = document.querySelector('meta[name="csrf-token"]')?.content;
    await fetch("/auth/logout", {
      method: "DELETE",
      headers: {
        "X-CSRF-Token": token,
        "Accept": "text/html"
      },
      redirect: "manual"
    });
    window.location.href = "/";
  });
}
