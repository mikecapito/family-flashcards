// ===========================================================================
// Family Flashcards — Admin Tool
// ===========================================================================
// Single-page app that lets one family administrator edit the encrypted
// data file and commit changes back to the repo via the GitHub Trees API.
// All crypto and image processing is client-side; only the GitHub PAT
// touches localStorage (the family password is held in memory only).
// ===========================================================================

// ---------- State ----------

const adminState = {
  // Data source
  encUrl: null,
  photosBase: null,
  familySlug: null,
  dataParam: null,

  // GitHub repo to commit to
  owner: null,
  repo: null,
  defaultBranch: null,

  // Auth
  pat: null,
  password: null,         // in-memory only, discarded after publish
  envelope: null,         // original envelope, kept for iterations field

  // Decrypted payload
  familyName: null,
  ancestor: null,           // legacy field, preserved on edit but no longer used
  groupPhoto: null,         // welcome image shown on the home screen
  groupPhotoLocalUrl: null, // object URL for the locally selected blob (if pending)
  people: [],

  // Drafts and pending changes
  draft: null,            // current person being edited
  pendingPhotos: new Map(), // path → Blob
  changes: [],            // [{type:'add'|'edit'|'delete', name}]
  pickerContext: null,    // { relType }

  // Create-new-family state
  isNewFamily: false,     // true between Create-family and first successful publish
};

const REL_TYPES = ["grandparents", "parents", "siblings", "spouses", "children"];
const REL_LABELS = {
  grandparents: "Grandparents",
  parents: "Parents",
  siblings: "Siblings",
  spouses: "Spouses",
  children: "Children"
};

const PAT_STORAGE_KEY = "family-flashcards.admin.pat";
const REPO_STORAGE_KEY_PREFIX = "family-flashcards.admin.repo.";

// ---------- DOM helpers ----------

function $(id) { return document.getElementById(id); }

function el(tag, props, ...children) {
  const e = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") {
        e.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === "attrs") {
        for (const [ak, av] of Object.entries(v)) e.setAttribute(ak, av);
      } else if (k in e) {
        e[k] = v;
      } else {
        e.setAttribute(k, v);
      }
    }
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function formatBuildTime() {
  const d = new Date(document.lastModified);
  if (isNaN(d.getTime())) return "unknown";
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function forceCacheBustReload() {
  const go = () => {
    const url = new URL(location.href);
    url.searchParams.set("cb", Date.now().toString(36));
    location.replace(url.toString());
  };
  if (window.caches && caches.keys) {
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .catch(() => {})
      .then(go);
  } else {
    go();
  }
}

function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const target = $(`${name}-screen`);
  if (target) target.classList.add("active");
}

function showOverlay(text) {
  $("overlay-text").textContent = text || "Working…";
  $("overlay").classList.add("active");
}

function hideOverlay() {
  $("overlay").classList.remove("active");
}

let toastTimer = null;
function toast(message, kind) {
  const t = $("toast");
  t.textContent = message;
  t.className = "toast active" + (kind ? " toast--" + kind : "");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.className = "toast";
  }, kind === "error" ? 4500 : 2500);
}

// ---------- Crypto ----------

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password, salt, iterations, usages) {
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
    usages
  );
}

async function decryptEnvelope(envelope, password) {
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const key = await deriveKey(password, salt, envelope.iterations, ["decrypt"]);
  const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(buf));
}

async function encryptPayload(payload, password) {
  // Always use fresh salt+IV. Match the parameters expected by the main app.
  const iterations = 600000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations, ["encrypt"]);
  const buf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload))
  );
  return {
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(buf))
  };
}

// ---------- Photo handling ----------

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read this photo — try JPEG or PNG."));
    };
    img.src = url;
  });
}

async function standardizeImage(file, targetW, targetH) {
  const img = await loadImageFromFile(file);
  if (!img.naturalWidth || !img.naturalHeight) {
    throw new Error("Couldn't read this photo — try JPEG or PNG.");
  }
  const targetAspect = targetW / targetH;
  const srcAspect = img.naturalWidth / img.naturalHeight;
  let sx, sy, sw, sh;
  if (srcAspect > targetAspect) {
    sh = img.naturalHeight;
    sw = sh * targetAspect;
    sx = (img.naturalWidth - sw) / 2;
    sy = 0;
  } else {
    sw = img.naturalWidth;
    sh = sw / targetAspect;
    sx = 0;
    sy = (img.naturalHeight - sh) / 2;
  }
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      b => b ? resolve(b) : reject(new Error("Couldn't encode photo as JPEG.")),
      "image/jpeg",
      0.85
    );
  });
}

async function standardizePhoto(file) {
  // 600x600 square crop for person portraits.
  return standardizeImage(file, 600, 600);
}

async function standardizeGroupPhoto(file) {
  // 3:2 landscape for group/welcome photos.
  return standardizeImage(file, 1200, 800);
}

function randomPhotoFilename() {
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("") + ".jpg";
}

function newPhotoPath(filename) {
  // photos/<family>/<hex>.jpg if we have a family slug; otherwise photos/<hex>.jpg
  return adminState.familySlug
    ? `photos/${adminState.familySlug}/${filename}`
    : `photos/${filename}`;
}

async function blobToBase64(blob) {
  const buf = await blob.arrayBuffer();
  return bytesToBase64(new Uint8Array(buf));
}

// ---------- Data source resolution ----------

function resolveDataSource(dataParam) {
  if (!dataParam) return null;
  if (/^https?:\/\//i.test(dataParam)) {
    if (dataParam.endsWith("/")) {
      return { encUrl: dataParam + "data.enc.json", photosBase: dataParam, slug: null };
    }
    const lastSlash = dataParam.lastIndexOf("/");
    if (lastSlash < dataParam.indexOf("://") + 3) return null;
    const photosBase = dataParam.slice(0, lastSlash + 1);
    const slug = dataParam.slice(lastSlash + 1);
    if (!/^[\w.-]+$/.test(slug)) return null;
    return { encUrl: photosBase + slug + ".enc.json", photosBase, slug };
  }
  const parts = dataParam.split("/").filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every(p => /^[\w.-]+$/.test(p))) return null;
  const photosBase = `https://${parts[0]}.github.io/${parts[1]}/`;
  if (parts.length === 2) {
    return { encUrl: photosBase + "data.enc.json", photosBase, slug: null, ghOwner: parts[0], ghRepo: parts[1] };
  }
  return {
    encUrl: photosBase + parts[2] + ".enc.json",
    photosBase,
    slug: parts[2],
    ghOwner: parts[0],
    ghRepo: parts[1]
  };
}

