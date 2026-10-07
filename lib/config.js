// Server-only configuration validation. Never import this from a client component.
// Reports WHICH setting is wrong, never the VALUE of any secret.

export const CODE_RE = /^\S{10}$/;
export const SECRET_MIN = 32;

const clean = (v) => (typeof v === 'string' ? v.trim() : '');

// Returns { ok, problems: string[], report: {name: status} } for the given environment.
export function checkConfig(env = process.env, opts = {}) {
  const secret = clean(env.SESSION_SECRET);
  const a = clean(env.CODE_A);
  const b = clean(env.CODE_B);
  const problems = [];
  const report = {};

  if (!secret) { report.SESSION_SECRET = 'missing'; problems.push('SESSION_SECRET is missing'); }
  else if (secret.length < SECRET_MIN) { report.SESSION_SECRET = `too short (need ${SECRET_MIN}+ characters)`; problems.push('SESSION_SECRET is too short'); }
  else report.SESSION_SECRET = 'configured';

  for (const [name, v] of [['CODE_A', a], ['CODE_B', b]]) {
    if (!v) { report[name] = 'missing'; problems.push(`${name} is missing`); }
    else if (/\s/.test(v)) { report[name] = 'invalid (contains whitespace)'; problems.push(`${name} contains whitespace`); }
    else if (Array.from(v).length !== 10) { report[name] = `invalid length (${Array.from(v).length}, expected 10)`; problems.push(`${name} must be exactly 10 characters`); }
    else report[name] = 'configured';
  }

  if (a && b) {
    report['CODE_A == CODE_B'] = String(a === b);
    if (a === b) problems.push('CODE_A and CODE_B must be different');
  }

  // Storage. In production (Vercel) memory storage is refused, so Redis is mandatory there.
  const production = opts.production ?? !!(env.VERCEL || env.NODE_ENV === 'production');
  const hasRedis = !!((env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL) && (env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN));
  report.REDIS = hasRedis ? 'configured' : 'missing';
  if (!hasRedis && production) problems.push('Redis (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) is required in production');

  const warnings = [];
  report.BLOB = clean(env.BLOB_READ_WRITE_TOKEN) ? 'configured' : 'missing';
  if (report.BLOB === 'missing' && production) warnings.push('BLOB_READ_WRITE_TOKEN is missing: photo, video and voice messages cannot be sent');
  report.CRON_SECRET = clean(env.CRON_SECRET) ? 'configured' : 'missing';
  if (report.CRON_SECRET === 'missing' && production) warnings.push('CRON_SECRET is missing: the daily cleanup job will be refused (503)');

  return { ok: problems.length === 0, problems, warnings, report };
}

// Values used by the app, trimmed the same way they were validated.
export const secretValue = (env = process.env) => { const s = clean(env.SESSION_SECRET); return s.length >= SECRET_MIN ? s : ''; };
export const codeValue = (which, env = process.env) => clean(which === 'A' ? env.CODE_A : env.CODE_B);
