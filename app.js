// ---------- App state ----------
// dataState holds everything loaded from the data repo. familyName comes
// from plaintext config.json; ancestor + people are decrypted from
// data.enc.json after the user enters the password.
const dataState = {
  baseUrl: null,
  familyName: null,
  envelope: null,
  ancestor: null,
  people: []
};

const state = {
  deck: [],
  index: 0,
  animating: false
};

const quizState = {
  questions: [],
  index: 0,
  score: 0,
  locked: false,
  pendingTimeout: null
};

// ---------- Utilities ----------

function getPersonById(id) {
  return dataState.people.find(p => p.id === id);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck() {
  const ancestor = getPersonById(dataState.ancestor);
  const others = dataState.people.filter(p => p.id !== dataState.ancestor);
  return ancestor ? [ancestor, ...shuffle(others)] : shuffle(others);
}

function calcAge(birthday) {
  const birth = new Date(birthday);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function isBirthMonth(birthday) {
  const birth = new Date(birthday);
  return birth.getMonth() === new Date().getMonth();
}

function photoUrl(relativePath) {
  if (!relativePath) return "";
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  if (!dataState.baseUrl) return relativePath;
  return dataState.baseUrl + relativePath.replace(/^\/+/, "");
}

// ---------- Crypto (Web Crypto API) ----------

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

// ---------- Data loading ----------

// Resolves ?data= into { encUrl, photosBaseUrl }.
// Supported forms:
//   owner/repo            → photosBase https://owner.github.io/repo/
//                           enc       https://owner.github.io/repo/data.enc.json
//   owner/repo/slug       → photosBase https://owner.github.io/repo/
//                           enc       https://owner.github.io/repo/slug.enc.json
//   https://host/path/    → photosBase https://host/path/
//                           enc       https://host/path/data.enc.json
//   https://host/path/slug → photosBase https://host/path/
//                           enc       https://host/path/slug.enc.json
function resolveDataSource(dataParam) {
  if (!dataParam) return null;

  if (/^https?:\/\//i.test(dataParam)) {
    if (dataParam.endsWith("/")) {
      return { encUrl: dataParam + "data.enc.json", photosBase: dataParam };
    }
    const lastSlash = dataParam.lastIndexOf("/");
    if (lastSlash < dataParam.indexOf("://") + 3) return null;
    const photosBase = dataParam.slice(0, lastSlash + 1);
    const slug = dataParam.slice(lastSlash + 1);
    if (!/^[\w.-]+$/.test(slug)) return null;
    return { encUrl: photosBase + slug + ".enc.json", photosBase };
  }

  const parts = dataParam.split("/").filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every(p => /^[\w.-]+$/.test(p))) return null;
  const photosBase = `https://${parts[0]}.github.io/${parts[1]}/`;
  const file = parts.length === 3 ? parts[2] + ".enc.json" : "data.enc.json";
  return { encUrl: photosBase + file, photosBase };
}

async function loadFamilyData() {
  const params = new URLSearchParams(window.location.search);
  const source = resolveDataSource(params.get("data"));
  if (!source) {
    return {
      ok: false,
      kind: "no-data",
      message:
        "No family data specified. The link you used should include a ?data= parameter — please ask the person who shared the link."
    };
  }
  dataState.baseUrl = source.photosBase;

  let envelopeResp;
  try {
    envelopeResp = await fetch(source.encUrl, { cache: "no-store" });
  } catch (e) {
    return {
      ok: false,
      kind: "network",
      message: "Couldn't load family data — check your connection and reload."
    };
  }
  if (!envelopeResp.ok) {
    return {
      ok: false,
      kind: "network",
      message: "Couldn't load family data — check your connection and reload."
    };
  }

  let envelope;
  try {
    envelope = await envelopeResp.json();
  } catch (e) {
    return {
      ok: false,
      kind: "corrupt",
      message: "Family data appears corrupted — contact the family organizer."
    };
  }

  if (
    !envelope ||
    envelope.version !== 1 ||
    typeof envelope.salt !== "string" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.ciphertext !== "string" ||
    typeof envelope.iterations !== "number"
  ) {
    return {
      ok: false,
      kind: "corrupt",
      message: "Family data appears corrupted — contact the family organizer."
    };
  }

  dataState.envelope = envelope;
  return { ok: true };
}

// ---------- Screen routing ----------

function showScreen(name) {
  document.querySelectorAll(".screen").forEach(el => el.classList.remove("active"));
  const target = document.getElementById(`${name}-screen`);
  if (target) target.classList.add("active");
}

// ---------- Password screen ----------

function renderPassword() {
  const screen = document.getElementById("password-screen");
  screen.innerHTML = "";

  const container = document.createElement("div");
  container.className = "password-container";

  const heading = document.createElement("h1");
  heading.className = "family-name";
  heading.textContent = "Family Flashcards";
  container.appendChild(heading);

  const sub = document.createElement("p");
  sub.className = "subheading";
  sub.textContent = "Please enter the family password";
  container.appendChild(sub);

  const form = document.createElement("form");
  form.className = "password-form";

  const input = document.createElement("input");
  input.type = "password";
  input.className = "password-input";
  input.id = "password-input";
  input.autocomplete = "off";
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("spellcheck", "false");
  form.appendChild(input);

  const button = document.createElement("button");
  button.type = "submit";
  button.className = "btn-primary";
  button.textContent = "Enter";
  form.appendChild(button);

  container.appendChild(form);

  const error = document.createElement("p");
  error.className = "error-message";
  error.id = "password-error";
  container.appendChild(error);

  screen.appendChild(container);

  let busy = false;

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (busy) return;
    let password = input.value;
    if (!password) return;

    busy = true;
    input.disabled = true;
    button.disabled = true;
    button.textContent = "Decrypting…";
    button.classList.add("is-busy");
    error.textContent = "";

    try {
      const decrypted = await decryptEnvelope(dataState.envelope, password);
      // Discard the password from local references as soon as we're done with it.
      password = null;

      if (
        !decrypted ||
        typeof decrypted.familyName !== "string" ||
        typeof decrypted.ancestor !== "string" ||
        !Array.isArray(decrypted.people)
      ) {
        // Decrypt succeeded but plaintext is malformed — treat as corrupt data.
        renderError("Family data appears corrupted — contact the family organizer.");
        return;
      }

      dataState.familyName = decrypted.familyName;
      dataState.ancestor = decrypted.ancestor;
      dataState.people = decrypted.people;

      input.value = "";
      renderHome();
    } catch (err) {
      // AES-GCM throws on bad key/tag — overwhelmingly the wrong-password case.
      error.textContent = "Incorrect password — try again";
      input.value = "";
      input.classList.remove("shake");
      void input.offsetWidth;
      input.classList.add("shake");
      input.focus();
    } finally {
      busy = false;
      input.disabled = false;
      button.disabled = false;
      button.textContent = "Enter";
      button.classList.remove("is-busy");
    }
  });

  showScreen("password");
  setTimeout(() => input.focus(), 50);
}

