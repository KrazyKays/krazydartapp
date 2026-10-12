const setupScreen = typeof document !== "undefined" ? document.querySelector("#setup-screen") : null;
const gameScreen = typeof document !== "undefined" ? document.querySelector("#game-screen") : null;
const setupForm = typeof document !== "undefined" ? document.querySelector("#setup-form") : null;
const modeSelect = typeof document !== "undefined" ? document.querySelector("#game-mode") : null;
const playerList = typeof document !== "undefined" ? document.querySelector("#player-list") : null;
const playerCount = typeof document !== "undefined" ? document.querySelector("#player-count") : null;
const multiplierButtons = typeof document !== "undefined" ? document.querySelector("#multiplier-buttons") : null;
const dartButtons = typeof document !== "undefined" ? document.querySelector("#dart-buttons") : null;
const history = [];

let game = null;
let nextPlayerId = 1;
let selectedMultiplier = 1;

function createDartButtons() {
  const buttons = Array.from({ length: 21 }, (_, target) => {
    const button = document.createElement("button");
    button.className = `dart-button${target === 0 ? " miss-button" : ""}`;
    button.type = "button";
    button.dataset.target = String(target);
    button.textContent = String(target);
    button.setAttribute("aria-label", target === 0 ? "Raté, 0 point" : `Secteur ${target}`);
    return button;
  });

  for (const [target, label, accessibleLabel] of [
    ["25", "Bull 25", "Bull extérieur, 25 points"],
    ["50", "Bull 50", "Bull intérieur, 50 points, double"],
  ]) {
    const bull = document.createElement("button");
    bull.className = "dart-button bull-button";
    bull.type = "button";
    bull.dataset.target = target;
    bull.textContent = label;
    bull.setAttribute("aria-label", accessibleLabel);
    buttons.push(bull);
  }
  dartButtons.append(...buttons);
}

