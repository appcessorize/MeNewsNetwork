// ── Generate Invite Link ─────────────────────────────────────────────────────
const btnGenerateInvite = document.getElementById("btn-generate-invite");
const inviteUrlInput = document.getElementById("invite-url-input");
const inviteActions = document.getElementById("invite-actions");
const inviteExpires = document.getElementById("invite-expires");

if (btnGenerateInvite) {
  btnGenerateInvite.addEventListener("click", async () => {
    btnGenerateInvite.disabled = true;
    btnGenerateInvite.textContent = "Generating...";

    try {
      const token = document.querySelector('meta[name="csrf-token"]')?.content;
      const response = await fetch("/friends/create_invite", {
        method: "POST",
        headers: {
          "X-CSRF-Token": token,
          "Accept": "application/json",
          "Content-Type": "application/json"
        }
      });

      const data = await response.json();

      if (response.ok) {
        inviteUrlInput.value = data.invite_url;
        inviteActions.hidden = false;

        const expiresDate = new Date(data.expires_at);
        inviteExpires.textContent = `Expires ${expiresDate.toLocaleDateString()}`;
      } else {
        alert(data.error || "Failed to generate invite");
      }
    } catch (err) {
      console.error("Generate invite error:", err);
      alert("Failed to generate invite link");
    } finally {
      btnGenerateInvite.disabled = false;
      btnGenerateInvite.textContent = "Generate Link";
    }
  });
}

// ── Copy Invite Link ─────────────────────────────────────────────────────────
const btnCopyInvite = document.getElementById("btn-copy-invite");

if (btnCopyInvite) {
  btnCopyInvite.addEventListener("click", async () => {
    const url = inviteUrlInput.value;
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      btnCopyInvite.textContent = "Copied!";
      setTimeout(() => {
        btnCopyInvite.textContent = "Copy Link";
      }, 2000);
    } catch (err) {
      console.error("Copy failed:", err);
      inviteUrlInput.select();
      alert("Press Ctrl/Cmd+C to copy");
    }
  });
}

// ── Share Invite Link ────────────────────────────────────────────────────────
const btnShareInvite = document.getElementById("btn-share-invite");

if (btnShareInvite) {
  btnShareInvite.addEventListener("click", async () => {
    const url = inviteUrlInput.value;
    if (!url) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join my group on Video Newsroom",
          text: "Click to join my group!",
          url: url
        });
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Share failed:", err);
        }
      }
    } else {
      btnCopyInvite.click();
    }
  });
}

// ── Join Group (Onboarding) ──────────────────────────────────────────────────
const btnJoinGroup = document.getElementById("btn-join-group");
const inviteCodeInput = document.getElementById("invite-code-input");

if (btnJoinGroup && inviteCodeInput) {
  btnJoinGroup.addEventListener("click", () => {
    let input = inviteCodeInput.value.trim();
    if (!input) {
      alert("Please enter an invite link or code");
      return;
    }

    // Extract token from URL if full URL pasted
    // Handles: https://domain.com/join/TOKEN or just TOKEN
    const urlMatch = input.match(/\/join\/([a-zA-Z0-9_-]+)/);
    const token = urlMatch ? urlMatch[1] : input;

    // Navigate to join page
    window.location.href = `/join/${encodeURIComponent(token)}`;
  });

  // Allow Enter key
  inviteCodeInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      btnJoinGroup.click();
    }
  });
}
