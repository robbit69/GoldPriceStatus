// 原始行情与对照行情分开，绝不拼接不同来源的价格。
const GOLD_VERSION = '2026-09-14.2';
const MINUTE = 60_000;
const DAY = 86_400_000;
const CURRENCIES = ['cny', 'usd', 'eur', 'gbp', 'jpy', 'aud', 'cad', 'chf', 'inr'];
const PERIODS = { day: DAY, week: 7 * DAY, month: 30 * DAY };
const CORS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Gold-Version': GOLD_VERSION
};
const inFlight = new Map();
addEventListener('fetch', event => event.respondWith(handleRequest(event.request, event)));

function json(body, status = 200, head = false) {
  return new Response(head ? null : JSON.stringify(body), { status, headers: CORS });
}

function timestamp(params, name, fallback) {
  if (!params.has(name)) return fallback;
  const raw = params.get(name);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} 必须是有效的毫秒时间戳`);
  }
  return value;
}

function parseQuery(url, now) {
  const p = url.searchParams;
  const currency = (p.get('currency') || 'cny').toLowerCase();
  const unit = (p.get('unit') || 'grams').toLowerCase();
  if (!CURRENCIES.includes(currency)) throw new Error('不支持的货币单位');
  if (!['grams', 'ounces', 'kilos'].includes(unit)) throw new Error('不支持的重量单位');
  const period = p.get('period');
  const explicit = p.has('starttime') || p.has('endtime');
  if (period !== null && (!Object.hasOwn(PERIODS, period) || explicit)) {
    throw new Error('period 必须为 day、week 或 month，且不能与时间范围混用');
  }
  if (url.pathname === '/compare' && (explicit || period !== null)) throw new Error('对照接口仅提供最新价');
  const boundary = Math.floor(now / MINUTE) * MINUTE;
  const endtime = timestamp(p, 'endtime', explicit ? now : boundary);
  const starttime = timestamp(p, 'starttime', endtime - (period ? PERIODS[period] : 10 * MINUTE));
  if (starttime >= endtime || endtime > now + MINUTE || endtime - starttime > 366 * DAY) {
    throw new Error('时间范围须递增、不得超过 366 天或超出当前时间');
  }
  return { currency, unit, starttime, endtime, latest: !explicit && period === null, period };
}

async function upstreamJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Compatible; Cloudflare Worker)' }
    });
    if (!response.ok) throw new Error(`上游 HTTP ${response.status}`);
    if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
      throw new Error('上游返回非 JSON 数据');
    }
    if (Number(response.headers.get('content-length')) > 4_000_000) throw new Error('上游响应过大');
    const body = await response.text();
    if (body.length > 4_000_000) throw new Error('上游响应过大');
    try { return JSON.parse(body); }
    catch (_) { throw new Error('上游 JSON 格式无效'); }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('上游请求超时');
    throw error;
  } finally { clearTimeout(timer); }
}

function validateSeries(data, currency, starttime, endtime) {
  const series = data?.chartData?.[currency.toUpperCase()];
  // WGC 在无报价区间返回 {chartData: {asOfDate: 'YYYY-MM-DD'}}。
  // 仅识别已验证的空行情结构；错误对象/缺失 chartData 仍视为上游异常。
  if (data?.chartData && Object.keys(data.chartData).length === 1 &&
      typeof data.chartData.asOfDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.chartData.asOfDate)) return [];
  if (!Array.isArray(series)) throw new Error('上游行情结构异常');
  const unique = new Map();
  for (const point of series) {
    if (!Array.isArray(point) || !Number.isSafeInteger(point[0]) || point[0] <= 0 ||
        !Number.isFinite(point[1]) || point[1] <= 0) throw new Error('上游价格点无效');
    if (point[0] >= starttime && point[0] <= endtime) unique.set(point[0], point[1]);
  }
  return [...unique].sort((a, b) => a[0] - b[0]);
}

async function primaryQuote(q) {
  let { starttime, endtime } = q;
  const fetchSeries = async () => validateSeries(await upstreamJSON(
    `https://fsapi.gold.org/api/goldprice/v11/chart/price/${q.currency}/${q.unit}/${starttime},${endtime}`
  ), q.currency, starttime, endtime);
  let series = await fetchSeries();
  let fallbackUsed = false;
  // 仅默认最新价可扩展到七天，覆盖周末/长假；历史查询绝不改时间。
  if (!series.length && q.latest) {
    starttime = endtime - 7 * DAY;
    series = await fetchSeries();
    fallbackUsed = true;
  }
  return {
    source: 'World Gold Council', currency: q.currency.toUpperCase(), unit: q.unit,
    chartData: { [q.currency.toUpperCase()]: series }, starttime, endtime,
    dataTimestamp: series.length ? series[series.length - 1][0] : null, fallbackUsed
  };
}

