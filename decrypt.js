// Standalone decrypt tool. Self-contained: no GitHub auth, no admin state.
// Crypto helpers below are intentional duplicates of app.js (same project,
// no build step — keeping decrypt.html runnable on its own is the point).

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

async function decryptEnvelope(envelope, password) {
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const key = await deriveKey(password, salt, envelope.iterations);
  const plaintextBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return JSON.parse(new TextDecoder().decode(plaintextBuf));
}

function validEnvelope(env) {
  return env
    && env.version === 1
    && typeof env.salt === "string"
    && typeof env.iv === "string"
    && typeof env.ciphertext === "string"
    && typeof env.iterations === "number";
}

async function readEnvelope({ urlInput, fileInput, errorEl }) {
  const file = fileInput.files && fileInput.files[0];
  if (file) {
    const text = await file.text();
    return JSON.parse(text);
  }
  const url = urlInput.value.trim();
  if (!url) throw new Error("Paste a URL or choose a file.");
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Couldn't fetch the file (HTTP ${resp.status}).`);
  return await resp.json();
}

function init() {
  const form = document.getElementById("decrypt-form");
  const urlInput = document.getElementById("env-url");
  const fileInput = document.getElementById("env-file");
  const pwInput = document.getElementById("pw");
  const btn = document.getElementById("decrypt-btn");
  const errorEl = document.getElementById("decrypt-error");
  const result = document.getElementById("result");
  const jsonOut = document.getElementById("json-out");
  const downloadBtn = document.getElementById("download-btn");

  let lastPlaintext = null;
  let lastSourceName = null;

  form.addEventListener("submit", async e => {
    e.preventDefault();
    errorEl.textContent = "";
    result.hidden = true;
    jsonOut.textContent = "";
    lastPlaintext = null;

    let password = pwInput.value;
    if (!password) {
      errorEl.textContent = "Enter the family password.";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Decrypting…";

    let envelope;
    try {
      envelope = await readEnvelope({ urlInput, fileInput, errorEl });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Decrypt";
      errorEl.textContent = err.message || "Couldn't read the envelope.";
      return;
    }

    if (!validEnvelope(envelope)) {
      btn.disabled = false;
      btn.textContent = "Decrypt";
      errorEl.textContent = "That doesn't look like a valid encrypted family file.";
      return;
    }

    try {
      const plaintext = await decryptEnvelope(envelope, password);
      password = null;
      lastPlaintext = plaintext;
      const file = fileInput.files && fileInput.files[0];
      lastSourceName = file
        ? file.name.replace(/\.enc\.json$/i, "").replace(/\.json$/i, "")
        : (() => {
            const u = urlInput.value.trim();
            const tail = u.slice(u.lastIndexOf("/") + 1);
            return tail.replace(/\.enc\.json$/i, "").replace(/\.json$/i, "") || "family";
          })();
      jsonOut.textContent = JSON.stringify(plaintext, null, 2);
      result.hidden = false;
    } catch (err) {
      errorEl.textContent = "Incorrect password (or the file is corrupted).";
    } finally {
      btn.disabled = false;
      btn.textContent = "Decrypt";
    }
  });

  downloadBtn.addEventListener("click", () => {
    if (!lastPlaintext) return;
    const json = JSON.stringify(lastPlaintext, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${lastSourceName || "family"}-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
