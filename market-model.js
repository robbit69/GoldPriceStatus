(function (root) {
  const assets = {
    gold: { type: 'gold', symbol: 'XAU', name: '黄金', currency: 'CNY', unit: '克' },
    bitcoin: { type: 'bitcoin', symbol: 'BTC-USD', name: '比特币', currency: 'USD', unit: 'BTC' }
  };
  const model = {
    assets,
    stock(input, market = 'auto') {
      let symbol = String(input || '').trim().toUpperCase();
      if (market === 'HK' && /^\d{1,5}$/.test(symbol)) symbol = symbol.padStart(4, '0') + '.HK';
      else if (['SH', 'SZ'].includes(market) && /^\d{6}$/.test(symbol)) symbol += market === 'SH' ? '.SS' : '.SZ';
      else if (market === 'auto' && /^\d{6}$/.test(symbol)) symbol += /^[569]/.test(symbol) ? '.SS' : '.SZ';
      else if (market === 'auto' && /^\d{4,5}$/.test(symbol)) symbol = symbol.padStart(4, '0') + '.HK';
      if (!/^(?:[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)?|\d{6}\.(?:SS|SZ)|\d{4,5}\.HK)$/.test(symbol) || symbol.length > 20 || symbol === 'BTC-USD') {
        throw Error('请输入股票代码，例如 AAPL、600519 或 0700.HK');
      }
      return { type: 'stock', symbol, name: symbol,
        currency: /\.(SS|SZ)$/.test(symbol) ? 'CNY' : /\.HK$/.test(symbol) ? 'HKD' : 'USD', unit: '股' };
    },
    parse(payload, asset, now = Date.now()) {
      if (payload?.asset !== asset.type || payload?.symbol !== asset.symbol ||
          !/^[A-Z]{3}$/.test(payload.currency || '') || payload.unit !== asset.unit ||
          payload.source !== 'Yahoo Finance' || !Array.isArray(payload.series)) throw Error('行情标的或单位不匹配');
      const unique = new Map();
      for (const point of payload.series) {
        if (!Array.isArray(point) || !Number.isSafeInteger(point[0]) || point[0] <= 0 || point[0] > now + 60000 ||
            !Number.isFinite(point[1]) || point[1] <= 0) throw Error('行情数据无效');
        unique.set(point[0], point[1]);
      }
      if (!Number.isFinite(payload.price) || payload.price <= 0 || !Number.isSafeInteger(payload.dataTimestamp) ||
          payload.dataTimestamp <= 0 || payload.dataTimestamp > now + 60000) throw Error('最新报价无效');
      return { points: [...unique].sort((a, b) => a[0] - b[0]), price: payload.price,
        timestamp: payload.dataTimestamp, currency: payload.currency, failed: payload.updateFailed === true };
    },
    periods(points, now = Date.now()) {
      return Object.fromEntries(Object.entries({ day: 1, week: 7, month: 30 }).map(([period, days]) => {
        const boundary = now - days * 86400000;
        const first = points.findIndex(point => point[0] >= boundary);
        // Retain one observed boundary price; never invent prices during market closures.
        return [period, first < 0 ? [] : points.slice(Math.max(0, first - 1))];
      }));
    }
  };
  root.MarketPriceModel = model;
  if (typeof module !== 'undefined') module.exports = model;
})(globalThis);