async function comparisonQuote(q) {
  const data = await upstreamJSON(`https://api.gold-api.com/price/XAU/${q.currency.toUpperCase()}`);
  const time = Date.parse(data.updatedAt);
  if (data.symbol !== 'XAU' || data.currency !== q.currency.toUpperCase() ||
      !Number.isFinite(data.price) || data.price <= 0 || !Number.isFinite(time) || time <= 0 ||
      time > Date.now() + MINUTE) throw new Error('对照行情结构异常');
  const price = q.unit === 'ounces' ? data.price : data.price / 31.1034768 * (q.unit === 'kilos' ? 1000 : 1);
  return {
    source: 'gold-api.com', currency: q.currency.toUpperCase(), unit: q.unit,
    price, dataTimestamp: time, sourceUnit: 'troy_ounce', comparisonOnly: true
  };
}

async function cachedQuote(key, ttl, loader, event) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  let previous = null;
  try {
    const stored = cache && await cache.match(key);
    if (stored) previous = await stored.json();
  } catch (_) { /* 缓存不可用时仍请求上游。 */ }
  if (previous && Date.now() - previous.cachedAt < ttl) {
    return { ...previous.data, fetchedAt: previous.cachedAt, cached: true, updateFailed: false };
  }
  try {
    if (!inFlight.has(key)) {
      const task = (async () => {
        const data = await loader();
        const cachedAt = Date.now();
        if (cache) {
          const write = cache.put(key, new Response(JSON.stringify({ data, cachedAt }), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' }
          })).catch(() => {});
          if (event?.waitUntil) event.waitUntil(write);
          else await write;
        }
        return { ...data, fetchedAt: cachedAt, cached: false, updateFailed: false };
      })();
      inFlight.set(key, task);
      task.then(() => inFlight.delete(key), () => inFlight.delete(key));
    }
    return await inFlight.get(key);
  } catch (error) {
    if (previous && Date.now() - previous.cachedAt <= DAY) {
      return { ...previous.data, fetchedAt: previous.cachedAt, cached: true, updateFailed: true, failureReason: error.message };
    }
    throw error;
  }
}

async function handleRequest(request, event) {
  const url = new URL(request.url);
  const head = request.method === 'HEAD';
  if (!['/price', '/compare'].includes(url.pathname)) return json({ error: 'Not found' }, 404, head);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(JSON.stringify({ error: '仅支持 GET、HEAD、OPTIONS' }), {
    status: 405, headers: { ...CORS, Allow: 'GET, HEAD, OPTIONS' }
  });
  let q;
  try { q = parseQuery(url, Date.now()); }
  catch (error) { return json({ error: error.message }, 400, head); }
  const started = Date.now();
  const comparison = url.pathname === '/compare';
  const rangeKey = comparison || q.latest ? 'latest' : q.period || `${q.starttime}-${q.endtime}`;
  const key = `${url.origin}/__gold_cache/${GOLD_VERSION}${url.pathname}/${q.currency}/${q.unit}/${rangeKey}`;
  try {
    const data = await cachedQuote(key, comparison || q.latest ? MINUTE : 5 * MINUTE,
      () => comparison ? comparisonQuote(q) : primaryQuote(q), event);
    const ageSeconds = data.dataTimestamp ? Math.max(0, Math.floor((Date.now() - data.dataTimestamp) / 1000)) : null;
    const { failureReason, ...publicData } = data;
    const result = {
      ...publicData, requestTime: new Date().toISOString(), ageSeconds,
      stale: data.updateFailed || ageSeconds === null || ageSeconds > 2 * 3600
    };
    if (url.searchParams.get('debug') === 'true') {
      result.system = { version: GOLD_VERSION, cached: data.cached, elapsedMs: Date.now() - started, error: failureReason };
    }
    return json(result, 200, head);
  } catch (error) {
    console.error('gold_upstream_error', { source: comparison ? 'gold-api.com' : 'gold.org', message: error.message });
    return json({ error: '获取金价数据失败', source: comparison ? 'gold-api.com' : 'World Gold Council', updateFailed: true,
      ...(url.searchParams.get('debug') === 'true' ? { system: { version: GOLD_VERSION, error: error.message } } : {}) }, 502, head);
  }
}