function setMultiplier(multiplier) {
  selectedMultiplier = multiplier;
  if (!multiplierButtons) return;
  for (const button of multiplierButtons.querySelectorAll("[data-multiplier]")) {
    const isSelected = Number(button.dataset.multiplier) === multiplier;
    button.classList.toggle("active", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
    button.disabled = Boolean(game?.winner);
  }
}

function addPlayerField(name = "") {
  if (playerList.children.length >= 8) return;

  const row = document.createElement("div");
  row.className = "player-row";

  const input = document.createElement("input");
  input.className = "player-input";
  input.type = "text";
  input.maxLength = 24;
  input.autocomplete = "off";
  input.placeholder = `Joueur ${playerList.children.length + 1}`;
  input.setAttribute("aria-label", `Nom du joueur ${playerList.children.length + 1}`);
  input.value = name;

  const remove = document.createElement("button");
  remove.className = "remove-player";
  remove.type = "button";
  remove.textContent = "×";
  remove.setAttribute("aria-label", "Retirer ce joueur");
  remove.addEventListener("click", () => {
    if (playerList.children.length <= 1) return;
    row.remove();
    updatePlayerFields();
  });

  row.append(input, remove);
  playerList.append(row);
  updatePlayerFields();
}

function updatePlayerFields() {
  const rows = [...playerList.querySelectorAll(".player-row")];
  playerCount.textContent = `${rows.length} joueur${rows.length > 1 ? "s" : ""}`;
  rows.forEach((row, index) => {
    const input = row.querySelector("input");
    input.placeholder = `Joueur ${index + 1}`;
    input.setAttribute("aria-label", `Nom du joueur ${index + 1}`);
    row.querySelector("button").disabled = rows.length <= 1;
  });
}

function updateRulesSummary() {
  if (typeof document === "undefined" || !modeSelect) return;
  const startRule = document.querySelector("#double-in").checked
    ? "Il faut d’abord toucher un double pour commencer à marquer."
    : "Chaque fléchette marque dès le premier lancer.";
  const doubleOut = document.querySelector("#double-out").checked;
  const finishRule = doubleOut
    ? "Finissez à exactement 0 avec un double."
    : "Finissez à exactement 0 ; le dernier lancer n’a pas besoin d’être un double.";
  const bustRule = doubleOut
    ? "Un dépassement, un score de 1 ou un 0 sans double annule la volée."
    : "Un dépassement annule la volée.";

  document.querySelector("#rules-summary-text").textContent =
    `Partez de ${modeSelect.value} points et soustrayez le score de chaque fléchette. ${startRule} ${finishRule} ${bustRule} Le score revient au début de la volée. Chaque joueur lance jusqu’à 3 fléchettes par tour.`;
}

function createGame(mode, names, rules) {
  const score = Number(mode);
  return {
    mode,
    players: names.map((name) => ({
      id: nextPlayerId++,
      name,
      score,
      opened: !rules.doubleIn,
      lastVisit: null,
      stats: {
        darts: 0,
        misses: 0,
        hits: 0,
        hitPoints: 0,
        doubles: 0,
        busts: 0,
        overshoots: 0,
        bustDarts: 0,
        bestVisit: 0,
        centuryVisits: 0,
        checkouts: 0,
        checkoutDarts: 0,
        checkoutScore: 0,
      },
    })),
    currentPlayer: 0,
    dartsInVisit: 0,
    visitStartScore: null,
    visitStartOpen: null,
    visitScore: 0,
    visitDarts: [],
    round: 1,
    winner: null,
    doubleIn: rules.doubleIn,
    doubleOut: rules.doubleOut,
    log: [],
    message: "",
    messageType: "",
  };
}

function cloneGame(value) {
  return JSON.parse(JSON.stringify(value));
}

function remember() {
  history.push(cloneGame(game));
}

function addLog(text, score) {
  game.log.unshift({ text, score });
  game.log.length = Math.min(game.log.length, 6);
}

function activePlayer() {
  return game.players[game.currentPlayer];
}

function recordVisit(player, points, busted = false) {
  player.lastVisit = {
    score: points,
    darts: [...game.visitDarts],
    busted,
  };
  player.stats.bestVisit = Math.max(player.stats.bestVisit, points);
  if (points >= 100) player.stats.centuryVisits += 1;
}

function endVisit(message = "", messageType = "") {
  game.dartsInVisit = 0;
  game.visitStartScore = null;
  game.visitStartOpen = null;
  game.visitScore = 0;
  game.visitDarts = [];
  if (!game.winner) {
    game.currentPlayer = (game.currentPlayer + 1) % game.players.length;
    if (game.currentPlayer === 0) game.round += 1;
  }
  game.message = message;
  game.messageType = messageType;
}

function registerDart(target) {
  if (!game || game.winner) return;
  const sector = Number(target);
  const isBull = sector === 25 || sector === 50;
  const points = isBull ? sector : sector * selectedMultiplier;
  const isDouble = sector === 50 || (selectedMultiplier === 2 && sector !== 0 && !isBull);
  remember();
  const player = activePlayer();
  const wasOpen = player.opened;
  const wasScore = player.score;

  if (game.dartsInVisit === 0) {
    game.visitStartScore = player.score;
    game.visitStartOpen = player.opened;
  }

  game.dartsInVisit += 1;
  game.visitDarts.push(
    sector === 0 ? "0"
      : sector === 25 ? "Bull 25"
        : sector === 50 ? "Bull 50"
          : `${selectedMultiplier === 2 ? "D" : selectedMultiplier === 3 ? "T" : ""}${sector}`,
  );
  player.stats.darts += 1;
  if (points === 0) {
    player.stats.misses += 1;
  } else {
    player.stats.hits += 1;
    player.stats.hitPoints += points;
    if (isDouble) player.stats.doubles += 1;
  }

  if (!player.opened && isDouble) player.opened = true;
  if (player.opened) player.score -= points;
  game.visitScore += wasOpen || player.opened ? points : 0;

  const isBust = player.score < 0 || (game.doubleOut && (player.score === 1 || (player.score === 0 && !isDouble)));
  if (isBust) {
    const isOvershoot = player.score < 0;
    const isScoreOne = game.doubleOut && player.score === 1;
    player.stats.busts += 1;
    player.stats.bustDarts += game.dartsInVisit;
    if (isOvershoot) player.stats.overshoots += 1;
    player.score = game.visitStartScore;
    player.opened = game.visitStartOpen;
    recordVisit(player, 0, true);
    addLog(
      `${player.name} — ${
        isOvershoot
          ? "dépassement"
          : isScoreOne
            ? "reste 1 pt (double out)"
            : "sortie sans double"
      }`,
      0,
    );
    endVisit(
      isOvershoot
        ? "Dépassement ! La volée est annulée et le score revient au début du tour."
        : isScoreOne
          ? "Score restant de 1 impossible avec double out. La volée est annulée et le score revient au début du tour."
          : "Il faut finir sur un double. La volée est annulée et le score revient au début du tour.",
      "warning",
    );
    renderGame();
    return;
  }

  if (player.score === 0) {
    player.stats.checkouts += 1;
    player.stats.checkoutDarts = game.dartsInVisit;
    player.stats.checkoutScore = game.visitStartScore;
    recordVisit(player, game.visitStartScore);
    game.winner = player.id;
    addLog(`${player.name} termine (${points} pts${isDouble ? ", double" : ""})`, wasScore);
    game.message = "Partie gagnée !";
    game.messageType = "";
    renderGame();
    return;
  }

  if (game.dartsInVisit === 3) {
    const visitScore = game.visitStartScore - player.score;
    recordVisit(player, visitScore);
    addLog(`${player.name} — volée de 3 fléchettes`, visitScore);
    endVisit();
  } else {
    game.message = points === 0
      ? "Raté : 0 point."
      : `${points} point${points > 1 ? "s" : ""}${isDouble ? " (double)" : ""}.`;
    game.messageType = "";
  }
  renderGame();
}

function finishVisit() {
  if (!game || game.winner || game.dartsInVisit === 0) return;
  remember();
  const player = activePlayer();
  const points = game.visitStartScore - player.score;
  recordVisit(player, points);
  addLog(`${player.name} — volée terminée`, points);
  endVisit("Volée terminée.");
  renderGame();
}

function renderScoreboard() {
  const scoreboard = document.querySelector("#scoreboard");
  scoreboard.replaceChildren();

  const cards = document.createElement("div");
  cards.className = "player-scores";
  for (let index = 0; index < game.players.length; index += 1) {
    const player = game.players[index];
    const card = document.createElement("div");
    card.className = `player-score-card${index === game.currentPlayer && !game.winner ? " active" : ""}`;
    const details = document.createElement("div");
    const name = document.createElement("div");
    name.className = "score-player-name";
    if (index === game.currentPlayer && !game.winner) {
      const dot = document.createElement("span");
      dot.className = "online-dot";
      name.append(dot);
    }
    const label = document.createElement("span");
    label.textContent = player.name;
    name.append(label);
    const subtitle = document.createElement("div");
    subtitle.className = "score-sub";
    subtitle.textContent = player.opened ? "En jeu" : "En attente d’un double";
    const lastVisit = document.createElement("div");
    lastVisit.className = "last-visit";
    const lastVisitLabel = document.createElement("span");
    lastVisitLabel.className = "last-visit-label";
    lastVisitLabel.textContent = "Dernière volée";
    lastVisit.append(lastVisitLabel);
    if (player.lastVisit === null) {
      const emptyVisit = document.createElement("span");
      emptyVisit.className = "last-visit-empty";
      emptyVisit.textContent = "—";
      lastVisit.append(emptyVisit);
    } else {
      const darts = document.createElement("span");
      darts.className = "last-visit-darts";
      for (let dartIndex = 0; dartIndex < player.lastVisit.darts.length; dartIndex += 1) {
        const dart = document.createElement("span");
        dart.className = "last-visit-dart";
        dart.textContent = player.lastVisit.darts[dartIndex];
        dart.setAttribute("aria-label", `Fléchette ${dartIndex + 1} : ${dart.textContent}`);
        darts.append(dart);
      }
      const total = document.createElement("span");
      total.className = "last-visit-total";
      total.textContent = `${player.lastVisit.score} pt${player.lastVisit.score > 1 ? "s" : ""}${player.lastVisit.busted ? " · annulée" : ""}`;
      lastVisit.append(darts, total);
    }
    details.append(name, subtitle, lastVisit);
    const score = document.createElement("strong");
    score.className = "score-value";
    score.textContent = String(player.score);
    card.append(details, score);
    cards.append(card);
  }
  scoreboard.append(cards);
}

function renderActiveTurnSummary() {
  const player = activePlayer();
  document.querySelector("#active-player-score").textContent = String(player.score);

  const darts = document.querySelector("#current-visit-darts");
  darts.replaceChildren();
  for (let index = 0; index < 3; index += 1) {
    const dart = document.createElement("span");
    dart.className = "current-visit-dart";
    dart.textContent = game.visitDarts[index] || "—";
    darts.append(dart);
  }
  const total = document.createElement("strong");
  total.className = "current-visit-total";
  total.textContent = `${game.visitScore} pt${game.visitScore > 1 ? "s" : ""}`;
  darts.append(total);
}

function renderCompactScoreboard() {
  const scoreboard = document.querySelector("#compact-player-list");
  scoreboard.parentElement.hidden = game.players.length <= 1;
  scoreboard.replaceChildren();

  game.players.forEach((player, index) => {
    if (index === game.currentPlayer && !game.winner) return;

    const card = document.createElement("div");
    card.className = "compact-player-card";

    const heading = document.createElement("div");
    heading.className = "compact-player-heading";
    const name = document.createElement("span");
    name.className = "compact-player-name";
    name.textContent = player.name;
    const score = document.createElement("strong");
    score.className = "compact-player-score";
    score.textContent = String(player.score);
    heading.append(name, score);

    const lastVisit = document.createElement("span");
    lastVisit.className = "compact-last-visit";
    if (player.lastVisit === null) {
      lastVisit.textContent = "Pas encore de volée";
    } else {
      const darts = player.lastVisit.darts.join(" · ");
      const result = player.lastVisit.busted ? "Annulée" : `${player.lastVisit.score} pts`;
      lastVisit.textContent = `${darts || "—"} · ${result}`;
    }

    card.append(heading, lastVisit);
    scoreboard.append(card);
  });
}

function createResultImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 900;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Impossible de créer l’image du résultat.");

  const winner = game.players.find((player) => player.id === game.winner);
  const modeLabel = `${game.mode} · ${[
    game.doubleIn ? "DOUBLE IN" : "",
    game.doubleOut ? "DOUBLE OUT" : "",
  ].filter(Boolean).join(" · ") || "CLASSIQUE"}`;
  const gradient = context.createLinearGradient(0, 0, 1200, 900);
  gradient.addColorStop(0, "#0b1018");
  gradient.addColorStop(1, "#14283a");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#55d6ff";
  context.beginPath();
  context.arc(1080, 95, 190, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 0.12;
  context.fillStyle = "#0b1018";
  context.beginPath();
  context.arc(1080, 95, 142, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  context.fillStyle = "#55d6ff";
  context.font = "800 24px Segoe UI, sans-serif";
  context.textAlign = "left";
  context.fillText("KDA  /  KRAZY DART APP", 72, 78);

  context.textAlign = "center";
  context.fillStyle = "#95a9bb";
  context.font = "500 18px Segoe UI, sans-serif";
  context.fillText(modeLabel, 600, 151);
  context.fillStyle = "#eff7ff";
  context.font = "800 54px Segoe UI, sans-serif";
  context.fillText(winner.name, 600, 225, 1000);
  context.fillStyle = "#55d6ff";
  context.font = "700 25px Segoe UI, sans-serif";
  context.fillText("REMPORTE LA PARTIE", 600, 270);

  const columns = game.players.length > 4 ? 2 : 1;
  const rowsPerColumn = Math.ceil(game.players.length / columns);
  const rowHeight = Math.min(110, 400 / rowsPerColumn);
  const gridTop = 354;
  const columnWidth = columns === 1 ? 760 : 480;
  const gridLeft = (1200 - columns * columnWidth - (columns - 1) * 24) / 2;

  game.players.forEach((player, index) => {
    const column = Math.floor(index / rowsPerColumn);
    const row = index % rowsPerColumn;
    const x = gridLeft + column * (columnWidth + 24);
    const y = gridTop + row * (rowHeight + 10);
    const isWinner = player.id === game.winner;
    context.fillStyle = isWinner ? "rgba(85, 214, 255, 0.14)" : "rgba(255, 255, 255, 0.06)";
    context.beginPath();
    context.roundRect(x, y, columnWidth, rowHeight, 10);
    context.fill();

    context.textAlign = "left";
    context.fillStyle = isWinner ? "#55d6ff" : "#eff7ff";
    context.font = "600 18px Segoe UI, sans-serif";
    context.fillText(player.name, x + 18, y + 27, columnWidth - 135);
    context.textAlign = "right";
    context.fillStyle = "#eff7ff";
    context.font = "700 21px Segoe UI, sans-serif";
    context.fillText(String(player.score), x + columnWidth - 18, y + 28);

    const stats = player.stats;
    const average = stats.hits ? (stats.hitPoints / stats.hits).toFixed(1) : "—";
    const firstLine = `Lancers ${stats.darts} · Ratés ${stats.misses} · Dépassements ${stats.overshoots} · Busts ${stats.busts}`;
    const secondLine = `Moy. par touche ${average} · Meilleure volée ${stats.bestVisit} · Volées 100+ ${stats.centuryVisits} · Doubles ${stats.doubles}`;

    context.textAlign = "left";
    context.fillStyle = "#adc0d1";
    context.font = columns === 1 ? "14px Segoe UI, sans-serif" : "12px Segoe UI, sans-serif";
    context.fillText(firstLine, x + 18, y + 52, columnWidth - 36);
    context.fillText(secondLine, x + 18, y + 74, columnWidth - 36);
    if (stats.checkouts) {
      context.fillText(
        `Checkout : ${stats.checkoutDarts} fléchette${stats.checkoutDarts > 1 ? "s" : ""} · ${stats.checkoutScore} points`,
        x + 18,
        y + 94,
        columnWidth - 36,
      );
    }
  });

  context.textAlign = "center";
  context.fillStyle = "#71869a";
  context.font = "500 14px Segoe UI, sans-serif";
  context.fillText("KRAZY DART APP  ·  BON JEU !", 600, 872);
  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Le navigateur n’a pas pu générer l’image."));
    }, "image/png");
  });
}

