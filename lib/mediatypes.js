// Explicit allow-list of content types for chat media. SVG, HTML and anything scriptable is NOT in here on purpose.
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/heic', 'image/heif'];
export const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/3gpp'];
export const AUDIO_TYPES = ['audio/webm', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/aac'];
export const ALLOWED_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES, ...AUDIO_TYPES];
export const SAFE_TYPES = new Set(ALLOWED_TYPES);
