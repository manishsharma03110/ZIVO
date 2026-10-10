import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceTyping, HOLD_MS } from '../lib/voice.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function harness({ engine = 'browser', transcribeImpl, neverEnd = false, gum } = {}) {
  let text = '';
  const states = [], toasts = [];
  let clock = 1000;
  const instances = [];
  class FakeSR {
    constructor() { instances.push(this); this.running = false; }
    start() { if (this.running) throw new Error('InvalidStateError'); this.running = true; }
    stop() { if (neverEnd) return; this.running = false; setTimeout(() => this.onend && this.onend(), 5); }
    abort() { this.running = false; }
  }
  const tracks = [];
  class FakeMR {
    static isTypeSupported() { return true; }
    constructor(stream) { this.state = 'inactive'; this.mimeType = 'audio/webm;codecs=opus'; }
    start() { this.state = 'recording'; setTimeout(() => this.ondataavailable && this.ondataavailable({ data: new Blob([new Uint8Array(4000)]) }), 1); }
    stop() { this.state = 'inactive'; setTimeout(() => this.onstop && this.onstop(), 2); }
  }
  const mkStream = () => { const t = { stop() { t.stopped = true; } }; tracks.push(t); return { getTracks: () => [t] }; }; // a real stream owns its track from the start
  const nav = { userAgent: 'Android', mediaDevices: { getUserMedia: gum ? () => gum(mkStream) : async () => mkStream() } };
  const calls = [];
  const v = createVoiceTyping({
    getText: () => text,
    setText: (x) => { text = typeof x === 'function' ? x(text) : x; },
    onState: (s) => states.push(s),
    onToast: (m) => toasts.push(m),
    engine: () => engine,
    transcribe: async (blob) => { calls.push(blob.size); return transcribeImpl ? transcribeImpl() : 'Kal mujhe office jana hai and please remind me at 10 AM'; },
    win: { SpeechRecognition: FakeSR, MediaRecorder: FakeMR, isSecureContext: true },
    nav, now: () => clock,
  });
  return { v, states, toasts, instances, tracks, calls, advance: (ms) => { clock += ms; }, get text() { return text; }, set text(x) { text = x; } };
}

test('cloud: hold, release -> transcript appended, mic released, state returns to idle', async () => {
  const h = harness({ engine: 'cloud' });
  h.v.press(); await sleep(10);
  assert.equal(h.v.state, 'recording');
  h.advance(HOLD_MS + 400); h.v.release();
  await sleep(40);
  assert.equal(h.text, 'Kal mujhe office jana hai and please remind me at 10 AM');
  assert.equal(h.v.state, 'idle');
  assert.ok(h.tracks.every((t) => t.stopped), 'microphone tracks are stopped');
});

test('cloud: repeated recordings work back to back and append', async () => {
  const h = harness({ engine: 'cloud', transcribeImpl: () => 'hello' });
  for (let i = 0; i < 4; i++) {
    h.v.press(); await sleep(10);
    h.advance(900); h.v.release(); await sleep(40);
  }
  assert.equal(h.text, 'hello hello hello hello');
  assert.equal(h.v.state, 'idle');
});

test('cloud: quick tap keeps recording; second tap stops', async () => {
  const h = harness({ engine: 'cloud' });
  h.v.press(); await sleep(10); h.advance(80); h.v.release();
  assert.equal(h.v.state, 'recording');
  h.advance(1500); h.v.press(); h.v.release(); await sleep(40);
  assert.ok(h.text.startsWith('Kal mujhe'));
  assert.equal(h.v.state, 'idle');
});

test('cloud: too-short recording is discarded with a hint', async () => {
  const h = harness({ engine: 'cloud' });
  h.v.press(); await sleep(10); h.advance(HOLD_MS + 10); h.v.release(); await sleep(40);
  assert.equal(h.text, '');
  assert.ok(h.toasts.some((t) => /longer/i.test(t)));
  assert.equal(h.v.state, 'idle');
});

