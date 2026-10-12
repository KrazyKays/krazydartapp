const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createGame,
  registerDart,
  finishVisit,
  setMultiplier,
  setGame,
  getGame,
  clearHistory,
  undo,
  buildResultRows,
} = require("./app.js");

function setupTestGame(options = {}) {
  clearHistory();
  const game = createGame(
    options.mode || "301",
    options.players || ["Alice", "Bob"],
    {
      doubleIn: options.doubleIn ?? false,
      doubleOut: options.doubleOut ?? true,
    },
  );
  if (options.initialScore !== undefined) {
    for (const p of game.players) {
      p.score = options.initialScore;
    }
  }
  setGame(game);
  setMultiplier(options.multiplier || 1);
  return game;
}

test("Double Out activé : un lancer amenant le score à 1 déclenche un bust immédiat", () => {
  const game = setupTestGame({ initialScore: 20, doubleOut: true });
  const player = game.players[0];

  // Alice a 20 points et lance un 19 simple -> reste 1 point
  setMultiplier(1);
  registerDart("19");

  // La volée doit être annulée et le score remis au début de la volée (20)
  assert.equal(player.score, 20, "Le score doit être réinitialisé à 20 après le bust");
  assert.equal(player.stats.busts, 1, "Le compteur de busts doit être incrémenté de 1");
  assert.equal(player.stats.overshoots, 0, "Un reste de 1 n'est pas un dépassement sous 0");
  assert.equal(player.lastVisit.busted, true, "La dernière volée doit être marquée comme busted");
  assert.equal(player.lastVisit.score, 0, "Le score de la volée annulée doit être 0");

  // Message et log
  assert.match(game.message, /Score restant de 1 impossible avec double out/);
  assert.equal(game.messageType, "warning");
  assert.match(game.log[0].text, /reste 1 pt \(double out\)/);

  // Le tour doit passer au joueur suivant (Bob)
  assert.equal(game.currentPlayer, 1, "Le tour doit passer au joueur suivant");
  assert.equal(game.dartsInVisit, 0, "Le nombre de fléchettes en cours doit être réinitialisé");
});

test("Double Out désactivé : un lancer amenant le score à 1 ne bust pas et permet de finir sur 1", () => {
  const game = setupTestGame({ initialScore: 20, doubleOut: false });
  const player = game.players[0];

  // Alice a 20 points et lance un 19 simple -> reste 1 point
  setMultiplier(1);
  registerDart("19");

  // Pas de bust : le score doit être 1
  assert.equal(player.score, 1, "Le score doit être 1 sans Double Out");
  assert.equal(player.stats.busts, 0, "Aucun bust ne doit être compté");
  assert.equal(game.currentPlayer, 0, "Alice doit continuer son tour");
  assert.equal(game.dartsInVisit, 1, "Alice a lancé 1 fléchette dans sa volée");

  // Alice lance un 1 simple -> 0 point -> Victoire sans double requis
  registerDart("1");
  assert.equal(player.score, 0);
  assert.equal(game.winner, player.id, "Alice doit remporter la partie");
});

test("Double Out activé : finir sur un double valide la victoire", () => {
  const game = setupTestGame({ initialScore: 40, doubleOut: true });
  const player = game.players[0];

  // Alice a 40 points et lance Double 20 (40 points)
  setMultiplier(2);
  registerDart("20");

  assert.equal(player.score, 0);
  assert.equal(game.winner, player.id, "Alice doit remporter la partie sur un double");
  assert.equal(player.stats.checkouts, 1);
});

test("Double Out activé : finir à 0 sans double déclenche un bust 'sortie sans double'", () => {
  const game = setupTestGame({ initialScore: 20, doubleOut: true });
  const player = game.players[0];

  // Alice a 20 points et lance un simple 20 (20 points sans double) -> score = 0
  setMultiplier(1);
  registerDart("20");

  assert.equal(player.score, 20, "Le score doit revenir à 20");
  assert.equal(player.stats.busts, 1);
  assert.equal(player.stats.overshoots, 0);
  assert.match(game.message, /Il faut finir sur un double/);
  assert.match(game.log[0].text, /sortie sans double/);
  assert.equal(game.currentPlayer, 1, "Le tour doit passer au joueur suivant");
});

test("Dépassement (< 0) déclenche un bust avec overshoots incrémenté", () => {
  const game = setupTestGame({ initialScore: 10, doubleOut: true });
  const player = game.players[0];

  // Alice a 10 points et tire Bull 25 -> score = -15
  registerDart("25");

  assert.equal(player.score, 10, "Le score doit revenir à 10");
  assert.equal(player.stats.busts, 1);
  assert.equal(player.stats.overshoots, 1, "Le dépassement sous 0 doit être compté");
  assert.match(game.message, /Dépassement !/);
  assert.match(game.log[0].text, /dépassement/);
});

