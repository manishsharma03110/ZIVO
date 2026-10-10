import { NextResponse } from 'next/server';
import { authed } from '@/lib/auth';
import { kvIncr } from '@/lib/store';
import { safe } from '@/lib/http';
import { sttKey } from '@/lib/stt';

// Speech-to-text for voice typing. The API key lives only in Vercel environment variables (never in the browser).
// Works with any OpenAI-compatible transcription endpoint: OpenAI (default), Groq, etc.
//   STT_API_KEY (or OPENAI_API_KEY)  required to turn this route on
//   STT_API_URL                      default https://api.openai.com/v1/audio/transcriptions
//   STT_MODEL                        default gpt-4o-transcribe  (e.g. whisper-large-v3 on Groq)
export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BYTES = 4 * 1000 * 1000; // Vercel functions accept bodies up to 4.5 MB
const LIMIT_PER_MIN = 20;

// The model is told that speech may mix Hindi and English and that the text must stay in Roman letters, so
// "Kal mujhe office jana hai and please remind me at 10 AM" comes back readable instead of half Devanagari.
const PROMPT = 'The speaker mixes Hindi and English (Hinglish). Transcribe exactly what is said, writing Hindi words in Roman letters and English words in English. Example: Kal mujhe office jana hai and please remind me at 10 AM.';

export const POST = safe(async (req) => {
  const ses = await authed(req);
  if (!ses) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const key = sttKey();
  if (!key) return NextResponse.json({ error: 'Voice typing is not set up on the server yet.' }, { status: 503 });

  if ((await kvIncr('stt:' + ses.u, 60)) > LIMIT_PER_MIN) return NextResponse.json({ error: 'Too many voice requests. Please wait a moment.' }, { status: 429 });
  const len = Number(req.headers.get('content-length'));
  if (Number.isFinite(len) && len > MAX_BYTES + 4096) return NextResponse.json({ error: 'Recording is too long.' }, { status: 413 });

  let file;
  try { file = (await req.formData()).get('audio'); } catch { return NextResponse.json({ error: 'The recording could not be read. Please try again.' }, { status: 400 }); }
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'No recording was received. Please try again.' }, { status: 400 });
  if (!/^(audio|video)\//.test(file.type || '')) return NextResponse.json({ error: 'This audio format is not supported.' }, { status: 415 });
  if (file.size < 200) return NextResponse.json({ error: 'The recording was empty. Hold the mic and speak, then release.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Recording is too long.' }, { status: 413 });

  const ext = file.type.includes('mp4') ? 'm4a' : file.type.includes('ogg') ? 'ogg' : 'webm';
  const fd = new FormData();
  fd.append('file', file, `speech.${ext}`);
  fd.append('model', (process.env.STT_MODEL || 'gpt-4o-transcribe').trim());
  fd.append('prompt', PROMPT);
  fd.append('response_format', 'json');
  fd.append('temperature', '0');

  let r;
  try {
    r = await fetch((process.env.STT_API_URL || 'https://api.openai.com/v1/audio/transcriptions').trim(), {
      method: 'POST', headers: { authorization: `Bearer ${key}` }, body: fd, signal: AbortSignal.timeout(25000),
    });
  } catch { return NextResponse.json({ error: 'The speech service is not reachable. Please try again.' }, { status: 502 }); }
  if (!r.ok) {
    console.error('[api] transcribe upstream status', r.status);
    return NextResponse.json({ error: 'Voice typing failed. Please try again.' }, { status: 502 });
  }
  const d = await r.json().catch(() => ({}));
  const text = Array.from(String(d.text || '')).slice(0, 2000).join('').trim();
  return NextResponse.json({ text }, { headers: { 'cache-control': 'no-store' } });
});