test('cloud: permission denied shows a clear message and recovers', async () => {
  const h = harness({ engine: 'cloud' });
  h.v.press(); // replace getUserMedia failing for next attempt
  await sleep(5); h.advance(900); h.v.release(); await sleep(30);
  const nav = { userAgent: 'x', mediaDevices: { getUserMedia: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } } };
  const g = createVoiceTyping({ getText: () => '', setText() {}, onState() {}, onToast: (m) => h.toasts.push(m), engine: () => 'cloud', transcribe: async () => '', win: { MediaRecorder: class { static isTypeSupported() { return true; } }, isSecureContext: true }, nav });
  g.press(); await sleep(10);
  assert.ok(h.toasts.some((t) => /blocked/i.test(t)));
  assert.equal(g.state, 'idle');
  g.press(); await sleep(10); // can try again immediately
  assert.equal(g.state, 'idle');
});

test('cloud: transcription failure never leaves the mic stuck', async () => {
  const h = harness({ engine: 'cloud', transcribeImpl: () => { throw new Error('Voice typing failed. Please try again.'); } });
  h.v.press(); await sleep(10); h.advance(900); h.v.release(); await sleep(40);
  assert.equal(h.v.state, 'idle');
  assert.ok(h.toasts.some((t) => /failed/i.test(t)));
});

test('cloud: halt() drops a transcript that finishes late', async () => {
  const h = harness({ engine: 'cloud', transcribeImpl: async () => { await sleep(30); return 'late words'; } });
  h.v.press(); await sleep(10); h.advance(900); h.v.release(); await sleep(15);
  h.v.halt(); await sleep(60);
  assert.equal(h.text, '');
  assert.equal(h.v.state, 'idle');
});

test('browser: only one recognition instance runs at a time across repeated recordings', async () => {
  const h = harness({ engine: 'browser' });
  for (let i = 0; i < 5; i++) {
    h.v.press(); h.advance(HOLD_MS + 300);
    assert.equal(h.instances.filter((r) => r.running).length, 1);
    h.v.release(); await sleep(20);
    assert.equal(h.instances.filter((r) => r.running).length, 0);
    assert.equal(h.v.state, 'idle');
  }
});

test('browser: builds text from interim + final results without duplicating words', async () => {
  const h = harness({ engine: 'browser' });
  h.text = 'Hi';
  h.v.press();
  const r = h.instances[0];
  r.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'kal mujhe' }], { isFinal: false })] });
  assert.equal(h.text, 'Hi kal mujhe');
  r.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'kal mujhe office' }], { isFinal: true })] });
  r.onresult({ resultIndex: 1, results: [Object.assign([{ transcript: 'kal mujhe office' }], { isFinal: true }), Object.assign([{ transcript: ' jana hai' }], { isFinal: false })] });
  assert.equal(h.text, 'Hi kal mujhe office jana hai');
  h.advance(HOLD_MS + 300); h.v.release(); await sleep(20);
  assert.equal(h.v.state, 'idle');
});

test('browser: an engine that never fires onend is force-closed and the next recording still starts', async () => {
  const h = harness({ engine: 'browser', neverEnd: true });
  h.v.press(); h.advance(HOLD_MS + 300); h.v.release();
  assert.equal(h.v.state, 'processing');
  // press again right away: the stuck instance is discarded instead of blocking
  h.v.press();
  assert.equal(h.v.state, 'recording');
  assert.equal(h.instances.length, 2);
  h.v.halt();
  assert.equal(h.v.state, 'idle');
});

test('browser: engine that ends on its own while holding restarts exactly one new instance', async () => {
  const h = harness({ engine: 'browser' });
  h.v.press();
  h.instances[0].running = false; h.instances[0].onend();
  await sleep(200);
  assert.equal(h.instances.length, 2);
  assert.equal(h.instances.filter((r) => r.running).length, 1);
  h.advance(HOLD_MS + 300); h.v.release(); await sleep(20);
  assert.equal(h.v.state, 'idle');
});