function inferRepoFromLocation() {
  const host = window.location.hostname;
  const segments = window.location.pathname.split("/").filter(Boolean).filter(s => !s.endsWith(".html"));
  if (/\.github\.io$/i.test(host)) {
    const owner = host.replace(/\.github\.io$/i, "");
    const repo = segments[0] || null;
    return repo ? { owner, repo } : null;
  }
  return null;
}

function repoStorageKey(dataParam) {
  return REPO_STORAGE_KEY_PREFIX + (dataParam || "default");
}

function loadStoredRepo() {
  try {
    return localStorage.getItem(repoStorageKey(adminState.dataParam));
  } catch (e) {
    return null;
  }
}

function saveStoredRepo(value) {
  try {
    localStorage.setItem(repoStorageKey(adminState.dataParam), value);
  } catch (e) { /* ignore */ }
}

// ---------- GitHub API ----------

async function ghFetch(path, init = {}) {
  const url = "https://api.github.com" + path;
  const headers = Object.assign({
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  }, init.headers || {});
  if (adminState.pat) headers.Authorization = "Bearer " + adminState.pat;
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const resp = await fetch(url, Object.assign({}, init, { headers }));
  if (!resp.ok) {
    let detail = "";
    try {
      const data = await resp.json();
      detail = data && data.message ? data.message : "";
    } catch (e) { /* ignore */ }
    const err = new Error(`GitHub ${resp.status}: ${detail || resp.statusText}`);
    err.status = resp.status;
    throw err;
  }
  if (resp.status === 204) return null;
  return resp.json();
}

async function validatePat(owner, repo) {
  // GET /repos/{owner}/{repo} — confirms the PAT can read the repo.
  // For write access we rely on the actual commit attempt to fail cleanly
  // if the token is read-only; we don't probe destructively here.
  return ghFetch(`/repos/${owner}/${repo}`);
}

// ---------- Person helpers ----------

function getPersonById(id) {
  return adminState.people.find(p => p.id === id);
}

function emptyFamily() {
  return {
    grandparents: [], grandparentsRaw: [],
    parents: [], parentsRaw: [],
    siblings: [], siblingsRaw: [],
    spouses: [], spousesRaw: [],
    children: [], childrenRaw: []
  };
}

function blankPerson() {
  return {
    id: null,
    name: "",
    photo: "",
    birthday: "",
    funFact: "",
    syncedAt: null,
    family: emptyFamily(),
    _isNew: true,
    _newPhotoBlob: null,
    _newPhotoPath: null
  };
}

function clonePerson(person) {
  return {
    id: person.id,
    name: person.name || "",
    photo: person.photo || "",
    birthday: person.birthday || "",
    funFact: person.funFact || "",
    syncedAt: person.syncedAt || null,
    family: {
      grandparents: [...(person.family?.grandparents || [])],
      grandparentsRaw: [...(person.family?.grandparentsRaw || [])],
      parents: [...(person.family?.parents || [])],
      parentsRaw: [...(person.family?.parentsRaw || [])],
      siblings: [...(person.family?.siblings || [])],
      siblingsRaw: [...(person.family?.siblingsRaw || [])],
      spouses: [...(person.family?.spouses || [])],
      spousesRaw: [...(person.family?.spousesRaw || [])],
      children: [...(person.family?.children || [])],
      childrenRaw: [...(person.family?.childrenRaw || [])]
    },
    _isNew: false,
    _newPhotoBlob: null,
    _newPhotoPath: null
  };
}

function slugify(name) {
  return name.trim().toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-") || "person";
}

function generatePersonId(name) {
  let base = slugify(name);
  let id = base;
  let n = 2;
  while (adminState.people.some(p => p.id === id)) {
    id = `${base}-${n++}`;
  }
  return id;
}

function photoUrl(relativePath) {
  if (!relativePath) return "";
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  if (!adminState.photosBase) return relativePath;
  return adminState.photosBase + relativePath.replace(/^\/+/, "");
}

function familyNameFromSlug(slug) {
  if (!slug) return "Family";
  return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase()) + " Family";
}

function recordChange(type, name) {
  adminState.changes.push({ type, name });
}

function hasUnsavedChanges() {
  return adminState.changes.length > 0 || adminState.isNewFamily;
}

// ---------- Login screen ----------

function renderLogin() {
  const screen = $("login-screen");
  clear(screen);

  const card = el("div", { class: "login-card" });

  card.appendChild(el("h1", { text: "Admin" }));

  const family = adminState.familySlug
    ? familyNameFromSlug(adminState.familySlug)
    : "Family Flashcards";
  card.appendChild(el("p", { class: "login-sub", text: family }));

  if (!adminState.dataParam) {
    card.appendChild(el("p", { class: "error-text",
      text: "No ?data= parameter in the URL. Open this page with a link like /admin.html?data=owner/repo/family." }));
    screen.appendChild(card);
    return;
  }

  // Family password
  const pwField = el("div", { class: "field" });
  pwField.appendChild(el("label", { text: "Family password", attrs: { for: "pw" } }));
  const pwInput = el("input", { type: "password", id: "pw", autocomplete: "current-password" });
  pwField.appendChild(pwInput);
  card.appendChild(pwField);

  // Repo prefill priority: stored value → data-param repo → location-inferred
  const stored = loadStoredRepo();
  const source = resolveDataSource(adminState.dataParam);
  const fromData = source && source.ghOwner && source.ghRepo
    ? `${source.ghOwner}/${source.ghRepo}` : null;
  const inferred = inferRepoFromLocation();
  const fromInferred = inferred ? `${inferred.owner}/${inferred.repo}` : null;
  const repoField = el("div", { class: "field" });
  repoField.appendChild(el("label", { text: "GitHub repo (owner/repo)", attrs: { for: "repo" } }));
  const repoInput = el("input", {
    type: "text",
    id: "repo",
    autocomplete: "off",
    spellcheck: "false",
    value: stored || fromData || fromInferred || ""
  });
  repoField.appendChild(repoInput);
  repoField.appendChild(el("p", { class: "field-hint",
    text: "The repo where the .enc.json and photos live (this is where edits get committed)." }));
  card.appendChild(repoField);

  // PAT
  const storedPat = (() => {
    try { return localStorage.getItem(PAT_STORAGE_KEY) || ""; } catch (e) { return ""; }
  })();
  const patField = el("div", { class: "field" });
  patField.appendChild(el("label", { text: "GitHub personal access token", attrs: { for: "pat" } }));
  const patInput = el("input", {
    type: "password",
    id: "pat",
    autocomplete: "off",
    value: storedPat
  });
  patField.appendChild(patInput);
  const tokenRow = el("div", { class: "token-row" });
  if (storedPat) {
    tokenRow.appendChild(el("span", { class: "muted", text: "Saved on this device" }));
    tokenRow.appendChild(el("button", {
      type: "button",
      class: "btn-link",
      text: "Forget token",
      onclick: () => {
        try { localStorage.removeItem(PAT_STORAGE_KEY); } catch (e) { /* ignore */ }
        patInput.value = "";
        renderLogin();
      }
    }));
  } else {
    tokenRow.appendChild(el("span", { class: "muted",
      text: "Fine-grained PAT scoped to this repo with Contents: read/write." }));
  }
  patField.appendChild(tokenRow);
  card.appendChild(patField);

  // Error
  const error = el("p", { class: "error-text", id: "login-error" });
  card.appendChild(error);

  // Unlock
  const unlock = el("button", {
    type: "button",
    class: "btn-primary",
    text: "Unlock",
    style: "width:100%;margin-top:8px;",
    onclick: () => attemptLogin(pwInput, repoInput, patInput, error, unlock)
  });
  card.appendChild(unlock);

  // Create new family
  card.appendChild(el("button", {
    type: "button",
    class: "btn-secondary",
    text: "Create new family",
    style: "width:100%;margin-top:10px;",
    onclick: () => renderCreateFamily({
      slugPrefill: adminState.familySlug || "",
      repoPrefill: repoInput.value.trim(),
      patPrefill: patInput.value
    })
  }));

  // Back to the regular family app (read-only flashcards view)
  if (adminState.dataParam) {
    const appHref = "./?data=" + encodeURIComponent(adminState.dataParam);
    const backRow = el("p", { class: "back-to-app" });
    backRow.appendChild(el("a", {
      href: appHref,
      text: "← Back to family app"
    }));
    card.appendChild(backRow);
  }

  // Submit on Enter
  [pwInput, repoInput, patInput].forEach(input => {
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        attemptLogin(pwInput, repoInput, patInput, error, unlock);
      }
    });
  });

  const versionLine = el("p", { class: "version-line" });
  versionLine.appendChild(document.createTextNode("built " + formatBuildTime() + " · "));
  versionLine.appendChild(el("a", {
    href: "#",
    class: "refresh-link",
    text: "force refresh",
    onclick: e => { e.preventDefault(); forceCacheBustReload(); }
  }));
  card.appendChild(versionLine);

  screen.appendChild(card);
  showScreen("login");
  setTimeout(() => pwInput.focus(), 50);
}

