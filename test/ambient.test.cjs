const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('script.js', 'utf8');

function primary() {
  const classes = new Set();
  const price = { textContent: '', classList: { add: name => classes.add(name), remove: (...names) => names.forEach(n => classes.delete(n)) },
    append(child) { this.textContent += child.textContent; } };
  const node = () => ({ textContent: '', classList: { add() {}, remove() {} } });
  const context = vm.createContext({ Date, Math, Number, String, setTimeout, clearTimeout,
    document: { querySelector: node, createElement: () => ({ textContent: '' }) },
    priceElement: price, timeElement: node(), statusElement: node() });
  vm.runInContext(fs.readFileSync('price-model.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('market-model.js', 'utf8'), context);
  vm.runInContext(source.slice(source.indexOf('// 最新主报价'), source.indexOf('async function refreshPrimary')) +
    '\nthis.setQuote = (asset, quote) => { currentAsset = asset; lastPrimary = quote; };', context);
  return { context, classes, price };
}

test('quote time shows clock for today, date otherwise, plus freshness', () => {
  const { context } = primary();
  const now = new Date(2026, 9, 27, 14, 30).getTime();
  assert.equal(context.formatQuoteTime(now - 20000, now), '报价 14:29 · 刚刚');
  assert.equal(context.formatQuoteTime(now - 5 * 60000, now), '报价 14:25 · 5 分钟前');
  assert.equal(context.formatQuoteTime(now - 3 * 3600000, now), '报价 11:30 · 3 小时前');
  assert.equal(context.formatQuoteTime(new Date(2026, 9, 24, 23, 59).getTime(), now), '报价 10月24日 23:59 · 2 天前');
});

test('price flashes only when the same asset changes price', () => {
  const { context, classes } = primary();
  const gold = context.MarketPriceModel.assets.gold;
  context.setQuote(gold, { price: 900, timestamp: Date.now() });
  context.renderPrimary();
  assert.equal(classes.size, 0, 'first render does not flash');
  context.renderPrimary();
  assert.equal(classes.size, 0, 'unchanged price does not flash');
  context.setQuote(gold, { price: 901, timestamp: Date.now() });
  context.renderPrimary();
  assert.deepEqual([...classes], ['tick-up']);
  context.setQuote(gold, { price: 899, timestamp: Date.now() });
  context.renderPrimary();
  assert.deepEqual([...classes], ['tick-down']);
  classes.clear();
  context.setQuote(context.MarketPriceModel.assets.bitcoin, { price: 80000, timestamp: Date.now() });
  context.renderPrimary();
  assert.equal(classes.size, 0, 'switching asset does not flash');
});

test('change cards end at a newer primary quote but never invent an empty period', () => {
  const elements = period => [{ getAttribute: () => period, innerHTML: '', textContent: '',
    classList: { add(name) { this.last = name; }, remove() {} } }];
  const values = elements('day'), extras = elements('day');
  const context = vm.createContext({ Date, Math, Object, Array, Number,
    PERIOD_RANGES: { day: 86400000 }, changeValueElements: values, changeExtraElements: extras,
    currentAsset: { type: 'gold' }, updateCardSelectionUI() {} });
  vm.runInContext(fs.readFileSync('market-model.js', 'utf8'), context);
  vm.runInContext(source.slice(source.indexOf('// 功能：负责计算与渲染涨跌幅看板'),
    source.indexOf('changeCards.forEach', source.indexOf('// 功能：负责计算与渲染涨跌幅看板'))) +
    '\nthis.board = changeBoardRenderer;', context);
  const now = Date.now();
  context.board.render({ day: [[now - 86400000, 900], [now - 600000, 910]] }, { price: 918, timestamp: now - 60000 });
  assert.match(values[0].innerHTML, /18\.00/);
  assert.match(values[0].innerHTML, /2\.00%/);
  context.board.render({ day: [[now - 86400000, 900], [now - 600000, 910]] }, { price: 890, timestamp: now - 900000 });
  assert.match(values[0].innerHTML, /10\.00/, 'an older quote does not replace the curve end');
  context.board.render({ day: [] }, { price: 918, timestamp: now });
  assert.equal(extras[0].textContent, '暂无数据');
});