test('browser: permission denied maps to a clear message', async () => {
  const h = harness({ engine: 'browser' });
  h.v.press();
  h.instances[0].onerror({ error: 'not-allowed' });
  assert.ok(h.toasts.some((t) => /blocked/i.test(t)));
  assert.equal(h.v.state, 'idle');
});

test('cloud: getUserMedia that never settles is freed by the watchdog (hint shown), next press works, a late stream is released', async () => {
  let lateResolve = null, mode = 'hang';
  const h = harness({ engine: 'cloud', gum: (mk) => (mode === 'hang' ? new Promise((res) => { lateResolve = () => res(mk()); }) : Promise.resolve(mk())) });
  h.v.press(); h.advance(HOLD_MS + 400); h.v.release();
  assert.equal(h.v.state, 'starting', 'nothing is being converted yet, so it must not claim "processing"');
  await sleep(2700);
  assert.equal(h.v.state, 'idle');
  assert.ok(h.toasts.some((t) => /Allow microphone/i.test(t)), h.toasts.join('|'));
  mode = 'ok';
  h.v.press(); await sleep(10);
  assert.equal(h.v.state, 'recording', 'the stuck attempt must not block the next press');
  lateResolve();                                  // the user finally taps "Allow" for the abandoned attempt
  await sleep(20);
  // tracks[0] belongs to the live recording (opened first), tracks[1] to the late stream of the abandoned attempt
  assert.ok(h.tracks.length === 2 && h.tracks[1].stopped && !h.tracks[0].stopped, 'late stream of the abandoned attempt is released, the live one is untouched');
  assert.equal(h.v.state, 'recording', 'and does not disturb the new recording');
  h.advance(900); h.v.release(); await sleep(40);
  assert.equal(h.v.state, 'idle');
  assert.ok(h.text.startsWith('Kal mujhe'));
});

test('cloud: halt({ keepPending }) (used by Send) keeps a transcription already in flight; plain halt still drops it', async () => {
  const slow = async () => { await sleep(60); return 'dictated'; };
  const a = harness({ engine: 'cloud', transcribeImpl: slow });
  a.v.press(); await sleep(10); a.advance(900); a.v.release(); await sleep(10);
  assert.equal(a.v.state, 'processing');
  a.v.halt({ keepPending: true });
  assert.equal(a.v.state, 'processing', 'still waiting for the text');
  await sleep(120);
  assert.equal(a.text, 'dictated'); assert.equal(a.v.state, 'idle');
  const b = harness({ engine: 'cloud', transcribeImpl: slow });
  b.v.press(); await sleep(10); b.advance(900); b.v.release(); await sleep(10); b.v.halt(); await sleep(120);
  assert.equal(b.text, ''); assert.equal(b.v.state, 'idle');
});

test('cloud: Send while still recording finishes and transcribes the recording instead of discarding it', async () => {
  const h = harness({ engine: 'cloud' });
  h.v.press(); await sleep(10); h.advance(900);
  h.v.halt({ keepPending: true });
  await sleep(60);
  assert.ok(h.text.startsWith('Kal mujhe')); assert.equal(h.v.state, 'idle');
  assert.ok(h.tracks.every((t) => t.stopped));
});

test('browser: Send while listening stops the engine at once and nothing more reaches the box', async () => {
  const h = harness({ engine: 'browser' });
  h.v.press();
  h.instances[0].onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'hello' }], { isFinal: false })] });
  assert.equal(h.text, 'hello');
  h.v.halt({ keepPending: true });
  assert.equal(h.instances.filter((r) => r.running).length, 0); assert.equal(h.v.state, 'idle');
  h.text = '';
  const old = h.instances[0]; if (old.onresult) old.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'ghost' }], { isFinal: true })] });
  assert.equal(h.text, '', 'late results are ignored');
});

test('browser: typing while dictating keeps every typed character and does not duplicate the unfinished phrase', async () => {
  const h = harness({ engine: 'browser' });
  h.text = 'Hi'; h.v.press();
  const r = h.instances[0];
  r.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'kal mujhe' }], { isFinal: false })] });
  assert.equal(h.text, 'Hi kal mujhe');
  h.text = 'Hi kal mujhe X'; h.v.rebase('Hi kal mujhe X');   // the user typed " X"; the page passes the value just typed
  r.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'kal mujhe office' }], { isFinal: true })] });
  assert.equal(h.text, 'Hi X kal mujhe office');
  h.v.halt();
});