async function attemptLogin(pwInput, repoInput, patInput, errorEl, btn) {
  errorEl.textContent = "";
  const pw = pwInput.value;
  const repoVal = repoInput.value.trim();
  const pat = patInput.value.trim();

  if (!pw) {
    errorEl.textContent = "Enter the family password.";
    return;
  }
  const repoMatch = repoVal.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!repoMatch) {
    errorEl.textContent = "GitHub repo must be in 'owner/repo' form.";
    return;
  }
  if (!pat) {
    errorEl.textContent = "Enter a GitHub personal access token.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Unlocking…";
  showOverlay("Decrypting…");

  try {
    // Fetch envelope
    let envelopeResp;
    try {
      envelopeResp = await fetch(adminState.encUrl, { cache: "no-store" });
    } catch (e) {
      throw new Error("Couldn't fetch the data file. Check your connection.");
    }
    if (envelopeResp.status === 404) {
      // No file at this slug — offer to create a fresh family here.
      hideOverlay();
      btn.disabled = false;
      btn.textContent = "Unlock";
      renderCreateFamily({
        slugPrefill: adminState.familySlug || "",
        repoPrefill: repoVal,
        patPrefill: pat,
        passwordPrefill: pw,
        noticeText: "No family found at this slug — set it up now?"
      });
      return;
    }
    if (!envelopeResp.ok) {
      throw new Error(`Couldn't fetch the data file (HTTP ${envelopeResp.status}).`);
    }
    let envelope;
    try {
      envelope = await envelopeResp.json();
    } catch (e) {
      throw new Error("Data file isn't valid JSON.");
    }
    if (!envelope || envelope.version !== 1) {
      throw new Error("Data file has an unexpected format.");
    }

    let decrypted;
    try {
      decrypted = await decryptEnvelope(envelope, pw);
    } catch (e) {
      // Wrong password
      btn.disabled = false;
      btn.textContent = "Unlock";
      hideOverlay();
      pwInput.classList.remove("shake");
      void pwInput.offsetWidth;
      pwInput.classList.add("shake");
      pwInput.value = "";
      errorEl.textContent = "Incorrect password.";
      pwInput.focus();
      return;
    }
    if (typeof decrypted.familyName !== "string" ||
        typeof decrypted.ancestor !== "string" ||
        !Array.isArray(decrypted.people)) {
      throw new Error("Decrypted data is missing expected fields.");
    }

    // Validate PAT against the repo
    showOverlay("Checking token…");
    adminState.pat = pat;
    adminState.owner = repoMatch[1];
    adminState.repo = repoMatch[2];
    let repoMeta;
    try {
      repoMeta = await validatePat(adminState.owner, adminState.repo);
    } catch (e) {
      adminState.pat = null;
      if (e.status === 401 || e.status === 403 || e.status === 404) {
        patInput.value = "";
        errorEl.textContent = "Token invalid or doesn't have access to this repo.";
      } else {
        errorEl.textContent = e.message;
      }
      btn.disabled = false;
      btn.textContent = "Unlock";
      hideOverlay();
      return;
    }
    adminState.defaultBranch = repoMeta.default_branch || "main";

    // Persist PAT + repo
    try {
      localStorage.setItem(PAT_STORAGE_KEY, pat);
      saveStoredRepo(`${adminState.owner}/${adminState.repo}`);
    } catch (e) { /* ignore quota errors */ }

    adminState.envelope = envelope;
    adminState.password = pw;
    adminState.familyName = decrypted.familyName;
    adminState.ancestor = decrypted.ancestor || null;
    adminState.groupPhoto = typeof decrypted.groupPhoto === "string" && decrypted.groupPhoto
      ? decrypted.groupPhoto : null;
    adminState.groupPhotoLocalUrl = null;
    adminState.people = decrypted.people.map(p => Object.assign({ _isNew: false }, p));

    hideOverlay();
    renderPeopleList();
  } catch (e) {
    hideOverlay();
    btn.disabled = false;
    btn.textContent = "Unlock";
    errorEl.textContent = e.message || String(e);
  }
}

// ---------- Create new family ----------

function deriveSlugFromName(name) {
  const first = (name || "").trim().toLowerCase().split(/\s+/)[0] || "";
  return first.replace(/[^a-z0-9-]/g, "");
}

