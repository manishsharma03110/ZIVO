// Minimal Upstash-REST-compatible server for tests (GET/SET/INCR/DECR/EXPIRE/TTL/DEL/MGET/RPUSH/LTRIM/LRANGE).
// It is NOT real Redis; it exists to exercise the app's real Redis code path (and many separate "instances") offline.
import http from 'node:http';

export function startFakeRedis() {
  const kv = new Map(); const stats = { commands: 0, log: [] }; let down = false;
  const alive = (k) => { const e = kv.get(k); if (!e) return null; if (e.exp && e.exp <= Date.now()) { kv.delete(k); return null; } return e; };
  const idx = (i, n) => (i < 0 ? Math.max(n + i, 0) : i);
  function run(cmd) {
    const [c, ...a] = cmd; const name = String(c).toLowerCase(); stats.commands++; stats.log.push(name);
    const k = a[0] !== undefined ? String(a[0]) : '';
    switch (name) {
      case 'get': { const e = alive(k); return e && typeof e.v === 'string' ? e.v : null; }
      case 'set': {
        const opts = a.slice(2).map((x) => String(x).toLowerCase()); let ex = 0;
        const i = opts.indexOf('ex'); if (i >= 0) ex = Number(a[2 + i + 1]);
        if (opts.includes('nx') && alive(k)) return null;
        kv.set(k, { v: String(a[1]), exp: ex ? Date.now() + ex * 1000 : 0 }); return 'OK';
      }
      case 'incr': case 'decr': { const e = alive(k); const n = (e ? Number(e.v) : 0) + (name === 'incr' ? 1 : -1); kv.set(k, { v: String(n), exp: e ? e.exp : 0 }); return n; }
      case 'expire': { const e = alive(k); if (!e) return 0; e.exp = Date.now() + Number(a[1]) * 1000; return 1; }
      case 'ttl': { const e = alive(k); return !e ? -2 : e.exp ? Math.ceil((e.exp - Date.now()) / 1000) : -1; }
      case 'del': { let n = 0; for (const x of a) { if (alive(String(x))) { kv.delete(String(x)); n++; } } return n; }
      case 'mget': return a.map((x) => { const e = alive(String(x)); return e ? e.v : null; });
      case 'rpush': { const e = alive(k) || { v: [], exp: 0 }; for (const v of a.slice(1)) e.v.push(String(v)); kv.set(k, e); return e.v.length; }
      case 'ltrim': { const e = alive(k); if (!e) return 'OK'; const n = e.v.length, s = idx(Number(a[1]), n), t = idx(Number(a[2]), n); e.v = e.v.slice(s, t + 1); return 'OK'; }
      case 'lrange': { const e = alive(k); if (!e) return []; const n = e.v.length, s = idx(Number(a[1]), n), t = idx(Number(a[2]), n); return e.v.slice(s, t + 1); }
      default: throw new Error('ERR unknown command ' + name);
    }
  }
  const enc = (v, b64) => (!b64 ? v : typeof v === 'string' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map((x) => enc(x, b64)) : v);
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => (body += d));
    req.on('end', () => {
      if (down) { res.writeHead(503); return res.end('{"error":"down"}'); }
      const b64 = /base64/i.test(req.headers['upstash-encoding'] || '');
      const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      try {
        const data = JSON.parse(body);
        if (req.url === '/pipeline' || req.url === '/multi-exec') {
          // multi-exec runs synchronously (no await between commands) => atomic, like MULTI/EXEC
          return send(200, data.map((cmd) => { try { return { result: enc(run(cmd), b64) }; } catch (e) { return { error: e.message }; } }));
        }
        send(200, { result: enc(run(data), b64) });
      } catch (e) { send(400, { error: e.message }); }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}`, stats, kv,
    setDown: (v) => { down = v; }, close: () => new Promise((r) => server.close(r)),
  })));
}
