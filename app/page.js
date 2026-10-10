'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { createVoiceTyping } from '@/lib/voice';
import { normalizeMessages, quotedAuthor, setOptimisticStatus, optimisticRetryLabel } from '@/lib/messages';
import SplashScreen from './components/SplashScreen';
import LoginScreen from './components/LoginScreen';

const IDLE_MS = 60 * 1000;

const post = (url, body) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export default function Page() {
  const [s, setS] = useState({ status: 'loading' });
  const [splash, setSplash] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 2000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' })
      .then(async (r) => (r.ok ? setS({ status: 'in', ...(await r.json()) }) : setS({ status: 'out' })))
      .catch(() => setS({ status: 'out' }));
  }, []);

  // Logging out (manually, on idle, or on an expired session) is silent: the loading and login screens never show a notice.
  const logout = useCallback(async () => {
    try { await fetch('/api/logout', { method: 'POST' }); } catch {}
    setS({ status: 'out' });
  }, []);

  const loggedIn = useCallback(async () => {
    const r = await fetch('/api/me', { cache: 'no-store' });
    if (!r.ok) throw new Error('not signed in');
    setS({ status: 'in', ...(await r.json()) });
  }, []);

  if (splash || s.status === 'loading') return <SplashScreen />;
  if (s.status === 'out') return <LoginScreen onDone={loggedIn} />;
  // The server cookie is the only source of identity. If it no longer matches this tab, reload who we are (Chat remounts via key).
  const resync = () => { loggedIn().catch(() => setS({ status: 'out' })); };
  return <Chat key={s.user} me={s.user} names={s.names} ice={s.ice} blob={s.blob} stt={!!s.stt} onLogout={logout} onResync={resync} />;
}

const M={pause:'<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>',up:'<path d="m18 15-6-6-6 6"/>',micoff:'<path d="m2 2 20 20M18.9 10.9V12a7 7 0 0 1-.7 3M15 9.3V4a3 3 0 0 0-5.7-1.3M9 9v3a3 3 0 0 0 5.1 2.1M5 10v2a7 7 0 0 0 11.5 5.3M12 19v3"/>',camoff:'<path d="M10.7 5H14a2 2 0 0 1 2 2v3.3l5.6 3.4V7.9L16 10.5M2 2l20 20M2 7v10a2 2 0 0 0 2 2h12"/>',speaker:'<path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',arrow:'<path d="M19 12H5M12 19l-7-7 7-7"/>',phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',video:'<path d="m22 8-6 4 6 4V8z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',lock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',plus:'<path d="M12 5v14M5 12h14"/>',smile:'<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',clip:'<path d="m21.4 11-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',camera:'<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',send:'<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',check:'<path d="M20 6 9 17l-5-5"/>',mic:'<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4"/>',cc:'<path d="M18 6 7 17l-5-5M22 10l-7.5 7.5L13 16"/>',badge:'<path d="M3.9 8.6a4 4 0 0 1 4.7-4.7 4 4 0 0 1 6.8 0 4 4 0 0 1 4.8 4.8 4 4 0 0 1 0 6.8 4 4 0 0 1-4.8 4.7 4 4 0 0 1-6.7 0 4 4 0 0 1-4.8-4.7 4 4 0 0 1 0-6.9z" fill="currentColor" stroke="none"/><path d="m9 12 2 2 4-4" stroke="#fff"/>',user:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4" fill="currentColor"/>',image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8"/>',reply:'<path d="m9 17-5-5 5-5M20 18v-2a4 4 0 0 0-4-4H4"/>',copy:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',trash:'<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',x:'<path d="M18 6 6 18M6 6l12 12"/>',play:'<path d="M6 3l14 9-14 9z" fill="currentColor"/>',more:'<circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/>',edit:'<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',globe:'<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>'};
const MIc = ({ n, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: M[n] }} />
);
const hm = (ts) => new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
const dayKey = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); };
const dayLabel = (ts) => {
  const t = new Date(), y = new Date(); y.setDate(t.getDate() - 1);
  if (dayKey(ts) === dayKey(t)) return 'Today';
  if (dayKey(ts) === dayKey(y)) return 'Yesterday';
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: new Date(ts).getFullYear() === t.getFullYear() ? undefined : 'numeric' });
};
const mmss = (n) => Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
const callTitle = (m, mine) => {
  const t = m.video ? 'video call' : 'voice call', s = m.status;
  if (s === 'done') return m.video ? 'Video call' : 'Voice call';
  if (!mine && (s === 'missed' || s === 'cancelled')) return 'Missed ' + t;
  if (s === 'declined') return 'Declined ' + t;
  return s === 'missed' ? 'No answer' : 'Cancelled ' + t;
};
const snip = (m) => (m.type === 'text' ? m.text : m.type === 'image' ? 'Photo' : m.type === 'video' ? 'Video' : m.type === 'voice' ? 'Voice message' : 'Call');
const EMOJI = ['😀', '😂', '🥰', '😍', '😎', '🤔', '😮', '😢', '🙏', '👍', '👏', '🔥', '🎉', '💜', '✨', '🌞'];
const REACT = ['❤️', '😂', '👍', '😮', '😢', '🙏'];
const WAVE = Array.from({ length: 23 }, (_, i) => <s key={i} style={{ height: 14 + Math.round(Math.abs(Math.sin(i * 0.55)) * 40), animationDelay: (i % 8) * 0.09 + 's' }} />);

function VoicePlayer({ url, dur }) {
  const [on, setOn] = useState(false);
  const a = useRef(null);
  const toggle = () => { const el = a.current; if (!el) return; if (el.paused) el.play().catch(() => {}); else el.pause(); };
  return (
    <>
      <button type="button" className="vp" aria-label={on ? 'Pause voice message' : 'Play voice message'} onClick={toggle}><MIc n={on ? 'pause' : 'play'} size={14} /></button>
      <span className={'wv' + (on ? ' on' : '')} aria-hidden="true">{[8, 16, 10, 22, 12, 18, 8, 20, 14, 9, 17, 11].map((h, i) => <s key={i} style={{ height: h }} />)}</span>
      <span>{mmss(dur || 0)}</span>
      <audio ref={a} src={url} preload="metadata" onPlay={() => setOn(true)} onPause={() => setOn(false)} onEnded={() => setOn(false)} />
    </>
  );
}

// Avatar: the person's photo when they have one, otherwise the user icon
const Av = ({ p, size }) => (p && p.photo ? <img className="avimg" src={p.photo} alt="" draggable="false" /> : <MIc n="user" size={size} />);

// Crops the chosen picture to a centred square and shrinks it to 256 px so it stays small (about 15-40 KB)
async function toAvatar(file) {
  const bmp = await createImageBitmap(file);
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const w = bmp.width, h = bmp.height, m = Math.min(w, h);
  c.getContext('2d').drawImage(bmp, (w - m) / 2, (h - m) / 2, m, m, 0, 0, S, S);
  for (let q = 0.85; q >= 0.35; q -= 0.15) { const u = c.toDataURL('image/jpeg', q); if (u.length <= 85000) return u; }
  throw new Error('too large');
}