function isValidSlug(slug) {
  return /^[a-z0-9][a-z0-9-]*$/.test(slug);
}

async function slugIsAvailable(photosBase, slug) {
  // We don't have direct GitHub access for file existence at this point, so
  // we probe the published URL. 404 = available, 200 = taken.
  try {
    const resp = await fetch(photosBase + slug + ".enc.json", {
      method: "GET",
      cache: "no-store"
    });
    if (resp.status === 404) return true;
    if (resp.ok) return false;
    // Other status — treat as inconclusive but lean "available" so the
    // commit attempt will be the authoritative check.
    return true;
  } catch (e) {
    return true;
  }
}

function renderCreateFamily(opts) {
  opts = opts || {};
  const screen = $("login-screen");
  clear(screen);

  const card = el("div", { class: "login-card" });
  card.appendChild(el("h1", { text: "Create a new family" }));
  if (opts.noticeText) {
    card.appendChild(el("p", { class: "login-sub", text: opts.noticeText }));
  } else {
    card.appendChild(el("p", { class: "login-sub",
      text: "Set up a brand-new encrypted family from scratch." }));
  }

  // Track whether the admin has manually edited the slug — once they have,
  // stop auto-deriving it from the name.
  let slugManuallyEdited = !!opts.slugPrefill;

  // Display name
  const nameField = el("div", { class: "field" });
  nameField.appendChild(el("label", { text: "Family display name", attrs: { for: "f-display" } }));
  const nameInput = el("input", {
    type: "text",
    id: "f-display",
    autocomplete: "off",
    placeholder: "The Frist Family Reunion 2026"
  });
  nameField.appendChild(nameInput);
  card.appendChild(nameField);

  // Slug
  const slugField = el("div", { class: "field" });
  slugField.appendChild(el("label", { text: "Family slug", attrs: { for: "f-slug" } }));
  const slugInput = el("input", {
    type: "text",
    id: "f-slug",
    autocomplete: "off",
    spellcheck: "false",
    placeholder: "frist",
    value: opts.slugPrefill || ""
  });
  slugInput.addEventListener("input", () => { slugManuallyEdited = true; });
  slugField.appendChild(slugInput);
  slugField.appendChild(el("p", { class: "field-hint",
    text: "Lowercase letters, numbers, hyphens. Used as the filename." }));
  card.appendChild(slugField);

  nameInput.addEventListener("input", e => {
    if (!slugManuallyEdited) {
      slugInput.value = deriveSlugFromName(e.target.value);
    }
  });

  // Password
  const pwField = el("div", { class: "field" });
  pwField.appendChild(el("label", { text: "Family password", attrs: { for: "f-pw" } }));
  const pwInput = el("input", {
    type: "password",
    id: "f-pw",
    autocomplete: "new-password",
    value: opts.passwordPrefill || ""
  });
  pwField.appendChild(pwInput);
  card.appendChild(pwField);

  const pw2Field = el("div", { class: "field" });
  pw2Field.appendChild(el("label", { text: "Confirm password", attrs: { for: "f-pw2" } }));
  const pw2Input = el("input", {
    type: "password",
    id: "f-pw2",
    autocomplete: "new-password",
    value: opts.passwordPrefill || ""
  });
  pw2Field.appendChild(pw2Input);
  card.appendChild(pw2Field);

  // Repo
  const stored = loadStoredRepo();
  const source = resolveDataSource(adminState.dataParam);
  const fromData = source && source.ghOwner && source.ghRepo
    ? `${source.ghOwner}/${source.ghRepo}` : null;
  const inferred = inferRepoFromLocation();
  const fromInferred = inferred ? `${inferred.owner}/${inferred.repo}` : null;
  const repoField = el("div", { class: "field" });
  repoField.appendChild(el("label", { text: "GitHub repo (owner/repo)", attrs: { for: "f-repo" } }));
  const repoInput = el("input", {
    type: "text",
    id: "f-repo",
    autocomplete: "off",
    spellcheck: "false",
    value: opts.repoPrefill || stored || fromData || fromInferred || ""
  });
  repoField.appendChild(repoInput);
  card.appendChild(repoField);

  // PAT
  let storedPat = "";
  try { storedPat = localStorage.getItem(PAT_STORAGE_KEY) || ""; } catch (e) { /* ignore */ }
  const patField = el("div", { class: "field" });
  patField.appendChild(el("label", { text: "GitHub personal access token", attrs: { for: "f-pat" } }));
  const patInput = el("input", {
    type: "password",
    id: "f-pat",
    autocomplete: "off",
    value: opts.patPrefill || storedPat
  });
  patField.appendChild(patInput);
  card.appendChild(patField);

  const error = el("p", { class: "error-text", id: "create-error" });
  card.appendChild(error);

  const create = el("button", {
    type: "button",
    class: "btn-primary",
    text: "Create family",
    style: "width:100%;margin-top:8px;",
    onclick: () => attemptCreateFamily({
      nameInput, slugInput, pwInput, pw2Input, repoInput, patInput, error, btn: create
    })
  });
  card.appendChild(create);

  card.appendChild(el("button", {
    type: "button",
    class: "btn-secondary",
    text: "Cancel",
    style: "width:100%;margin-top:10px;",
    onclick: () => renderLogin()
  }));

  screen.appendChild(card);
  showScreen("login");
  setTimeout(() => nameInput.focus(), 50);
}

