const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function page(native = 'unavailable', pointerEvents = true) {
  const classes = new Set();
  const buttonEvents = {};
  const documentEvents = {};
  const attributes = {};
  const button = { style: {}, setAttribute(name, value) { attributes[name] = value; },
    addEventListener(name, handler) { buttonEvents[name] = handler; } };
  let requests = 0, exits = 0;
  const document = {
    body: { classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } } },
    documentElement: { style: {} },
    querySelector() { return null; },
    addEventListener(name, handler) { documentEvents[name] = handler; },
    async exitFullscreen() { exits++; this.fullscreenElement = null; }
  };
  if (native !== 'unavailable') {
    document.documentElement.requestFullscreen = async () => {
      requests++;
      if (native === 'rejected') throw Error('Fullscreen denied');
      document.fullscreenElement = document.documentElement;
    };
  }
  const context = vm.createContext({ document, fullscreenButton: button,
    window: { PointerEvent: pointerEvents ? function PointerEvent() {} : undefined },
    layoutController: { refreshHeight() {} }, console });
  const source = fs.readFileSync('script.js', 'utf8');
  const controller = vm.runInContext(source.slice(source.indexOf('const fullscreenController ='),
    source.indexOf('const chartRenderer =')) + '\nfullscreenController;', context);
  return { controller, document, classes, button, attributes, buttonEvents, documentEvents,
    get requests() { return requests; }, get exits() { return exits; } };
}