// ---------- Home screen ----------

function renderHome() {
  const screen = document.getElementById("home-screen");
  screen.innerHTML = "";

  const container = document.createElement("div");
  container.className = "home-container";

  const heading = document.createElement("h1");
  heading.className = "family-name home-title";
  heading.textContent = dataState.familyName || "";
  container.appendChild(heading);

  const ancestor = getPersonById(dataState.ancestor);

  if (ancestor) {
    const feature = document.createElement("button");
    feature.type = "button";
    feature.className = "ancestor-feature";
    feature.setAttribute("aria-label", `Open ${ancestor.name}'s card`);

    const photo = document.createElement("img");
    photo.className = "ancestor-photo";
    photo.src = photoUrl(ancestor.photo);
    photo.alt = ancestor.name;
    feature.appendChild(photo);

    const ancestorName = document.createElement("div");
    ancestorName.className = "ancestor-name";
    ancestorName.textContent = ancestor.name;
    feature.appendChild(ancestorName);

    feature.addEventListener("click", () => renderBrowse());
    container.appendChild(feature);
  }

  const buttons = document.createElement("div");
  buttons.className = "mode-buttons";

  const browseBtn = document.createElement("button");
  browseBtn.type = "button";
  browseBtn.className = "btn-primary mode-btn";
  browseBtn.textContent = "Browse";
  browseBtn.addEventListener("click", () => renderBrowse());
  buttons.appendChild(browseBtn);

  const quizBtn = document.createElement("button");
  quizBtn.type = "button";
  quizBtn.className = "btn-primary mode-btn";
  quizBtn.textContent = "Quiz";
  quizBtn.addEventListener("click", () => renderQuiz());
  buttons.appendChild(quizBtn);

  container.appendChild(buttons);

  screen.appendChild(container);
  showScreen("home");
}