async function attemptCreateFamily(refs) {
  const { nameInput, slugInput, pwInput, pw2Input, repoInput, patInput, error, btn } = refs;
  error.textContent = "";

  const displayName = nameInput.value.trim();
  const slug = slugInput.value.trim();
  const pw = pwInput.value;
  const pw2 = pw2Input.value;
  const repoVal = repoInput.value.trim();
  const pat = patInput.value.trim();

  if (!displayName) {
    error.textContent = "Enter a family display name.";
    nameInput.focus();
    return;
  }
  if (!slug) {
    error.textContent = "Enter a slug.";
    slugInput.focus();
    return;
  }
  if (!isValidSlug(slug)) {
    error.textContent = "Slug must be lowercase letters, numbers, and hyphens only.";
    slugInput.focus();
    return;
  }
  if (!pw) {
    error.textContent = "Enter a family password.";
    pwInput.focus();
    return;
  }
  if (pw !== pw2) {
    error.textContent = "Passwords don't match.";
    pw2Input.focus();
    return;
  }
  const repoMatch = repoVal.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!repoMatch) {
    error.textContent = "GitHub repo must be in 'owner/repo' form.";
    repoInput.focus();
    return;
  }
  if (!pat) {
    error.textContent = "Enter a GitHub personal access token.";
    patInput.focus();
    return;
  }

  // Determine photosBase — either from existing ?data= or by inferring from the
  // repo (assumes GitHub Pages at <owner>.github.io/<repo>/).
  let photosBase = adminState.photosBase;
  if (!photosBase) {
    photosBase = `https://${repoMatch[1]}.github.io/${repoMatch[2]}/`;
  }

  btn.disabled = true;
  btn.textContent = "Checking…";
  showOverlay("Checking slug availability…");

  try {
    const available = await slugIsAvailable(photosBase, slug);
    if (!available) {
      hideOverlay();
      btn.disabled = false;
      btn.textContent = "Create family";
      error.textContent = "A family with this slug already exists — pick a different slug.";
      slugInput.focus();
      return;
    }

    // Validate PAT
    showOverlay("Checking token…");
    adminState.pat = pat;
    adminState.owner = repoMatch[1];
    adminState.repo = repoMatch[2];
    let repoMeta;
    try {
      repoMeta = await validatePat(adminState.owner, adminState.repo);
    } catch (e) {
      adminState.pat = null;
      hideOverlay();
      btn.disabled = false;
      btn.textContent = "Create family";
      if (e.status === 401 || e.status === 403 || e.status === 404) {
        error.textContent = "Token invalid or doesn't have access to this repo.";
      } else {
        error.textContent = e.message;
      }
      return;
    }
    adminState.defaultBranch = repoMeta.default_branch || "main";

    // Persist what we can
    try {
      localStorage.setItem(PAT_STORAGE_KEY, pat);
      saveStoredRepo(`${adminState.owner}/${adminState.repo}`);
    } catch (e) { /* ignore */ }

    // Set up state for a new, unpublished family
    adminState.photosBase = photosBase;
    adminState.familySlug = slug;
    adminState.encUrl = photosBase + slug + ".enc.json";
    adminState.familyName = displayName;
    adminState.ancestor = null;
    adminState.groupPhoto = null;
    adminState.groupPhotoLocalUrl = null;
    adminState.people = [];
    adminState.password = pw;
    adminState.envelope = null; // no prior envelope
    adminState.isNewFamily = true;
    adminState.changes = [];
    adminState.pendingPhotos = new Map();

    hideOverlay();
    toast("Family ready — add people and tap Save & Publish.", "success");
    renderPeopleList();
  } catch (e) {
    hideOverlay();
    btn.disabled = false;
    btn.textContent = "Create family";
    error.textContent = e.message || String(e);
  }
}

// ---------- People list screen ----------

function renderPeopleList() {
  const screen = $("people-screen");
  clear(screen);

  // Top bar
  const top = el("div", { class: "topbar" });
  const title = el("div", { class: "topbar-title" });
  title.appendChild(document.createTextNode(adminState.familyName));
  const visible = adminState.people.filter(p => !p._deleted);
  const sub = el("span", { class: "topbar-sub", text: `${visible.length} ${visible.length === 1 ? "person" : "people"}` });
  title.appendChild(sub);
  top.appendChild(title);

  const pendingCount = adminState.changes.length;
  const publish = el("button", {
    type: "button",
    class: "pill-btn",
    text: pendingCount > 0 ? `Save & Publish (${pendingCount})` : "Save & Publish",
    disabled: !hasUnsavedChanges(),
    onclick: () => publishChanges()
  });
  top.appendChild(publish);
  screen.appendChild(top);

  if (adminState.isNewFamily) {
    screen.appendChild(el("div", { class: "new-family-banner",
      text: "New family — not yet published" }));
  }

  // Welcome image section
  screen.appendChild(renderGroupPhotoSection());

  // List
  const scroll = el("div", { class: "people-list-scroll" });
  const sorted = adminState.people.slice().sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
  );

  if (sorted.length === 0) {
    scroll.appendChild(el("div", { class: "people-empty",
      text: "No people yet — tap + to add the first." }));
  } else {
    for (const person of sorted) {
      scroll.appendChild(renderPersonRow(person));
    }
  }
  screen.appendChild(scroll);

  // FAB
  screen.appendChild(el("button", {
    type: "button",
    class: "fab",
    text: "+",
    attrs: { "aria-label": "Add a person" },
    onclick: () => openPersonEditor(null)
  }));

  showScreen("people");
}

function renderGroupPhotoSection() {
  const section = el("div", { class: "group-section" });
  section.appendChild(el("div", { class: "group-section-label", text: "Welcome image" }));

  const preview = el("div", { class: "group-preview" });
  const src = adminState.groupPhotoLocalUrl
    || (adminState.groupPhoto ? photoUrl(adminState.groupPhoto) : null);
  if (src) {
    preview.appendChild(el("img", { src, alt: "Welcome image" }));
  } else {
    preview.appendChild(el("div", { class: "group-placeholder", text: "🌅" }));
  }
  section.appendChild(preview);

  const fileInput = el("input", {
    type: "file",
    accept: "image/*",
    style: "display:none",
    onchange: async e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        showOverlay("Processing image…");
        const blob = await standardizeGroupPhoto(file);
        // Drop any previously pending group blob.
        clearPendingGroupPhoto();
        const filename = randomPhotoFilename();
        const path = newPhotoPath(filename);
        adminState.pendingPhotos.set(path, blob);
        adminState.groupPhoto = path;
        adminState.groupPhotoLocalUrl = URL.createObjectURL(blob);
        recordChange("edit", "welcome image");
        hideOverlay();
        renderPeopleList();
      } catch (err) {
        hideOverlay();
        toast(err.message || "Couldn't process image.", "error");
      }
      e.target.value = "";
    }
  });
  section.appendChild(fileInput);

  const actions = el("div", { class: "group-actions" });
  actions.appendChild(el("button", {
    type: "button",
    class: "btn-secondary",
    text: src ? "Replace image" : "Choose image",
    onclick: () => fileInput.click()
  }));
  if (src) {
    actions.appendChild(el("button", {
      type: "button",
      class: "btn-danger",
      text: "Remove",
      onclick: () => removeGroupPhoto()
    }));
  }
  section.appendChild(actions);

  return section;
}

function clearPendingGroupPhoto() {
  // If there's a pending blob queued for the group photo, discard it.
  if (adminState.groupPhotoLocalUrl) {
    URL.revokeObjectURL(adminState.groupPhotoLocalUrl);
    adminState.groupPhotoLocalUrl = null;
  }
  if (adminState.groupPhoto && adminState.pendingPhotos.has(adminState.groupPhoto)) {
    adminState.pendingPhotos.delete(adminState.groupPhoto);
  }
}

function removeGroupPhoto() {
  if (!confirm("Remove the welcome image? This takes effect after Save & Publish.")) return;
  clearPendingGroupPhoto();
  adminState.groupPhoto = null;
  recordChange("delete", "welcome image");
  renderPeopleList();
}