function ProfileSheet({ me, p, defName, onClose, onSaved, onActivity, toast }) {
  const [name, setName] = useState((p && p.name) || defName);
  const [bio, setBio] = useState((p && p.bio) || '');
  const [photo, setPhoto] = useState(undefined); // undefined = unchanged, null = removed, string = new picture
  const [saving, setSaving] = useState(false);
  const fileR = useRef(null);
  const shown = photo === null ? '' : photo || (p ? p.photo : '');
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);
  async function pick(e) {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast('Please choose an image.');
    try { setPhoto(await toAvatar(f)); onActivity(); } catch { toast('That picture could not be used.'); }
  }
  async function save() {
    if (saving) return;
    setSaving(true); onActivity();
    try {
      const r = await post('/api/profile', { as: me, name, bio, ...(photo !== undefined ? { photo } : {}) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not save your profile.');
      onSaved(d.profiles); toast('Profile saved'); onClose();
    } catch (e) { toast((e && e.message) || 'Could not save your profile.'); setSaving(false); }
  }
  return (
    <section className="psheet" role="dialog" aria-label="Edit profile" onInput={onActivity}>
      <header className="hd">
        <button type="button" className="ib flat" aria-label="Back" onClick={onClose}><MIc n="arrow" /></button>
        <div className="who"><b style={{ fontSize: 18 }}>Edit profile</b></div>
      </header>
      <div className="pbody">
        <div className="pav">
          <div className="pimg">{shown ? <img src={shown} alt="Profile picture preview" /> : <MIc n="user" size={56} />}</div>
          <button type="button" className="pchg" onClick={() => fileR.current.click()}><MIc n="camera" size={16} />Change photo</button>
          {shown && <button type="button" className="plnk" onClick={() => setPhoto(null)}>Remove photo</button>}
          <input ref={fileR} type="file" accept="image/*" hidden onChange={pick} />
        </div>
        <label className="pf"><span>Name</span>
          <input value={name} maxLength={30} placeholder={defName} autoComplete="off" enterKeyHint="next" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="pf"><span>Bio / About</span>
          <textarea rows={3} maxLength={120} placeholder="Say something about yourself" value={bio} onChange={(e) => setBio(e.target.value)} />
          <small>{Array.from(bio).length}/120</small>
        </label>
      </div>
      <footer className="pfoot">
        <button type="button" className="pcancel" onClick={onClose}>Cancel</button>
        <button type="button" className="psave" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </footer>
    </section>
  );
}

function Chat({ me, names: namesBase, ice, blob, stt, onLogout, onResync }) {
  const connT = useRef(0);
  const callTok = useRef(0);
  const ackR = useRef('');
  const discT = useRef(null);
  const micR = useRef(false);
  const sendingR = useRef(false);
  const pendingR = useRef(null); // { t, cid } of a send that failed, so a retry of the same text is not stored twice
  const seenSentR = useRef('');
  const [peerSeen, setPeerSeen] = useState('');
  const [vn, setVn] = useState(null); // seconds recorded while a voice message is being recorded, else null
  const vnR = useRef({ rec: null, chunks: [], stream: null, timer: null, t0: 0, send: false });
  const peer = me === 'A' ? 'B' : 'A';
  // Every message post states who this tab thinks it is; the server rejects it (409) if the session cookie says otherwise
  const postMsg = async (body) => {
    const r = await post('/api/messages', { ...body, as: me });
    if (r.status === 409) onResync();
    return r;
  };
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [left, setLeft] = useState(IDLE_MS / 1000);
  const [now, setNow] = useState(Date.now());
  const [call, setCallState] = useState({ phase: 'idle' });
  const [link, setLink] = useState('');
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  // Profiles (name, bio, photo) edited by the two people. The environment names are only the defaults.
  const [profiles, setProfiles] = useState(null);
  const names = { A: (profiles && profiles.A.name) || namesBase.A, B: (profiles && profiles.B.name) || namesBase.B };
  const loadProfiles = useCallback(async () => {
    try { const r = await fetch('/api/profile', { cache: 'no-store' }); if (r.ok) setProfiles((await r.json()).profiles); } catch {}
  }, []);
  useEffect(() => {
    loadProfiles();
    const iv = setInterval(() => { if (document.visibilityState === 'visible') loadProfiles(); }, 30000);
    return () => clearInterval(iv);
  }, [loadProfiles]);
  const [prof, setProf] = useState(false);
  const [kb, setKb] = useState(false);
  const nearBottomR = useRef(true);
  const formR = useRef(null);
  const sttR = useRef(!!stt);
  sttR.current = !!stt;

  const callR = useRef({ phase: 'idle' });
  const busyR = useRef(false);
  const lastIdR = useRef('');
  const firstR = useRef(true);
  const actR = useRef(Date.now());
  const timerR = useRef(null);
  const tickR = useRef(null);
  const pcR = useRef(null);
  const localS = useRef(null);
  const remoteS = useRef(null);
  const answeredR = useRef(false);
  const listR = useRef(null);
  const localV = useRef(null);
  const remoteV = useRef(null);
  const aliveR = useRef(true);

  const setCall = (c) => { callR.current = c; setCallState(c); };
  const activity = () => { actR.current = Date.now(); };

  const teardown = useCallback((st) => {
    const c = callR.current;
    if (c.dir === 'out' && c.id && c.phase !== 'idle') {
      const dur = connT.current ? Math.round((Date.now() - connT.current) / 1000) : 0;
      postMsg({ type: 'call', video: !!c.video, status: c.phase === 'connected' ? 'done' : (st || 'cancelled'), dur }).catch(() => {});
    }
    connT.current = 0;
    clearTimeout(discT.current); ackR.current = '';
    try { pcR.current && pcR.current.close(); } catch {}
    pcR.current = null;
    if (localS.current) localS.current.getTracks().forEach((t) => t.stop());
    localS.current = null; remoteS.current = null; answeredR.current = false;
    setLink(''); setMuted(false); setCamOff(false);
    setCall({ phase: 'idle' });
  }, []);

  const hangup = useCallback(async (st) => {
    const id = callR.current.id;
    teardown(st);
    try { await post('/api/call', { action: 'end', id }); } catch {}
  }, [teardown]);

  const logout = useCallback(async () => {
    aliveR.current = false;
    clearTimeout(timerR.current);
    if (callR.current.phase !== 'idle') await hangup();
    onLogout();
  }, [hangup, onLogout]);

  // ---------- WebRTC ----------
  function makePC(stream) {
    const pc = new RTCPeerConnection({ iceServers: ice });
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.ontrack = (e) => {
      remoteS.current = e.streams[0];
      if (remoteV.current) remoteV.current.srcObject = e.streams[0];
    };
    pc.onconnectionstatechange = () => {
      if (pcR.current !== pc) return;
      const st = pc.connectionState;
      setLink(st);
      clearTimeout(discT.current);
      if (st === 'failed') hangup();
      // A brief "disconnected" is normal on mobile networks; end the call only if it does not recover
      else if (st === 'disconnected') discT.current = setTimeout(() => { if (pcR.current === pc && pc.connectionState !== 'connected') hangup(); }, 12000);
    };
    pcR.current = pc;
    return pc;
  }

  function waitIce(pc) {
    return new Promise((res) => {
      if (pc.iceGatheringState === 'complete') return res();
      const t = setTimeout(res, 3500);
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); }
      });
    });
  }

  async function getMedia(video) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: video ? { facingMode: 'user' } : false,
    });
    localS.current = stream;
    return stream;
  }

  const mediaErr = (e) =>
    e && e.name === 'NotAllowedError' ? 'Please allow microphone and camera access in your browser settings.'
      : e && e.name === 'NotFoundError' ? 'No microphone or camera was found.' : 'The call could not be started.';

  async function startCall(video) {
    if (callR.current.phase !== 'idle') return;
    stopVoiceNote(false); voiceR.current.halt();
    activity();
    const tok = ++callTok.current;
    const stale = () => callTok.current !== tok || callR.current.phase !== 'calling';
    setCall({ phase: 'calling', video, dir: 'out' });
    try {
      const stream = await getMedia(video);
      // Cancelled while the permission prompt was open: release the mic/camera right away
      if (stale()) { stream.getTracks().forEach((t) => t.stop()); if (callTok.current === tok) teardown(); return; }
      const pc = makePC(stream);
      await pc.setLocalDescription(await pc.createOffer());
      await waitIce(pc);
      if (stale()) { if (callTok.current === tok) teardown(); return; }
      const r = await post('/api/call', { action: 'start', video, offer: pc.localDescription });
      if (!r.ok) { if (!stale()) { teardown(); alert(r.status === 409 ? 'A call is already in progress.' : 'The call could not be started.'); } return; }
      const { id } = await r.json();
      // Cancelled while the request was in flight: end the call that was just created so it does not keep ringing
      if (stale()) { post('/api/call', { action: 'end', id }).catch(() => {}); return; }
      setCall({ ...callR.current, id, idAt: Date.now() });
    } catch (e) {
      if (callTok.current !== tok) return; // a newer call has taken over
      const wasCalling = callR.current.phase === 'calling';
      teardown();
      if (wasCalling) alert(mediaErr(e));
    }
  }

  async function accept() {
    const cur = callR.current;
    if (cur.phase !== 'incoming') return;
    stopVoiceNote(false); voiceR.current.halt();
    connT.current = Date.now();
    setCall({ ...cur, phase: 'connected' });
    try {
      const stream = await getMedia(cur.video);
      const pc = makePC(stream);
      await pc.setRemoteDescription(cur.offer);
      await pc.setLocalDescription(await pc.createAnswer());
      await waitIce(pc);
      const r = await post('/api/call', { action: 'answer', id: cur.id, answer: pc.localDescription });
      if (!r.ok) { teardown(); alert('This call has already ended.'); }
    } catch (e) { await hangup(); alert(mediaErr(e)); }
  }

  async function handleCall(c) {
    const cur = callR.current;
    if (!c || c.status === 'ended') {
      // A poll that was already in flight when the call was created can legitimately report "no call";
      // only trust a missing call once the call has existed for a few seconds.
      const settled = Date.now() - (cur.idAt || 0) > 4000;
      if (cur.id && ((!c && settled) || (c && c.id === cur.id))) teardown(cur.phase === 'calling' ? 'declined' : undefined);
      return;
    }
    if (c.status === 'ringing') {
      if (c.to === me && cur.phase === 'idle' && c.age < 60000) {
        setCall({ phase: 'incoming', dir: 'in', id: c.id, idAt: Date.now(), video: c.video, offer: c.offer });
      } else if (c.to === me && cur.phase === 'incoming' && c.age >= 60000) {
        teardown();
      } else if (c.from === me && cur.phase === 'calling' && c.age >= 60000) {
        hangup('missed'); alert('No answer.');
      }
    } else if (c.status === 'active' && c.from === me && cur.phase === 'calling' && c.answer && !answeredR.current) {
      answeredR.current = true;
      ackR.current = c.id; // tell the server we have the answer so it stops sending it
      try {
        await pcR.current.setRemoteDescription(c.answer);
        connT.current = Date.now();
        setCall({ ...callR.current, phase: 'connected' });
      } catch { hangup(); }
    }
  }

  // While connected, send a heartbeat so a call abandoned without a clean hang-up never blocks new calls
  useEffect(() => {
    if (call.phase !== 'connected' || !call.id) return;
    const ping = () => post('/api/call', { action: 'ping', id: call.id }).catch(() => {});
    ping();
    const iv = setInterval(ping, 10000);
    return () => clearInterval(iv);
  }, [call.phase, call.id]);

  // Closing the tab or navigating away mid-call ends the call for the other person too
  useEffect(() => {
    const h = () => {
      const c = callR.current;
      if (c.phase === 'idle' || !c.id) return;
      try { navigator.sendBeacon('/api/call', new Blob([JSON.stringify({ action: 'end', id: c.id })], { type: 'application/json' })); } catch {}
    };
    window.addEventListener('pagehide', h);
    return () => window.removeEventListener('pagehide', h);
  }, []);

  // Attach streams to the video elements when the call screen opens
  useEffect(() => {
    if (localV.current && localS.current) localV.current.srcObject = localS.current;
    if (remoteV.current && remoteS.current) remoteV.current.srcObject = remoteS.current;
  }, [call.phase]);

  function toggleMic() {
    const t = localS.current && localS.current.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setMuted(!t.enabled); }
  }
  function toggleCam() {
    const t = localS.current && localS.current.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setCamOff(!t.enabled); }
  }

  // ---------- polling (auto refresh) ----------
  useEffect(() => {
    aliveR.current = true;
    let running = false, again = false;
    let idleWait = 1000;
    const nextWait = () => {
      const hidden = document.visibilityState === 'hidden';
      if (hidden) return 7000;
      if (callR.current.phase !== 'idle') return 800;
      return idleWait;
    };
    async function tick() {
      // Never run two polls at once. A second request just schedules a quick follow-up poll, so
      // "refresh now" calls cannot multiply the polling loop.
      if (running) { again = true; return; }
      running = true;
      clearTimeout(timerR.current);
      try {
        const ack = ackR.current ? '&ack=' + encodeURIComponent(ackR.current) : '';
        // Tell the server which message we have seen, but only while the tab is actually visible
        const sentId = lastIdR.current;
        const seenQ = sentId && sentId !== seenSentR.current && document.visibilityState === 'visible' ? '&seen=' + encodeURIComponent(sentId) : '';
        const r = await fetch('/api/poll?since=' + encodeURIComponent(sentId) + ack + seenQ, { cache: 'no-store' });
        if (r.status === 401) { logout(); return; }
        if (!r.ok) return; // temporary server error: keep any call running and try again shortly
        const d = await r.json();
        if (!aliveR.current) return;
        // The session cookie now belongs to the other person (shared browser): stop and reload identity instead of mixing senders
        if (d.me && d.me !== me) { onResync(); return; }
        if (seenQ) seenSentR.current = sentId;
        setPeerSeen(typeof d.peerSeen === 'string' ? d.peerSeen : '');
        if (d.messages) {
          idleWait = 1000;
          if (!firstR.current) activity(); // a new message arrived or was sent
          firstR.current = false;
          lastIdR.current = d.lastId;
          const serverMessages = normalizeMessages(d.messages);
          setMsgs((cur) => {
            const outstanding = cur.filter((m) => (m.pending || m.status === 'failed')
              && !serverMessages.some((server) => server.from === m.from && server.type === 'text'
                && server.text === m.text && Math.abs(server.createdAt - m.createdAt) < 5000));
            return normalizeMessages([...serverMessages, ...outstanding]);
          });
        }
        firstR.current = false;
        await handleCall(d.call || null);
      } catch {} finally {
        running = false;
        if (aliveR.current) {
          const wait = again ? 250 : nextWait();
          if (!again && document.visibilityState !== 'hidden' && callR.current.phase === 'idle') {
            idleWait = Math.min(3000, idleWait * 2);
          }
          again = false;
          timerR.current = setTimeout(tick, wait);
        }
      }
    }
    const trigger = () => {
      if (!aliveR.current) return;
      if (running) { again = true; return; }
      tick();
    };
    tickR.current = trigger;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') trigger();
    };
    const onOnline = () => trigger();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    tick();
    return () => { aliveR.current = false; clearTimeout(timerR.current); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('online', onOnline); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- idle logout (1 minute without activity) ----------
  useEffect(() => {
    const iv = setInterval(() => {
      if (callR.current.phase !== 'idle' || busyR.current || micR.current) actR.current = Date.now();
      const rem = Math.ceil((IDLE_MS - (Date.now() - actR.current)) / 1000);
      setLeft(Math.max(rem, 0));
      setNow(Date.now());
      if (rem <= 0) { clearInterval(iv); logout(); }
    }, 1000);
    return () => clearInterval(iv);
  }, [logout]);

  useEffect(() => {
    if (listR.current) listR.current.scrollTop = listR.current.scrollHeight;
  }, [msgs.length]);

  // ---------- sending ----------
  async function send(e, retryMessage = null) {
    if (e && e.preventDefault) e.preventDefault();
    const t = (retryMessage ? retryMessage.text : text).trim();
    if (!t || sendingR.current) return;
    sendingR.current = true;
    voiceR.current.halt({ keepPending: true }); // stop listening; a recording already being transcribed still delivers its text
    const rt = retryMessage ? retryMessage.replyTo : replyTo;
    const pc = pendingR.current;
    const cid = retryMessage ? retryMessage.cid : pc && pc.t === t ? pc.cid : (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(16) + Math.random().toString(16).slice(2, 10));
    const optimisticId = 'pending:' + cid;
    const optimistic = retryMessage
      ? { ...retryMessage, status: 'sending', pending: true }
      : { id: optimisticId, from: me, type: 'text', text: t, createdAt: Date.now(), status: 'sending', pending: true, cid, reply: rt ? { from: rt.from, who: rt.from === me ? 'You' : names[peer], text: snip(rt) } : undefined };
    pendingR.current = { t, cid };
    if (!retryMessage) {
      setText(''); setReplyTo(null); activity();
      setMsgs((cur) => normalizeMessages([...cur, optimistic]));
    } else {
      setMsgs((cur) => setOptimisticStatus(cur, cid, 'sending'));
    }
    try {
      const r = await postMsg({ type: 'text', cid, text: t, reply: rt ? { from: rt.from, who: rt.from === me ? 'You' : names[peer], text: snip(rt) } : undefined });
      if (!r.ok) throw new Error('send failed');
      pendingR.current = null;
      setMsgs((cur) => normalizeMessages(cur.map((m) => (m.pending && m.cid === cid ? { ...m, id: r.id, pending: false, status: 'sent' } : m))));
      tickR.current && tickR.current();
    } catch {
      setMsgs((cur) => setOptimisticStatus(cur, cid, 'failed'));
      toast('Message not sent. Please try again.');
    } finally { sendingR.current = false; }
  }

  async function uploadFile(f) {
    if (blob) {
      const b = await upload(f.name, f, { access: 'public', handleUploadUrl: '/api/upload', contentType: f.type });
      return b.url;
    }
    const fd = new FormData(); fd.append('file', f);
    const r = await fetch('/api/upload-local', { method: 'POST', body: fd });
    if (!r.ok) throw new Error('upload failed');
    return (await r.json()).url;
  }

  // ---------- voice messages (record and send) ----------
  async function startVoiceNote() {
    setPop('');
    const st = vnR.current;
    if (st.rec) return;
    if (callR.current.phase !== 'idle') return toast('Voice messages are not available during a call.');
    voiceR.current.halt();
    if (!navigator.mediaDevices || !window.MediaRecorder) return toast('Voice messages are not supported in this browser.');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { return toast(e && e.name === 'NotAllowedError' ? 'Please allow microphone access in your browser settings.' : 'No microphone was found.'); }
    if (st.rec) { stream.getTracks().forEach((t) => t.stop()); return; }
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    const mime = types.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
    let rec;
    try { rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
    catch { stream.getTracks().forEach((t) => t.stop()); return toast('Voice messages are not supported in this browser.'); }
    st.rec = rec; st.chunks = []; st.stream = stream; st.send = false; st.t0 = Date.now();
    rec.ondataavailable = (e) => { if (e.data && e.data.size) st.chunks.push(e.data); };
    rec.onstop = () => finishVoiceNote(rec, mime);
    micR.current = true; setVn(0); activity();
    try { rec.start(1000); } catch { finishVoiceNote(rec, mime); return toast('Voice messages could not be started.'); }
    st.timer = setInterval(() => {
      const secs = Math.floor((Date.now() - st.t0) / 1000);
      setVn(secs); activity();
      if (secs >= 300) stopVoiceNote(true); // 5 minute limit
    }, 500);
  }
  function stopVoiceNote(send) {
    const st = vnR.current;
    if (!st.rec) return;
    st.send = send;
    try { st.rec.stop(); } catch { finishVoiceNote(st.rec, ''); }
  }
  async function finishVoiceNote(rec, mime) {
    const st = vnR.current;
    if (st.rec !== rec) return;
    clearInterval(st.timer);
    if (st.stream) st.stream.getTracks().forEach((t) => t.stop());
    const send = st.send, chunks = st.chunks, dur = Math.round((Date.now() - st.t0) / 1000);
    st.rec = null; st.chunks = []; st.stream = null; micR.current = false; setVn(null);
    if (!send) return;
    if (dur < 1 || !chunks.length) return toast('Recording is too short.');
    const type = (rec.mimeType || mime || 'audio/webm').split(';')[0];
    const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
    const file = new File([new Blob(chunks, { type })], `voice-${Date.now()}.${ext}`, { type });
    activity(); busyR.current = true; setBusy('Sending voice message…');
    try {
      const url = await uploadFile(file);
      const m = await postMsg({ type: 'voice', url, dur });
      if (!m.ok) throw new Error('send failed');
      tickR.current && tickR.current();
    } catch { toast('The voice message could not be sent. Please try again.'); }
    busyR.current = false; setBusy(''); activity();
  }
  useEffect(() => () => {
    const st = vnR.current;
    if (!st.rec) return;
    st.send = false; clearInterval(st.timer);
    try { st.rec.stop(); } catch {}
    if (st.stream) st.stream.getTracks().forEach((t) => t.stop());
    micR.current = false;
  }, []);

  async function onFile(e) {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const type = f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : null;
    if (!type) return alert('You can only send images or videos.');
    if (f.size > 50 * 1024 * 1024) return alert('The file must be smaller than 50 MB.');
    activity(); busyR.current = true; setBusy('Uploading…');
    try {
      const url = await uploadFile(f);
      const m = await postMsg({ type, url });
      if (!m.ok) throw new Error('could not send');
      tickR.current && tickR.current();
    } catch (err) { alert('Upload failed' + (err && err.message ? ': ' + err.message : '.')); }
    busyR.current = false; setBusy(''); activity();
  }

  const hoursLeft = (m) => Math.max(1, Math.ceil((m.expiresAt - now) / 3600000));
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  const [spk, setSpk] = useState(true);
  const toggleSpk = () => { const v = remoteV.current; if (v) { v.muted = spk; } setSpk(!spk); };
  const [rx, setRx] = useState({});
  const [hid, setHid] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [menu, setMenu] = useState(null);
  const [pop, setPop] = useState('');
  const [list, setList] = useState(false);
  const [toastT, setToast] = useState('');
  const [ui, setUi] = useState(true);
  const taR = useRef(null), fiR = useRef(null), fcR = useRef(null), lp = useRef(0), swy = useRef(null), uiT = useRef(0);
  const toast = (t) => { setToast(t); setTimeout(() => setToast(''), 1800); };
  const [vstate, setVstate] = useState('idle'); // idle | starting | recording | processing
  const [vtap, setVtap] = useState(false);      // true while a tap-to-record session is running
  const [lang, setLang] = useState('en-IN');
  const textR = useRef('');
  textR.current = text;
  const voiceR = useRef(null);
  if (!voiceR.current) {
    voiceR.current = createVoiceTyping({
      getText: () => textR.current,
      setText: (v) => setText(v),
      onState: (v, tap) => { setVstate(v); setVtap(!!tap); micR.current = v !== 'idle'; },
      onToast: (m) => toast(m),
      onActivity: () => activity(),
      canStart: () => (callR.current.phase !== 'idle' ? 'Voice typing is not available during a call.' : vnR.current.rec ? 'Finish the voice message first.' : null),
      engine: () => (sttR.current ? 'cloud' : 'browser'),
      transcribe: async (blob) => {
        const fd = new FormData(); fd.append('audio', blob, 'speech');
        const r = await fetch('/api/transcribe', { method: 'POST', body: fd });
        if (r.status === 401) { logout(); throw new Error('Your session has ended.'); }
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Voice typing failed. Please try again.');
        return d.text || '';
      },
    });
  }
  // Press-and-hold microphone. Window-level listeners guarantee the release is always seen, even if the finger slides off
  // the button or the layout changes while it is held.
  const micOffR = useRef(null);
  const micDown = (e) => {
    if (e.button > 0 || e.isPrimary === false) return;
    const v = voiceR.current;
    if (micOffR.current) micOffR.current(); // listeners of an earlier press whose release never arrived
    const up = () => { off(); v.release(); }, cancel = () => { off(); v.cancelPress(); };
    const off = () => { window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); if (micOffR.current === off) micOffR.current = null; };
    micOffR.current = off;
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
    v.press();
  };
  const micKey = (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); voiceR.current.toggle(); } };
  const swapLang = () => { const l = voiceR.current.swap(); setLang(l); toast(l === 'hi-IN' ? 'Voice language: Hindi' : 'Voice language: English (India)'); };
  useEffect(() => {
    const v = voiceR.current;
    const h = (e) => { if (e.key === 'Escape') v.stop(); };
    const hide = () => { if (document.visibilityState !== 'visible') v.cancelPress(); };
    document.addEventListener('keydown', h);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('blur', hide);
    // The mic must not steal focus (that would close the keyboard in the middle of a recording) and must not scroll the page
    const f = formR.current;
    const block = (e) => { if (e.target.closest && e.target.closest('[data-mic]')) e.preventDefault(); };
    if (f) { f.addEventListener('touchstart', block, { passive: false }); f.addEventListener('mousedown', block); }
    return () => {
      document.removeEventListener('keydown', h); document.removeEventListener('visibilitychange', hide); window.removeEventListener('blur', hide);
      if (f) { f.removeEventListener('touchstart', block); f.removeEventListener('mousedown', block); }
      v.halt();
    };
  }, []);

  // ---------- mobile keyboard / dynamic viewport ----------
  // The chat is pinned to the *visual* viewport: when the keyboard opens it shrinks to the space above the keyboard
  // (input stays visible); when it closes it returns to the full height at once. interactive-widget=resizes-content
  // (layout.js) covers Android Chrome; visualViewport covers iOS Safari, which resizes only the visual viewport.
  useEffect(() => {
    const vv = window.visualViewport, root = document.documentElement;
    let maxH = Math.max(window.innerHeight, vv ? vv.height : 0), raf = 0;
    const apply = () => {
      raf = 0;
      const h = vv ? vv.height : window.innerHeight, top = vv ? vv.offsetTop : 0;
      if (h > maxH) maxH = h;
      const field = document.activeElement && document.activeElement.matches && document.activeElement.matches('textarea,input');
      const open = !!field && h < maxH - 120;
      root.style.setProperty('--vvh', Math.round(h) + 'px');
      root.style.setProperty('--vvt', Math.round(top) + 'px');
      setKb((k) => (k === open ? k : open));
      if (!open && (window.scrollX || window.scrollY)) window.scrollTo(0, 0); // iOS can leave the page scrolled after the keyboard closes
      const l = listR.current;
      if (l && nearBottomR.current) l.scrollTo({ top: l.scrollHeight, behavior: 'instant' }); // keep the latest messages in view
    };
    const sched = () => { if (!raf) raf = requestAnimationFrame(apply); };
    const late = () => { sched(); setTimeout(sched, 120); setTimeout(sched, 350); }; // some browsers report the final size late
    const rotate = () => { maxH = 0; late(); };
    apply();
    if (vv) { vv.addEventListener('resize', sched); vv.addEventListener('scroll', sched); }
    window.addEventListener('resize', sched);
    window.addEventListener('orientationchange', rotate);
    window.addEventListener('pageshow', late);
    document.addEventListener('focusin', late);
    document.addEventListener('focusout', late);
    return () => {
      if (vv) { vv.removeEventListener('resize', sched); vv.removeEventListener('scroll', sched); }
      window.removeEventListener('resize', sched); window.removeEventListener('orientationchange', rotate); window.removeEventListener('pageshow', late);
      document.removeEventListener('focusin', late); document.removeEventListener('focusout', late);
      if (raf) cancelAnimationFrame(raf);
      root.style.removeProperty('--vvh'); root.style.removeProperty('--vvt');
    };
  }, []);
  const vconn = !!call.video && call.phase === 'connected' && link === 'connected';
  useEffect(() => {
    if (!vconn) return;
    setUi(true);
    const t = setTimeout(() => setUi(false), 3500);
    return () => clearTimeout(t);
  }, [vconn]);
  // An incoming or outgoing call takes over the screen: close any open menu or popup so nothing stays above the call controls
  useEffect(() => { if (call.phase !== 'idle') { setMenu(null); setPop(''); } }, [call.phase]);
  useEffect(() => { const t = taR.current; if (!t) return; t.style.height = 'auto'; if (text) t.style.height = Math.min(t.scrollHeight, 120) + 'px'; else t.style.height = ''; }, [text]);

  const canShare = typeof navigator !== 'undefined' && !!navigator.share;
  const canCopyImg = typeof ClipboardItem !== 'undefined' && !!(typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.write);
  const openMenu = (kind, m, el) => {
    const r = el.getBoundingClientRect(), w = 220;
    const n = 2 + (m && m.type === 'text' ? (canShare ? 2 : 1) : m && m.type === 'image' ? (canShare ? 1 : 0) + (canCopyImg ? 1 : 0) : 0);
    const h = kind === 'msg' ? 62 + 44 * n : 210;
    const vh = window.visualViewport ? window.visualViewport.height : innerHeight;
    let y = r.top - h - 8; if (y < 8) y = Math.max(8, Math.min(r.bottom + 8, vh - h - 8));
    setPop('');
    setMenu({ kind, m, y, x: Math.max(8, Math.min(r.left + (r.width - w) / 2, innerWidth - w - 8)) });
  };
  const openAcct = (el) => {
    const r = el.getBoundingClientRect(), w = 232;
    setPop('');
    setMenu({ kind: 'acct', y: r.bottom + 6, x: Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) });
  };
  const copyText = (t) => { try { navigator.clipboard.writeText(t).then(() => toast('Copied'), () => toast('Could not copy')); } catch { toast('Could not copy'); } };
  async function imageBlob(url) { const r = await fetch(url); if (!r.ok) throw new Error('fetch'); return r.blob(); }
  async function copyImage(url) {
    try {
      const b = await imageBlob(url);
      const bmp = await createImageBitmap(b); // the clipboard only accepts PNG
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
      const png = await new Promise((res) => c.toBlob(res, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      toast('Image copied');
    } catch { toast('Could not copy this image'); }
  }
  async function shareMsg(m) {
    try {
      if (m.type === 'text') { await navigator.share({ text: m.text }); return; }
      let b = null;
      try { b = await imageBlob(m.url); } catch {}
      const file = b && new File([b], 'zivo-photo.' + ((b.type || 'image/jpeg').split('/')[1] || 'jpg').replace('jpeg', 'jpg'), { type: b.type || 'image/jpeg' });
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file] });
      else await navigator.share({ url: m.url });
    } catch (e) { if (!e || e.name !== 'AbortError') toast('Could not share'); }
  }
  async function shareApp() {
    const url = location.origin;
    try { if (navigator.share) await navigator.share({ title: 'ZIVO', url }); else { await navigator.clipboard.writeText(url); toast('Link copied'); } }
    catch (e) { if (!e || e.name !== 'AbortError') toast('Could not share'); }
  }
  const heart = (m) => setRx((r) => ({ ...r, [m.id]: r[m.id] ? null : '❤️' }));
  const visible = msgs.filter((m) => !hid.includes(m.id));
  const peerSeenTs = peerSeen ? Number(peerSeen.split('-')[0]) || 0 : 0; // messages up to this time were seen by the other person
  const last = visible[visible.length - 1];

  const renderCall = () => {
    const v = !!call.video, inc = call.phase === 'incoming', on = call.phase === 'connected', live = on && link === 'connected';
    const secs = connT.current ? Math.max(0, Math.floor((now - connT.current) / 1000)) : 0;
    const status = inc ? `Incoming ${v ? 'video' : 'voice'} call…` : live ? mmss(secs) : on ? 'Connecting…' : v ? 'Video calling…' : 'Calling…';
    const B = (cls, icon, label, fn) => (
      <div className="cw"><button type="button" className={'cb ' + cls} aria-label={label} aria-pressed={cls === 'on' ? true : undefined} onClick={fn}><MIc n={icon} size={24} /></button><span>{label}</span></div>
    );
    return (
      <section className={'call' + (v ? ' vid' : '') + (vconn ? ' conn' : '') + (inc ? ' in' : '') + (vconn && !ui ? ' idle' : '')} aria-label="Call"
        onClick={() => { setUi(true); clearTimeout(uiT.current); uiT.current = setTimeout(() => setUi(false), 3500); }}>
        <video ref={remoteV} className="remote" autoPlay playsInline style={{ display: vconn ? 'block' : 'none' }} />
        {v && on && <div className={'pip live' + (camOff ? ' off' : '')}><video ref={localV} autoPlay playsInline muted /></div>}
        <div className="ctop">
          <div className="big"><Av p={profiles && profiles[peer]} size={vconn ? 40 : 56} /></div>
          <h2>{names[peer]}</h2>
          <p aria-live="polite">{status}</p>
          {!v && !inc && <div className="wf" aria-hidden="true">{WAVE}</div>}
        </div>
        <div className={'ctl' + (inc ? ' inc' : '')}>
          {inc ? (<>{B('red', 'phone', 'Decline', () => hangup())}{B('grn', v ? 'video' : 'phone', 'Accept', accept)}</>) : (
            <>{B(muted ? 'on' : '', muted ? 'micoff' : 'mic', 'Mute', toggleMic)}
              {v && B(camOff ? 'on' : '', camOff ? 'camoff' : 'video', 'Camera', toggleCam)}
              {B(!spk ? 'on' : '', 'speaker', 'Speaker', toggleSpk)}
              {B('red', 'phone', 'End', () => hangup())}</>
          )}
        </div>
        <div className="swh" role="presentation"
          onPointerDown={(e) => { swy.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { if (swy.current !== null && swy.current - e.clientY > 90) { swy.current = null; accept(); } }}
          onPointerUp={() => { swy.current = null; }}><MIc n="up" size={18} />Swipe up to answer</div>
      </section>
    );
  };

  return (
    <div className="mchat-wrap"><div className={'mchat' + (list ? ' show-list' : '') + (kb ? ' kb' : '')}
      onPointerDown={(e) => { if (!e.target.closest('.menu,.pop,[data-pop]')) { setMenu(null); setPop(''); } }}>
      <aside className="side" aria-label="Conversations">
        <div className="sh"><h1 className="brand">Morning</h1></div>
        <button className="ci" onClick={() => { setList(false); taR.current && taR.current.focus(); }}>
          <div className="av"><Av p={profiles && profiles[peer]} size={22} /></div>
          <div className="mid"><b>{names[peer]}</b><small>{last ? snip(last) : 'No messages yet'}</small></div>
          <time>{last ? hm(last.createdAt) : ''}</time>
        </button>
        <div className="sf"><MIc n="lock" size={16} />Private chat · photos &amp; videos delete in 24h</div>
      </aside>
      <main className="chat">
        <header className="hd">
          <button className="ib flat back" aria-label="Back to chats" onClick={() => setList(true)}><MIc n="arrow" /></button>
          <div className="who">
            <div className="av"><Av p={profiles && profiles[peer]} size={24} /></div>
            <div style={{ minWidth: 0 }}><div className="nm">{names[peer]} <MIc n="badge" size={18} /></div><div className="st">{(profiles && profiles[peer].bio) || 'Private & secure'}</div></div>
          </div>
          <button className="ib qcall" aria-label="Voice call" onClick={() => startCall(false)}><MIc n="phone" size={20} /></button>
          <button className="ib qcall" aria-label="Video call" onClick={() => startCall(true)}><MIc n="video" size={20} /></button>
          <button className="ib flat" data-pop="acct" aria-label="Menu" aria-haspopup="menu" aria-expanded={!!menu && menu.kind === 'acct'} onClick={(e) => (menu && menu.kind === 'acct' ? setMenu(null) : openAcct(e.currentTarget))}><MIc n="more" size={22} /></button>
        </header>
        <div className="feed" ref={listR} role="log" aria-live="polite" onScroll={(e) => { const l = e.currentTarget; nearBottomR.current = l.scrollHeight - l.scrollTop - l.clientHeight < 120; }}>
          <span className="pill"><MIc n="lock" size={14} />Private chat</span>
          <span className={'pill' + (left <= 15 ? ' low' : '')}>Auto logout in {clock}</span>
          {visible.length === 0 && <span className="pill">Today</span>}
          {visible.map((m, i) => {
            const retryLabel = optimisticRetryLabel(m);
            const showDay = i === 0 || dayKey(visible[i - 1].createdAt) !== dayKey(m.createdAt);
            const row = (() => {
            const mine = m.from === me;
            if (m.type === 'call') {
              const st = m.status, miss = !mine && (st === 'missed' || st === 'cancelled'), bad = st !== 'done';
              return (
                <div key={m.id} className="row evrow">
                  <div className={'ev ' + (miss ? 'miss' : bad ? 'neu' : '')} role="button" tabIndex={0} aria-label={callTitle(m, mine) + '. Open details'}
                    onClick={(e) => openMenu('ev', m, e.currentTarget)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.click()}>
                    <i><MIc n={m.video ? 'video' : 'phone'} size={20} /></i>
                    <div><b>{callTitle(m, mine)}</b><small>{mine ? 'Outgoing' : 'Incoming'}{st === 'done' ? ' · ' + mmss(m.dur || 0) : ''}</small><small>{hm(m.createdAt)}</small></div>
                    {bad && <button className="evb" onClick={(e) => { e.stopPropagation(); startCall(!!m.video); }}>{miss ? 'Call back' : 'Call again'}</button>}
                  </div>
                </div>
              );
            }
            const gone = m.type !== 'text' && (m.expired || !m.url || (m.expiresAt && m.expiresAt < now));
            const body = m.type === 'text' ? <span dir="auto" style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
              : gone ? <span className="fl"><i><MIc n="image" size={20} /></i><span>Deleted after 24 hours</span></span>
              : m.type === 'voice' ? <VoicePlayer url={m.url} dur={m.dur} />
              : m.type === 'image' ? <img src={m.url} alt="Shared photo" loading="lazy" />
              : <video src={m.url} controls playsInline preload="metadata" style={{ maxWidth: '100%', borderRadius: 14, display: 'block' }} />;
            return (
              <div key={m.id} className={'row ' + (mine ? 'out' : 'in')}>
                {!mine && <div className="sa"><Av p={profiles && profiles[peer]} size={16} /></div>}
                <div className="col">
                  <div className={'bub' + (m.type === 'image' || m.type === 'video' ? ' media' : '')} tabIndex={0} role="button" aria-label={`${mine ? 'You' : names[peer]}: ${snip(m)}. Press Enter for options`}
                    onContextMenu={(e) => { e.preventDefault(); openMenu('msg', m, e.currentTarget); }}
                    onDoubleClick={() => heart(m)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) { e.preventDefault(); openMenu('msg', m, e.currentTarget); } }}
                    onPointerDown={(e) => { const el = e.currentTarget; lp.current = setTimeout(() => openMenu('msg', m, el), 450); }}
                    onPointerUp={() => clearTimeout(lp.current)} onPointerLeave={() => clearTimeout(lp.current)} onPointerCancel={() => clearTimeout(lp.current)}>
                    {m.reply && <div className="quote"><b>{quotedAuthor(m) === me ? 'You' : names[quotedAuthor(m) || peer]}</b>{m.reply.text}</div>}
                    {body}
                    <span className="meta">{m.expiresAt && !gone ? `Deletes in ${hoursLeft(m)}h · ` : ''}{hm(m.createdAt)}{mine && (m.status === 'failed' ? <span className="send-failed">Not sent</span> : m.status === 'sending' ? <span>Sending…</span> : <span className={'tk' + (peerSeenTs && m.createdAt <= peerSeenTs ? ' read' : '')}><MIc n={peerSeenTs && m.createdAt <= peerSeenTs ? 'cc' : 'check'} size={15} /></span>)}</span>
                  </div>
                  {retryLabel && <button type="button" className="retry-msg" onClick={(e) => { e.stopPropagation(); send(null, { ...m, replyTo: m.reply }); }}>{retryLabel}</button>}
                  {rx[m.id] && <span className="rx">{rx[m.id]}</span>}
                </div>
              </div>
            );
            })();
            return <Fragment key={m.id}>{showDay && <span className="pill">{dayLabel(m.createdAt)}</span>}{row}</Fragment>;
          })}
        </div>
        <div className={'toast' + (toastT ? ' on' : '')} role="status">{toastT}</div>
        <footer className="comp">
          {replyTo && <div className="rb"><MIc n="reply" size={18} /><div><b>{replyTo.from === me ? 'You' : names[peer]}</b><span>{snip(replyTo)}</span></div><button type="button" className="fb" aria-label="Cancel reply" onClick={() => setReplyTo(null)}><MIc n="x" size={18} /></button></div>}
          {vstate !== 'idle' && <div className="rb" role="status"><MIc n="mic" size={18} /><div><b>{vstate === 'processing' ? 'Converting speech to text…' : vstate === 'starting' ? 'Starting microphone…' : 'Listening…'}</b><span>{vstate === 'processing' ? 'Your text will appear in the message box' : sttR.current ? 'Speak English, Hindi or Hinglish' + (vtap ? ' · tap the mic to stop' : ' · release to stop') : (lang === 'hi-IN' ? 'Hindi' : 'English (India)') + (vtap ? ' · tap the mic to stop' : ' · release to stop')}</span></div></div>}
          {vn !== null && <div className="rb" role="status"><MIc n="mic" size={18} /><div><b>Recording voice message…</b><span>{mmss(vn)}</span></div><button type="button" className="fb" aria-label="Cancel recording" onClick={() => stopVoiceNote(false)}><MIc n="x" size={18} /></button><button type="button" className="fb" aria-label="Send voice message" onClick={() => stopVoiceNote(true)}><MIc n="send" size={18} /></button></div>}
          {busy && <div className="rb"><span>{busy}</span></div>}
          <div className={'pop att' + (pop === 'pa' ? ' on' : '')}>
            <button type="button" onClick={() => { fiR.current.click(); setPop(''); }}><i style={{ background: 'linear-gradient(135deg,#a070ff,#6a3df0)' }}><MIc n="image" /></i>Photo / Video</button>
            <button type="button" onClick={() => { fcR.current.click(); setPop(''); }}><i style={{ background: 'linear-gradient(135deg,#ff8ab4,#e0489a)' }}><MIc n="camera" /></i>Camera</button>
            <button type="button" onClick={startVoiceNote}><i style={{ background: 'linear-gradient(135deg,#34d399,#059669)' }}><MIc n="mic" /></i>Voice message</button>
          </div>
          <div className={'pop emo' + (pop === 'pe' ? ' on' : '')} style={{ left: 12 }}>
            {EMOJI.map((e) => <button key={e} type="button" aria-label={'Insert ' + e} onClick={() => { setText((t) => t + e); taR.current && taR.current.focus(); }}>{e}</button>)}
          </div>
          <form className="cr" onSubmit={send} ref={formR}>
            <button type="button" className="ib" data-pop="pa" aria-label="Attach" aria-expanded={pop === 'pa'} onClick={() => { setMenu(null); setPop((p) => (p === 'pa' ? '' : 'pa')); }}><MIc n="plus" /></button>
            <div className="fld">
              <button type="button" className="fb" data-pop="pe" aria-label="Emoji" onClick={() => { setMenu(null); setPop((p) => (p === 'pe' ? '' : 'pe')); }}><MIc n="smile" /></button>
              <textarea ref={taR} rows={1} placeholder="Type a message..." aria-label="Message" maxLength={2000} value={text} dir="auto"
                onChange={(e) => { setText(e.target.value); voiceR.current.rebase(e.target.value); activity(); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
                // Enter sends, but not while an input method (Hindi/Indic, Chinese, Japanese, Korean...) is still composing a word
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); send(e); } }} />
              <button type="button" data-mic="" className={'fb mic' + (vstate === 'recording' ? ' rec' : vstate === 'starting' ? ' rec dim' : vstate === 'processing' ? ' proc' : '')}
                aria-label={vstate === 'idle' ? 'Hold to speak' : 'Stop voice typing'} aria-pressed={vstate === 'recording'} title="Hold to speak"
                onPointerDown={micDown} onKeyDown={micKey} onContextMenu={(e) => e.preventDefault()} onClick={(e) => e.preventDefault()}>
                {vstate === 'processing' ? <span className="mspin" aria-hidden="true" /> : <MIc n="mic" size={22} />}
              </button>
            </div>
            <button className={'act' + (text.trim() ? '' : ' off')} type="submit" aria-label="Send message" disabled={!text.trim()}><MIc n="send" /></button>
          </form>
          <input ref={fiR} type="file" accept="image/*,video/*" hidden onChange={onFile} />
          <input ref={fcR} type="file" accept="image/*,video/*" capture="environment" hidden onChange={onFile} />
        </footer>
        {call.phase !== 'idle' && renderCall()}
        {prof && <ProfileSheet me={me} p={profiles && profiles[me]} defName={namesBase[me]} onClose={() => setProf(false)} onSaved={setProfiles} onActivity={activity} toast={toast} />}
      </main>
      {menu && (
        <div className="menu" style={{ top: menu.y, left: menu.x }}>
          {menu.kind === 'acct' ? (
            <>
              <button role="menuitem" onClick={() => { setMenu(null); activity(); setProf(true); }}><MIc n="edit" size={18} />Edit profile</button>
              <button role="menuitem" onClick={() => { setMenu(null); startCall(false); }}><MIc n="phone" size={18} />Voice call</button>
              <button role="menuitem" onClick={() => { setMenu(null); startCall(true); }}><MIc n="video" size={18} />Video call</button>
              <button role="menuitem" onClick={() => { setMenu(null); shareApp(); }}><MIc n="share" size={18} />Share app link</button>
              {!stt && <button role="menuitem" onClick={() => { setMenu(null); swapLang(); }}><MIc n="globe" size={18} />Voice: {lang === 'hi-IN' ? 'Hindi' : 'English (India)'}</button>}
              <button role="menuitem" className="dng" onClick={() => { setMenu(null); logout(); }}><MIc n="logout" size={18} />Log out</button>
            </>
          ) : menu.kind === 'msg' ? (
            <>
              <div className="qr">{REACT.map((e) => <button key={e} className={rx[menu.m.id] === e ? 'sel' : ''} aria-label={'React ' + e} onClick={() => { setRx((r) => ({ ...r, [menu.m.id]: r[menu.m.id] === e ? null : e })); setMenu(null); }}>{e}</button>)}</div>
              <button onClick={() => { setReplyTo(menu.m); setMenu(null); taR.current && taR.current.focus(); }}><MIc n="reply" size={18} />Reply</button>
              {menu.m.type === 'text' && <button onClick={() => { copyText(menu.m.text); setMenu(null); }}><MIc n="copy" size={18} />Copy</button>}
              {menu.m.type === 'text' && canShare && <button onClick={() => { const m = menu.m; setMenu(null); shareMsg(m); }}><MIc n="share" size={18} />Share</button>}
              {menu.m.type === 'image' && menu.m.url && canCopyImg && <button onClick={() => { const u = menu.m.url; setMenu(null); copyImage(u); }}><MIc n="copy" size={18} />Copy image</button>}
              {menu.m.type === 'image' && menu.m.url && canShare && <button onClick={() => { const m = menu.m; setMenu(null); shareMsg(m); }}><MIc n="share" size={18} />Share image</button>}
              <button className="dng" onClick={() => { setHid((h) => [...h, menu.m.id]); setMenu(null); }}><MIc n="trash" size={18} />Delete for me</button>
            </>
          ) : (
            <>
              <div style={{ padding: '10px 12px 6px' }}><b>{callTitle(menu.m, menu.m.from === me)}</b></div>
              {[['Type', menu.m.video ? 'Video' : 'Voice'], ['Direction', menu.m.from === me ? 'Outgoing' : 'Incoming'], ['Duration', menu.m.status === 'done' ? mmss(menu.m.dur || 0) : '—'], ['Time', dayLabel(menu.m.createdAt) + ', ' + hm(menu.m.createdAt)]].map(([a, b]) => <div className="dr" key={a}><span>{a}</span><b>{b}</b></div>)}
              <button onClick={() => { const v = !!menu.m.video; setMenu(null); startCall(v); }}><MIc n={menu.m.video ? 'video' : 'phone'} size={18} />Call again</button>
            </>
          )}
        </div>
      )}
    </div></div>
  );
}
