// Voice typing (speech-to-text) controller. Framework-free so it can be unit-tested; app/page.js wires it to React.
//
// ROOT CAUSES of the old "works once, then stops / gets stuck / no text" bugs, and what replaces them:
//  1. The old code only cleared its "active" instance inside the browser's `onend` event. Android Chrome and iOS Safari
//     sometimes never fire `onend` after stop()/abort(). `start()` then saw a stale instance and silently returned forever.
//     -> Every session now has an id and a watchdog. If the engine does not end by itself, the session is force-closed,
//        and start() always discards a leftover instance instead of refusing to start.
//  2. Mobile used single-utterance mode with a 250 ms auto-restart loop and "give up after N quiet restarts" counters.
//     That is what produced the beeping, the early stops and the "could not start" failures.
//     -> Hold-to-talk needs no restart loop for the cloud engine at all (MediaRecorder records until released). The browser
//        engine only restarts while the user is still holding, one instance at a time, never in parallel.
//  3. A tap-only toggle with no permission handling. -> press / release / tap logic lives here and permission errors are mapped
//     to clear messages. On the very first use the browser's permission prompt interrupts the press, so nothing is recorded
//     and the user is told to hold the mic again once access has been allowed.
//  4. Only "hi-IN" or "en-IN" could be chosen, so Hindi + English in one sentence could never work.
//     -> Engine "cloud" (recommended): the audio is sent to /api/transcribe (a Vercel route handler holding the API key)
//        and a speech model transcribes mixed Hindi + English in one pass. Engine "browser" is the fallback when no key is set.
//
// States passed to onState: 'idle' | 'starting' | 'recording' | 'processing'.

const MOBILE = /Android|iPhone|iPad|iPod/i;
export const HOLD_MS = 280;        // a press shorter than this is a "tap" (tap again to stop), longer is "hold to talk"
export const MIN_AUDIO_MS = 500;   // shorter recordings are discarded with a hint
const WATCHDOG_MS = 2500;          // how long we wait for the engine to finish after stop() before force-closing it