function renderPersonRow(person) {
  const row = el("button", {
    type: "button",
    class: "person-row",
    onclick: () => openPersonEditor(person.id)
  });
  if (person._deleted) row.style.opacity = "0.5";

  const thumb = el("div", { class: "person-row-thumb" });
  const thumbSrc = person._localPhotoUrl || (person.photo ? photoUrl(person.photo) : "");
  if (thumbSrc) {
    thumb.appendChild(el("img", { src: thumbSrc, alt: person.name }));
  }
  row.appendChild(thumb);

  const nameWrap = el("div", { class: "person-row-name" });
  nameWrap.appendChild(document.createTextNode(person.name || "(unnamed)"));
  if (person._isNew) nameWrap.appendChild(el("span", { class: "row-tag row-tag--new", text: "New" }));
  else if (person._dirty) nameWrap.appendChild(el("span", { class: "row-tag row-tag--edited", text: "Edited" }));
  if (person._deleted) nameWrap.appendChild(el("span", { class: "row-tag row-tag--deleted", text: "Deleted" }));
  row.appendChild(nameWrap);

  row.appendChild(el("span", { class: "person-row-chevron", text: "›" }));
  return row;
}

// ---------- Person editor screen ----------

function openPersonEditor(personId) {
  if (personId) {
    const person = getPersonById(personId);
    if (!person) return;
    adminState.draft = clonePerson(person);
    adminState.draft._originalId = person.id;
    adminState.draft._isNew = !!person._isNew;
  } else {
    adminState.draft = blankPerson();
  }
  renderPersonEditor();
}

function renderPersonEditor() {
  const screen = $("person-screen");
  clear(screen);
  const draft = adminState.draft;

  // Top bar
  const top = el("div", { class: "topbar" });
  top.appendChild(el("button", {
    type: "button",
    class: "icon-btn",
    text: "✕",
    attrs: { "aria-label": "Cancel" },
    onclick: () => {
      adminState.draft = null;
      renderPeopleList();
    }
  }));
  top.appendChild(el("div", { class: "topbar-title",
    text: draft._originalId ? draft.name || "Edit person" : "New person" }));
  screen.appendChild(top);

  // Scroll body
  const body = el("div", { class: "person-form-scroll" });

  // Photo
  body.appendChild(renderPhotoArea(draft));

  // Name
  const nameField = el("div", { class: "field" });
  nameField.appendChild(el("label", { text: "Full name", attrs: { for: "f-name" } }));
  const nameInput = el("input", {
    type: "text",
    id: "f-name",
    value: draft.name,
    placeholder: "e.g. Eleanor Frist",
    oninput: e => {
      draft.name = e.target.value;
      saveBtn.disabled = !draft.name.trim();
    }
  });
  nameField.appendChild(nameInput);
  body.appendChild(nameField);

  // Birthday
  const bField = el("div", { class: "field" });
  bField.appendChild(el("label", { text: "Birthday", attrs: { for: "f-birthday" } }));
  bField.appendChild(el("input", {
    type: "date",
    id: "f-birthday",
    value: draft.birthday,
    oninput: e => { draft.birthday = e.target.value; }
  }));
  body.appendChild(bField);

  // Fun fact
  const ffField = el("div", { class: "field" });
  ffField.appendChild(el("label", { text: "Fun fact", attrs: { for: "f-fun" } }));
  ffField.appendChild(el("textarea", {
    id: "f-fun",
    value: draft.funFact,
    placeholder: "Optional",
    oninput: e => { draft.funFact = e.target.value; }
  }));
  body.appendChild(ffField);

  // Relationships
  REL_TYPES.forEach(type => body.appendChild(renderRelSection(type, draft)));

  // Actions
  const actions = el("div", { class: "person-actions" });
  const saveBtn = el("button", {
    type: "button",
    class: "btn-primary",
    text: "Save",
    disabled: !draft.name.trim(),
    onclick: () => savePersonFromDraft()
  });
  actions.appendChild(saveBtn);
  if (draft._originalId && !getPersonById(draft._originalId)?._deleted) {
    actions.appendChild(el("button", {
      type: "button",
      class: "btn-danger",
      text: "Delete person",
      onclick: () => confirmDelete()
    }));
  }
  body.appendChild(actions);

  screen.appendChild(body);
  showScreen("person");
}

function renderPhotoArea(draft) {
  const wrap = el("div", { class: "photo-area" });
  const preview = el("div", { class: "photo-preview" });
  const previewSrc = draft._localPhotoUrl || (draft.photo ? photoUrl(draft.photo) : "");
  if (previewSrc) {
    preview.appendChild(el("img", { src: previewSrc, alt: "Photo preview" }));
  } else {
    preview.appendChild(el("div", { class: "photo-placeholder", text: "👤" }));
  }
  wrap.appendChild(preview);

  const fileInput = el("input", {
    type: "file",
    accept: "image/*",
    style: "display:none",
    onchange: async e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      photoErr.textContent = "";
      try {
        showOverlay("Processing photo…");
        const blob = await standardizePhoto(file);
        // Drop any previously queued photo for this draft.
        if (draft._newPhotoPath) {
          adminState.pendingPhotos.delete(draft._newPhotoPath);
          if (draft._localPhotoUrl) URL.revokeObjectURL(draft._localPhotoUrl);
        }
        const filename = randomPhotoFilename();
        const path = newPhotoPath(filename);
        adminState.pendingPhotos.set(path, blob);
        draft._newPhotoBlob = blob;
        draft._newPhotoPath = path;
        draft.photo = path;
        draft._localPhotoUrl = URL.createObjectURL(blob);
        hideOverlay();
        renderPersonEditor();
      } catch (err) {
        hideOverlay();
        photoErr.textContent = err.message || "Couldn't process photo.";
      }
      e.target.value = "";
    }
  });
  wrap.appendChild(fileInput);

  wrap.appendChild(el("button", {
    type: "button",
    class: "btn-secondary",
    text: previewSrc ? "Replace photo" : "Choose photo",
    onclick: () => fileInput.click()
  }));

  const photoErr = el("div", { class: "photo-error" });
  wrap.appendChild(photoErr);

  return wrap;
}

