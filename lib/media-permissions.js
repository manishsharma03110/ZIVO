const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

export function inAppBrowserMessage(userAgent = '') {
  if (/Instagram|FBAN|FBAV|Facebook|WhatsApp|Line\//i.test(userAgent)) {
    return 'Yeh in-app browser mic/camera ko block kar sakta hai. Page ko Chrome ya Safari mein kholo.';
  }
  return '';
}

export function permissionInstructions(userAgent = '') {
  if (/SamsungBrowser/i.test(userAgent)) return 'Samsung Internet: address bar ke lock icon par tap karo, Site permissions kholo, Microphone/Camera ko Allow karo, phir Dobara try karo.';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iPhone/iPad: Settings → Apps → Safari → Microphone/Camera mein Allow karo. Safari ke aA/site settings mein bhi permission check karke Dobara try karo.';
  if (/Android/i.test(userAgent)) return 'Chrome Android: address bar ke lock/site icon → Permissions → Microphone/Camera → Allow. Phir page reload karke Dobara try karo.';
  return 'Browser ke site settings mein Microphone/Camera ko Allow karo, phir Dobara try karo.';
}

export function mediaErrorInfo(error, userAgent = '') {
  const name = error && error.name;
  const instructions = permissionInstructions(userAgent);
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return { message: 'Mic ya camera ki permission deny hui hai.', instructions };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return { message: 'Is device par microphone ya camera nahi mila.', instructions: '' };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return { message: 'Mic ya camera doosre app mein busy hai. Doosra app band karke dobara try karo.', instructions: '' };
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return { message: 'Is device par yeh mic/camera setting supported nahi hai. Browser ya device settings check karo.', instructions: '' };
  }
  if (name === 'SecurityError' || name === 'TypeError') {
    return { message: 'Mic/camera ke liye secure HTTPS connection chahiye. Site ko HTTPS par kholo.', instructions: '' };
  }
  return { message: 'Mic ya camera start nahi ho saka. Permission aur device settings check karke dobara try karo.', instructions };
}

export async function queryMediaPermission(navigatorObject, kind = 'audio') {
  if (!navigatorObject || !navigatorObject.permissions || typeof navigatorObject.permissions.query !== 'function') return 'unsupported';
  const names = kind === 'video' ? ['microphone', 'camera'] : ['microphone'];
  try {
    const states = await Promise.all(names.map(async (name) => (await navigatorObject.permissions.query({ name })).state));
    if (states.includes('denied')) return 'denied';
    if (states.includes('prompt')) return 'prompt';
    return states.every((state) => state === 'granted') ? 'granted' : 'unknown';
  } catch {
    return 'unsupported';
  }
}

const secureLocalhost = (win) => {
  const host = win && win.location && win.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
};

export async function requestMediaStream({ video = false, navigatorObject, windowObject } = {}) {
  const nav = navigatorObject || (typeof navigator !== 'undefined' ? navigator : null);
  const win = windowObject || (typeof window !== 'undefined' ? window : null);
  const userAgent = nav && nav.userAgent || '';
  const embeddedMessage = inAppBrowserMessage(userAgent);
  if (embeddedMessage) return { ok: false, message: embeddedMessage, instructions: 'Browser ke menu se Open in Chrome/Safari chuno.' };
  if (win && win.isSecureContext === false && !secureLocalhost(win)) {
    return { ok: false, message: 'Mic/camera ke liye secure HTTPS connection chahiye. Site ko HTTPS par kholo.', instructions: '' };
  }
  const getUserMedia = nav && nav.mediaDevices && nav.mediaDevices.getUserMedia;
  if (typeof getUserMedia !== 'function') {
    return { ok: false, message: 'Is browser mein mic/camera access supported nahi hai. Chrome ya Safari mein kholo.', instructions: '' };
  }

  const permissionPromise = queryMediaPermission(nav, video ? 'video' : 'audio');
  try {
    const stream = await getUserMedia.call(nav.mediaDevices, {
      audio: AUDIO,
      video: video ? { facingMode: 'user' } : false,
    });
    return { ok: true, stream, permission: await permissionPromise, downgraded: false };
  } catch (error) {
    if (video) {
      try {
        const stream = await getUserMedia.call(nav.mediaDevices, { audio: AUDIO, video: false });
        return {
          ok: true,
          stream,
          permission: await permissionPromise,
          downgraded: true,
          message: 'Camera nahi chala; call audio-only mode mein connect hogi.',
        };
      } catch (audioError) {
        error = audioError;
      }
    }
    const info = mediaErrorInfo(error, userAgent);
    return { ok: false, ...info, permission: await permissionPromise };
  }
}