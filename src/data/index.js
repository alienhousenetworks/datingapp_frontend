// ── API CONFIG ────────────────────────────────────────────────────────────────
export const BASE_URL = 
  (typeof process !== "undefined" && process.env ? process.env.REACT_APP_API_V1_URL : null) ||
  (typeof import.meta !== "undefined" && import.meta.env ? import.meta.env.VITE_API_V1_URL : null) ||
  "https://testapi.spycenow.com/api/v1";

export const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("access_token")}`,
});

// ── MOCK PROFILES ─────────────────────────────────────────────────────────────
export const PROFILES = [
  {
    id: "1",
    letter: "R",
    name: "Rohan",
    age: 24,
    city: "Location not detected",
    sub: "IIT Bombay · he/him",
    distance: "1.4 km",
    gradient: "linear-gradient(160deg,#2a0a1a 0%,#4B1528 55%,#72243E 100%)",
    tags: [
      ["dry texter", "pink"],
      ["f1 fanatic", "gold"],
      ["night owl", "teal"],
      ["memer", "gray"],
    ],
    prompts: [
      [
        "Hot take I'll go to war for —",
        "Talking for 3 weeks and 'what are we' still hits different every time.",
      ],
      [
        "Red flag or green flag —",
        "Texting back in under 10 mins. green. obviously.",
      ],
    ],
  },
  {
    id: "2",
    letter: "A",
    name: "Arjun",
    age: 26,
    city: "Delhi",
    sub: "DU grad · he/him",
    distance: "3.2 km",
    gradient: "linear-gradient(160deg,#0a1a2a 0%,#124B3B 55%,#1A7260 100%)",
    tags: [
      ["gym rat", "gold"],
      ["introvert", "gray"],
      ["foodie", "teal"],
      ["night owl", "pink"],
    ],
    prompts: [
      ["Unpopular opinion —", "Sunday morning chai > Friday night party."],
      ["My type of person —", "Reads books and argues about them."],
    ],
  },
  {
    id: "3",
    letter: "S",
    name: "Samarth",
    age: 23,
    city: "Bangalore",
    sub: "SDE @ startup · he/him",
    distance: "0.8 km",
    gradient: "linear-gradient(160deg,#1a1a0a 0%,#3B3B12 55%,#5C5A1A 100%)",
    tags: [
      ["memer", "pink"],
      ["coder", "gold"],
      ["gamer", "gray"],
      ["night owl", "teal"],
    ],
    prompts: [
      ["Peak comfort is —", "3am, dark room, lo-fi, and a blank editor."],
      ["Will instantly vibe if —", "You have takes about anything."],
    ],
  },
  {
    id: "4",
    letter: "K",
    name: "Karan",
    age: 25,
    city: "Hyderabad",
    sub: "Designer · he/him",
    distance: "2.1 km",
    gradient: "linear-gradient(160deg,#1a0a2a 0%,#3B1260 55%,#5A1A8C 100%)",
    tags: [
      ["early riser", "teal"],
      ["minimalist", "gray"],
      ["coffee snob", "gold"],
      ["soft launch", "pink"],
    ],
    prompts: [
      ["Deal breaker for me —", "Bad taste in fonts. non-negotiable."],
      ["I will always —", "Reply with a meme when I don't know what to say."],
    ],
  },
];

// ── MOCK MATCHES / CONVOS ─────────────────────────────────────────────────────
export const MATCHES = [
  {
    id: "m1",
    letter: "N",
    name: "Nisha",
    color: "rgba(255,31,107,0.15)",
    textColor: "var(--pink-soft)",
    lastMsg: "okay the talking stage needs to die 💀",
    time: "2m",
    badge: 3,
    messages: [
      {
        from: "them",
        text: "okay the talking stage really needs to be illegal",
      },
      { from: "mine", text: "fr, 3 weeks and then 'i need space' is criminal" },
      { from: "them", text: "at least ghost me faster lmao save us both time" },
      { from: "mine", text: "honestly same energy every time 💀" },
    ],
  },
  {
    id: "m2",
    letter: "A",
    name: "Arya",
    color: "rgba(0,212,170,0.12)",
    textColor: "var(--teal)",
    lastMsg: "lol same energy honestly",
    time: "1h",
    badge: null,
    messages: [
      { from: "them", text: "wait you watch F1 too??" },
      { from: "mine", text: "obviously. since 2018. you?" },
      { from: "them", text: "lol same energy honestly" },
    ],
  },
  {
    id: "m3",
    letter: "M",
    name: "Meera",
    color: "rgba(245,184,0,0.12)",
    textColor: "var(--gold)",
    lastMsg: "wait you watch F1 too??",
    time: "4h",
    badge: null,
    messages: [{ from: "them", text: "wait you watch F1 too??" }],
  },
];

export const NEW_MATCHES = [
  { letter: "N", name: "Nisha" },
  { letter: "P", name: "Priya" },
  { letter: "K", name: "Kavya" },
  { letter: "S", name: "Sneha" },
  { letter: "T", name: "Tara" },
];

// ── VIBE TAGS ─────────────────────────────────────────────────────────────────
export const ALL_VIBES = [
  "dry texter",
  "f1 fanatic",
  "memer",
  "gym rat",
  "early riser",
  "night owl",
  "foodie",
  "introvert",
  "coder",
  "gamer",
  "overthinker",
  "soft launch",
  "coffee snob",
  "bookworm",
  "minimalist",
];
