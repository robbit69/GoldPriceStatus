const { test } = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../chart-layout.js');
test('extremum leaders reverse direction near screen edges and respect notch insets', () => {
  const safe = { left: 44, right: 44, top: 0, bottom: 21 };
  for (const x of [56, 406, 756]) {
    const label = layout.label({ x, y: 40 }, 120, 812, safe);
    assert.ok(label.x >= 56);
    assert.ok(label.x + 120 <= 756);
  }
  assert.ok(layout.label({ x: 56 }, 120, 812, safe).end > 56);
  assert.ok(layout.label({ x: 756 }, 120, 812, safe).end < 756);
});
test('XS extrema use free space without scaling the main content', () => {
  for (const [height, contentHeight] of [[300, 190], [375, 225], [812, 240]]) {
    const safe = { top: 0, bottom: 21 };
    const top = (height - safe.bottom - contentHeight) / 2;
    const content = { top, bottom: top + contentHeight };
    const lanes = layout.lanes(height, safe, content);
    assert.ok(lanes.high < content.top);
    assert.ok(lanes.high >= 30);
    assert.ok(lanes.low - 24 > content.bottom);
    assert.ok(lanes.low <= height - safe.bottom - 12);
  }
});

test('top corner control moves the label away while keeping its extremum anchor', () => {
  const safe = {left: 0, right: 0};
  const control = {left: 740, right: 800, top: 2, bottom: 28, width: 60, height: 26};
  const label = layout.label({x: 790, y: 38}, 108, 812, safe, [control], 14);
  assert.ok(label.x + 108 < control.left);
  assert.equal(label.end, label.x);
});
