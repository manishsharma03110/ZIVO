// Voice typing (speech-to-text) controller built on the browser SpeechRecognition API.
// Framework-free so it can be unit-tested; app/page.js wires it to React state.
//
// Key behaviours (these fix the "voice typing does not work" reports):
//  * Final and interim results are tracked separately from ev.resultIndex, so words are never duplicated
//    (a well-known problem with continuous mode on Android Chrome).
//  * Mobile browsers use single-utterance mode and are restarted automatically while the mic is on,
//    because they stop by themselves after a short pause.
//  * Every failure (blocked mic, no network to the speech service, no microphone, unsupported language,
//    unsupported browser) shows a clear message instead of failing silently.
//  * Sending a message cancels dictation immediately, so late results can never refill the cleared box.
//  * Switching language restarts cleanly with no timing race.

const MOBILE = /Android|iPhone|iPad|iPod/i;

export function createVoiceTyping({ getText, setText, onState, onToast, onBusy, onActivity, canStart, win, nav, maxLen = 2000 }) {
  const W = win || (typeof window !== 'undefined' ? window : {});
  const N = nav || (typeof navigator !== 'undefined' ? navigator : {});
  const SR = () => W.SpeechRecognition || W.webkitSpeechRecognition;

  let cur = null;          // active recognition instance
  let want = false;        // the user wants the mic on
  let lang = 'hi-IN';
  let base = '';           // text that was already in the box when dictation started
  let finals = '';         // confirmed speech from this dictation
  let silent = 0;          // consecutive sessions with no speech
  let quick = 0;           // consecutive sessions that ended almost immediately
  let timer = null;

  const isMobile = () => MOBILE.test(N.userAgent || '') || (N.platform === 'MacIntel' && N.maxTouchPoints > 1);
  const clip = (s) => Array.from(s).slice(0, maxLen).join('');
  const join = (a, b) => (a && b && !/\s$/.test(a) && !/^\s/.test(b) ? a + ' ' : a) + b;
  const setRec = (v) => { onState && onState(v); onBusy && onBusy(v); };
  const toast = (m) => onToast && onToast(m);

  function detach(r) {
    if (!r) return;
    r.onresult = r.onerror = r.onend = r.onstart = null;
  }

  function rebase() {
    const t = (getText() || '').replace(/\s+$/, '');
    base = t ? t + ' ' : '';
    finals = '';
  }

  function fail(msg) {
    want = false;
    clearTimeout(timer);
    if (cur) { const r = cur; cur = null; detach(r); try { r.abort(); } catch {} }
    setRec(false);
    if (msg) toast(msg);
  }

  function spawn() {
    const Ctor = SR();
    const r = new Ctor();
    const t0 = Date.now();
    let heard = false;
    r.lang = lang;
    r.interimResults = true;
    r.continuous = !isMobile();
    r.maxAlternatives = 1;

    r.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const seg = res[0] ? res[0].transcript : '';
        if (res.isFinal) finals = join(finals, seg.trim()); else interim += seg;
      }
      heard = true; silent = 0; quick = 0;
      setText(clip(join(join(base, finals), interim.trim())));
      onActivity && onActivity();
    };

    r.onerror = (ev) => {
      const e = ev && ev.error;
      if (e === 'not-allowed' || e === 'service-not-allowed') fail('Please allow microphone access in your browser settings.');
      else if (e === 'audio-capture') fail('No microphone was found.');
      else if (e === 'network') fail('Could not reach the speech service. Please check your internet connection (some browsers, such as Brave, block voice typing).');
      else if (e === 'language-not-supported') fail('This language is not supported for voice typing on your device.');
      else if (e === 'no-speech') silent++;
      // 'aborted' is expected when we stop/switch on purpose
    };

    r.onend = () => {
      if (cur !== r) return;      // an old instance finishing after we replaced it
      cur = null;
      if (!want) { setRec(false); return; }
      if (!heard && Date.now() - t0 < 1500) quick++;
      if (silent >= 2) return fail("I couldn't hear anything. Tap the mic and try again.");
      if (quick >= 4) return fail('Voice typing could not start. Please try again.');
      timer = setTimeout(() => { if (want && !cur) { try { spawn(); } catch { fail('Voice typing could not start. Please try again.'); } } }, 250);
    };

    cur = r;
    r.start();
  }

  return {
    get lang() { return lang; },
    get active() { return want; },

    start() {
      if (cur || want) return;
      if (!SR()) return toast('Voice typing is not supported in this browser. Please use Chrome, Edge or Safari.');
      if (W.isSecureContext === false) return toast('Voice typing needs a secure (HTTPS) connection.');
      const why = canStart && canStart();
      if (why) return toast(why);
      want = true; silent = 0; quick = 0;
      rebase();
      setRec(true);
      onActivity && onActivity();
      try { spawn(); } catch { fail('Voice typing could not start. Please try again.'); }
    },

    // Graceful stop: the browser delivers the last words, then ends.
    stop() {
      want = false;
      clearTimeout(timer);
      if (cur) { try { cur.stop(); } catch { setRec(false); } } else setRec(false);
    },

    // Hard stop: no further results will reach the text box (used when a message is sent or the page closes).
    halt() {
      want = false;
      clearTimeout(timer);
      if (cur) { const r = cur; cur = null; detach(r); try { r.abort(); } catch {} }
      setRec(false);
    },

    swap() {
      lang = lang === 'hi-IN' ? 'en-IN' : 'hi-IN';
      if (want) {
        clearTimeout(timer);
        if (cur) { const r = cur; cur = null; detach(r); try { r.abort(); } catch {} }
        rebase(); silent = 0; quick = 0;
        try { spawn(); } catch { fail('Voice typing could not start. Please try again.'); }
      }
      return lang;
    },

    // Call when the user edits the box by hand while dictating, so their edit is kept.
    rebase() { if (want) rebase(); },
  };
}
