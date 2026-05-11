// ---------- Hardcoded data (replaced by fetched data in session 4) ----------

const config = {
  familyName: "The Frist Family Reunion 2026",
  ancestor: "eleanor-frist",
  password: "frist2026"
};

const people = [
  {
    id: "eleanor-frist",
    name: "Eleanor Frist",
    photo: "https://placecats.com/300/300",
    birthday: "1935-03-12",
    funFact: "Taught herself to play piano at age 60.",
    syncedAt: null,
    family: {
      grandparents: [], grandparentsRaw: [],
      parents: [], parentsRaw: [],
      siblings: ["george-frist"], siblingsRaw: ["George Frist"],
      spouses: [], spousesRaw: [],
      children: ["robert-frist", "carol-frist"], childrenRaw: ["Robert Frist", "Carol Frist"]
    }
  },
  {
    id: "robert-frist",
    name: "Robert Frist",
    photo: "https://placecats.com/301/300",
    birthday: "1962-07-04",
    funFact: "Has visited every US national park.",
    syncedAt: null,
    family: {
      grandparents: [], grandparentsRaw: [],
      parents: ["eleanor-frist"], parentsRaw: ["Eleanor Frist"],
      siblings: ["carol-frist"], siblingsRaw: ["Carol Frist"],
      spouses: ["diane-frist"], spousesRaw: ["Diane Frist"],
      children: ["mike-frist", "sarah-frist"], childrenRaw: ["Mike Frist", "Sarah Frist"]
    }
  },
  {
    id: "carol-frist",
    name: "Carol Frist",
    photo: "https://placecats.com/302/300",
    birthday: "1965-11-20",
    funFact: "Makes the best apple pie in three counties.",
    syncedAt: null,
    family: {
      grandparents: [], grandparentsRaw: [],
      parents: ["eleanor-frist"], parentsRaw: ["Eleanor Frist"],
      siblings: ["robert-frist"], siblingsRaw: ["Robert Frist"],
      spouses: [], spousesRaw: [],
      children: ["jake-frist"], childrenRaw: ["Jake Frist"]
    }
  },
  {
    id: "diane-frist",
    name: "Diane Frist",
    photo: "https://placecats.com/303/300",
    birthday: "1964-04-29",
    funFact: "Ran a marathon in every decade of her life.",
    syncedAt: null,
    family: {
      grandparents: [], grandparentsRaw: [],
      parents: [], parentsRaw: [],
      siblings: [], siblingsRaw: [],
      spouses: ["robert-frist"], spousesRaw: ["Robert Frist"],
      children: ["mike-frist", "sarah-frist"], childrenRaw: ["Mike Frist", "Sarah Frist"]
    }
  },
  {
    id: "mike-frist",
    name: "Mike Frist",
    photo: "https://placecats.com/304/300",
    birthday: "1990-08-15",
    funFact: "Once ate 12 tacos in a single sitting.",
    syncedAt: null,
    family: {
      grandparents: ["eleanor-frist"], grandparentsRaw: ["Eleanor Frist"],
      parents: ["robert-frist", "diane-frist"], parentsRaw: ["Robert Frist", "Diane Frist"],
      siblings: ["sarah-frist"], siblingsRaw: ["Sarah Frist"],
      spouses: [], spousesRaw: [],
      children: [], childrenRaw: []
    }
  },
  {
    id: "sarah-frist",
    name: "Sarah Frist",
    photo: "https://placecats.com/305/300",
    birthday: "1993-12-01",
    funFact: "Speaks four languages fluently.",
    syncedAt: null,
    family: {
      grandparents: ["eleanor-frist"], grandparentsRaw: ["Eleanor Frist"],
      parents: ["robert-frist", "diane-frist"], parentsRaw: ["Robert Frist", "Diane Frist"],
      siblings: ["mike-frist"], siblingsRaw: ["Mike Frist"],
      spouses: [], spousesRaw: [],
      children: [], childrenRaw: []
    }
  },
  {
    id: "jake-frist",
    name: "Jake Frist",
    photo: "https://placecats.com/306/300",
    birthday: "1992-05-30",
    funFact: "Built his own sailing boat from scratch.",
    syncedAt: null,
    family: {
      grandparents: ["eleanor-frist"], grandparentsRaw: ["Eleanor Frist"],
      parents: ["carol-frist"], parentsRaw: ["Carol Frist"],
      siblings: [], siblingsRaw: [],
      spouses: [], spousesRaw: [],
      children: [], childrenRaw: []
    }
  },
  {
    id: "george-frist",
    name: "George Frist",
    photo: "https://placecats.com/307/300",
    birthday: "1938-09-08",
    funFact: "Played semi-professional baseball in the 1950s.",
    syncedAt: null,
    family: {
      grandparents: [], grandparentsRaw: [],
      parents: [], parentsRaw: [],
      siblings: ["eleanor-frist"], siblingsRaw: ["Eleanor Frist"],
      spouses: [], spousesRaw: [],
      children: [], childrenRaw: []
    }
  }
];

// ---------- State ----------

const state = {
  deck: [],
  index: 0,
  animating: false
};

// ---------- Utilities ----------