test("Annulation (undo) restaure l'état exact avant le bust à 1", () => {
  const game = setupTestGame({ initialScore: 20, doubleOut: true });
  const player = game.players[0];

  // Lancer menant à 1
  setMultiplier(1);
  registerDart("19");
  assert.equal(player.score, 20);
  assert.equal(game.currentPlayer, 1);

  // Annuler le lancer
  undo();
  const restoredGame = getGame();
  const restoredPlayer = restoredGame.players[0];

  assert.equal(restoredGame.currentPlayer, 0, "Le joueur actif doit à nouveau être Alice");
  assert.equal(restoredPlayer.score, 20, "Le score d'Alice doit être 20");
  assert.equal(restoredPlayer.stats.busts, 0, "Le bust annulé ne doit plus être comptabilisé");
  assert.equal(restoredGame.dartsInVisit, 0, "Les fléchettes en cours doivent être remises à zéro");
});

test("Bust à 1 sur la 3ème fléchette annule l'ensemble des points marqués pendant la volée", () => {
  const game = setupTestGame({ initialScore: 50, doubleOut: true });
  const player = game.players[0];

  // Fléchette 1 : Simple 20 (score passe à 30)
  setMultiplier(1);
  registerDart("20");
  assert.equal(player.score, 30);
  assert.equal(game.dartsInVisit, 1);

  // Fléchette 2 : Simple 9 (score passe à 21)
  registerDart("9");
  assert.equal(player.score, 21);
  assert.equal(game.dartsInVisit, 2);

  // Fléchette 3 : Simple 20 (score passerait à 1 -> BUST)
  registerDart("20");

  // Toute la volée doit être annulée : retour au score initial (50)
  assert.equal(player.score, 50, "Le score doit être revenu à 50");
  assert.equal(player.stats.busts, 1);
  assert.equal(player.lastVisit.score, 0);
  assert.equal(player.lastVisit.darts.length, 3);
  assert.deepEqual(player.lastVisit.darts, ["20", "9", "20"]);
  assert.equal(game.currentPlayer, 1, "Le tour doit passer à Bob");
});

test("Bull 25 laissant un score de 1 déclenche un bust en Double Out", () => {
  const game = setupTestGame({ initialScore: 26, doubleOut: true });
  const player = game.players[0];

  // Alice a 26 points et tire Bull 25 -> score 1 -> Bust
  registerDart("25");

  assert.equal(player.score, 26);
  assert.equal(player.stats.busts, 1);
  assert.match(game.message, /Score restant de 1 impossible avec double out/);
});

test("Bull 50 laissant un score de 1 déclenche un bust en Double Out", () => {
  const game = setupTestGame({ initialScore: 51, doubleOut: true });
  const player = game.players[0];

  // Alice a 51 points et tire Bull 50 -> score 1 -> Bust
  registerDart("50");

  assert.equal(player.score, 51);
  assert.equal(player.stats.busts, 1);
  assert.match(game.message, /Score restant de 1 impossible avec double out/);
});

test("Score de 2 avec Simple 1 déclenche un bust en Double Out", () => {
  const game = setupTestGame({ initialScore: 2, doubleOut: true });
  const player = game.players[0];

  // Alice a 2 points et tire 1 simple -> score 1 -> Bust
  setMultiplier(1);
  registerDart("1");

  assert.equal(player.score, 2);
  assert.equal(player.stats.busts, 1);
  assert.match(game.message, /Score restant de 1 impossible avec double out/);
});

test("Score de 3 avec Double 1 déclenche un bust en Double Out", () => {
  const game = setupTestGame({ initialScore: 3, doubleOut: true });
  const player = game.players[0];

  // Alice a 3 points et tire Double 1 (2 points) -> score 1 -> Bust
  setMultiplier(2);
  registerDart("1");

  assert.equal(player.score, 3);
  assert.equal(player.stats.busts, 1);
  assert.match(game.message, /Score restant de 1 impossible avec double out/);
});

test("Rotation correcte de plusieurs joueurs après bust sur score 1", () => {
  const game = setupTestGame({
    initialScore: 20,
    players: ["Alice", "Bob", "Charlie"],
    doubleOut: true,
  });

  // Alice bust sur 1
  setMultiplier(1);
  registerDart("19");
  assert.equal(game.currentPlayer, 1, "Tour de Bob");

  // Bob joue normalement une fléchette
  registerDart("10");
  assert.equal(game.currentPlayer, 1, "Toujours le tour de Bob");

  // Bob bust sur 1 (avait 20, tire 10 puis 9 -> reste 1)
  registerDart("9");
  assert.equal(game.currentPlayer, 2, "Tour de Charlie");
  assert.equal(game.players[1].score, 20, "Le score de Bob revient à 20");
});

test("En solo, le joueur conserve la main après une volée et le numéro de tour progresse", () => {
  const game = setupTestGame({ players: ["Alice"], initialScore: 301 });

  registerDart("1");
  registerDart("2");
  registerDart("3");

  assert.equal(game.currentPlayer, 0);
  assert.equal(game.round, 2);
  assert.equal(game.players[0].score, 295);

  registerDart("5");
  finishVisit();

  assert.equal(game.currentPlayer, 0);
  assert.equal(game.round, 3);
  assert.equal(game.players[0].score, 290);

  undo();
  const restoredGame = getGame();
  assert.equal(restoredGame.currentPlayer, 0);
  assert.equal(restoredGame.round, 2);
  assert.equal(restoredGame.players[0].score, 290);
  assert.equal(restoredGame.dartsInVisit, 1);
});

