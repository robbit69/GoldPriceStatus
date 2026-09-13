const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const model = vm.runInNewContext(fs.readFileSync('price-model.js', 'utf8') + '\nGoldPriceModel;');
test('freshness does not claim market-open or closed; failure has its own state', () => {
  const now = 1800000000000;
  assert.equal(model.status(now, false, now).text, '● 数据已获取');
  assert.match(model.status(now - 86400000, false, now).text, /可能休市或数据延迟/);
  assert.match(model.status(now, true, now).text, /更新失败.*保留/);
});
test('primary prices reject foreign units and sort without fabricating points', () => {
  assert.throws(() => model.series({ currency: 'USD', unit: 'grams', chartData: { CNY: [] } }));
  const points = model.series({ currency: 'CNY', unit: 'grams', chartData: { CNY: [[2000, 940], [1000, 938], [1000, 938]] } });
  assert.equal(JSON.stringify(points), '[[1000,938],[2000,940]]');
});
test('a comparison quote cannot enter the primary chart parser', () => {
  const quote = { source: 'gold-api.com', currency: 'CNY', unit: 'grams', price: 940, dataTimestamp: 1800000000000 };
  assert.equal(model.comparison(quote), quote);
  assert.throws(() => model.series(quote));
});
