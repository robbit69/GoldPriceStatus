const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function viewportPage(withVisualViewport = true) {
  const properties = {}, events = {}, viewportEvents = {}, frames = [], timers = [];
  const viewport = { width: 812, height: 375, offsetLeft: 0, offsetTop: 0,
    addEventListener(name, handler) { viewportEvents[name] = handler; } };
  const window = { innerWidth: 812, innerHeight: 375,
    addEventListener(name, handler) { events[name] = handler; },
    visualViewport: withVisualViewport ? viewport : undefined };
  const document = { documentElement: { clientWidth: 812,
    style: { setProperty(name, value) { properties[name] = value; } } } };
  const source = fs.readFileSync('script.js', 'utf8');
  vm.runInNewContext(source.slice(source.indexOf('const layoutController ='),
    source.indexOf('const fullscreenController =')), { window, document,
    requestAnimationFrame(handler) { frames.push(handler); },
    setTimeout(handler) { timers.push(handler); } });
  return { properties, viewport, window, document, events, viewportEvents, frames, timers };
}

test('Safari visible viewport resize and scroll update dimensions and origin together', () => {
  const p = viewportPage();
  assert.equal(p.properties['--app-width'], '812px');
  assert.equal(p.properties['--app-height'], '375px');
  Object.assign(p.viewport, { width: 780, height: 300, offsetTop: 44, offsetLeft: 12 });
  p.viewportEvents.resize();
  assert.deepEqual(p.properties, { '--app-width': '780px', '--app-height': '300px',
    '--app-top': '44px', '--app-left': '12px' });
  p.viewport.offsetTop = 0;
  p.viewportEvents.scroll();
  assert.equal(p.properties['--app-top'], '0px');
});

test('orientation changes settle again after Safari reports the final viewport', () => {
  const p = viewportPage();
  p.events.orientationchange();
  Object.assign(p.viewport, { width: 375, height: 724 });
  p.frames.forEach(handler => handler());
  assert.equal(p.properties['--app-width'], '375px');
  p.viewport.height = 812;
  p.timers.forEach(handler => handler());
  assert.equal(p.properties['--app-height'], '812px');
  p.events.pageshow();
  assert.equal(p.properties['--app-top'], '0px');
});

test('layout falls back to the document viewport when VisualViewport is unavailable', () => {
  const p = viewportPage(false);
  p.window.innerHeight = 300;
  p.document.documentElement.clientWidth = 780;
  p.events.resize();
  assert.deepEqual(p.properties, { '--app-width': '780px', '--app-height': '300px',
    '--app-top': '0px', '--app-left': '0px' });
});