test("En solo, un bust annule la volée et permet au joueur de rejouer", () => {
  const game = setupTestGame({
    players: ["Alice"],
    initialScore: 20,
    doubleOut: true,
  });

  registerDart("19");

  assert.equal(game.players[0].score, 20);
  assert.equal(game.players[0].stats.busts, 1);
  assert.equal(game.currentPlayer, 0);
  assert.equal(game.round, 2);
  assert.equal(game.dartsInVisit, 0);
});

test("Double In activé : un joueur non-ouvert ne peut pas décrémenter son score", () => {
  const game = setupTestGame({
    initialScore: 20,
    doubleIn: true,
    doubleOut: true,
  });
  const player = game.players[0];

  assert.equal(player.opened, false);

  // Tire un Simple 19 -> pas un double, donc n'ouvre pas
  setMultiplier(1);
  registerDart("19");

  assert.equal(player.score, 20, "Le score ne doit pas bouger");
  assert.equal(player.opened, false, "Le joueur n'est toujours pas ouvert");
  assert.equal(player.stats.busts, 0, "Pas de bust");

  // Tire Double 10 -> double valide, ouvre et checkout immédiat (20 pts)
  setMultiplier(2);
  registerDart("10");

  assert.equal(player.opened, true);
  assert.equal(player.score, 0);
  assert.equal(game.winner, player.id, "Alice remporte la partie");
});

test("Chaque volée est enregistrée avec son tour, ses points et le score restant", () => {
  const game = setupTestGame({ initialScore: 301, doubleOut: false });

  setMultiplier(1);
  registerDart("20");
  registerDart("20");
  registerDart("20");

  assert.deepEqual(game.players[0].visits, [{ round: 1, points: 60, score: 241, busted: false }]);
});

test("Une volée annulée est enregistrée sans points et avec le score d'avant la volée", () => {
  const game = setupTestGame({ initialScore: 20, doubleOut: true });

  setMultiplier(1);
  registerDart("19");

  assert.deepEqual(game.players[0].visits, [{ round: 1, points: 0, score: 20, busted: true }]);
});

test("Le multiplicateur revient sur Simple après un double ou un triple", () => {
  const game = setupTestGame({ players: ["Alice"], initialScore: 301, doubleOut: false });
  const player = game.players[0];

  setMultiplier(2);
  registerDart("10");
  assert.equal(player.score, 281, "Double 10 compte 20 points");

  registerDart("10");
  assert.equal(player.score, 271, "La fléchette suivante est un simple");

  setMultiplier(3);
  registerDart("10");
  assert.equal(player.score, 241, "Triple 10 compte 30 points");

  registerDart("10");
  assert.equal(player.score, 231, "Après un triple, la fléchette suivante est un simple");
});

test("La moyenne par volée compte toutes les volées, annulées incluses", () => {
  const game = setupTestGame({ players: ["Alice"], initialScore: 301, doubleOut: false });

  setMultiplier(1);
  registerDart("20");
  registerDart("20");
  registerDart("20");
  registerDart("1");
  finishVisit();

  const [row] = buildResultRows(game);
  assert.equal(row.visits, 2);
  assert.equal(row.average, 30.5);
});

test("Le classement suit l'ordre d'arrivée des joueurs terminés, puis le score restant croissant", () => {
  const game = setupTestGame({ players: ["Alice", "Bob", "Charlie"], initialScore: 301 });
  game.players[0].score = 0;
  game.players[0].finishedPosition = 1;
  game.players[1].score = 120;
  game.players[2].score = 45;
  game.winner = game.players[0].id;

  const rows = buildResultRows(game);
  assert.deepEqual(rows.map((row) => row.name), ["Alice", "Charlie", "Bob"]);
  assert.deepEqual(rows.map((row) => row.rank), [1, 2, 3]);
  assert.equal(rows[2].average, null, "Un joueur sans volée n'a pas de moyenne");
});

test("Après une victoire, la partie continue avec les autres joueurs", () => {
  const game = setupTestGame({ players: ["Alice", "Bob", "Charlie"], initialScore: 20, doubleOut: true });

  setMultiplier(2);
  registerDart("10");
  assert.equal(game.winner, game.players[0].id, "Alice est la première à finir");
  assert.equal(game.players[0].finishedPosition, 1);
  assert.equal(game.currentPlayer, 1, "Bob joue après la victoire d'Alice");

  setMultiplier(2);
  registerDart("10");
  assert.equal(game.players[1].finishedPosition, 2);
  assert.equal(game.currentPlayer, 2, "Charlie joue encore");

  setMultiplier(2);
  registerDart("10");
  assert.equal(game.players[2].finishedPosition, 3);
  assert.deepEqual(buildResultRows(game).map((row) => row.name), ["Alice", "Bob", "Charlie"]);

  registerDart("1");
  assert.equal(game.players[2].stats.darts, 1, "Plus aucun lancer n'est enregistré une fois la partie terminée");
});

