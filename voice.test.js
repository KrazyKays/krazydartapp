const test = require("node:test");
const assert = require("node:assert/strict");
const { parseAnnouncement } = require("./voice-parser.js");
const { createGame, setGame, clearHistory, applyVoiceDarts, registerDart, getGame } = require("./app.js");

function summarize(text) {
  return parseAnnouncement(text).darts.map((dart) => `${dart.target}x${dart.multiplier}${dart.valid ? "" : "!"}`);
}

function startGame(options = {}) {
  clearHistory();
  const game = createGame("301", ["Alice", "Bob"], { doubleIn: false, doubleOut: options.doubleOut ?? false });
  if (options.score !== undefined) game.players[0].score = options.score;
  setGame(game);
  return game;
}

function snapshotOf(game, playerIndex = game.currentPlayer) {
  return { playerId: game.players[playerIndex].id, round: game.round };
}

test("Annonce française complète : triple vingt, dix-neuf, double douze", () => {
  assert.deepEqual(summarize("triple vingt, dix-neuf, double douze"), ["20x3", "19x1", "12x2"]);
});

test("Chiffres, tirets et variantes homophones sont acceptés", () => {
  assert.deepEqual(summarize("Triple 20, 19, Double 12"), ["20x3", "19x1", "12x2"]);
  assert.deepEqual(summarize("tripe dix huit"), ["18x3"]);
  assert.deepEqual(summarize("tripe dix, huit"), ["10x3", "8x1"]);
  assert.deepEqual(summarize("triplé quinze"), ["15x3"]);
});

test("Bull : simple vaut 25, double vaut 50, triple est refusé", () => {
  assert.deepEqual(summarize("bull"), ["25x1"]);
  assert.deepEqual(summarize("double bull"), ["50x1"]);
  assert.deepEqual(summarize("triple bull"), ["25x1!"]);
  assert.deepEqual(summarize("double 25"), ["50x1"]);
});

test("Raté et cibles inexistantes", () => {
  assert.deepEqual(summarize("rate, zéro"), ["0x1", "0x1"]);
  assert.deepEqual(summarize("rate, 28"), ["0x1", "28x1!"]);
});

test("« vingt cinq » reste un seul bull 25 et « vingt, cinq » reste deux fléchettes", () => {
  assert.deepEqual(summarize("vingt cinq"), ["25x1"]);
  assert.deepEqual(summarize("vingt, cinq"), ["20x1", "5x1"]);
});

test("Mots non compris et multiplicateur sans cible sont signalés", () => {
  const parsed = parseAnnouncement("bonjour 12 double");
  assert.deepEqual(parsed.darts.map((dart) => dart.target), ["12"]);
  assert.deepEqual(parsed.unparsed, ["bonjour", "multiplicateur sans cible"]);
});

test("applyVoiceDarts enregistre une volée complète et passe au joueur suivant", () => {
  const game = startGame();
  const alice = game.players[0];
  const darts = parseAnnouncement("triple vingt, dix-neuf, double douze").darts;

  const result = applyVoiceDarts(darts, snapshotOf(game));

  assert.equal(result.applied, 3);
  assert.equal(result.remaining.length, 0);
  assert.equal(alice.score, 301 - 60 - 19 - 24);
  assert.equal(getGame().currentPlayer, 1);
});

test("applyVoiceDarts s'arrête au bust et renvoie les fléchettes restantes", () => {
  const game = startGame({ doubleOut: true, score: 20 });
  const darts = parseAnnouncement("dix-neuf, cinq, douze").darts;

  const result = applyVoiceDarts(darts, snapshotOf(game));

  assert.equal(result.applied, 1);
  assert.deepEqual(result.remaining.map((dart) => dart.target), ["5", "12"]);
  assert.equal(game.players[0].score, 20);
  assert.equal(game.currentPlayer, 1);
});

test("applyVoiceDarts ne dépasse pas les fléchettes restantes de la volée", () => {
  const game = startGame();
  registerDart("20", 1);
  const darts = parseAnnouncement("1, 2, 3").darts;

  const result = applyVoiceDarts(darts, snapshotOf(game));

  assert.equal(result.applied, 2);
  assert.deepEqual(result.remaining.map((dart) => dart.target), ["3"]);
});

test("applyVoiceDarts ignore une annonce si le tour a changé", () => {
  const game = startGame();
  const darts = parseAnnouncement("vingt").darts;

  const result = applyVoiceDarts(darts, snapshotOf(game, 1));

  assert.equal(result.stale, true);
  assert.equal(result.applied, 0);
  assert.equal(game.players[0].score, 301);
});
