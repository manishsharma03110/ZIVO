import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getPermissionChoice,
  mediaErrorInfo,
  permissionStateTransition,
  recordPermissionDecision,
} from '../lib/media-permissions.js';

const root = fileURLToPath(new URL('..', import.meta.url));

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.isFile() && /\.(js|mjs)$/.test(entry.name) ? [path] : [];
  });
}

test('permission state machine covers prompt, grant, deny and cancel', () => {
  assert.equal(permissionStateTransition('idle', 'open'), 'prompt');
  assert.equal(permissionStateTransition('prompt', 'request'), 'requesting');
  assert.equal(permissionStateTransition('requesting', 'grant'), 'granted');
  assert.equal(permissionStateTransition('prompt', 'deny'), 'denied');
  assert.equal(permissionStateTransition('prompt', 'cancel'), 'idle');
});

test('Don’t allow persists per permission and is read back; Cancel leaves storage unchanged', () => {
  const storage = memoryStorage();
  assert.equal(recordPermissionDecision({ kind: 'voice' }, 'dont-allow', storage), true);
  assert.equal(getPermissionChoice({ kind: 'voice' }, storage), 'denied');
  const before = new Map(storage.values);
  assert.equal(recordPermissionDecision({ kind: 'call', video: true }, 'cancel', storage), true);
  assert.deepEqual(storage.values, before);
});

test('video call denial is stored for both microphone and camera', () => {
  const storage = memoryStorage();
  recordPermissionDecision({ kind: 'call', video: true }, 'dont-allow', storage);
  assert.equal(getPermissionChoice('microphone', storage), 'denied');
  assert.equal(getPermissionChoice('camera', storage), 'denied');
});

test('media errors are mapped to clear English messages', () => {
  assert.match(mediaErrorInfo({ name: 'NotAllowedError' }).message, /access is blocked/i);
  assert.match(mediaErrorInfo({ name: 'NotFoundError' }).message, /No microphone or camera/i);
  assert.match(mediaErrorInfo({ name: 'NotReadableError' }).message, /being used by another app/i);
  assert.match(mediaErrorInfo({ name: 'OverconstrainedError' }).message, /does not support/i);
  assert.match(mediaErrorInfo({ name: 'SecurityError' }).message, /secure HTTPS/i);
});

test('no location request exists and the permissions policy allows only required media', () => {
  const files = [...sourceFiles(join(root, 'app')), ...sourceFiles(join(root, 'lib'))];
  const contents = files.map((path) => readFileSync(path, 'utf8'));
  assert.equal(contents.some((source) => /navigator\s*\.\s*geolocation\b/.test(source)), false);

  const config = readFileSync(join(root, 'next.config.mjs'), 'utf8');
  const policy = config.match(/key:\s*'Permissions-Policy',\s*value:\s*'([^']+)'/);
  assert.ok(policy);
  assert.match(policy[1], /(?:^|,\s*)microphone=\(self\)(?:,|$)/);
  assert.match(policy[1], /(?:^|,\s*)camera=\(self\)(?:,|$)/);
  assert.match(policy[1], /(?:^|,\s*)geolocation=\(\)(?:,|$)/);
});

test('only the permission helper calls getUserMedia in application source', () => {
  const appAndLib = [...sourceFiles(join(root, 'app')), ...sourceFiles(join(root, 'lib'))];
  const callers = appAndLib.filter((path) => /getUserMedia\s*\.\s*call\s*\(|\.getUserMedia\s*\(/.test(readFileSync(path, 'utf8')));
  assert.deepEqual(callers, [join(root, 'lib', 'media-permissions.js')]);
});
