const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function page(native = 'unavailable') {
  const classes = new Set();
  const buttonEvents = {};
  const documentEvents = {};
  const button = { style: {}, addEventListener(name, handler) { buttonEvents[name] = handler; } };
  let requests = 0, exits = 0;
  const document = {
    body: { classList: { add(name) { classes.add(name); }, remove(name) { classes.delete(name); } } },
    documentElement: { style: {} },
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
    layoutController: { refreshHeight() {} }, console });
  const source = fs.readFileSync('script.js', 'utf8');
  const controller = vm.runInContext(source.slice(source.indexOf('const fullscreenController ='),
    source.indexOf('const chartRenderer =')) + '\nfullscreenController;', context);
  return { controller, document, classes, button, buttonEvents, documentEvents,
    get requests() { return requests; }, get exits() { return exits; } };
}

test('fullscreen button enters and exits display mode without a native API on iPhone', () => {
  const p = page();
  let stopped = false;
  p.buttonEvents.click({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.equal(p.classes.has('fullscreen'), true);
  assert.equal(p.button.style.display, 'none');
  assert.equal(p.document.documentElement.style.backgroundColor, '#000');
  p.documentEvents.click();
  assert.equal(p.classes.has('fullscreen'), false);
  assert.equal(p.button.style.display, 'block');
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
  assert.equal(p.button.style.display, 'block');
});