// ---------- Browse screen ----------

function buildBrowseScreen() {
  const screen = document.getElementById("browse-screen");
  screen.innerHTML = "";

  const browse = document.createElement("div");
  browse.className = "browse";

  const back = document.createElement("button");
  back.type = "button";
  back.className = "back-button";
  back.setAttribute("aria-label", "Back to home");
  back.textContent = "‹";
  back.addEventListener("click", () => renderHome());
  browse.appendChild(back);

  const indicator = document.createElement("div");
  indicator.className = "position-indicator";
  browse.appendChild(indicator);

  const viewport = document.createElement("div");
  viewport.className = "card-viewport";
  browse.appendChild(viewport);

  screen.appendChild(browse);

  attachSwipe(viewport);
}

function renderBrowse() {
  state.deck = buildDeck();
  state.index = 0;
  state.animating = false;
  const viewport = document.querySelector("#browse-screen .card-viewport");
  const indicator = document.querySelector("#browse-screen .position-indicator");
  mountCard(viewport, indicator);
  showScreen("browse");
}

function mountCard(viewport, indicator) {
  viewport.innerHTML = "";
  const person = state.deck[state.index];
  const card = buildCardElement(person);
  viewport.appendChild(card);
  indicator.textContent = `${state.index + 1} / ${state.deck.length}`;
}

function buildCardElement(person) {
  const card = document.createElement("div");
  card.className = "card";

  const photo = document.createElement("div");
  photo.className = "card-photo";
  const img = document.createElement("img");
  img.src = photoUrl(person.photo);
  img.alt = person.name;
  photo.appendChild(img);
  card.appendChild(photo);

  const info = document.createElement("div");
  info.className = "card-info";

  const name = document.createElement("h1");
  name.className = "card-name";
  name.textContent = person.name;
  info.appendChild(name);

  const age = document.createElement("p");
  age.className = "card-age";
  age.textContent = `Age ${calcAge(person.birthday)}`;
  info.appendChild(age);

  if (isBirthMonth(person.birthday)) {
    const badge = document.createElement("div");
    badge.className = "birthday-badge";
    badge.textContent = "🎂 Birthday this month!";
    info.appendChild(badge);
  }

  if (person.funFact) {
    const fact = document.createElement("p");
    fact.className = "card-fun-fact";
    fact.textContent = person.funFact;
    info.appendChild(fact);
  }

  const groups = [
    ["Grandparents", person.family.grandparents, person.family.grandparentsRaw],
    ["Parents", person.family.parents, person.family.parentsRaw],
    ["Siblings", person.family.siblings, person.family.siblingsRaw],
    ["Spouses", person.family.spouses, person.family.spousesRaw],
    ["Children", person.family.children, person.family.childrenRaw]
  ];

  groups.forEach(([label, ids, raws]) => {
    const group = renderChipGroup(label, ids || [], raws || []);
    if (group) info.appendChild(group);
  });

  card.appendChild(info);
  return card;
}

function renderChipGroup(label, ids, raws) {
  const count = Math.max(ids.length, raws.length);
  if (count === 0) return null;

  const group = document.createElement("div");
  group.className = "chip-group";

  const lbl = document.createElement("div");
  lbl.className = "chip-group-label";
  lbl.textContent = label;
  group.appendChild(lbl);

  const row = document.createElement("div");
  row.className = "chip-row";

  for (let i = 0; i < count; i++) {
    const id = ids[i];
    const raw = raws[i];
    if (id) {
      const person = getPersonById(id);
      const chip = document.createElement("button");
      chip.className = "chip chip--linked";
      chip.type = "button";
      chip.textContent = person ? person.name : (raw || id);
      chip.addEventListener("click", () => jumpToPerson(id));
      row.appendChild(chip);
    } else if (raw) {
      const chip = document.createElement("span");
      chip.className = "chip chip--raw";
      chip.textContent = raw;
      row.appendChild(chip);
    }
  }

  group.appendChild(row);
  return group;
}