async function shareResult() {
  const button = document.querySelector("#share-button");
  const message = document.querySelector("#game-message");
  button.disabled = true;
  message.classList.remove("warning");
  message.textContent = "Préparation de l’image…";

  try {
    const canvas = createResultImage();
    const blob = await canvasToBlob(canvas);
    const file = new File([blob], "krazy-dart-app-resultat.png", { type: "image/png" });

    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ title: "Résultat — Krazy Dart App", files: [file] });
      message.textContent = "Image partagée. Bien joué !";
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      message.textContent = "Image téléchargée. Vous pouvez maintenant la partager.";
    }
  } catch (error) {
    if (error.name === "AbortError") {
      message.textContent = "Partage annulé.";
    } else {
      message.textContent = error.message || "Impossible de générer ou partager l’image.";
      message.classList.add("warning");
    }
  } finally {
    button.disabled = false;
  }
}

function renderGame() {
  if (!game || typeof document === "undefined") return;
  const current = activePlayer();
  document.querySelector("#game-mode-label").textContent = `MODE ${game.mode}`;
  document.querySelector("#game-title").textContent = game.mode;
  document.querySelector("#turn-label").textContent = game.winner ? "Partie terminée" : `Au tour de ${current.name}`;
  document.querySelector("#round-label").textContent = `TOUR ${game.round}`;
  document.querySelector("#active-player-name").textContent = game.winner
    ? `${game.players.find((player) => player.id === game.winner).name} a gagné`
    : current.name;
  document.querySelector("#darts-left").textContent = game.winner ? "TERMINÉ" : `${3 - game.dartsInVisit} FLÉCHETTE${3 - game.dartsInVisit > 1 ? "S" : ""}`;
  document.querySelector("#game-message").textContent = game.message;
  document.querySelector("#game-message").classList.toggle("warning", game.messageType === "warning");
  setMultiplier(selectedMultiplier);
  for (const button of dartButtons.querySelectorAll("[data-target]")) {
    button.disabled = Boolean(game.winner);
  }
  document.querySelector("#undo-button").disabled = history.length === 0;
  document.querySelector("#end-turn-button").disabled = Boolean(game.winner || game.dartsInVisit === 0);

  const winnerBanner = document.querySelector("#winner-banner");
  winnerBanner.hidden = !game.winner;
  if (game.winner) winnerBanner.textContent = `🏆 ${game.players.find((player) => player.id === game.winner).name} remporte la partie !`;
  document.querySelector("#share-button").hidden = !game.winner;
  document.querySelector("#share-help").hidden = !game.winner;

  const logList = document.querySelector("#log-list");
  logList.replaceChildren();
  if (game.log.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-log";
    empty.textContent = "Les premières fléchettes n'attendent que vous.";
    logList.append(empty);
  } else {
    for (const entry of game.log) {
      const item = document.createElement("li");
      const text = document.createElement("span");
      const score = document.createElement("strong");
      text.textContent = entry.text;
      score.textContent = typeof entry.score === "number" ? `${entry.score > 0 ? "+" : ""}${entry.score}` : entry.score;
      item.append(text, score);
      logList.append(item);
    }
  }

  renderScoreboard();
  renderActiveTurnSummary();
  renderCompactScoreboard();
}

