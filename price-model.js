// 不依赖 DOM，供页面与回归测试共同使用。
const GoldPriceModel = {
  series(payload) {
    if (payload?.currency !== 'CNY' || payload?.unit !== 'grams') throw new Error('报价单位不匹配');
    const points = payload.chartData?.CNY;
    if (!Array.isArray(points)) throw new Error('行情结构异常');
    const unique = new Map();
    for (const point of points) {
      if (!Array.isArray(point) || !Number.isSafeInteger(point[0]) || point[0] <= 0 ||
          !Number.isFinite(point[1]) || point[1] <= 0) throw new Error('行情数据无效');
      unique.set(point[0], point[1]);
    }
    return [...unique].sort((a, b) => a[0] - b[0]);
  },
  status(timestamp, failed, now = Date.now()) {
    if (failed) return { text: timestamp ? '⚠ 更新失败 · 保留上次报价' : '⚠ 更新失败', className: 'stopped' };
    if (!timestamp) return { text: '暂无报价', className: 'stopped' };
    if (now - timestamp > 2 * 3600_000) {
      return { text: '暂无新报价 · 可能休市或数据延迟', className: 'stopped' };
    }
    return { text: '● 数据已获取', className: 'active' };
  },
  comparison(payload) {
    if (payload?.currency !== 'CNY' || payload?.unit !== 'grams' || payload?.source !== 'gold-api.com' ||
        !Number.isFinite(payload.price) || payload.price <= 0 ||
        !Number.isSafeInteger(payload.dataTimestamp) || payload.dataTimestamp <= 0) {
      throw new Error('对照报价无效');
    }
    return payload;
  }
};