export function createVoiceTyping({
  getText, setText, onState, onToast, onActivity, canStart,
  engine,            // () => 'cloud' | 'browser'
  transcribe,        // async (blob, mime) => string        (cloud engine)
  win, nav, maxMs = 90000, maxLen = 2000, now = () => Date.now(),
}) {
  const W = win || (typeof window !== 'undefined' ? window : {});
  const N = nav || (typeof navigator !== 'undefined' ? navigator : {});
  const SR = () => W.SpeechRecognition || W.webkitSpeechRecognition;

  let sid = 0;                 // id of the newest session; older sessions can never touch the text box or the state again
  let sess = null;             // the session that is starting or recording (null when idle or only processing)
  let state = 'idle';
  let lang = 'en-IN';          // browser engine only. Indian English handles Hinglish in Roman letters best.
  let press = null;            // { t, consumed } for the current finger/mouse press
  let pending = 0;             // transcriptions in flight
  let epoch = 0;               // bumped by halt(): transcriptions that finish after a halt are dropped

  const clip = (s) => Array.from(s).slice(0, maxLen).join('');
  const join = (a, b) => (a && b && !/\s$/.test(a) && !/^\s/.test(b) ? a + ' ' : a) + b;
  const toast = (m) => onToast && onToast(m);
  const act = () => onActivity && onActivity();
  let tapOut = false;          // last tap-mode flag reported to onState
  // onState(state, tap): `tap` is true while a tap-to-record session is running (the UI then says "tap to stop", not "release")
  const set = (s) => { const t = !!(sess && sess.tap) && s !== 'idle'; if (state !== s || t !== tapOut) { state = s; tapOut = t; onState && onState(s, t); } };
  const setTap = (s) => { s.tap = true; set(state); };
  const settle = () => set(sess ? sess.phase : pending ? 'processing' : 'idle');
  const isMobile = () => MOBILE.test(N.userAgent || '') || (N.platform === 'MacIntel' && N.maxTouchPoints > 1);
  const kind = () => (engine && engine() === 'cloud' ? 'cloud' : 'browser');

  // The text box is only ever changed through these two helpers.
  const append = (text) => { const t = (text || '').trim(); if (t) setText((cur) => clip(join((cur || '').replace(/\s+$/, ''), t))); };

  function errMsg(e) {
    const n = e && (e.name || e.error);
    if (n === 'NotAllowedError' || n === 'not-allowed' || n === 'service-not-allowed' || n === 'SecurityError') return 'Microphone access is blocked. Allow it in your browser settings and try again.';
    if (n === 'NotFoundError' || n === 'audio-capture' || n === 'OverconstrainedError') return 'No microphone was found.';
    if (n === 'NotReadableError') return 'The microphone is being used by another app.';
    if (n === 'network') return 'Could not reach the speech service. Check your connection and try again.';
    if (n === 'language-not-supported') return 'This language is not supported for voice typing on your device.';
    return 'Voice typing could not start. Please try again.';
  }

  // ---------- shared session plumbing ----------
  function endSession(s, msg) {
    if (!s || s.ended) return;
    s.ended = true;
    clearTimeout(s.watchdog); clearTimeout(s.limit);
    try { s.cleanup && s.cleanup(); } catch {}
    if (sess === s) sess = null;
    if (msg) toast(msg);
    settle();
  }

  function requestStop(s) {
    if (!s || s.ended || s.stopping) return;
    s.stopping = true;
    clearTimeout(s.limit);
    // A session whose microphone has not opened yet stays 'starting' (nothing is being converted); it sees `stopping`
    // when the mic arrives and bails out, or the watchdog below frees it if the mic never arrives.
    if (s.phase !== 'starting') { s.phase = 'processing'; set('processing'); }
    // Watchdog: some browsers never fire the end event. Never stay stuck.
    s.watchdog = setTimeout(() => s.forceClose && s.forceClose(), WATCHDOG_MS);
    try { s.stop && s.stop(); } catch { s.forceClose && s.forceClose(); }
  }

  // ---------- cloud engine: MediaRecorder -> /api/transcribe ----------
  async function startCloud(s) {
    const md = N.mediaDevices;
    const MR = W.MediaRecorder;
    if (!md || !md.getUserMedia || !MR) { endSession(s, 'Voice typing is not supported in this browser.'); return; }
    // Until the recorder exists, force-closing just ends the session. getUserMedia can stay pending for a very long time
    // (an unanswered permission prompt, a browser bug); the watchdog must still be able to free the button.
    s.forceClose = () => endSession(s, 'Allow microphone access, then hold the mic again.');
    let stream;
    try {
      stream = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) { endSession(s, errMsg(e)); return; }
    if (s.ended || s.stopping) { // released (or replaced) before the mic finished opening
      stream.getTracks().forEach((t) => t.stop());
      endSession(s, s.ended ? '' : 'Microphone ready. Hold the mic and speak.');
      return;
    }
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    const mime = types.find((t) => MR.isTypeSupported && MR.isTypeSupported(t)) || '';
    let rec;
    try { rec = mime ? new MR(stream, { mimeType: mime, audioBitsPerSecond: 24000 }) : new MR(stream); }
    catch { stream.getTracks().forEach((t) => t.stop()); endSession(s, 'Voice typing is not supported in this browser.'); return; }
    const chunks = [];
    let t0 = 0, done = false;
    const release = () => stream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
    const finish = () => {
      if (done) return; done = true;
      release();
      const dur = t0 ? now() - t0 : 0;
      const type = ((rec && rec.mimeType) || mime || 'audio/webm').split(';')[0];
      const blob = new Blob(chunks, { type });
      endSession(s); // frees the mic for the next recording immediately; transcription continues in the background
      if (dur < MIN_AUDIO_MS || blob.size < 800) return toast('Hold the mic a little longer and speak.');
      const ep = epoch;
      pending++; settle();
      Promise.resolve().then(() => transcribe(blob, type)).then((text) => {
        if (ep !== epoch) return;
        if (text && text.trim()) append(text); else toast("I couldn't hear anything. Please try again.");
      }).catch((e) => { if (ep === epoch) toast((e && e.message) || 'Voice typing failed. Please try again.'); })
        .finally(() => { if (ep === epoch) { pending = Math.max(0, pending - 1); settle(); act(); } });
    };
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = finish;
    rec.onerror = () => { done = true; release(); endSession(s, 'Recording failed. Please try again.'); };
    s.stop = () => { if (rec.state !== 'inactive') rec.stop(); else finish(); };
    s.forceClose = () => { try { if (rec.state !== 'inactive') rec.stop(); } catch {} finish(); };
    s.cleanup = () => { if (!done) { done = true; try { rec.onstop = null; if (rec.state !== 'inactive') rec.stop(); } catch {} release(); } };
    try { rec.start(250); } catch { release(); endSession(s, 'Voice typing could not start. Please try again.'); return; }
    t0 = now(); s.phase = 'recording'; set('recording'); act();
    s.limit = setTimeout(() => requestStop(s), maxMs);
  }

  // ---------- browser engine: SpeechRecognition (fallback) ----------
  function startBrowser(s) {
    const Ctor = SR();
    if (!Ctor) { endSession(s, 'Voice typing is not supported in this browser. Please use Chrome, Edge or Safari.'); return; }
    let cur = null;        // the one live recognition instance of this session
    let finals = '', base = '', shown = '', restarts = 0; // shown = the unfinished phrase currently displayed in the box
    // The user typed in the box while dictating. `typed` is the value just typed (React has not re-rendered yet, so
    // getText() would still return the text from one keystroke ago and the last character would be lost). The unfinished
    // phrase is taken out of the base because the engine re-sends it in full with the next result.
    const rebase = (typed) => {
      let t = typeof typed === 'string' ? typed : (getText() || '');
      if (shown) { const i = t.lastIndexOf(shown); if (i >= 0) t = (t.slice(0, i).replace(/\s+$/, '') + ' ' + t.slice(i + shown.length).replace(/^\s+/, '')).replace(/^\s+/, ''); }
      t = t.replace(/\s+$/, ''); base = t ? t + ' ' : ''; finals = '';
    };
    rebase();
    s.rebase = rebase;

    const drop = (r) => { if (!r) return; r.onresult = r.onerror = r.onend = r.onstart = null; try { r.abort(); } catch {} };
    const finalize = () => { drop(cur); cur = null; endSession(s); };

    function spawn() {
      const r = new Ctor();
      const t0 = now();
      r.lang = lang; r.interimResults = true; r.maxAlternatives = 1;
      // Mobile browsers (Android Chrome in particular) re-send cumulative results in continuous mode, which duplicates words;
      // there each utterance is one session and a new instance is started below while the user is still holding.
      r.continuous = !isMobile();
      r.onresult = (ev) => {
        if (s.ended || cur !== r) return;
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const res = ev.results[i];
          const seg = res[0] ? res[0].transcript : '';
          if (res.isFinal) finals = join(finals, seg.trim()); else interim += seg;
        }
        shown = interim.trim();
        setText(clip(join(join(base, finals), shown)));
        act();
      };
      r.onerror = (ev) => {
        const e = ev && ev.error;
        if (e === 'no-speech' || e === 'aborted') return; // normal; onend decides what happens next
        if (cur === r) { drop(r); cur = null; }
        endSession(s, errMsg({ error: e }));
      };
      r.onend = () => {
        if (cur !== r) return;
        cur = null;
        if (s.ended) return;
        if (s.stopping) return finalize();                       // user released: the last words have been delivered
        // Ended by itself while the user is still holding / in tap mode: continue, one new instance, never in parallel
        if (now() - t0 < 1000 && ++restarts > 3) return endSession(s, 'Voice typing stopped unexpectedly. Please try again.');
        setTimeout(() => { if (!s.ended && !s.stopping && !cur) { rebase0(); try { spawn(); } catch { endSession(s, errMsg({})); } } }, 150);
      };
      // keep text that is already shown when a new instance takes over
      const rebase0 = () => { if (finals) { base = join(base, finals); finals = ''; } };
      cur = r;
      r.start();
    }

    s.stop = () => { if (cur) { try { cur.stop(); } catch { finalize(); } } else finalize(); };
    s.forceClose = finalize;
    s.cleanup = () => { drop(cur); cur = null; };
    s.phase = 'recording'; set('recording'); act();
    try { spawn(); } catch { endSession(s, errMsg({})); return; }
    s.limit = setTimeout(() => requestStop(s), maxMs);
  }

  // ---------- public API ----------
  function begin() {
    // A leftover session (e.g. an engine that never reported its end) is discarded, never allowed to block the next one.
    if (sess) endSession(sess);
    const why = canStart && canStart();
    if (why) { toast(why); return null; }
    if (W.isSecureContext === false) { toast('Voice typing needs a secure (HTTPS) connection.'); return null; }
    const s = { id: ++sid, phase: 'starting', stopping: false, ended: false, kind: kind() };
    sess = s;
    set('starting'); act();
    if (s.kind === 'cloud') startCloud(s); else startBrowser(s);
    return s;
  }

  const api = {
    get state() { return state; },
    get active() { return !!sess; },
    get engine() { return kind(); },
    get lang() { return lang; },

    // Pointer / key handling. The UI only calls press() on pointer-down and release() on pointer-up.
    press() {
      // A press while a recording is running always means "stop": it is the second tap of tap mode, and it is also the
      // way out when the release of a hold was lost (for example iOS swallowing pointer-up while its permission sheet
      // was open). A single finger cannot press twice without releasing, so this can never cut a held recording short.
      if (sess && !sess.stopping) { press = { consumed: true }; requestStop(sess); return; }
      if (sess && sess.stopping) {
        // The previous recording is still finishing. The browser engine can be closed right away; the cloud engine
        // is only milliseconds from handing over its audio, which must not be thrown away.
        if (kind() === 'browser') endSession(sess); else { press = { consumed: true }; return; }
      }
      if (sess) { press = { consumed: true }; return; }
      press = { t: now(), consumed: false };
      begin();
    },
    release() {
      const p = press; press = null;
      if (!p || p.consumed) return;
      const s = sess;
      if (!s) return;
      if (now() - p.t >= HOLD_MS) requestStop(s);   // hold-to-talk: letting go stops and finalizes
      else { setTap(s); toast('Recording… tap the mic again to stop.'); } // quick tap: keep recording until the next tap
    },
    cancelPress() { const p = press; press = null; if (p && !p.consumed && sess) requestStop(sess); },
    toggle() { if (sess && !sess.stopping) requestStop(sess); else if (!sess) { const s = begin(); if (s) setTap(s); } },
    stop() { if (sess) requestStop(sess); },

    // Hard stop: nothing more reaches the text box (used when the chat closes or a call starts).
    // halt({ keepPending: true }) is for "Send": stop listening, but a recording that was already handed over for
    // transcription still delivers its text (into the now empty box) instead of being silently thrown away, and a
    // cloud recording that is still running is finished and transcribed rather than discarded.
    halt(opts) {
      press = null;
      const keep = !!(opts && opts.keepPending);
      if (sess) {
        if (keep && sess.kind === 'cloud' && sess.phase === 'recording' && !sess.stopping) requestStop(sess);
        else endSession(sess);
      }
      if (keep) { settle(); return; }
      sid++; epoch++; // late results of any older session are ignored
      pending = 0; set('idle');
    },
    swap() {
      lang = lang === 'en-IN' ? 'hi-IN' : 'en-IN';
      const s = sess;
      if (s && kind() === 'browser') { const keepTap = s.tap; endSession(s); const n = begin(); if (n && keepTap) setTap(n); }
      return lang;
    },
    // The user edited the text box by hand while dictating: keep their edit.
    rebase(typed) { if (sess && sess.rebase) sess.rebase(typed); },
  };
  return api;
}