function renderRelSection(type, draft) {
  const section = el("div", { class: "rel-section" });
  const ids = draft.family[type] || [];
  const raws = draft.family[type + "Raw"] || [];
  const count = ids.length + raws.length;

  const header = el("button", {
    type: "button",
    class: "rel-section-header",
    onclick: () => section.classList.toggle("open")
  });
  header.appendChild(document.createTextNode(REL_LABELS[type]));
  if (count > 0) header.appendChild(el("span", { class: "rel-count", text: `(${count})` }));
  header.appendChild(el("span", { class: "rel-caret", text: "›" }));
  section.appendChild(header);

  const body = el("div", { class: "rel-section-body" });

  const chipRow = el("div", { class: "rel-chips" });
  ids.forEach((id, idx) => {
    const person = getPersonById(id);
    const chip = el("span", { class: "rel-chip rel-chip--linked",
      text: person ? person.name : id });
    chip.appendChild(el("button", {
      type: "button",
      class: "chip-x",
      text: "×",
      attrs: { "aria-label": "Remove" },
      onclick: () => {
        draft.family[type].splice(idx, 1);
        renderPersonEditor();
        // Re-open the section after re-render
        document.querySelectorAll(".rel-section")[REL_TYPES.indexOf(type)]?.classList.add("open");
      }
    }));
    chipRow.appendChild(chip);
  });
  raws.forEach((raw, idx) => {
    const chip = el("span", { class: "rel-chip rel-chip--raw", text: raw });
    chip.appendChild(el("button", {
      type: "button",
      class: "chip-x",
      text: "×",
      attrs: { "aria-label": "Remove" },
      onclick: () => {
        draft.family[type + "Raw"].splice(idx, 1);
        renderPersonEditor();
        document.querySelectorAll(".rel-section")[REL_TYPES.indexOf(type)]?.classList.add("open");
      }
    }));
    chipRow.appendChild(chip);
  });
  body.appendChild(chipRow);

  body.appendChild(el("button", {
    type: "button",
    class: "rel-add-btn",
    text: `+ Add ${REL_LABELS[type].toLowerCase().replace(/s$/, "")}`,
    onclick: () => openPicker(type)
  }));

  section.appendChild(body);
  if (count > 0) section.classList.add("open");
  return section;
}

function savePersonFromDraft() {
  const draft = adminState.draft;
  if (!draft.name.trim()) {
    toast("Name is required.", "error");
    return;
  }

  if (draft._originalId) {
    // Edit existing
    const idx = adminState.people.findIndex(p => p.id === draft._originalId);
    if (idx === -1) {
      toast("Could not find person to update.", "error");
      return;
    }
    const existing = adminState.people[idx];
    const wasNew = existing._isNew;
    adminState.people[idx] = {
      id: existing.id,
      name: draft.name.trim(),
      photo: draft.photo,
      birthday: draft.birthday,
      funFact: draft.funFact,
      syncedAt: existing.syncedAt || null,
      family: draft.family,
      _isNew: wasNew,
      _dirty: !wasNew,
      _deleted: false,
      _localPhotoUrl: draft._localPhotoUrl || existing._localPhotoUrl
    };
    recordChange(wasNew ? "add" : "edit", draft.name.trim());
  } else {
    // New
    const id = generatePersonId(draft.name);
    adminState.people.push({
      id,
      name: draft.name.trim(),
      photo: draft.photo,
      birthday: draft.birthday,
      funFact: draft.funFact,
      syncedAt: null,
      family: draft.family,
      _isNew: true,
      _localPhotoUrl: draft._localPhotoUrl
    });
    recordChange("add", draft.name.trim());
  }

  adminState.draft = null;
  renderPeopleList();
  toast("Saved. Tap Save & Publish when you're done.");
}

function confirmDelete() {
  const draft = adminState.draft;
  if (!draft || !draft._originalId) return;
  if (!confirm(`Delete ${draft.name}? This will be permanent after you Save & Publish.`)) return;
  const idx = adminState.people.findIndex(p => p.id === draft._originalId);
  if (idx === -1) return;
  const person = adminState.people[idx];
  if (person._isNew) {
    // Never persisted — just drop it.
    if (person._localPhotoUrl) URL.revokeObjectURL(person._localPhotoUrl);
    if (person.photo && adminState.pendingPhotos.has(person.photo)) {
      adminState.pendingPhotos.delete(person.photo);
    }
    adminState.people.splice(idx, 1);
    recordChange("delete", draft.name);
  } else {
    person._deleted = true;
    person._dirty = false;
    recordChange("delete", draft.name);
  }
  adminState.draft = null;
  renderPeopleList();
}

// ---------- Picker screen ----------

function openPicker(relType) {
  adminState.pickerContext = { relType };
  renderPicker("");
}

function renderPicker(query) {
  const screen = $("picker-screen");
  clear(screen);
  const ctx = adminState.pickerContext;
  if (!ctx) {
    showScreen("person");
    return;
  }
  const label = REL_LABELS[ctx.relType].toLowerCase().replace(/s$/, "");

  // Top bar
  const top = el("div", { class: "topbar" });
  top.appendChild(el("button", {
    type: "button",
    class: "icon-btn",
    text: "‹",
    attrs: { "aria-label": "Back" },
    onclick: () => {
      adminState.pickerContext = null;
      renderPersonEditor();
    }
  }));
  top.appendChild(el("div", { class: "topbar-title", text: `Add ${label}` }));
  screen.appendChild(top);

  // Search
  const searchWrap = el("div", { class: "picker-search" });
  const searchInput = el("input", {
    type: "text",
    placeholder: "Search names…",
    value: query,
    oninput: e => renderPicker(e.target.value)
  });
  searchWrap.appendChild(searchInput);
  screen.appendChild(searchWrap);

  // List
  const list = el("div", { class: "picker-list" });
  const draft = adminState.draft;
  const exclude = new Set();
  if (draft._originalId) exclude.add(draft._originalId);
  // Also exclude people already in this relationship slot
  for (const id of (draft.family[ctx.relType] || [])) exclude.add(id);

  const q = query.trim().toLowerCase();
  const candidates = adminState.people
    .filter(p => !p._deleted && !exclude.has(p.id))
    .filter(p => !q || (p.name || "").toLowerCase().includes(q))
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }));

  if (candidates.length === 0) {
    list.appendChild(el("div", { class: "picker-empty",
      text: q ? "No matches." : "No other people yet." }));
  } else {
    for (const person of candidates) {
      const row = el("button", {
        type: "button",
        class: "picker-row",
        onclick: () => pickerAddLinked(person.id)
      });
      const thumb = el("div", { class: "person-row-thumb" });
      const src = person._localPhotoUrl || (person.photo ? photoUrl(person.photo) : "");
      if (src) thumb.appendChild(el("img", { src, alt: person.name }));
      row.appendChild(thumb);
      row.appendChild(el("div", { class: "person-row-name", text: person.name }));
      list.appendChild(row);
    }
  }
  screen.appendChild(list);

  // Raw add
  const raw = el("div", { class: "picker-raw" });
  raw.appendChild(el("label", { text: "Or add by name only" }));
  const rawRow = el("div", { class: "picker-raw-row" });
  const rawInput = el("input", { type: "text", placeholder: `${label} name` });
  rawRow.appendChild(rawInput);
  rawRow.appendChild(el("button", {
    type: "button",
    text: "Add",
    onclick: () => {
      const v = rawInput.value.trim();
      if (!v) return;
      pickerAddRaw(v);
    }
  }));
  raw.appendChild(rawRow);
  screen.appendChild(raw);

  showScreen("picker");
}

