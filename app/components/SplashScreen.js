'use client';

// Full-screen loading screen: ZIVO logo, tagline and spinner on a purple gradient.
export default function SplashScreen() {
  return (
    <div className="splash" role="status" aria-live="polite" aria-label="Loading ZIVO">
      <span className="blob blob-tr" aria-hidden="true" />
      <span className="blob blob-bl" aria-hidden="true" />
      <span className="blob blob-br" aria-hidden="true" />
      <div className="splash-main">
        <img className="logo" src="/zivo-logo.png" alt="ZIVO" width="756" height="353" decoding="async" fetchPriority="high" />
        <p className="tag">Everything, Right When<br />You Need It</p>
      </div>
      <div className="splash-load">
        <span className="spinner" aria-hidden="true" />
        <p>Loading your world...</p>
      </div>
    </div>
  );
}
