// Server-only: the speech-to-text key. Never import this from a client component.
export const sttKey = (env = process.env) => (env.STT_API_KEY || env.OPENAI_API_KEY || '').trim();
