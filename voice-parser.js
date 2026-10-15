const VOICE_MULTIPLIER_WORDS = {
  double: 2,
  triple: 3,
  tripe: 3,
  triplet: 3,
};

const VOICE_NUMBER_WORDS = {
  zero: 0,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
  vingt: 20,
  cinquante: 50,
};

const VOICE_TEENS = { sept: 17, huit: 18, neuf: 19 };
const VOICE_BULL_WORDS = new Set(["bull", "boule", "bulle", "bul"]);
const VOICE_MISS_WORDS = new Set(["rate"]);
const VOICE_FILLER_WORDS = new Set(["et", "puis", "a", "au", "le", "la", "les", "de", "du", "dans", "fleche", "fleches", "point", "points"]);
const VOICE_BOUNDARY = "|";

function normalizeAnnouncement(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[,;.!?]/g, ` ${VOICE_BOUNDARY} `)
    .replace(/[-'’:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeVoiceDart(value, multiplier) {
  if (value === 0) return { target: "0", multiplier: 1, valid: true, reason: "" };
  if (value === 25 || value === 50) {
    if (multiplier === 3) return { target: String(value), multiplier: 1, valid: false, reason: "triple bull n’existe pas" };
    if (value === 25 && multiplier === 2) return { target: "50", multiplier: 1, valid: true, reason: "" };
    return { target: String(value), multiplier: 1, valid: true, reason: "" };
  }
  if (value >= 1 && value <= 20) return { target: String(value), multiplier, valid: true, reason: "" };
  return { target: String(value), multiplier, valid: false, reason: `cible ${value} inexistante` };
}

function parseAnnouncement(text) {
  const tokens = normalizeAnnouncement(text).split(" ").filter(Boolean);
  const darts = [];
  const unparsed = [];
  let multiplier = 1;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];

    if (token === VOICE_BOUNDARY) continue;
    if (VOICE_MULTIPLIER_WORDS[token]) {
      multiplier = VOICE_MULTIPLIER_WORDS[token];
      continue;
    }
    if (VOICE_FILLER_WORDS.has(token)) continue;

    if (VOICE_BULL_WORDS.has(token)) {
      darts.push(makeVoiceDart(25, multiplier));
      multiplier = 1;
      continue;
    }
    if (VOICE_MISS_WORDS.has(token)) {
      darts.push(makeVoiceDart(0, 1));
      multiplier = 1;
      continue;
    }

    let value = null;
    let consumed = 1;
    if (/^\d+$/.test(token)) {
      value = Number(token);
    } else if (token === "dix" && VOICE_TEENS[next]) {
      value = VOICE_TEENS[next];
      consumed = 2;
    } else if (token === "vingt" && next === "cinq" && multiplier === 1) {
      value = 25;
      consumed = 2;
    } else if (token in VOICE_NUMBER_WORDS) {
      value = VOICE_NUMBER_WORDS[token];
    }

    if (value === null) {
      unparsed.push(token);
      continue;
    }
    index += consumed - 1;
    darts.push(makeVoiceDart(value, multiplier));
    multiplier = 1;
  }

  if (multiplier !== 1) unparsed.push("multiplicateur sans cible");
  return { darts, unparsed };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseAnnouncement, normalizeAnnouncement };
}
