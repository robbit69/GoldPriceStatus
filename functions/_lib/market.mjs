const VERSION = '2026-10-09.1';
const TTL = 60000;
const DAY = 86400000;
const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff', 'X-Market-Version': VERSION };

export function parseAsset(url) {
  const asset = url.searchParams.get('asset');
  if (asset === 'bitcoin') return { asset, symbol: 'BTC-USD', unit: 'BTC' };
  const symbol = (url.searchParams.get('symbol') || '').trim().toUpperCase();
  if (asset !== 'stock' || !/^(?:[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)?|\d{6}\.(?:SS|SZ)|\d{4,5}\.HK)$/.test(symbol) ||
      symbol.length > 20 || symbol === 'BTC-USD') throw Error('请选择比特币或输入有效股票代码');
  return { asset, symbol, unit: '股' };
}

export function normalizeChart(data, selected, now = Date.now()) {
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  const types = selected.asset === 'bitcoin' ? ['CRYPTOCURRENCY'] : ['EQUITY', 'ETF'];
  if (!meta || meta.symbol !== selected.symbol || !types.includes(meta.instrumentType) ||
      !/^[A-Z]{3}$/.test(meta.currency || '') || !Array.isArray(result.timestamp) ||
      !Array.isArray(result.indicators?.quote?.[0]?.close)) throw Error('上游行情结构异常');
  const closes = result.indicators.quote[0].close;
  if (result.timestamp.length !== closes.length) throw Error('上游行情长度不匹配');
  const points = new Map();
  result.timestamp.forEach((time, index) => {
    const value = closes[index];
    if (value === null) return; // Actual missing bars, including non-trading periods.
    if (!Number.isSafeInteger(time) || time <= 0 || time * 1000 > now + 60000 ||
        !Number.isFinite(value) || value <= 0) throw Error('上游价格点无效');
    points.set(time * 1000, value);
  });
  const series = [...points].sort((a, b) => a[0] - b[0]);
  const latest = series.at(-1);
  const quoteValid = Number.isFinite(meta.regularMarketPrice) && meta.regularMarketPrice > 0 &&
    Number.isSafeInteger(meta.regularMarketTime) && meta.regularMarketTime > 0 && meta.regularMarketTime * 1000 <= now + 60000;
  if (!quoteValid && !latest) throw Error('暂无可用行情');
  return { ...selected, currency: meta.currency, source: 'Yahoo Finance',
    name: meta.longName || meta.shortName || selected.symbol, intervalSeconds: 1800, series,
    price: quoteValid ? meta.regularMarketPrice : latest[1],
    dataTimestamp: quoteValid ? meta.regularMarketTime * 1000 : latest[0], fetchedAt: now, updateFailed: false };
}

async function loadChart(selected, fetcher) {
  let lastError;
  // Both hosts belong to the same provider; never mix different price sources.
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetcher(`https://${host}/v8/finance/chart/${encodeURIComponent(selected.symbol)}?range=1mo&interval=30m`,
        { signal: controller.signal, headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } });
      if (response.status === 404) {
        const error = Error('该股票代码未找到或暂无行情'); error.status = 404; throw error;
      }
      if (!response.ok) throw Error(`行情源 HTTP ${response.status}`);
      if (!(response.headers.get('content-type') || '').includes('application/json')) throw Error('行情源未返回 JSON');
      const text = await response.text();
      if (text.length > 2000000) throw Error('行情响应过大');
      return normalizeChart(JSON.parse(text), selected);
    } catch (error) {
      if (error.status === 404) throw error;
      lastError = error;
    } finally { clearTimeout(timer); }
  }
  throw lastError;
}

export async function handleMarket(request, { fetcher = fetch, cache = globalThis.caches?.default, waitUntil } = {}) {
  const json = (body, status = 200) => new Response(request.method === 'HEAD' ? null : JSON.stringify(body),
    { status, headers: HEADERS });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { ...HEADERS, Allow: 'GET, HEAD' } });
  const url = new URL(request.url);
  let selected;
  try { selected = parseAsset(url); }
  catch (error) { return json({ error: error.message }, 400); }
  const key = new Request(`${url.origin}/__market_cache/${VERSION}/${selected.asset}/${encodeURIComponent(selected.symbol)}`);
  let previous;
  try {
    const hit = cache && await cache.match(key);
    if (hit) previous = await hit.json();
  } catch (_) { /* Cache failure must not prevent a real request. */ }
  const finish = (data, cached, failed = false) => json({ ...data, cached, updateFailed: failed,
    stale: failed || Date.now() - data.dataTimestamp > 7200000,
    ageSeconds: Math.max(0, Math.floor((Date.now() - data.dataTimestamp) / 1000)) });
  if (previous && Date.now() - previous.fetchedAt < TTL) return finish(previous, true);
  try {
    const data = await loadChart(selected, fetcher);
    if (cache) {
      const write = cache.put(key, new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' }
      })).catch(() => {});
      if (waitUntil) waitUntil(write); else await write;
    }
    return finish(data, false);
  } catch (error) {
    if (previous && Date.now() - previous.fetchedAt <= DAY) return finish(previous, true, true);
    return json({ error: error.status === 404 ? error.message : '暂时无法获取行情，请稍后重试', updateFailed: true }, error.status || 502);
  }
}
