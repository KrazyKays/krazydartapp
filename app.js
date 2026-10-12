const setupScreen = typeof document !== "undefined" ? document.querySelector("#setup-screen") : null;
const gameScreen = typeof document !== "undefined" ? document.querySelector("#game-screen") : null;
const resultScreen = typeof document !== "undefined" ? document.querySelector("#result-screen") : null;
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
let resultViewOpen = false;

const CURVE_COLORS = ["#55d6ff", "#ff966d", "#b99cff", "#9be37a", "#ffd166", "#ff7aa2", "#7fb3ff", "#e6f28b"];

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
      finishedPosition: null,
      lastVisit: null,
      visits: [],
      stats: {
        darts: 0,
        misses: 0,
        hits: 0,
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

function isGameOver(state) {
  return state.players.every((player) => player.finishedPosition !== null);
}

function nextActiveIndex(state) {
  const count = state.players.length;
  for (let step = 1; step <= count; step += 1) {
    const index = (state.currentPlayer + step) % count;
    if (state.players[index].finishedPosition === null) return index;
  }
  return state.currentPlayer;
}

function placeLabel(position) {
  return position === 1 ? "1re" : `${position}e`;
}

function recordVisit(player, points, busted = false) {
  player.lastVisit = {
    score: points,
    darts: [...game.visitDarts],
    busted,
  };
  player.visits.push({ round: game.round, points, score: player.score, busted });
  player.stats.bestVisit = Math.max(player.stats.bestVisit, points);
  if (points >= 100) player.stats.centuryVisits += 1;
}

function endVisit(message = "", messageType = "") {
  game.dartsInVisit = 0;
  game.visitStartScore = null;
  game.visitStartOpen = null;
  game.visitScore = 0;
  game.visitDarts = [];
  if (!isGameOver(game)) {
    const next = nextActiveIndex(game);
    if (next <= game.currentPlayer) game.round += 1;
    game.currentPlayer = next;
  }
  game.message = message;
  game.messageType = messageType;
}

function registerDart(target) {
  if (!game || isGameOver(game)) return;
  const sector = Number(target);
  const isBull = sector === 25 || sector === 50;
  const points = isBull ? sector : sector * selectedMultiplier;
  const isDouble = sector === 50 || (selectedMultiplier === 2 && sector !== 0 && !isBull);
  selectedMultiplier = 1;
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
    player.finishedPosition = game.players.filter((other) => other.finishedPosition !== null).length + 1;
    if (!game.winner) game.winner = player.id;
    addLog(`${player.name} termine (${points} pts${isDouble ? ", double" : ""})`, wasScore);
    endVisit(`${player.name} termine à la ${placeLabel(player.finishedPosition)} place !`, "");
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
  if (!game || isGameOver(game) || game.dartsInVisit === 0) return;
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
    card.className = `player-score-card${index === game.currentPlayer ? " active" : ""}`;
    const details = document.createElement("div");
    const name = document.createElement("div");
    name.className = "score-player-name";
    if (index === game.currentPlayer) {
      const dot = document.createElement("span");
      dot.className = "online-dot";
      name.append(dot);
    }
    const label = document.createElement("span");
    label.textContent = player.name;
    name.append(label);
    const subtitle = document.createElement("div");
    subtitle.className = "score-sub";
    subtitle.textContent = player.finishedPosition !== null
      ? `Terminé · ${placeLabel(player.finishedPosition)} place`
      : player.opened ? "En jeu" : "En attente d’un double";
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
    if (index === game.currentPlayer) return;

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

function modeLabel() {
  const rules = [game.doubleIn ? "DOUBLE IN" : "", game.doubleOut ? "DOUBLE OUT" : ""]
    .filter(Boolean)
    .join(" · ") || "CLASSIQUE";
  return `${game.mode} · ${rules}`;
}

function pluralVolees(count) {
  return `${count} volée${count > 1 ? "s" : ""}`;
}

function averagePerVisit(player) {
  if (player.visits.length === 0) return null;
  const total = player.visits.reduce((sum, visit) => sum + visit.points, 0);
  return total / player.visits.length;
}

function formatAverage(value) {
  return value === null ? "—" : value.toFixed(1).replace(".", ",");
}

function rankedPlayers(state) {
  return [...state.players].sort((a, b) => {
    if (a.finishedPosition === null && b.finishedPosition === null) return a.score - b.score;
    if (a.finishedPosition === null) return 1;
    if (b.finishedPosition === null) return -1;
    return a.finishedPosition - b.finishedPosition;
  });
}

function buildResultRows(game) {
  return rankedPlayers(game).map((player, index) => ({
    rank: index + 1,
    name: player.name,
    color: CURVE_COLORS[game.players.indexOf(player) % CURVE_COLORS.length],
    visits: player.visits.length,
    average: averagePerVisit(player),
    best: player.stats.bestVisit,
    busts: player.stats.busts,
  }));
}

function strokeCancelledMarker(context, x, y) {
  const size = 6;
  for (const [style, width] of [["#0d1620", 6], ["#ff4d5e", 2.5]]) {
    context.strokeStyle = style;
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(x - size, y - size);
    context.lineTo(x + size, y + size);
    context.moveTo(x + size, y - size);
    context.lineTo(x - size, y + size);
    context.stroke();
  }
}

function drawFinishMarker(context, x, y, color, label, rightEdge) {
  context.beginPath();
  context.arc(x, y, 8, 0, Math.PI * 2);
  context.fillStyle = "#0d1620";
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = color;
  context.stroke();

  const alignRight = x > rightEdge - 40;
  context.font = "700 20px Segoe UI, sans-serif";
  context.textAlign = alignRight ? "right" : "left";
  context.textBaseline = "middle";
  context.fillStyle = color;
  context.fillText(label, x + (alignRight ? -14 : 14), y - 14);
}

function drawScoreCurve(context, box, game) {
  const start = Number(game.mode);
  const lastRound = Math.max(game.round, 1);
  const left = box.x + 56;
  const top = box.y + 16;
  const width = box.width - 72;
  const height = box.height - 50;
  const xFor = (round) => left + (round / lastRound) * width;
  const yFor = (score) => top + (1 - score / start) * height;

  context.font = "500 20px Segoe UI, sans-serif";
  context.textBaseline = "middle";
  context.textAlign = "right";
  context.fillStyle = "#71869a";
  context.strokeStyle = "rgba(255, 255, 255, 0.1)";
  context.lineWidth = 1;
  for (const score of [0, Math.round(start / 2), start]) {
    context.beginPath();
    context.moveTo(left, yFor(score));
    context.lineTo(left + width, yFor(score));
    context.stroke();
    context.fillText(String(score), left - 10, yFor(score));
  }

  context.textBaseline = "top";
  context.textAlign = "left";
  context.fillText("Départ", left, top + height + 12);
  context.textAlign = "right";
  context.fillText(`Tour ${lastRound}`, left + width, top + height + 12);

  for (const player of rankedPlayers(game).reverse()) {
    const color = CURVE_COLORS[game.players.indexOf(player) % CURVE_COLORS.length];
    const isFinished = player.finishedPosition !== null;
    let previousY = yFor(start);
    context.strokeStyle = color;
    context.lineWidth = 3;
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(xFor(0), previousY);
    for (const visit of player.visits) {
      const x = xFor(visit.round);
      context.lineTo(x, previousY);
      previousY = yFor(visit.score);
      context.lineTo(x, previousY);
    }
    if (!isFinished) context.lineTo(xFor(lastRound), previousY);
    context.stroke();

    for (const visit of player.visits) {
      if (visit.busted) strokeCancelledMarker(context, xFor(visit.round), yFor(visit.score));
    }

    if (isFinished) {
      const finishRound = player.visits.at(-1).round;
      drawFinishMarker(context, xFor(finishRound), yFor(0), color, placeLabel(player.finishedPosition), left + width);
    } else {
      context.fillStyle = color;
      context.beginPath();
      context.arc(xFor(lastRound), previousY, 6, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function createResultImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Impossible de créer l’image du résultat.");

  const winner = game.players.find((player) => player.id === game.winner);
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#0b1018");
  gradient.addColorStop(1, "#14283a");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.textAlign = "left";
  context.fillStyle = "#55d6ff";
  context.font = "800 26px Segoe UI, sans-serif";
  context.fillText("KDA  /  KRAZY DART APP", 72, 88);
  context.fillStyle = "#95a9bb";
  context.font = "500 22px Segoe UI, sans-serif";
  context.fillText(modeLabel(), 72, 136);
  context.fillStyle = "#eff7ff";
  context.font = "800 64px Segoe UI, sans-serif";
  context.fillText(winner.name, 72, 230, 936);
  context.fillStyle = "#55d6ff";
  context.font = "700 32px Segoe UI, sans-serif";
  context.fillText(`gagne en ${pluralVolees(winner.visits.length)}`, 72, 288);

  const headers = [
    ["#", 72, "left"],
    ["Joueur", 146, "left"],
    ["Volées", 610, "center"],
    ["Moy./volée", 730, "center"],
    ["Meilleure", 850, "center"],
    ["Annulées", 990, "center"],
  ];
  context.font = "600 20px Segoe UI, sans-serif";
  context.fillStyle = "#71869a";
  for (const [label, x, align] of headers) {
    context.textAlign = align;
    context.fillText(label, x, 352);
  }

  const rowTop = 376;
  const rowHeight = 64;
  const rows = buildResultRows(game);
  rows.forEach((row, index) => {
    const y = rowTop + index * rowHeight;
    if (row.rank === 1) {
      context.fillStyle = "rgba(85, 214, 255, 0.14)";
      context.beginPath();
      context.roundRect(72, y, 936, rowHeight - 8, 10);
      context.fill();
    }
    context.fillStyle = row.color;
    context.beginPath();
    context.arc(124, y + (rowHeight - 8) / 2, 7, 0, Math.PI * 2);
    context.fill();

    const values = [
      String(row.rank),
      row.name,
      String(row.visits),
      formatAverage(row.average),
      String(row.best),
      String(row.busts),
    ];
    context.font = "600 22px Segoe UI, sans-serif";
    context.fillStyle = "#eff7ff";
    headers.forEach(([, x, align], column) => {
      context.textAlign = align;
      context.fillText(values[column], x, y + 36, column === 1 ? 360 : 200);
    });
  });

  const curveTop = rowTop + rows.length * rowHeight + 24;
  const curveBox = { x: 72, y: curveTop, width: 936, height: 1250 - curveTop };
  context.fillStyle = "rgba(255, 255, 255, 0.04)";
  context.beginPath();
  context.roundRect(curveBox.x, curveBox.y, curveBox.width, curveBox.height, 12);
  context.fill();
  drawScoreCurve(
    context,
    { x: curveBox.x + 24, y: curveBox.y + 24, width: curveBox.width - 48, height: curveBox.height - 48 },
    game,
  );

  context.textAlign = "center";
  context.fillStyle = "#71869a";
  context.font = "500 18px Segoe UI, sans-serif";
  context.fillText("KRAZY DART APP  ·  BON JEU !", 540, 1310);
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
  const message = document.querySelector("#result-message");
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

function renderResult() {
  const winner = game.players.find((player) => player.id === game.winner);
  const isOver = isGameOver(game);
  document.querySelector("#result-eyebrow").textContent = `${isOver ? "PARTIE TERMINÉE" : "PARTIE EN COURS"} · ${modeLabel()}`;
  document.querySelector("#result-title").textContent = winner
    ? `${winner.name} gagne en ${pluralVolees(winner.visits.length)}`
    : "Classement provisoire";
  document.querySelector("#share-button").hidden = !isOver;
  document.querySelector("#replay-button").hidden = !isOver;
  document.querySelector("#resume-game-button").hidden = isOver;
  document.querySelector("#result-rows").replaceChildren(...buildResultRows(game).map(resultRowElement));

  const canvas = document.querySelector("#score-curve");
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawScoreCurve(context, { x: 0, y: 0, width: canvas.width, height: canvas.height }, game);
}

function resultRowElement(row) {
  const tr = document.createElement("tr");
  if (row.rank === 1) tr.className = "is-winner";
  const name = document.createElement("td");
  const swatch = document.createElement("span");
  swatch.className = "swatch";
  swatch.style.background = row.color;
  name.append(swatch, row.name);
  tr.append(
    resultCell(String(row.rank)),
    name,
    resultCell(String(row.visits)),
    resultCell(formatAverage(row.average)),
    resultCell(String(row.best)),
    resultCell(String(row.busts)),
  );
  return tr;
}

function resultCell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

function renderGame() {
  if (!game || typeof document === "undefined") return;
  const showResult = isGameOver(game) || resultViewOpen;
  gameScreen.hidden = showResult;
  resultScreen.hidden = !showResult;
  if (showResult) {
    renderResult();
    return;
  }

  const current = activePlayer();
  document.querySelector("#game-mode-label").textContent = `MODE ${game.mode}`;
  document.querySelector("#game-title").textContent = game.mode;
  document.querySelector("#turn-label").textContent = `Au tour de ${current.name}`;
  document.querySelector("#round-label").textContent = `TOUR ${game.round}`;
  document.querySelector("#active-player-name").textContent = current.name;
  document.querySelector("#darts-left").textContent = `${3 - game.dartsInVisit} FLÉCHETTE${3 - game.dartsInVisit > 1 ? "S" : ""}`;
  document.querySelector("#game-message").textContent = game.message;
  document.querySelector("#game-message").classList.toggle("warning", game.messageType === "warning");
  setMultiplier(selectedMultiplier);
  document.querySelector("#undo-button").disabled = history.length === 0;
  document.querySelector("#end-turn-button").disabled = game.dartsInVisit === 0;

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

function showSetup() {
  game = null;
  history.length = 0;
  resultViewOpen = false;
  setupScreen.hidden = false;
  gameScreen.hidden = true;
  resultScreen.hidden = true;
}

function replay() {
  const names = game.players.map((player) => player.name);
  history.length = 0;
  resultViewOpen = false;
  game = createGame(game.mode, names, { doubleIn: game.doubleIn, doubleOut: game.doubleOut });
  setMultiplier(1);
  renderGame();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function undoMove() {
  if (history.length === 0) return;
  game = history.pop();
  resultViewOpen = false;
  renderGame();
}

function startGame(event) {
  event.preventDefault();
  const names = [...playerList.querySelectorAll("input")]
    .map((input, index) => input.value.trim() || `Joueur ${index + 1}`);
  if (names.length < 1 || names.length > 8) return;

  history.length = 0;
  resultViewOpen = false;
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
  document.querySelector("#show-result-button").addEventListener("click", () => {
    resultViewOpen = true;
    renderGame();
  });
  document.querySelector("#resume-game-button").addEventListener("click", () => {
    resultViewOpen = false;
    renderGame();
  });
  document.querySelector("#back-button").addEventListener("click", showSetup);
  document.querySelector("#new-game-button").addEventListener("click", showSetup);
  document.querySelector("#undo-button").addEventListener("click", undoMove);
  document.querySelector("#result-undo-button").addEventListener("click", undoMove);
  document.querySelector("#replay-button").addEventListener("click", replay);
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
    buildResultRows,
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
    undo: undoMove,
  };
}