function getPersonById(id) {
  return people.find(p => p.id === id);
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
  const ancestor = getPersonById(config.ancestor);
  const others = people.filter(p => p.id !== config.ancestor);
  return [ancestor, ...shuffle(others)];
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

// ---------- Screen routing ----------
// Function-per-screen pattern. One persistent container per screen;
// showScreen() toggles which is visible.

function showScreen(name) {
  document.querySelectorAll(".screen").forEach(el => el.classList.remove("active"));
  const target = document.getElementById(`${name}-screen`);
  if (target) target.classList.add("active");
}

// ---------- Password screen ----------

function buildPasswordScreen() {
  const screen = document.getElementById("password-screen");
  screen.innerHTML = "";

  const container = document.createElement("div");
  container.className = "password-container";

  const heading = document.createElement("h1");
  heading.className = "family-name";
  heading.textContent = config.familyName;
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

  form.addEventListener("submit", e => {
    e.preventDefault();
    const attempt = input.value;
    if (attempt === config.password) {
      input.value = "";
      error.textContent = "";
      renderHome();
    } else {
      error.textContent = "Incorrect password — try again";
      input.classList.remove("shake");
      // Force reflow so the animation re-triggers on consecutive wrong attempts.
      void input.offsetWidth;
      input.classList.add("shake");
      input.value = "";
      input.focus();
    }
  });
}

function renderPassword() {
  showScreen("password");
  const input = document.getElementById("password-input");
  const error = document.getElementById("password-error");
  if (input) {
    input.value = "";
    input.classList.remove("shake");
  }
  if (error) error.textContent = "";
  // Defer focus so the transition has a chance to start; iOS Safari sometimes
  // ignores focus() on a hidden element.
  setTimeout(() => input && input.focus(), 50);
}

// ---------- Home screen ----------

function buildHomeScreen() {
  const screen = document.getElementById("home-screen");
  screen.innerHTML = "";

  const container = document.createElement("div");
  container.className = "home-container";

  const heading = document.createElement("h1");
  heading.className = "family-name home-title";
  heading.textContent = config.familyName;
  container.appendChild(heading);

  const ancestor = getPersonById(config.ancestor);

  const feature = document.createElement("button");
  feature.type = "button";
  feature.className = "ancestor-feature";
  feature.setAttribute("aria-label", `Open ${ancestor.name}'s card`);

  const photo = document.createElement("img");
  photo.className = "ancestor-photo";
  photo.src = ancestor.photo;
  photo.alt = ancestor.name;
  feature.appendChild(photo);

  const ancestorName = document.createElement("div");
  ancestorName.className = "ancestor-name";
  ancestorName.textContent = ancestor.name;
  feature.appendChild(ancestorName);

  feature.addEventListener("click", () => renderBrowse());
  container.appendChild(feature);

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
}

function renderHome() {
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

// ---------- Card rendering ----------

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

  // Photo
  const photo = document.createElement("div");
  photo.className = "card-photo";
  const img = document.createElement("img");
  img.src = person.photo;
  img.alt = person.name;
  photo.appendChild(img);
  card.appendChild(photo);

  // Info
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

// ---------- Navigation ----------

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
  // Force layout so the initial transform applies before we transition.
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
  // Safety fallback in case transitionend doesn't fire.
  setTimeout(() => {
    if (state.animating) cleanup();
  }, 500);
}

// ---------- Swipe ----------

function attachSwipe(el) {
  if (typeof Hammer === "undefined") return;
  const mc = new Hammer.Manager(el);
  mc.add(new Hammer.Swipe({ direction: Hammer.DIRECTION_HORIZONTAL }));
  mc.on("swipeleft", goNext);
  mc.on("swiperight", goPrev);
}

// ---------- Quiz screen ----------

const quizState = {
  questions: [],
  index: 0,
  score: 0,
  locked: false,
  pendingTimeout: null
};

function generateQuiz() {
  const order = shuffle(people);
  return order.map(person => {
    const others = people.filter(p => p.id !== person.id);
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
  img.src = q.person.photo;
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

function buildQuizEndScreen() {
  const screen = document.getElementById("quiz-end-screen");
  screen.innerHTML = "";

  const container = document.createElement("div");
  container.className = "quiz-end-container";

  const score = document.createElement("div");
  score.className = "quiz-end-score";
  score.id = "quiz-end-score";
  container.appendChild(score);

  const message = document.createElement("p");
  message.className = "quiz-end-message";
  message.id = "quiz-end-message";
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
}

function renderQuizEnd() {
  const total = quizState.questions.length;
  const score = quizState.score;
  document.getElementById("quiz-end-score").textContent = `${score} / ${total}`;

  let msg;
  if (score >= 7) msg = "Great job!";
  else if (score >= 4) msg = "Nice work!";
  else msg = "Keep practicing!";
  document.getElementById("quiz-end-message").textContent = msg;

  showScreen("quiz-end");
}

// ---------- Entry point ----------

function init() {
  buildPasswordScreen();
  buildHomeScreen();
  buildBrowseScreen();
  buildQuizScreen();
  buildQuizEndScreen();
  renderPassword();
}

document.addEventListener("DOMContentLoaded", init);
