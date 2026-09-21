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
test('XS landscape lanes leave label clearance around fitted content and bottom control', () => {
  for (const height of [300, 375, 812]) {
    const safe = { top: 0, bottom: 21 };
    const contentHeight = Math.min(240, height - safe.bottom - 170);
    const top = (height - safe.bottom - contentHeight) / 2 - 10;
    const content = { top, bottom: top + contentHeight };
    const lanes = layout.lanes(height, safe, content);
    assert.ok(lanes.high < content.top - 10);
    assert.ok(lanes.high >= 38);
    assert.ok(lanes.low - 24 > content.bottom);
    assert.ok(lanes.low <= height - safe.bottom - 58);
  }
});
