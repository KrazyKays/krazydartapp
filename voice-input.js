const voiceToggle = document.querySelector("#voice-toggle");
const voiceStatus = document.querySelector("#voice-status");
const voiceTranscript = document.querySelector("#voice-transcript");
const voiceAlternatives = document.querySelector("#voice-alternatives");
const voicePending = document.querySelector("#voice-pending");
const voiceDartList = document.querySelector("#voice-darts");
const voiceUnparsed = document.querySelector("#voice-unparsed");
const voiceValidate = document.querySelector("#voice-validate");
const voiceCancel = document.querySelector("#voice-cancel");

const VOICE_ERROR_MESSAGES = {
  "not-allowed": "Micro refusé. Autorisez le micro pour ce site dans votre navigateur.",
  "service-not-allowed": "La reconnaissance vocale est refusée par le navigateur.",
  "audio-capture": "Aucun micro détecté.",
  network: "Service de reconnaissance injoignable. Vérifiez votre connexion.",
  "no-speech": "Aucune parole détectée. Réessayez.",
  "language-not-supported": "Le français n’est pas disponible pour la reconnaissance vocale.",
};
const VOICE_TARGET_OPTIONS = [
  ["0", "Raté"],
  ...Array.from({ length: 20 }, (_, index) => [String(index + 1), String(index + 1)]),
  ["25", "Bull 25"],
  ["50", "Bull 50"],
];
const VOICE_MULTIPLIER_OPTIONS = [
  ["1", "Simple"],
  ["2", "Double"],
  ["3", "Triple"],
];
const VOICE_FIXED_TARGETS = new Set(["0", "25", "50"]);

let voiceRecognizer = null;
let voiceListening = false;
let voiceGotResult = false;
let voicePendingState = null;

function setVoiceStatus(text, isWarning = false) {
  voiceStatus.textContent = text;
  voiceStatus.classList.toggle("warning", isWarning);
}

function setVoiceListening(listening) {
  voiceListening = listening;
  voiceToggle.textContent = listening ? "■ Arrêter" : "🎙 Parler";
  voiceToggle.setAttribute("aria-pressed", String(listening));
}

function voiceDartLabel(dart) {
  if (dart.target === "0") return "Raté";
  if (dart.target === "25") return "Bull 25";
  if (dart.target === "50") return "Bull 50";
  return `${dart.multiplier === 2 ? "Double" : dart.multiplier === 3 ? "Triple" : "Simple"} ${dart.target}`;
}