function goNext() {
  if (state.animating) return;
  if (state.index >= state.deck.length - 1) return;
  animateTo(state.index + 1, "left");
}

function goPrev() {
  if (state.animating) return;
  if (state.index <= 0) return;
  animateTo(state.index - 1, "right");
}

function jumpToPerson(id) {
  if (state.animating) return;
  const idx = state.deck.findIndex(p => p.id === id);
  if (idx === -1 || idx === state.index) return;
  const direction = idx > state.index ? "left" : "right";
  animateTo(idx, direction);
}

function animateTo(newIndex, direction) {
  const viewport = document.querySelector(".card-viewport");
  const indicator = document.querySelector(".position-indicator");
  if (!viewport || !indicator) return;

  const oldCard = viewport.querySelector(".card");
  const newPerson = state.deck[newIndex];
  const newCard = buildCardElement(newPerson);

  newCard.classList.add(direction === "left" ? "slide-in-from-right" : "slide-in-from-left");
  viewport.appendChild(newCard);

  state.animating = true;
  void newCard.offsetWidth;

  if (oldCard) {
    oldCard.classList.add(direction === "left" ? "slide-out-left" : "slide-out-right");
  }
  newCard.classList.add("slide-in-active");

  const cleanup = () => {
    if (oldCard && oldCard.parentNode) oldCard.parentNode.removeChild(oldCard);
    newCard.classList.remove(
      "slide-in-from-right",
      "slide-in-from-left",
      "slide-in-active"
    );
    state.index = newIndex;
    indicator.textContent = `${state.index + 1} / ${state.deck.length}`;
    state.animating = false;
  };

  newCard.addEventListener("transitionend", cleanup, { once: true });
  setTimeout(() => {
    if (state.animating) cleanup();
  }, 500);
}

function attachSwipe(el) {
  if (typeof Hammer === "undefined") return;
  const mc = new Hammer.Manager(el);
  mc.add(new Hammer.Swipe({ direction: Hammer.DIRECTION_HORIZONTAL }));
  mc.on("swipeleft", goNext);
  mc.on("swiperight", goPrev);
}

// ---------- Quiz screen ----------

function generateQuiz() {
  const order = shuffle(dataState.people);
  return order.map(person => {
    const others = dataState.people.filter(p => p.id !== person.id);
    const distractors = shuffle(others).slice(0, 3);
    const choices = shuffle([person, ...distractors]);
    return { person, choices };
  });
}

function buildQuizScreen() {
  const screen = document.getElementById("quiz-screen");
  screen.innerHTML = "";

  const quiz = document.createElement("div");
  quiz.className = "quiz";

  const back = document.createElement("button");
  back.type = "button";
  back.className = "back-button";
  back.setAttribute("aria-label", "Back to home");
  back.textContent = "‹";
  back.addEventListener("click", exitQuiz);
  quiz.appendChild(back);

  const progress = document.createElement("div");
  progress.className = "quiz-progress";
  progress.id = "quiz-progress";
  quiz.appendChild(progress);

  const photoWrap = document.createElement("div");
  photoWrap.className = "quiz-photo";
  const img = document.createElement("img");
  img.id = "quiz-photo-img";
  img.alt = "";
  photoWrap.appendChild(img);
  quiz.appendChild(photoWrap);

  const choices = document.createElement("div");
  choices.className = "quiz-choices";
  choices.id = "quiz-choices";
  for (let i = 0; i < 4; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quiz-choice";
    btn.dataset.slot = String(i);
    btn.addEventListener("click", () => onChoice(i));
    choices.appendChild(btn);
  }
  quiz.appendChild(choices);

  screen.appendChild(quiz);
}

function renderQuiz() {
  cancelPendingAdvance();
  quizState.questions = generateQuiz();
  quizState.index = 0;
  quizState.score = 0;
  quizState.locked = false;
  showQuestion();
  showScreen("quiz");
}

