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

// ---------- Screen renderers ----------
// Function-per-screen pattern. Session 2 adds renderPassword + renderHome content.

function renderPassword() {
  // Placeholder for session 2.
}

function renderHome() {
  // Placeholder for session 2.
}

function renderBrowse() {
  const app = document.getElementById("app");
  app.innerHTML = "";

  const screen = document.createElement("div");
  screen.className = "screen browse";

  const indicator = document.createElement("div");
  indicator.className = "position-indicator";
  screen.appendChild(indicator);

  const viewport = document.createElement("div");
  viewport.className = "card-viewport";
  screen.appendChild(viewport);

  app.appendChild(screen);

  mountCard(viewport, indicator);
  attachSwipe(viewport);
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

// ---------- Entry point ----------

function init() {
  state.deck = buildDeck();
  state.index = 0;
  // Session 2 will route through renderPassword/renderHome first.
  renderBrowse();
}

document.addEventListener("DOMContentLoaded", init);