test('browser: manual edit between two dictated phrases is kept', async () => {
  const h = harness({ engine: 'browser' });
  h.v.press(); const r = h.instances[0];
  r.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'one two' }], { isFinal: true })] });
  assert.equal(h.text, 'one two');
  h.text = 'one 2'; h.v.rebase('one 2');                      // the user corrected the text by hand
  r.onresult({ resultIndex: 1, results: [Object.assign([{ transcript: 'one two' }], { isFinal: true }), Object.assign([{ transcript: 'three' }], { isFinal: true })] });
  assert.equal(h.text, 'one 2 three');
  h.v.halt();
});

test('browser fallback: mobile browsers use single-utterance mode (no duplicated words), desktop uses continuous mode', async () => {
  const mk = (ua) => {
    const inst = [];
    class SR { constructor() { inst.push(this); } start() {} stop() {} abort() {} }
    const v = createVoiceTyping({ getText: () => '', setText() {}, onState() {}, onToast() {}, engine: () => 'browser', win: { SpeechRecognition: SR, isSecureContext: true }, nav: { userAgent: ua } });
    v.press(); v.halt(); return inst[0].continuous;
  };
  assert.equal(mk('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126 Mobile'), false);
  assert.equal(mk('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604'), false);
  assert.equal(mk('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126'), true);
});

test('state callback reports tap mode, so the UI can say "tap to stop" instead of "release"', async () => {
  const seen = [];
  const h = harness({ engine: 'cloud' });
  const v = createVoiceTyping({ getText: () => '', setText() {}, onState: (s, t) => seen.push([s, t]), onToast() {}, engine: () => 'cloud', transcribe: async () => 'x',
    win: { MediaRecorder: class { static isTypeSupported() { return true; } constructor() { this.state = 'inactive'; } start() { this.state = 'recording'; setTimeout(() => this.ondataavailable && this.ondataavailable({ data: new Blob([new Uint8Array(4000)]) }), 1); } stop() { this.state = 'inactive'; setTimeout(() => this.onstop && this.onstop(), 2); } }, isSecureContext: true },
    nav: { userAgent: 'x', mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } } });
  v.press(); await sleep(10); v.release();                      // quick tap -> tap mode
  assert.deepEqual(seen.at(-1), ['recording', true]);
  v.press(); v.release(); await sleep(50);                      // second tap stops
  assert.deepEqual(seen.at(-1), ['idle', false]);
  assert.ok(seen.some(([s, t]) => s === 'recording' && t === false), 'a held press is not tap mode');
});

test('cloud: a lost release (pointer-up never delivered) never leaves the mic stuck — the next press stops and transcribes', async () => {
  const h = harness({ engine: 'cloud' });
  h.v.press(); await sleep(10);
  h.advance(2500);                                   // the finger is long gone, but release() was never called
  assert.equal(h.v.state, 'recording');
  h.v.press(); h.v.release(); await sleep(40);       // the user taps the mic once more
  assert.ok(h.text.startsWith('Kal mujhe')); assert.equal(h.v.state, 'idle');
  assert.ok(h.tracks.every((t) => t.stopped), 'microphone released');
  h.v.press(); await sleep(10); h.advance(900); h.v.release(); await sleep(40);   // and it records normally again
  assert.equal(h.v.state, 'idle'); assert.equal(h.calls.length, 2);
});

test('browser: a lost release is also recoverable with one more press, and only one engine instance ever runs', async () => {
  const h = harness({ engine: 'browser' });
  h.v.press(); h.advance(2500);
  assert.equal(h.instances.filter((r) => r.running).length, 1);
  h.v.press(); h.v.release(); await sleep(20);
  assert.equal(h.v.state, 'idle'); assert.equal(h.instances.filter((r) => r.running).length, 0);
});