test('fullscreen button enters and exits display mode without a native API on iPhone', () => {
  const p = page();
  let stopped = false;
  p.buttonEvents.click({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.equal(p.classes.has('fullscreen'), true);
  assert.equal(p.button.textContent, '退出全屏');
  assert.equal(p.attributes['aria-pressed'], 'true');
  assert.equal(p.button.style.display, undefined);
  assert.equal(p.document.documentElement.style.backgroundColor, '#000');
  assert.equal(p.documentEvents.click, undefined, 'background clicks must not accidentally exit');
  p.buttonEvents.click({ stopPropagation() {} });
  assert.equal(p.classes.has('fullscreen'), false);
  assert.equal(p.button.textContent, '全屏');
  assert.equal(p.attributes['aria-pressed'], 'false');
  assert.equal(p.document.documentElement.style.backgroundColor, '#f0f0f0');
});

test('a rejected native fullscreen request still enters an escapable display mode', async () => {
  const p = page('rejected');
  await p.controller.requestFullscreen();
  assert.equal(p.requests, 1);
  assert.equal(p.classes.has('fullscreen'), true);
  await p.controller.exitFullscreen();
  assert.equal(p.classes.has('fullscreen'), false);
  assert.equal(p.exits, 0);
});

test('supported native fullscreen enters, exits and follows browser exit events', async () => {
  const p = page('supported');
  await p.controller.requestFullscreen();
  assert.equal(p.requests, 1);
  assert.equal(p.classes.has('fullscreen'), true);
  await p.controller.exitFullscreen();
  assert.equal(p.exits, 1);
  assert.equal(p.classes.has('fullscreen'), false);
  await p.controller.requestFullscreen();
  p.document.fullscreenElement = null;
  p.documentEvents.fullscreenchange();
  assert.equal(p.classes.has('fullscreen'), false);
  assert.equal(p.button.textContent, '全屏');
});

test('repeated taps cannot race a pending native fullscreen request', async () => {
  const p = page();
  let finish;
  let requests = 0;
  p.document.documentElement.requestFullscreen = () => {
    requests++;
    return new Promise(resolve => { finish = resolve; });
  };
  const first = p.controller.requestFullscreen();
  await p.controller.requestFullscreen();
  await p.controller.exitFullscreen();
  assert.equal(requests, 1);
  assert.equal(p.classes.has('fullscreen'), true);
  finish();
  await first;
  await p.controller.exitFullscreen();
  assert.equal(p.classes.has('fullscreen'), false);
});

test('Escape exits the iPhone display mode but leaves an open dialog to handle Escape first', () => {
  const p = page();
  p.controller.requestFullscreen();
  p.document.querySelector = () => ({});
  p.documentEvents.keydown({ key: 'Escape' });
  assert.equal(p.classes.has('fullscreen'), true);
  p.document.querySelector = () => null;
  p.documentEvents.keydown({ key: 'Escape' });
  assert.equal(p.classes.has('fullscreen'), false);
});

test('failed native exit keeps the toggle consistent and allows retry', async () => {
  const p = page('supported');
  await p.controller.requestFullscreen();
  const exit = p.document.exitFullscreen;
  p.document.exitFullscreen = async () => { throw Error('denied'); };
  await p.controller.exitFullscreen();
  assert.equal(p.classes.has('fullscreen'), true);
  assert.equal(p.button.textContent, '退出全屏');
  p.document.exitFullscreen = exit;
  await p.controller.exitFullscreen();
  assert.equal(p.classes.has('fullscreen'), false);
});

function pointer(p, name, extra = {}) {
  p.buttonEvents[name]({ pointerType: 'touch', pointerId: 1, isPrimary: true,
    clientX: 100, clientY: 30, stopPropagation() {}, ...extra });
}
const compatibilityClick = p => p.buttonEvents.click({ detail: 1, stopPropagation() {}, preventDefault() {} });

test('touch release with finger movement activates once even when Safari omits its click', () => {
  const p = page();
  pointer(p, 'pointerdown');
  pointer(p, 'pointermove', { clientX: 106, clientY: 33 });
  pointer(p, 'pointerup', { clientX: 106, clientY: 33 });
  assert.equal(p.classes.has('fullscreen'), true);
  compatibilityClick(p);
  assert.equal(p.classes.has('fullscreen'), true, 'compatibility click must not undo the release');
  pointer(p, 'pointerdown');
  pointer(p, 'pointerup');
  compatibilityClick(p);
  assert.equal(p.classes.has('fullscreen'), false);
});

test('cancelled pointers and deliberate drags do not activate or create ghost clicks', () => {
  const p = page();
  pointer(p, 'pointerdown');
  pointer(p, 'pointercancel');
  pointer(p, 'pointerup');
  compatibilityClick(p);
  assert.equal(p.classes.has('fullscreen'), false);
  pointer(p, 'pointerdown');
  pointer(p, 'pointermove', { clientX: 130 });
  pointer(p, 'pointermove');
  pointer(p, 'pointerup');
  compatibilityClick(p);
  assert.equal(p.classes.has('fullscreen'), false, 'returning after a drag is not a tap');
  pointer(p, 'pointerdown');
  pointer(p, 'pointerdown', { pointerId: 2, isPrimary: false });
  pointer(p, 'pointerup');
  assert.equal(p.classes.has('fullscreen'), false, 'multi-touch must not activate');
});

test('mouse and keyboard remain usable after touch activation', () => {
  const p = page();
  pointer(p, 'pointerdown'); pointer(p, 'pointerup'); compatibilityClick(p);
  p.buttonEvents.click({ detail: 0, stopPropagation() {} });
  assert.equal(p.classes.has('fullscreen'), false, 'keyboard click exits once');
  pointer(p, 'pointerdown', { pointerType: 'mouse' });
  pointer(p, 'pointerup', { pointerType: 'mouse' });
  compatibilityClick(p);
  assert.equal(p.classes.has('fullscreen'), true, 'mouse click enters once');
});

test('older Safari touch events also tolerate movement and consume a compatibility click', () => {
  const p = page('unavailable', false);
  const touch = (x = 100) => ({ identifier: 1, clientX: x, clientY: 30 });
  p.buttonEvents.touchstart({ touches: [touch()], changedTouches: [touch()] });
  p.buttonEvents.touchmove({ touches: [touch(106)], changedTouches: [touch(106)] });
  let prevented = false;
  p.buttonEvents.touchend({ changedTouches: [touch(106)], stopPropagation() {}, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(p.classes.has('fullscreen'), true);
  p.buttonEvents.mousedown();
  compatibilityClick(p);
  assert.equal(p.classes.has('fullscreen'), true);
});
