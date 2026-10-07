'use client';
import { useRef, useState } from 'react';

const LEN = 10; // the field takes exactly 10 characters: letters, numbers or a mix

const post = (url, body) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function GoogleG() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

// Login screen. The field accepts the account's access value; it is masked while typing.
export default function LoginScreen({ onDone }) {
  const [value, setValue] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [shaking, setShaking] = useState(false);
  const inputR = useRef(null);
  const ready = value.length === LEN;

  // Gentle feedback on a mistake: the field shakes and the phone vibrates briefly
  function oops(message) {
    setErr(message); setShaking(true); setTimeout(() => setShaking(false), 450);
    try { navigator.vibrate && navigator.vibrate(40); } catch {}
    inputR.current && inputR.current.focus();
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setInfo('');
    if (!value) return oops('Please enter your mobile number.');
    if (!ready) return oops('Please enter a valid 10-digit mobile number.');
    setBusy(true); setErr('');
    try {
      const r = await post('/api/login', { code: value });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401 || r.status === 400) oops(r.status === 400 ? 'Please enter a valid 10-digit mobile number.' : 'Invalid mobile number. Please try again.');
      else if (!r.ok) oops(d.error || 'Login failed. Please try again.');
      else await onDone();
    } catch { oops('Network error. Please check your connection and try again.'); }
    setBusy(false);
  }

  const placeholder = (what) => { setErr(''); setInfo(`${what} is coming soon. Please continue with your mobile number.`); };

  return (
    <main className="loginpage">
      <section className="hero">
        <img className="art" src="/login-hero.jpg" alt="" width="500" height="348" decoding="async" fetchPriority="high" />
        <h2>Fresh groceries,<br />daily essentials,<br />delivered fast.</h2>
      </section>

      <form className="loginform" onSubmit={submit} noValidate>
        <h1>Welcome Back!</h1>
        <p className="sub">Log in to your ZIVO account and get<br />your essentials delivered.</p>

        <label className={'field' + (err ? ' bad' : '') + (shaking ? ' shake' : '')}>
          <svg className="flag" viewBox="0 0 36 26" aria-hidden="true">
            <rect width="36" height="26" rx="3" fill="#fff" />
            <path d="M0 3a3 3 0 0 1 3-3h30a3 3 0 0 1 3 3v8H0z" fill="#f59e2b" />
            <path d="M0 15h36v8a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3z" fill="#1b8a3d" />
            <circle cx="18" cy="13" r="3.4" fill="none" stroke="#2742a8" strokeWidth="1" />
          </svg>
          <span className="cc">+91</span>
          <svg className="chev" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="#5b5870" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <input ref={inputR} type="password" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="go"
            maxLength={LEN} placeholder="Enter your mobile number" value={value}
            aria-label="Enter your mobile number" aria-invalid={!!err}
            onChange={(e) => { setValue(e.target.value.replace(/\s/g, '').slice(0, LEN)); setErr(''); setInfo(''); }} />
        </label>

        <div className="msg err" role="alert">{err}</div>

        <button className={'cta' + (ready ? ' ready' : '')} type="submit" disabled={busy} aria-busy={busy}>
          {busy ? <><span className="btn-spin" aria-hidden="true" />Please wait…</> : 'Continue'}
        </button>

        <div className="or" aria-hidden="true"><span>OR</span></div>

        <button type="button" className="gbtn" onClick={() => placeholder('Google sign-in')}>
          <GoogleG /> Continue with Google
        </button>

        <div className="msg info" role="status">{info}</div>

        <p className="signup">Don&apos;t have an account?{' '}
          <button type="button" className="lnk" onClick={() => placeholder('Sign up')}>Sign Up</button>
        </p>
        <p className="terms">By continuing, you agree to our <span>Terms of Use</span> &amp; <span>Privacy Policy</span></p>
      </form>
    </main>
  );
}
