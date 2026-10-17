// Voice input for the search box and the chat: the browser's built-in Web Speech API
// (SpeechRecognition), no key and no paid service. Bangla (bn-BD) by default, English (en-US) on
// the language button. The words land in the same text box and are sent through the same form,
// so the spoken trip goes through exactly the same parser and engine as a typed one.
// Unsupported browser (Firefox, some in-app webviews): the mic says so and typing keeps working.
import { $, store } from './util.js';

const Rec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
const LANGS = { 'bn-BD': { label: 'বাং', name: 'Bangla' }, 'en-US': { label: 'EN', name: 'English' } };
let lang = LANGS[store('dp-voice-lang')] ? store('dp-voice-lang') : 'bn-BD';
let active = null;                                   // the one recognition running (one mic at a time)

const ERR = {
  'not-allowed': 'Microphone permission is blocked. Allow the mic for this site, or type instead.',
  'service-not-allowed': 'This browser does not allow speech recognition here. Type instead.',
  'no-speech': "Didn't hear anything. Tap the mic and speak again.",
  'audio-capture': 'No microphone found.',
  network: 'The speech service needs an internet connection. Type instead.',
  'language-not-supported': 'This browser cannot recognise that language; switch to the other one.',
};

export const voiceSupported = () => !!Rec;

function attach(form, input) {
  const send = form.querySelector('button[type=submit]');
  const wrap = document.createElement('span'); wrap.className = 'voice';
  wrap.innerHTML = `<button type="button" class="ghost mic" aria-label="Speak your trip" title="${Rec ? 'Speak your trip (browser speech recognition)' : 'Voice input is not supported in this browser'}" aria-pressed="false">🎤</button><button type="button" class="ghost vlang" aria-label="Voice language"></button>`;
  form.insertBefore(wrap, send);
  const status = document.createElement('div'); status.className = 'voice-status muted small'; status.setAttribute('aria-live', 'polite'); status.hidden = true;
  form.insertAdjacentElement('afterend', status);
  const mic = wrap.querySelector('.mic'), lb = wrap.querySelector('.vlang');
  const say = (t, kind = '') => { status.textContent = t; status.className = `voice-status small ${kind || 'muted'}`; status.hidden = !t; };
  const paintLang = () => { lb.textContent = LANGS[lang].label; lb.title = `Voice language: ${LANGS[lang].name} (tap to switch)`; lb.setAttribute('aria-label', `Voice language ${LANGS[lang].name}, tap to switch`); };
  paintLang();
  lb.onclick = () => { lang = lang === 'bn-BD' ? 'en-US' : 'bn-BD'; store('dp-voice-lang', lang); document.querySelectorAll('.vlang').forEach((b) => { b.textContent = LANGS[lang].label; b.title = `Voice language: ${LANGS[lang].name} (tap to switch)`; }); paintLang(); };
  if (!Rec) { mic.setAttribute('aria-disabled', 'true'); mic.classList.add('off'); mic.onclick = () => say('Voice input is not supported in this browser (it works in Chrome, Edge and Safari). Type your trip instead.', 'warn'); return; }

  const stop = () => { if (active && active.form === form) active.rec.abort(); };
  mic.onclick = () => {
    if (active && active.form === form) { active.rec.stop(); return; }    // second tap: finish now
    if (active) active.rec.abort();
    const rec = new Rec();
    rec.lang = lang; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
    const before = input.value, placeholder = input.placeholder;
    let finalText = '', failed = false;
    const timer = setTimeout(() => rec.stop(), 10000);                     // never leave the mic open
    active = { rec, form };
    mic.setAttribute('aria-pressed', 'true'); mic.classList.add('listening');
    input.placeholder = lang === 'bn-BD' ? 'শুনছি… (যেমন: মিরপুর থেকে মতিঝিল, ছাত্র)' : 'Listening… (e.g. Mirpur to Motijheel, student)';
    say(`Listening in ${LANGS[lang].name}… tap 🎤 again to finish.`);
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) finalText += t; else interim += t; }
      input.value = (finalText + interim).trim();
    };
    rec.onerror = (e) => { failed = true; if (e.error !== 'aborted') say(ERR[e.error] || `Voice input stopped (${e.error}). Type instead.`, 'warn'); };
    rec.onend = () => {
      clearTimeout(timer); active = null;
      mic.setAttribute('aria-pressed', 'false'); mic.classList.remove('listening'); input.placeholder = placeholder;
      const text = finalText.trim();
      if (text) { input.value = text; say(`Heard: “${text}”`); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })); }
      else { if (!input.value.trim()) input.value = before; if (!failed) say("Didn't catch that. Tap the mic and speak again.", 'warn'); }
    };
    try { rec.start(); } catch (err) { active = null; clearTimeout(timer); mic.setAttribute('aria-pressed', 'false'); mic.classList.remove('listening'); input.placeholder = placeholder; say('Could not start the microphone. Type instead.', 'warn'); }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') stop(); });
}

export function initVoice() {
  const nl = $('#nl-form'), chat = $('#chat-form');
  if (nl) attach(nl, $('#nl-in'));
  if (chat) attach(chat, $('#chat-in'));
}
