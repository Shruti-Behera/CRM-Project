/* Browser speech-to-text (Chrome/Edge). Returns the recogniser so the caller
   can stop it; onResult streams the running transcript, onEnd fires on finish. */
export function dictate(onResult, onEnd) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { onEnd?.(null, 'unsupported'); return null; }
  const r = new SR();
  r.lang = 'en-IN';
  r.interimResults = true;
  r.continuous = true;
  let finalText = '';
  r.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t + ' '; else interim += t;
    }
    onResult((finalText + interim).trim());
  };
  r.onerror = (e) => onEnd?.(finalText.trim(), e.error);
  r.onend = () => onEnd?.(finalText.trim());
  try { r.start(); } catch { /* already started */ }
  return r;
}

export const speechSupported = () =>
  !!(typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition));
