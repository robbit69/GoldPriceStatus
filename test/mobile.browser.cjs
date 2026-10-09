// Optional browser regression suite. Fixtures are deliberately confined to this test.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const playwright = require(process.env.GOLDPRICE_PLAYWRIGHT_PATH || 'playwright-core');
const root = path.resolve(__dirname, '..');
const files = new Set(['index.html', 'script.js', 'market-model.js', 'price-model.js', 'chart-layout.js']);
const now = Date.now();
function points(price) {
  return [[now - 30 * 86400000, price - 700], [now - 7 * 86400000, price - 400],
    [now - 86400000, price - 200], [now - 3600000, price + 100], [now - 60000, price]];
}

async function run(browserType, origin, standalone) {
  const options = browserType === 'chromium' && process.env.GOLDPRICE_CHROMIUM_PATH
    ? { executablePath: process.env.GOLDPRICE_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {};
  const browser = await playwright[browserType].launch(options);
  try {
    const page = await browser.newPage({ viewport: { width: 812, height: 375 },
      isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const touchSession = browserType === 'chromium' ? await page.context().newCDPSession(page) : null;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(standalone => Object.defineProperty(navigator, 'standalone', { value: standalone }), standalone);
    await page.addInitScript(() => {
      Element.prototype.requestFullscreen = undefined;
      const p = CanvasRenderingContext2D.prototype;
      const begin = p.beginPath, move = p.moveTo, line = p.lineTo, stroke = p.stroke, clear = p.clearRect, fillText = p.fillText;
      p.beginPath = function (...args) { this.__path = []; return begin.apply(this, args); };
      p.moveTo = function (x, y) { this.__path.push({ x, y }); return move.call(this, x, y); };
      p.lineTo = function (x, y) { this.__path.push({ x, y }); return line.call(this, x, y); };
      p.stroke = function (...args) {
        if (Math.abs(this.lineWidth - 3.2) < .001) {
          window.__chartPath = this.__path;
          const rect = this.canvas.getBoundingClientRect();
          window.__chartGeometry = { width: rect.width, height: rect.height, left: rect.left, top: rect.top,
            inset: readSafeAreaInsets().left, symbol: currentAsset.symbol };
        }
        return stroke.apply(this, args);
      };
      p.clearRect = function (...args) { window.__chartLabels = []; window.__labelBounds = []; return clear.apply(this, args); };
      p.fillText = function (text, x, y, ...args) {
        window.__chartLabels.push(text);
        window.__labelBounds.push({ left: x, right: x + this.measureText(text).width, bottom: y,
          top: y - parseFloat(this.font.match(/[\d.]+px/)[0]) });
        return fillText.call(this, text, x, y, ...args);
      };
    });
    await page.route('https://api.goldprice.yanrrd.com/**', route => route.fulfill({ json: {
      currency: 'CNY', unit: 'grams', chartData: { CNY: points(898.63) }, updateFailed: false
    } }));
    await page.goto(origin);
    async function choose(type) {
      await page.locator('#assetSwitchButton').tap();
      if (type === 'stock') {
        await page.locator('#stockSymbol').fill('AAPL');
        await page.locator('#stockForm button[type="submit"]').tap();
      } else await page.locator(`[data-asset="${type}"]`).tap();
      await page.waitForFunction(type => {
        const text = document.querySelector('.price').textContent;
        return type === 'bitcoin' ? text === '82.3K USD/BTC' : type === 'stock' ? text === '242.30 USD/股' : text === '898.63 CNY/克';
      }, type);
    }
    async function geometry(width, height, inset, left = 0, top = 0) {
      // Check the completed draw for this viewport, rather than a previous frame with the same width.
      await page.waitForFunction(expected => window.__chartPath?.at(-1).x === expected.width &&
        window.__chartLabels?.length >= 2 && window.__chartGeometry?.symbol === currentAsset.symbol &&
        Object.entries(expected).every(([name, value]) => window.__chartGeometry?.[name] === value),
      { width, height, inset, left, top });
      const g = await page.evaluate(() => {
        const rect = selector => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
        };
        return { canvas: rect('canvas'), content: rect('.container'), price: rect('.price'),
          button: rect('#fullscreenButton'), switcher: rect('#assetSwitchButton'),
          first: window.__chartPath[0].x, last: window.__chartPath.at(-1).x,
          safe: readSafeAreaInsets(), padding: getComputedStyle(document.body).padding,
          plotTop: Math.min(...window.__chartPath.map(point => point.y)),
          plotBottom: Math.max(...window.__chartPath.map(point => point.y)),
          scrollWidth: document.documentElement.scrollWidth, labels: window.__chartLabels, labelBounds: window.__labelBounds };
      });
      assert.equal(g.first, 0); assert.equal(g.last, width);
      assert.equal(g.canvas.left, left); assert.equal(g.canvas.top, top);
      assert.equal(g.canvas.width, width); assert.equal(g.canvas.height, height);
      assert.ok(g.content.top >= top && g.content.bottom <= top + height, JSON.stringify(g));
      assert.ok(g.price.left >= left + inset && g.price.right <= left + width - inset, JSON.stringify(g));
      const lanes = await page.evaluate(() => {
        const canvas = document.querySelector('canvas').getBoundingClientRect();
        const content = document.querySelector('.container').getBoundingClientRect();
        return GoldChartLayout.lanes(canvas.height, readSafeAreaInsets(),
          { top: content.top - canvas.top, bottom: content.bottom - canvas.top });
      });
      assert.ok(Math.abs((g.plotBottom - g.plotTop) / (lanes.low - lanes.high) - .72) < .00001, 'plot must retain the smaller amplitude');
      for (const button of [g.button, g.switcher]) {
        assert.ok(button.height >= 44 && button.width >= 44);
        assert.ok(button.left >= left + inset && button.right <= left + width - inset);
        assert.ok(button.top >= top && button.bottom <= top + height);
        for (const label of g.labelBounds) {
          assert.ok(!(label.left + left < button.right && label.right + left > button.left &&
            label.top + top < button.bottom && label.bottom + top > button.top), 'chart label covered by control: ' + JSON.stringify(g));
        }
      }
      return g;
    }
    async function movingTap(x, y, dx) {
      if (touchSession) {
        // Trusted moving touches exercise browser gesture recognition, beyond an instantaneous tap.
        await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await touchSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx, y: y + 3 }] });
        await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        // WebKit exposes tap only: test its release/compatibility-click sequence explicitly as well.
        const button = page.locator('#fullscreenButton');
        const event = { pointerType: 'touch', pointerId: 9, isPrimary: true, clientX: x, clientY: y };
        await button.dispatchEvent('pointerdown', event);
        await button.dispatchEvent('pointermove', { ...event, clientX: x + dx, clientY: y + 3 });
        await button.dispatchEvent('pointerup', { ...event, clientX: x + dx, clientY: y + 3 });
        await button.dispatchEvent('click', { detail: 1 });
      }
    }
    for (const type of ['bitcoin', 'stock', 'gold']) {
      await choose(type);
      for (const [width, height, inset] of [[812, 375, 44], [812, 300, 44], [375, 812, 0], [812, 375, 44]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(({ inset, standalone, portrait }) => {
          document.documentElement.style.setProperty('--safe-left', inset + 'px');
          document.documentElement.style.setProperty('--safe-right', inset + 'px');
          document.documentElement.style.setProperty('--safe-top', standalone && portrait ? '44px' : '0px');
          document.documentElement.style.setProperty('--safe-bottom', portrait && standalone ? '34px' : '21px');
          window.dispatchEvent(new Event('orientationchange'));
        }, { inset, standalone, portrait: width < height });
        const g = await geometry(width, height, inset);
        assert.equal(g.scrollWidth, width);
        if (type === 'bitcoin') assert.ok(g.labels.every(text => /\d+\.\dK USD/.test(text)));
        const x = g.button.left + 8, y = g.button.top + g.button.height / 2;
        // Holding a press reproduces the old :active transform/cancelled-click regression.
        await page.mouse.move(x, y); await page.mouse.down();
        await page.waitForTimeout(240);
        assert.deepEqual(await page.locator('#fullscreenButton').boundingBox(),
          { x: g.button.left, y: g.button.top, width: g.button.width, height: g.button.height });
        await page.mouse.up();
        await page.waitForFunction(() => document.body.classList.contains('fullscreen'));
        assert.equal(await page.locator('#fullscreenButton').getAttribute('aria-pressed'), 'true');
        await page.touchscreen.tap(width / 2, 2);
        assert.equal(await page.evaluate(() => document.body.classList.contains('fullscreen')), true);
        await page.locator('#assetSwitchButton').tap();
        await page.locator('#closeAssetDialog').tap();
        assert.equal(await page.evaluate(() => document.body.classList.contains('fullscreen')), true);
        for (let tap = 0; tap < 5; tap++) {
          await page.touchscreen.tap(x, y);
          assert.equal(await page.evaluate(() => document.body.classList.contains('fullscreen')), tap % 2 === 1);
        }
        for (let tap = 0; tap < 4; tap++) {
          await movingTap(x, y, tap % 2 ? 8 : 5);
          assert.equal(await page.evaluate(() => document.body.classList.contains('fullscreen')), tap % 2 === 0,
            'each moving touch must toggle once without waiting for another tap');
        }
        await movingTap(x, y, 25);
        assert.equal(await page.evaluate(() => document.body.classList.contains('fullscreen')), false, 'drag is not a tap');
        const unblocked = await page.evaluate(() => {
          const touchMove = new Event('touchmove', { bubbles: true, cancelable: true });
          document.getElementById('fullscreenButton').dispatchEvent(touchMove);
          return !touchMove.defaultPrevented;
        });
        assert.equal(unblocked, true, 'global scroll prevention must leave the button touch alone');
        await page.locator('#fullscreenButton').press('Enter');
        assert.equal(await page.evaluate(() => document.body.classList.contains('fullscreen')), true, 'keyboard works after touch');
        await page.locator('#fullscreenButton').press('Space');
        assert.equal(await page.evaluate(() => document.body.classList.contains('fullscreen')), false);
        assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(240, 240, 240)');
      }
    }
    // Simulate a Safari visual viewport with a shifted origin and a shrinking toolbar.
    await page.evaluate(() => {
      Object.defineProperties(window.visualViewport, {
        width: { configurable: true, value: 792 }, height: { configurable: true, value: 320 },
        offsetLeft: { configurable: true, value: 10 }, offsetTop: { configurable: true, value: 40 }
      });
      window.visualViewport.dispatchEvent(new Event('resize'));
      window.visualViewport.dispatchEvent(new Event('scroll'));
    });
    await geometry(792, 320, 44, 10, 40);
    await page.locator('#fullscreenButton').tap();
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), 'rgb(0, 0, 0)');
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), '#000');
    await page.locator('#fullscreenButton').tap();
    await page.evaluate(() => {
      for (const name of ['width', 'height', 'offsetLeft', 'offsetTop']) delete window.visualViewport[name];
      window.visualViewport.dispatchEvent(new Event('scroll'));
    });
    await geometry(812, 375, 44);
    assert.deepEqual(errors, []);
    console.log(`${browserType} ${standalone ? 'home screen' : 'Safari'}: compressed plot, moving touches, click deduplication, keyboard, assets and XS layout passed`);
  } finally { await browser.close(); }
}

(async () => {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/api/market') {
        const bitcoin = url.searchParams.get('asset') === 'bitcoin';
        const price = bitcoin ? 82300 : 242.30;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ asset: bitcoin ? 'bitcoin' : 'stock', symbol: bitcoin ? 'BTC-USD' : 'AAPL',
          currency: 'USD', unit: bitcoin ? 'BTC' : '股', price, dataTimestamp: now - 60000,
          source: 'Yahoo Finance', updateFailed: false,
          series: bitcoin ? points(price) : points(price).map(([time, value]) => [time, Math.max(10, value)]) }));
        return;
      }
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!files.has(file)) { response.writeHead(404).end(); return; }
      response.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8');
      response.end(await fs.readFile(path.join(root, file)));
    } catch (error) { response.writeHead(500).end(String(error)); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}/`;
    for (const type of (process.env.GOLDPRICE_BROWSERS || 'chromium,webkit').split(',')) {
      for (const standalone of [false, true]) await run(type, origin, standalone);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
