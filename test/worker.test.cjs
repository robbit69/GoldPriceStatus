const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('worker.js', 'utf8');

function worker(responder, options = {}) {
  let now = 1_800_000_000_000;
  let calls = [];
  const storage = new Map();
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({
    URL, Request, Response, AbortController, Map, Date: Clock,
    console: { error() {} },
    setTimeout: options.fastTimeout ? fn => setTimeout(fn, 5) : setTimeout, clearTimeout,
    addEventListener() {},
    caches: { default: {
      async match(key) { return storage.get(key)?.clone(); },
      async put(key, response) { storage.set(key, response.clone()); }
    } },
    fetch: async (url, init) => { calls.push(url); return responder(url, init, calls.length, now); }
  });
  vm.runInContext(source, context);
  return {
    calls, advance(ms) { now += ms; },
    request: (path = '/price', method = 'GET') => context.handleRequest(new Request('https://api.goldprice.yanrrd.com' + path, { method }))
  };
}
const response = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const price = now => response({ chartData: { CNY: [[now - 300000, 938]] } });

test('invalid parameters are rejected before any upstream request', async () => {
  const w = worker(() => { throw Error('must not fetch'); });
  for (const query of ['starttime=abc', 'starttime=0', 'starttime=-1', 'starttime=123junk', 'starttime=1e12',
    'starttime=9007199254740993', 'starttime=1&endtime=1800000000000', 'starttime=20&endtime=10',
    'currency=xxx', 'unit=bad', 'period=toString', 'period=', 'period=day&starttime=1']) {
    assert.equal((await w.request('/price?' + query)).status, 400, query);
  }
  assert.equal((await w.request('/compare?period=day')).status, 400);
  assert.equal(w.calls.length, 0);
});
test('OPTIONS, wrong method, missing route do not fetch', async () => {
  const w = worker(() => { throw Error('must not fetch'); });
  assert.equal((await w.request('/price', 'OPTIONS')).status, 204);
  assert.equal((await w.request('/price', 'POST')).status, 405);
  assert.equal((await w.request('/unknown')).status, 404);
  assert.equal(w.calls.length, 0);
});
test('empty historical range stays empty without recent-data fallback', async () => {
  const w = worker(() => response({ chartData: { CNY: [] } }));
  const body = await (await w.request('/price?starttime=100000&endtime=200000')).json();
  assert.deepEqual(body.chartData.CNY, []);
  assert.equal(body.starttime, 100000);
  assert.equal(body.endtime, 200000);
  assert.equal(body.fallbackUsed, false);
  assert.equal(w.calls.length, 1);
});
test('latest falls back to seven days, preserving the real old quote time', async () => {
  const w = worker((url, init, count, now) => response({ chartData: { CNY: count === 1 ? [] : [[now - 3 * 86400000, 938]] } }));
  const body = await (await w.request()).json();
  assert.equal(body.fallbackUsed, true);
  assert.equal(body.stale, true);
  assert.equal(body.updateFailed, false);
  assert.equal(body.ageSeconds, 3 * 86400);
  assert.equal(w.calls.length, 2);
});
test('fallback validates HTTP status and returns 502, not success', async () => {
  const w = worker((url, init, count) => count === 1 ? response({ chartData: { CNY: [] } }) : new Response('bad', { status: 503 }));
  assert.equal((await w.request()).status, 502);
});
test('malformed, null and non-positive points cannot become valid prices', async () => {
  for (const value of [null, 0, -1, '938']) {
    const w = worker((url, init, count, now) => response({ chartData: { CNY: [[now - 300000, value]] } }));
    assert.equal((await w.request()).status, 502);
  }
});
test('cache is reused then serves last successful data on outage without changing its time', async () => {
  const w = worker((url, init, count, now) => count === 1 ? price(now) : new Response('bad', { status: 503 }));
  const first = await (await w.request()).json();
  w.advance(30000);
  const hit = await (await w.request('/price?debug=true')).json();
  assert.equal(hit.cached, true);
  assert.equal(w.calls.length, 1);
  w.advance(40000);
  const fallback = await (await w.request()).json();
  assert.equal(fallback.updateFailed, true);
  assert.equal(fallback.stale, true);
  assert.equal(fallback.dataTimestamp, first.dataTimestamp);
  assert.equal(fallback.fetchedAt, first.fetchedAt);
  w.advance(86400000);
  assert.equal((await w.request()).status, 502);
});
test('different preset/currency/units use separate caches', async () => {
  const w = worker((url, init, count, now) => price(now));
  for (const path of ['/price?period=day', '/price?period=week', '/price?period=month']) await w.request(path);
  await w.request('/price?period=day');
  assert.equal(w.calls.length, 3);
});
test('comparison converts troy ounces, has independent provenance, and never returns a chart', async () => {
  const w = worker((url, init, count, now) => response({ symbol: 'XAU', currency: 'CNY', price: 31.1034768 * 940,
    updatedAt: new Date(now - 5000).toISOString() }));
  const data = await (await w.request('/compare')).json();
  assert.ok(Math.abs(data.price - 940) < 1e-9);
  assert.equal(data.source, 'gold-api.com');
  assert.equal(data.comparisonOnly, true);
  assert.equal(data.chartData, undefined);
  assert.equal((await w.request('/compare', 'HEAD')).status, 200);
  assert.equal(await (await w.request('/compare', 'HEAD')).text(), '');
});
test('mismatched comparison currency is rejected', async () => {
  const w = worker((url, init, count, now) => response({ symbol: 'XAU', currency: 'USD', price: 4000, updatedAt: new Date(now).toISOString() }));
  assert.equal((await w.request('/compare')).status, 502);
});
test('upstream request aborts on timeout', async () => {
  const w = worker((url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Error('aborted')));
  }), { fastTimeout: true });
  assert.equal((await w.request()).status, 502);
});