function selectControl(options, value, onChange, disabled = false) {
  const select = document.createElement("select");
  select.className = "control voice-select";
  for (const [optionValue, label] of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = label;
    select.append(option);
  }
  select.value = value;
  select.disabled = disabled;
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

function voiceDartRow(dart, index) {
  const row = document.createElement("li");
  row.className = dart.valid ? "voice-dart" : "voice-dart is-invalid";

  const label = document.createElement("span");
  label.className = "voice-dart-label";
  label.textContent = dart.valid ? voiceDartLabel(dart) : `Invalide : ${dart.reason}`;

  const fixed = VOICE_FIXED_TARGETS.has(dart.target);
  const targetSelect = selectControl(VOICE_TARGET_OPTIONS, dart.target, (value) => {
    dart.target = value;
    if (VOICE_FIXED_TARGETS.has(value)) dart.multiplier = 1;
    dart.valid = true;
    dart.reason = "";
    renderVoicePending();
  });
  targetSelect.setAttribute("aria-label", `Cible de la fléchette ${index + 1}`);

  const multiplierSelect = selectControl(VOICE_MULTIPLIER_OPTIONS, String(dart.multiplier), (value) => {
    dart.multiplier = Number(value);
    dart.valid = true;
    dart.reason = "";
    renderVoicePending();
  }, fixed);
  multiplierSelect.setAttribute("aria-label", `Multiplicateur de la fléchette ${index + 1}`);

  const remove = document.createElement("button");
  remove.className = "remove-player";
  remove.type = "button";
  remove.textContent = "×";
  remove.setAttribute("aria-label", `Retirer la fléchette ${index + 1}`);
  remove.addEventListener("click", () => {
    voicePendingState.darts.splice(index, 1);
    renderVoicePending();
  });

  row.append(label, targetSelect, multiplierSelect, remove);
  return row;
}

function renderVoicePending() {
  if (!voicePendingState) {
    voicePending.hidden = true;
    return;
  }
  const { darts, unparsed } = voicePendingState;
  const capacity = game ? 3 - game.dartsInVisit : 0;
  const allValid = darts.length > 0 && darts.every((dart) => dart.valid);
  const fits = darts.length <= capacity;

  voicePending.hidden = false;
  voiceDartList.replaceChildren(...darts.map(voiceDartRow));
  const messages = [];
  if (darts.length === 0) messages.push("Aucune fléchette reconnue.");
  if (unparsed.length > 0) messages.push(`Mots non compris : ${unparsed.join(", ")}.`);
  if (!fits) messages.push(`Il reste ${capacity} fléchette${capacity > 1 ? "s" : ""} dans cette volée ; l’annonce en contient ${darts.length}.`);
  voiceUnparsed.textContent = messages.join(" ");
  voiceValidate.disabled = !allValid || !fits;
}

function setVoicePending(parsed, snapshot) {
  voicePendingState = {
    darts: parsed.darts.map((dart) => ({ ...dart })),
    unparsed: parsed.unparsed,
    snapshot,
  };
  renderVoicePending();
}

function renderVoiceAlternatives(candidates, selectedText) {
  voiceAlternatives.replaceChildren();
  for (const candidate of candidates) {
    if (candidate.text === selectedText) continue;
    const button = document.createElement("button");
    button.className = "voice-alternative";
    button.type = "button";
    button.textContent = candidate.text;
    button.addEventListener("click", () => chooseVoiceAlternative(candidate.text, candidates));
    voiceAlternatives.append(button);
  }
}

function chooseVoiceAlternative(text, candidates) {
  voiceTranscript.textContent = text;
  setVoicePending(parseAnnouncement(text), voicePendingState.snapshot);
  renderVoiceAlternatives(candidates, text);
}

function handleVoiceResult({ alternatives, isFinal }) {
  if (!isFinal) {
    voiceTranscript.textContent = alternatives[0] || "";
    return;
  }
  voiceGotResult = true;
  const candidates = alternatives.map((text) => ({ text, parsed: parseAnnouncement(text) }));
  const best = candidates.find((candidate) => candidate.parsed.darts.length > 0 && candidate.parsed.darts.every((dart) => dart.valid))
    || candidates[0];
  const snapshot = { playerId: activePlayer().id, round: game.round };

  voiceTranscript.textContent = best.text;
  setVoicePending(best.parsed, snapshot);
  renderVoiceAlternatives(candidates.map(({ text }) => ({ text })), best.text);
  setVoiceStatus("Vérifiez l’annonce avant de l’enregistrer.");
}

function handleVoiceError(code) {
  setVoiceListening(false);
  if (code === "aborted") return;
  setVoiceStatus(VOICE_ERROR_MESSAGES[code] || `Erreur de reconnaissance vocale (${code}).`, true);
}

function handleVoiceEnd() {
  setVoiceListening(false);
  if (!voiceGotResult && voiceStatus.textContent === "Je vous écoute…") {
    setVoiceStatus("Rien compris. Réessayez.", true);
  }
}

function toggleVoice() {
  if (voiceListening) {
    voiceRecognizer.stop();
    return;
  }
  if (!game) return;
  if (!voiceRecognizer) {
    voiceRecognizer = createVoiceRecognizer({
      onResult: handleVoiceResult,
      onError: handleVoiceError,
      onEnd: handleVoiceEnd,
    });
  }
  voiceGotResult = false;
  voiceTranscript.textContent = "";
  voiceAlternatives.replaceChildren();
  try {
    voiceRecognizer.start();
  } catch (error) {
    setVoiceStatus("Impossible de démarrer la reconnaissance vocale. Réessayez.", true);
    return;
  }
  setVoiceListening(true);
  setVoiceStatus("Je vous écoute…");
}

function validateVoiceAnnouncement() {
  if (!voicePendingState) return;
  const result = applyVoiceDarts(voicePendingState.darts, voicePendingState.snapshot);
  voicePendingState = null;
  voiceTranscript.textContent = "";
  voiceAlternatives.replaceChildren();
  renderVoicePending();

  if (result.stale) {
    setVoiceStatus("Le tour a changé : annonce ignorée.", true);
  } else if (result.remaining.length > 0) {
    setVoiceStatus(`${result.applied} fléchette${result.applied > 1 ? "s" : ""} enregistrée${result.applied > 1 ? "s" : ""}. ${result.remaining.length} non appliquée${result.remaining.length > 1 ? "s" : ""} : volée ou partie terminée.`, true);
  } else {
    setVoiceStatus(`${result.applied} fléchette${result.applied > 1 ? "s" : ""} enregistrée${result.applied > 1 ? "s" : ""}.`);
  }
}

function cancelVoiceAnnouncement() {
  voicePendingState = null;
  voiceTranscript.textContent = "";
  voiceAlternatives.replaceChildren();
  renderVoicePending();
  setVoiceStatus("Annonce annulée.");
}

voiceToggle.addEventListener("click", toggleVoice);
voiceValidate.addEventListener("click", validateVoiceAnnouncement);
voiceCancel.addEventListener("click", cancelVoiceAnnouncement);

if (!isSpeechRecognitionSupported()) {
  voiceToggle.disabled = true;
  setVoiceStatus("Saisie vocale indisponible dans ce navigateur. Utilisez la saisie manuelle.", true);
}
