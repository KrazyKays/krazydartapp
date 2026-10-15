const VOICE_LANG = "fr-FR";

function isSpeechRecognitionSupported() {
  return typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function createVoiceRecognizer({ onResult, onError, onEnd }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new Recognition();
  recognition.lang = VOICE_LANG;
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;

  recognition.onresult = (event) => {
    let alternatives = null;
    let isFinal = false;
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      alternatives = Array.from(result, (alternative) => alternative.transcript.trim());
      isFinal = result.isFinal;
    }
    if (alternatives) onResult({ alternatives, isFinal });
  };
  recognition.onerror = (event) => onError(event.error);
  recognition.onend = () => onEnd();

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
  };
}