function startGame(event) {
  event.preventDefault();
  const names = [...playerList.querySelectorAll("input")]
    .map((input, index) => input.value.trim() || `Joueur ${index + 1}`);
  if (names.length < 1 || names.length > 8) return;

  history.length = 0;
  game = createGame(modeSelect.value, names, {
    doubleIn: document.querySelector("#double-in").checked,
    doubleOut: document.querySelector("#double-out").checked,
  });
  setMultiplier(1);
  setupScreen.hidden = true;
  gameScreen.hidden = false;
  renderGame();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

if (typeof document !== "undefined") {
  document.querySelector("#add-player").addEventListener("click", () => addPlayerField());
  document.querySelector("#game-mode").addEventListener("change", updateRulesSummary);
  document.querySelector("#double-in").addEventListener("change", updateRulesSummary);
  document.querySelector("#double-out").addEventListener("change", updateRulesSummary);
  multiplierButtons.addEventListener("click", (event) => {
    const button = event.target.closest("[data-multiplier]");
    if (button && !button.disabled) setMultiplier(Number(button.dataset.multiplier));
  });
  dartButtons.addEventListener("click", (event) => {
    const button = event.target.closest("[data-target]");
    if (button && !button.disabled) registerDart(button.dataset.target);
  });
  document.querySelector("#end-turn-button").addEventListener("click", finishVisit);
  document.querySelector("#back-button").addEventListener("click", () => {
    game = null;
    history.length = 0;
    setupScreen.hidden = false;
    gameScreen.hidden = true;
  });
  document.querySelector("#undo-button").addEventListener("click", () => {
    if (history.length === 0) return;
    game = history.pop();
    renderGame();
  });
  document.querySelector("#share-button").addEventListener("click", shareResult);
  setupForm.addEventListener("submit", startGame);

  addPlayerField("Joueur 1");
  createDartButtons();
  setMultiplier(selectedMultiplier);
  updateRulesSummary();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    createGame,
    cloneGame,
    registerDart,
    finishVisit,
    setMultiplier,
    getGame: () => game,
    setGame: (g) => {
      game = g;
    },
    getHistory: () => history,
    clearHistory: () => {
      history.length = 0;
    },
    undo: () => {
      if (history.length === 0) return;
      game = history.pop();
      renderGame();
    },
  };
}
