// One simulated serverless instance: its own process, its own memory; talks to the shared Redis only.
const R = {};
const load = async (r) => (R[r] ||= await import('../app/api/' + r + '/route.js'));
process.on('message', async (m) => {
  if (m.op === 'mem') return process.send({ id: m.id, lists: globalThis.__chatMem.lists.size, kv: globalThis.__chatMem.kv.size });
  const headers = { 'x-forwarded-for': m.ip || '192.0.2.1', ...(m.cookie ? { cookie: m.cookie } : {}) };
  if (m.body !== undefined) headers['content-type'] = 'application/json';
  const req = new Request('http://localhost/api/' + m.route + (m.qs || ''), { method: m.method, headers, body: m.body === undefined ? undefined : JSON.stringify(m.body) });
  const mod = await load(m.route);
  const res = await mod[m.method](req);
  const sc = res.headers.get('set-cookie');
  process.send({ id: m.id, status: res.status, text: await res.text(), cookie: sc ? sc.split(';')[0] : null });
});
process.send({ ready: true });