function pickerAddLinked(id) {
  const ctx = adminState.pickerContext;
  if (!ctx) return;
  const arr = adminState.draft.family[ctx.relType];
  if (!arr.includes(id)) arr.push(id);
  adminState.pickerContext = null;
  renderPersonEditor();
}

function pickerAddRaw(name) {
  const ctx = adminState.pickerContext;
  if (!ctx) return;
  const arr = adminState.draft.family[ctx.relType + "Raw"];
  arr.push(name);
  adminState.pickerContext = null;
  renderPersonEditor();
}

// ---------- Save & publish ----------

function buildCommitMessage() {
  if (adminState.isNewFamily) {
    return `Create new family: ${adminState.familyName}`;
  }
  const adds = adminState.changes.filter(c => c.type === "add");
  const edits = adminState.changes.filter(c => c.type === "edit");
  const deletes = adminState.changes.filter(c => c.type === "delete");
  const total = adds.length + edits.length + deletes.length;
  if (total === 1) {
    const c = adminState.changes[0];
    return `${c.type[0].toUpperCase() + c.type.slice(1)} ${c.name}`;
  }
  const parts = [];
  if (adds.length) parts.push(`add ${adds.length}`);
  if (edits.length) parts.push(`edit ${edits.length}`);
  if (deletes.length) parts.push(`delete ${deletes.length}`);
  return "Admin update: " + parts.join(", ");
}

function buildPayloadForCommit() {
  // Strip internal flags before encrypting.
  const people = adminState.people
    .filter(p => !p._deleted)
    .map(p => ({
      id: p.id,
      name: p.name,
      photo: p.photo,
      birthday: p.birthday,
      funFact: p.funFact,
      syncedAt: p.syncedAt || null,
      family: p.family
    }));
  const payload = {
    familyName: adminState.familyName,
    people
  };
  if (adminState.ancestor) payload.ancestor = adminState.ancestor;
  if (adminState.groupPhoto) payload.groupPhoto = adminState.groupPhoto;
  return payload;
}

function encFilePath() {
  // Returns the .enc.json path relative to the repo root (what the Trees API
  // wants). The served URL includes a repo segment for project Pages,
  // whether on github.io or a custom domain — strip that segment off.
  const url = new URL(adminState.encUrl);
  const pathname = url.pathname.replace(/^\/+/, "");
  const parts = pathname.split("/");
  if (/\.github\.io$/i.test(url.hostname)) {
    return parts.slice(1).join("/");
  }
  if (adminState.repo && parts[0] === adminState.repo) {
    return parts.slice(1).join("/");
  }
  return pathname;
}

async function publishChanges() {
  if (!hasUnsavedChanges()) return;
  if (!adminState.pat) {
    toast("No GitHub token — log in again.", "error");
    return;
  }

  try {
    showOverlay("Encrypting…");
    const payload = buildPayloadForCommit();
    const envelope = await encryptPayload(payload, adminState.password);
    const encJsonStr = JSON.stringify(envelope, null, 2);

    showOverlay("Publishing…");
    const { owner, repo, defaultBranch } = adminState;

    // 1. Latest ref
    const ref = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`);
    const headSha = ref.object.sha;
    const headCommit = await ghFetch(`/repos/${owner}/${repo}/git/commits/${headSha}`);
    const baseTreeSha = headCommit.tree.sha;

    // 2. Blobs
    const encBlob = await ghFetch(`/repos/${owner}/${repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({
        content: bytesToBase64(new TextEncoder().encode(encJsonStr)),
        encoding: "base64"
      })
    });

    const treeEntries = [
      { path: encFilePath(), mode: "100644", type: "blob", sha: encBlob.sha }
    ];

    // Only commit photos that are referenced by surviving (non-deleted) people
    // or by the current group/welcome image.
    const referencedPaths = new Set(
      adminState.people.filter(p => !p._deleted).map(p => p.photo).filter(Boolean)
    );
    if (adminState.groupPhoto) referencedPaths.add(adminState.groupPhoto);
    for (const [path, blob] of adminState.pendingPhotos.entries()) {
      if (!referencedPaths.has(path)) continue;
      const b64 = await blobToBase64(blob);
      const photoBlob = await ghFetch(`/repos/${owner}/${repo}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: b64, encoding: "base64" })
      });
      treeEntries.push({ path, mode: "100644", type: "blob", sha: photoBlob.sha });
    }

    // 3. Tree
    const tree = await ghFetch(`/repos/${owner}/${repo}/git/trees`, {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries })
    });

    // 4. Commit
    const commit = await ghFetch(`/repos/${owner}/${repo}/git/commits`, {
      method: "POST",
      body: JSON.stringify({
        message: buildCommitMessage(),
        tree: tree.sha,
        parents: [headSha]
      })
    });

    // 5. Update ref
    await ghFetch(`/repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha })
    });

    // Success — clear pending state, refresh in-memory people to a clean baseline
    adminState.changes = [];
    adminState.isNewFamily = false;
    adminState.pendingPhotos.forEach((_, path) => { /* keep blobs referenced for thumbs */ });
    // Mark everyone as clean
    adminState.people = adminState.people
      .filter(p => !p._deleted)
      .map(p => {
        const cleaned = Object.assign({}, p);
        delete cleaned._isNew;
        delete cleaned._dirty;
        delete cleaned._deleted;
        return cleaned;
      });
    // Update envelope so future re-encrypts use the new iterations/salt? Not
    // needed — encryptPayload generates fresh ones each time.
    hideOverlay();
    toast("Published!", "success");
    renderPeopleList();
  } catch (e) {
    hideOverlay();
    toast(e.message || "Publish failed.", "error");
  }
}

// ---------- Entry point ----------

function init() {
  const params = new URLSearchParams(window.location.search);
  const dataParam = params.get("data");
  adminState.dataParam = dataParam;

  const source = resolveDataSource(dataParam);
  if (source) {
    adminState.encUrl = source.encUrl;
    adminState.photosBase = source.photosBase;
    adminState.familySlug = source.slug;
  }

  renderLogin();
}

document.addEventListener("DOMContentLoaded", init);
