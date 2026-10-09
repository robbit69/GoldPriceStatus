const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../market-model.js');
const api = import('../functions/_lib/market.mjs');

function chart(symbol = 'BTC-USD', now = Date.now()) {
  const stamp = Math.floor(now / 1000) - 60;
  return { chart: { result: [{ meta: { symbol, currency: 'USD', instrumentType: symbol === 'BTC-USD' ? 'CRYPTOCURRENCY' : 'EQUITY',
    regularMarketPrice: 81000, regularMarketTime: stamp }, timestamp: [stamp - 3600, stamp - 1800, stamp],
    indicators: { quote: [{ close: [80000, null, 80900] }] } }] } };
}
const response = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

test('stock input resolves US, Shanghai, Shenzhen and Hong Kong codes', () => {
  for (const [input, market, symbol, currency] of [
    ['aapl', 'auto', 'AAPL', 'USD'], ['brk-b', 'US', 'BRK-B', 'USD'],
    ['600519', 'auto', '600519.SS', 'CNY'], ['000001', 'auto', '000001.SZ', 'CNY'],
    ['700', 'HK', '0700.HK', 'HKD'], ['0700.hk', 'auto', '0700.HK', 'HKD']
  ]) {
    const selected = model.stock(input, market);
    assert.equal(selected.symbol, symbol); assert.equal(selected.currency, currency);
  }
  for (const invalid of ['BTC-USD', '../AAPL', 'https://evil.test', '', 'AAPL?x=1']) assert.throws(() => model.stock(invalid));
});

test('normalized history skips actual missing bars without manufacturing prices or quote times', async () => {
  const { normalizeChart } = await api;
  const now = Date.now();
  const result = normalizeChart(chart(), { asset: 'bitcoin', symbol: 'BTC-USD', unit: 'BTC' }, now);
  assert.equal(result.series.length, 2);
  assert.equal(result.series[1][1], 80900);
  assert.equal(result.price, 81000);
  assert.equal(result.dataTimestamp, chart().chart.result[0].meta.regularMarketTime * 1000);
  const parsed = model.parse(result, model.assets.bitcoin, now);
  assert.equal(parsed.price, 81000);
  assert.throws(() => model.parse(result, model.stock('AAPL'), now));
});

test('wrong symbols, instrument types and future timestamps cannot become valid stock prices', async () => {
  const { normalizeChart } = await api;
  const selected = { asset: 'stock', symbol: 'AAPL', unit: '股' };
  assert.throws(() => normalizeChart(chart('TSLA'), selected));
  const invalid = chart('AAPL'); invalid.chart.result[0].meta.instrumentType = 'CRYPTOCURRENCY';
  assert.throws(() => normalizeChart(invalid, selected));
  const future = chart('AAPL', Date.now() + 3600000);
  assert.throws(() => normalizeChart(future, selected));
});

test('period curves keep one real boundary point and do not invent trades during closures', () => {
  const now = 1800000000000, day = 86400000;
  const points = [[now - 2 * day, 100], [now - day - 1, 105], [now - 3600000, 110]];
  assert.deepEqual(model.periods(points, now).day, points.slice(1));
  assert.deepEqual(model.periods(points, now + 2 * day).day, []);
});

test('market API rejects invalid inputs and methods before contacting a provider', async () => {
  const { handleMarket } = await api;
  let calls = 0;
  const opts = { fetcher: () => { calls++; throw Error('must not fetch'); } };
  for (const query of ['asset=gold', 'asset=stock&symbol=../AAPL', 'asset=stock&symbol=BTC-USD']) {
    assert.equal((await handleMarket(new Request('https://local/api/market?' + query), opts)).status, 400);
  }
  assert.equal((await handleMarket(new Request('https://local/api/market?asset=bitcoin', { method: 'POST' }), opts)).status, 405);
  assert.equal(calls, 0);
});

test('cache keys isolate Bitcoin and stocks; provider outage keeps the real previous timestamp', async () => {
  const { handleMarket } = await api;
  const store = new Map();
  const cache = { async match(key) { return store.get(key.url)?.clone(); }, async put(key, value) { store.set(key.url, value); } };
  let calls = 0, failing = false;
  const fetcher = async url => {
    calls++;
    if (failing) return new Response('unavailable', { status: 503 });
    return response(chart(url.includes('/AAPL?') ? 'AAPL' : 'BTC-USD'));
  };
  const btc = new Request('https://local/api/market?asset=bitcoin');
  const first = await (await handleMarket(btc, { fetcher, cache })).json();
  await handleMarket(btc, { fetcher, cache });
  assert.equal(calls, 1);
  const stock = await (await handleMarket(new Request('https://local/api/market?asset=stock&symbol=AAPL'), { fetcher, cache })).json();
  assert.equal(stock.symbol, 'AAPL'); assert.equal(calls, 2);
  for (const [key, value] of store) {
    const body = await value.clone().json(); body.fetchedAt -= 70000;
    store.set(key, response(body));
  }
  failing = true;
  const stale = await (await handleMarket(btc, { fetcher, cache })).json();
  assert.equal(stale.updateFailed, true); assert.equal(stale.stale, true);
  assert.equal(stale.dataTimestamp, first.dataTimestamp);
  assert.equal(stale.symbol, 'BTC-USD');
});

test('unknown stock returns a useful 404 and upstream failures return 502', async () => {
  const { handleMarket } = await api;
  const request = new Request('https://local/api/market?asset=stock&symbol=ZZZZZZZZ');
  const missing = await handleMarket(request, { fetcher: async () => new Response('missing', { status: 404 }) });
  assert.equal(missing.status, 404);
  assert.match((await missing.json()).error, /股票代码/);
  const failed = await handleMarket(request, { fetcher: async () => new Response('bad', { status: 503 }) });
  assert.equal(failed.status, 502);
  const head = await handleMarket(new Request('https://local/api/market?asset=bitcoin', { method: 'HEAD' }), { fetcher: async () => response(chart()) });
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
});