function showQuestion() {
  const q = quizState.questions[quizState.index];
  const img = document.getElementById("quiz-photo-img");
  const progress = document.getElementById("quiz-progress");
  img.src = photoUrl(q.person.photo);
  img.alt = q.person.name;
  progress.textContent = `Question ${quizState.index + 1} of ${quizState.questions.length}`;
  const buttons = document.querySelectorAll("#quiz-choices .quiz-choice");
  buttons.forEach((btn, i) => {
    btn.textContent = q.choices[i].name;
    btn.classList.remove("quiz-choice--correct", "quiz-choice--wrong");
    btn.disabled = false;
  });
  quizState.locked = false;
}

function onChoice(i) {
  if (quizState.locked) return;
  quizState.locked = true;

  const q = quizState.questions[quizState.index];
  const buttons = document.querySelectorAll("#quiz-choices .quiz-choice");
  const isCorrect = q.choices[i].id === q.person.id;
  const correctIndex = q.choices.findIndex(c => c.id === q.person.id);

  buttons.forEach(btn => { btn.disabled = true; });

  if (isCorrect) {
    quizState.score++;
    buttons[i].classList.add("quiz-choice--correct");
    quizState.pendingTimeout = setTimeout(advanceQuiz, 1000);
  } else {
    buttons[i].classList.add("quiz-choice--wrong");
    if (correctIndex !== -1) {
      buttons[correctIndex].classList.add("quiz-choice--correct");
    }
    quizState.pendingTimeout = setTimeout(advanceQuiz, 1500);
  }
}

function advanceQuiz() {
  quizState.pendingTimeout = null;
  quizState.index++;
  if (quizState.index >= quizState.questions.length) {
    renderQuizEnd();
  } else {
    showQuestion();
  }
}

function cancelPendingAdvance() {
  if (quizState.pendingTimeout !== null) {
    clearTimeout(quizState.pendingTimeout);
    quizState.pendingTimeout = null;
  }
}

function exitQuiz() {
  cancelPendingAdvance();
  renderHome();
}

// ---------- Quiz end screen ----------

function renderQuizEnd() {
  const screen = document.getElementById("quiz-end-screen");
  screen.innerHTML = "";

  const total = quizState.questions.length;
  const score = quizState.score;

  const container = document.createElement("div");
  container.className = "quiz-end-container";

  const scoreEl = document.createElement("div");
  scoreEl.className = "quiz-end-score";
  scoreEl.textContent = `${score} / ${total}`;
  container.appendChild(scoreEl);

  const message = document.createElement("p");
  message.className = "quiz-end-message";
  if (score >= 7) message.textContent = "Great job!";
  else if (score >= 4) message.textContent = "Nice work!";
  else message.textContent = "Keep practicing!";
  container.appendChild(message);

  const buttons = document.createElement("div");
  buttons.className = "quiz-end-buttons";

  const tryAgain = document.createElement("button");
  tryAgain.type = "button";
  tryAgain.className = "btn-primary mode-btn";
  tryAgain.textContent = "Try Again";
  tryAgain.addEventListener("click", () => renderQuiz());
  buttons.appendChild(tryAgain);

  const home = document.createElement("button");
  home.type = "button";
  home.className = "btn-secondary mode-btn";
  home.textContent = "Home";
  home.addEventListener("click", () => renderHome());
  buttons.appendChild(home);

  container.appendChild(buttons);
  screen.appendChild(container);
  showScreen("quiz-end");
}

// ---------- Error screen ----------

function renderError(message) {
  const screen = document.getElementById("error-screen");
  screen.innerHTML = "";

  const container = document.createElement("div");
  container.className = "error-container";

  const heading = document.createElement("h1");
  heading.className = "error-heading";
  heading.textContent = "Something went wrong";
  container.appendChild(heading);

  const msg = document.createElement("p");
  msg.className = "error-message-text";
  msg.textContent = message;
  container.appendChild(msg);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-primary mode-btn";
  btn.textContent = "Reload";
  btn.addEventListener("click", () => window.location.reload());
  container.appendChild(btn);

  screen.appendChild(container);
  showScreen("error");
}

// ---------- Entry point ----------

async function init() {
  buildBrowseScreen();
  buildQuizScreen();

  const result = await loadFamilyData();
  if (!result.ok) {
    renderError(result.message);
    return;
  }
  renderPassword();
}

document.addEventListener("DOMContentLoaded", init);
