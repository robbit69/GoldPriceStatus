const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function page() {
  const nodes = {};
  const node = name => nodes[name] ||= { textContent: '', classList: { add() {}, remove() {} } };
  const context = vm.createContext({
    Date, URL, AbortController, setTimeout, clearTimeout, Promise,
    document: { querySelector: node },
    priceElement: node('.price'), timeElement: node('.time'), statusElement: node('.status'),
    PERIOD_RANGES: { day: 1, week: 7, month: 30 },
    cachedSeriesByPeriod: { day: [], week: [], month: [] }, selectedPeriod: 'day',
    changeBoardRenderer: { render() {} }, chartRenderer: { render() {} },
    fetch: async () => { throw Error('offline'); }
  });
  vm.runInContext(fs.readFileSync('price-model.js', 'utf8'), context);
  const source = fs.readFileSync('script.js', 'utf8');
  vm.runInContext(source.slice(source.indexOf('// 最新主报价'), source.indexOf('// 功能：负责计算与渲染涨跌幅看板')), context);
  return { context, nodes };
}
const payload = points => ({ currency: 'CNY', unit: 'grams', chartData: { CNY: points }, updateFailed: false });
test('frontend retains real primary price and timestamp when refresh fails', async () => {
  const { context, nodes } = page();
  const timestamp = Date.now() - 300000;
  context.fetch = async () => ({ ok: true, json: async () => payload([[timestamp, 938.06]]) });
  await context.refreshPrimary();
  const time = nodes['.time'].textContent;
  context.fetch = async () => { throw Error('offline'); };
  await context.refreshPrimary();
  assert.equal(nodes['.price'].textContent, '938.06 CNY/克');
  assert.equal(nodes['.time'].textContent, time);
  assert.match(nodes['.status'].textContent, /更新失败.*保留/);
});
test('comparison failure leaves primary status and chart untouched', async () => {
  const { context, nodes } = page();
  context.fetch = async () => ({ ok: true, json: async () => payload([[Date.now() - 300000, 938]]) });
  await context.refreshPrimary();
  const before = nodes['.status'].textContent;
  context.fetch = async () => { throw Error('offline'); };
  await context.refreshComparison();
  assert.equal(nodes['.status'].textContent, before);
  assert.match(nodes['.comparison'].textContent, /不影响主报价/);
});
test('partial historical failure keeps old affected curve while updating successful periods', async () => {
  const { context, nodes } = page();
  context.cachedSeriesByPeriod.week = [[1000, 930]];
  context.fetch = async url => {
    if (url.includes('period=week')) throw Error('offline');
    return { ok: true, json: async () => payload([[2000, 940]]) };
  };
  await context.refreshHistory(false);
  assert.equal(JSON.stringify(context.cachedSeriesByPeriod.week), '[[1000,930]]');
  assert.equal(JSON.stringify(context.cachedSeriesByPeriod.day), '[[2000,940]]');
  assert.match(nodes['.history-status'].textContent, /7天曲线更新失败/);
});
