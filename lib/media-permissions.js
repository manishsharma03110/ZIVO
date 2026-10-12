import { STRINGS } from './strings.js';

export const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const CHOICE_PREFIX = 'zivo.permission.';
const PERMISSION_TYPES = new Set(['microphone', 'camera', 'notifications']);

function permissionTypes(request) {
  if (typeof request === 'string') return PERMISSION_TYPES.has(request) ? [request] : [];
  if (!request || typeof request !== 'object') return [];
  if (request.kind === 'notifications') return ['notifications'];
  if (request.kind === 'photo') return ['camera'];
  if (request.video && (request.kind === 'call' || request.kind === 'accept')) return ['microphone', 'camera'];
  return [request.video ? 'camera' : 'microphone'];
}

function getStorage(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function getPermissionChoice(request, storage) {
  const target = getStorage(storage);
  if (!target) return null;
  for (const type of permissionTypes(request)) {
    try {
      if (target.getItem(CHOICE_PREFIX + type) === 'denied') return 'denied';
    } catch {
      return null;
    }
  }
  return null;
}

export function savePermissionChoice(request, choice = 'denied', storage) {
  if (choice !== 'denied' && choice !== 'allowed') return false;
  const target = getStorage(storage);
  if (!target) return false;
  try {
    for (const type of permissionTypes(request)) target.setItem(CHOICE_PREFIX + type, choice);
    return true;
  } catch {
    return false;
  }
}

export function recordPermissionDecision(request, action, storage) {
  if (action === 'cancel') return true;
  if (action === 'dont-allow') return savePermissionChoice(request, 'denied', storage);
  return false;
}

export function clearPermissionChoice(request, storage) {
  const target = getStorage(storage);
  if (!target) return false;
  try {
    for (const type of permissionTypes(request)) target.removeItem(CHOICE_PREFIX + type);
    return true;
  } catch {
    return false;
  }
}

export function permissionStateTransition(current, event) {
  const transitions = {
    open: 'prompt',
    request: 'requesting',
    grant: 'granted',
    deny: 'denied',
    cancel: 'idle',
    retry: 'prompt',
  };
  return Object.hasOwn(transitions, event) ? transitions[event] : current;
}

export function permissionChoiceMessage(request) {
  const types = permissionTypes(request);
  const denied = types.filter((type) => getPermissionChoice(type) === 'denied');
  if (denied.includes('notifications')) return STRINGS.permission.notificationsDeclined;
  if (denied.includes('camera') && denied.includes('microphone')) return STRINGS.permission.combinedDeclined;
  if (denied.includes('camera')) return STRINGS.permission.cameraDeclined;
  if (denied.includes('microphone')) return STRINGS.permission.microphoneDeclined;
  return types.includes('camera') ? STRINGS.permission.cameraDeclined : STRINGS.permission.microphoneDeclined;
}

export function inAppBrowserMessage(userAgent = '') {
  if (/Instagram|FBAN|FBAV|Facebook|WhatsApp|Line\//i.test(userAgent)) {
    return STRINGS.permission.embeddedBrowser;
  }
  return '';
}

export function permissionInstructions(userAgent = '') {
  if (/SamsungBrowser/i.test(userAgent)) return STRINGS.permission.instructionsSamsung;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return STRINGS.permission.instructionsSafari;
  if (/Android/i.test(userAgent)) return STRINGS.permission.instructionsChromeAndroid;
  return STRINGS.permission.instructionsDefault;
}

export function mediaErrorInfo(error, userAgent = '') {
  const name = error && error.name;
  const instructions = permissionInstructions(userAgent);
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return { message: STRINGS.permission.notAllowed, instructions, permission: 'denied' };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return { message: STRINGS.permission.notFound, instructions: '' };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return { message: STRINGS.permission.notReadable, instructions: '' };
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return { message: STRINGS.permission.overconstrained, instructions: '' };
  }
  if (name === 'SecurityError' || name === 'TypeError') {
    return { message: STRINGS.permission.insecure, instructions: '' };
  }
  return { message: STRINGS.permission.genericMediaError, instructions };
}

export async function queryMediaPermission(navigatorObject, kind = 'audio') {
  if (!navigatorObject || !navigatorObject.permissions || typeof navigatorObject.permissions.query !== 'function') return 'unsupported';
  const names = permissionNames(kind);
  try {
    return summarizePermissions(await Promise.all(names.map((name) => navigatorObject.permissions.query({ name }))));
  } catch {
    return 'unsupported';
  }
}

function permissionNames(kind) {
  return kind === 'video' ? ['microphone', 'camera']
    : kind === 'camera' ? ['camera']
      : kind === 'notifications' ? ['notifications']
        : ['microphone'];
}

function summarizePermissions(statuses) {
  const states = statuses.map((status) => status.state);
  if (states.includes('denied')) return 'denied';
  if (states.includes('prompt')) return 'prompt';
  return states.length && states.every((state) => state === 'granted') ? 'granted' : 'unknown';
}

export function observeMediaPermission(navigatorObject, kind, onChange) {
  const permissions = navigatorObject && navigatorObject.permissions;
  if (!permissions || typeof permissions.query !== 'function') {
    onChange('unsupported');
    return () => {};
  }
  let disposed = false;
  let observed = [];
  const listeners = [];
  const publish = () => {
    if (!disposed) onChange(summarizePermissions(observed));
  };
  Promise.all(permissionNames(kind).map((name) => permissions.query({ name })))
    .then((statuses) => {
      if (disposed) return;
      observed = statuses;
      publish();
      for (const status of statuses) {
        const listener = publish;
        if (typeof status.addEventListener === 'function') {
          status.addEventListener('change', listener);
          listeners.push(() => status.removeEventListener('change', listener));
        } else {
          const previous = status.onchange;
          const handler = (event) => {
            if (typeof previous === 'function') previous.call(status, event);
            listener();
          };
          status.onchange = handler;
          listeners.push(() => {
            if (status.onchange === handler) status.onchange = previous || null;
          });
        }
      }
    })
    .catch(() => {
      if (!disposed) onChange('unsupported');
    });
  return () => {
    disposed = true;
    listeners.forEach((remove) => remove());
  };
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
  if (embeddedMessage) return { ok: false, message: embeddedMessage, instructions: STRINGS.permission.openExternal };
  if (win && win.isSecureContext === false && !secureLocalhost(win)) {
    return { ok: false, message: STRINGS.permission.insecure, instructions: '' };
  }
  const getUserMedia = nav && nav.mediaDevices && nav.mediaDevices.getUserMedia;
  if (typeof getUserMedia !== 'function') {
    return { ok: false, message: STRINGS.permission.unsupportedMedia, instructions: '' };
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
          message: STRINGS.permission.audioOnlyFallback,
        };
      } catch (audioError) {
        error = audioError;
      }
    }
    const info = mediaErrorInfo(error, userAgent);
    return { ok: false, ...info, permission: await permissionPromise };
  }
}