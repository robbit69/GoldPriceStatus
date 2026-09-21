// =============== 页面变量 ===============
const priceElement = document.querySelector('.price');
const timeElement = document.querySelector('.time');
const statusElement = document.querySelector('.status');
const changeValueElements = document.querySelectorAll('.change-value');
const changeExtraElements = document.querySelectorAll('.change-extra');
const fullscreenButton = document.getElementById('fullscreenButton');
const backgroundCanvas = document.getElementById('backgroundChart');
const backgroundCtx = backgroundCanvas ? backgroundCanvas.getContext('2d') : null;
const changeCards = document.querySelectorAll('.change-card');

let selectedPeriod = 'day';


function readSafeAreaInsets() {
  const style = getComputedStyle(document.body);
  return Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side =>
    [side, parseFloat(style.getPropertyValue(`padding-${side}`)) || 0]));
}

const PERIOD_RANGES = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000
};

function createEmptySeriesMap() {
  return Object.fromEntries(Object.keys(PERIOD_RANGES).map((key) => [key, []]));
}

let cachedSeriesByPeriod = createEmptySeriesMap();

function updateCardSelectionUI() {
  changeCards.forEach((card) => {
    const period = card.getAttribute('data-card-period');
    const isActive = period === selectedPeriod;
    card.classList.toggle('active', isActive);
    card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function setSelectedPeriod(period) {
  if (!Object.prototype.hasOwnProperty.call(PERIOD_RANGES, period)) {
    return;
  }
  if (selectedPeriod === period) {
    return;
  }
  selectedPeriod = period;
  updateCardSelectionUI();
  chartRenderer.render(cachedSeriesByPeriod, selectedPeriod, true);
}

// 功能：管理布局高度并彻底关闭滚动
const layoutController = (() => {
  // 功能：在不同视口尺寸下同步 CSS 变量高度
  function setAppHeight() {
    const height = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${height}px`);

  }

  // 功能：禁用浏览器滚轮与触摸滚动
  function disableManualScroll() {
    const preventScrollHandler = (event) => {
      event.preventDefault();
    };
    window.addEventListener('wheel', preventScrollHandler, { passive: false });
    window.addEventListener('touchmove', preventScrollHandler, { passive: false });
  }

  setAppHeight();
  disableManualScroll();
  window.visualViewport?.addEventListener('resize', setAppHeight);
  window.addEventListener('resize', setAppHeight);
  window.addEventListener('orientationchange', setAppHeight);

  return {
    refreshHeight: setAppHeight
  };
})();

// 功能：识别是否为 iOS 设备
const isIOS = /iP(ad|od|hone)/i.test(navigator.userAgent);

// 功能：负责管理全屏进入/退出
const fullscreenController = (() => {
  // 功能：在进入全屏时更新样式
  function handleEnterFullscreen() {
    document.body.classList.add('fullscreen');
    fullscreenButton.style.display = 'none';
    layoutController.refreshHeight();
  }

  // 功能：在退出全屏时恢复样式
  function handleExitFullscreen() {
    document.body.classList.remove('fullscreen');
    fullscreenButton.style.display = 'block';
    layoutController.refreshHeight();
  }

  // 功能：触发全屏或伪全屏模式
  async function requestFullscreen() {
    if (isIOS) {
      handleEnterFullscreen();
      return;
    }
    try {
      await document.documentElement.requestFullscreen();
      handleEnterFullscreen();
    } catch (error) {
      handleEnterFullscreen();
    }
  }

  // 功能：退出全屏或伪全屏模式
  async function exitFullscreen() {
    if (isIOS) {
      handleExitFullscreen();
      return;
    }
    if (!document.fullscreenElement) {
      handleExitFullscreen();
      return;
    }
    try {
      await document.exitFullscreen();
      handleExitFullscreen();
    } catch (error) {
      console.error('退出全屏失败：', error);
    }
  }

  fullscreenButton.addEventListener('click', (event) => {
    event.stopPropagation();
    requestFullscreen();
  });

  document.addEventListener('click', () => {
    exitFullscreen();
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      handleExitFullscreen();
    }
  });

  return {
    requestFullscreen,
    exitFullscreen
  };
})();

// 功能：负责在背景绘制折线图
const chartRenderer = (() => {
  if (!backgroundCanvas || !backgroundCtx) {
    return { render() {} };
  }

  const ANIMATION_DURATION = 650;
  let cachedSeries = [];
  let animationFrame = null;
  let resizeFrame = null;
  let animationStartTime = 0;
  let lastDrawProgress = 1;

  function resizeCanvas() {
    const width = backgroundCanvas.clientWidth;
    const height = backgroundCanvas.clientHeight;

    if (!width || !height) {
      return null;
    }

    const devicePixelRatio = window.devicePixelRatio || 1;
    backgroundCanvas.width = width * devicePixelRatio;
    backgroundCanvas.height = height * devicePixelRatio;
    backgroundCtx.setTransform(1, 0, 0, 1, 0, 0);
    backgroundCtx.scale(devicePixelRatio, devicePixelRatio);

    return { width, height };
  }

  function cancelAnimation() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  }

  function interpolateSeries(progress) {
    if (!Array.isArray(cachedSeries) || cachedSeries.length === 0) {
      return [];
    }

    if (cachedSeries.length === 1) {
      return [cachedSeries[0]];
    }

    const totalSegments = cachedSeries.length - 1;
    const scaledIndex = Math.min(Math.max(progress, 0), 1) * totalSegments;
    const endIndex = Math.floor(scaledIndex);
    const fraction = scaledIndex - endIndex;
    const visible = cachedSeries.slice(0, Math.min(endIndex + 1, cachedSeries.length));

    if (fraction > 0 && endIndex + 1 < cachedSeries.length) {
      const [startTime, startPrice] = cachedSeries[endIndex];
      const [endTime, endPrice] = cachedSeries[endIndex + 1];
      visible.push([
        startTime + (endTime - startTime) * fraction,
        startPrice + (endPrice - startPrice) * fraction
      ]);
    }

    if (visible.length === 0 && cachedSeries.length > 0) {
      visible.push(cachedSeries[0]);
    }

    return visible;
  }

  function draw(progress = 1) {
    const dimensions = resizeCanvas();
    if (!dimensions) {
      return;
    }

    const { width, height } = dimensions;
    backgroundCtx.clearRect(0, 0, width, height);
    backgroundCtx.globalAlpha = 0.6;
    document.querySelector('.chart-description').textContent = '';

    if (!Array.isArray(cachedSeries) || cachedSeries.length === 0) {
      return;
    }

    const safeArea = readSafeAreaInsets();
    const availableHeight = Math.max(height - safeArea.top - safeArea.bottom, 1);

    const times = cachedSeries.map(([timestamp]) => timestamp);
    const prices = cachedSeries.map(([, price]) => price);

    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    const timeRange = maxTime - minTime || 1;
    const priceRange = maxPrice - minPrice || 1;

    // Keep both extrema in clear lanes outside the central content.
    const content = document.querySelector('.container').getBoundingClientRect();
    const lanes = GoldChartLayout.lanes(height, safeArea, content);
    const verticalOffset = lanes.high;
    const chartHeight = lanes.low - lanes.high;

    const toX = (timestamp) => {
      const ratio = (timestamp - minTime) / timeRange;
      const x = safeArea.left + 12 + ratio * (width - safeArea.left - safeArea.right - 24);
      return Math.min(width, Math.max(0, x));
    };
    const toY = (price) => {
      const normalized = (price - minPrice) / priceRange;
      return minPrice === maxPrice ? verticalOffset : verticalOffset + chartHeight - normalized * chartHeight;
    };

    const visibleSeries = interpolateSeries(progress);

    if (visibleSeries.length === 0) {
      return;
    }

    if (visibleSeries.length === 1) {
      const [timestamp, price] = visibleSeries[0];
      const x = toX(timestamp);
      const y = toY(price);
      backgroundCtx.beginPath();
      backgroundCtx.arc(x, y, 3, 0, Math.PI * 2);
      backgroundCtx.fillStyle = 'rgba(236, 198, 76, 0.95)';
      backgroundCtx.fill();
      if (progress === 1) drawLabels();
      return;
    }

    const firstPoint = visibleSeries[0];
    const lastPoint = visibleSeries[visibleSeries.length - 1];

    // 绘制折线
    backgroundCtx.beginPath();
    visibleSeries.forEach(([timestamp, price], index) => {
      const x = toX(timestamp);
      const y = toY(price);
      if (index === 0) {
        backgroundCtx.moveTo(x, y);
      } else {
        backgroundCtx.lineTo(x, y);
      }
    });
    backgroundCtx.lineWidth = 3.2;
    backgroundCtx.lineJoin = 'round';
    backgroundCtx.lineCap = 'round';
    backgroundCtx.strokeStyle = 'rgba(236, 198, 76, 0.95)';
    backgroundCtx.stroke();

    // 绘制填充区域
    const fillBaselineY = height - safeArea.bottom;
    const gradient = backgroundCtx.createLinearGradient(0, verticalOffset, 0, fillBaselineY + safeArea.bottom);
    gradient.addColorStop(0, 'rgba(236, 198, 76, 0.5)');
    gradient.addColorStop(1, 'rgba(236, 198, 76, 0.05)');

    backgroundCtx.beginPath();
    backgroundCtx.moveTo(toX(firstPoint[0]), fillBaselineY);
    visibleSeries.forEach(([timestamp, price]) => {
      backgroundCtx.lineTo(toX(timestamp), toY(price));
    });
    backgroundCtx.lineTo(toX(lastPoint[0]), fillBaselineY);
    backgroundCtx.closePath();
    backgroundCtx.fillStyle = gradient;
    backgroundCtx.fill();
    if (progress === 1) drawLabels();

    function drawLabels() {
      backgroundCtx.globalAlpha = 1;
      const fontSize = Math.max(13, Math.min(22, width * .016, height * .045));
      backgroundCtx.font = `600 ${fontSize}px Arial, sans-serif`;
      const extrema = minPrice === maxPrice ? [['最高/最低', maxPrice]] : [['最高', maxPrice], ['最低', minPrice]];
      const descriptions = [];
      for (const [name, value] of extrema) {
        const point = cachedSeries.find(([, price]) => price === value);
        const text = `${name} ${value.toFixed(2)} 元`;
        const anchor = { x: toX(point[0]), y: toY(value) };
        const label = GoldChartLayout.label(anchor, backgroundCtx.measureText(text).width, width, safeArea,
          [fullscreenButton.getBoundingClientRect()], fontSize);
        backgroundCtx.strokeStyle = '#e35b60';
        backgroundCtx.fillStyle = '#e35b60';
        backgroundCtx.lineWidth = 1.5;
        backgroundCtx.beginPath();
        backgroundCtx.moveTo(anchor.x, anchor.y);
        backgroundCtx.lineTo(label.end, anchor.y);
        backgroundCtx.stroke();
        backgroundCtx.textBaseline = 'bottom';
        backgroundCtx.fillText(text, label.x, anchor.y - 6);
        descriptions.push(text);
      }
      document.querySelector('.chart-description').textContent = `当前${{day: '24小时', week: '7天', month: '30天'}[selectedPeriod]}，${descriptions.join('，')}，单位人民币/克`;
    }
  }

  function startAnimation() {
    cancelAnimation();
    animationStartTime = performance.now();

    const step = (timestamp) => {
      const progress = Math.min((timestamp - animationStartTime) / ANIMATION_DURATION, 1);
      lastDrawProgress = progress;
      draw(progress);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(step);
      } else {
        animationFrame = null;
      }
    };

    animationFrame = requestAnimationFrame(step);
  }

  function requestStaticDraw(progress = 1) {
    if (animationFrame) {
      return;
    }

    const clampedProgress = Math.min(Math.max(progress, 0), 1);

    if (resizeFrame) {
      cancelAnimationFrame(resizeFrame);
    }

    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      draw(clampedProgress);
      lastDrawProgress = clampedProgress;
    });
  }

  window.addEventListener('resize', () => requestStaticDraw(lastDrawProgress));
  window.addEventListener('orientationchange', () => requestStaticDraw(lastDrawProgress));

  new ResizeObserver(() => { layoutController.refreshHeight(); requestStaticDraw(); }).observe(document.querySelector('.container'));
  new MutationObserver(() => requestStaticDraw()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.visualViewport?.addEventListener('resize', () => requestStaticDraw());
  requestStaticDraw();

  return {
    render(seriesByPeriod = {}, period = 'day', shouldAnimate = false) {
      const activePeriod = Object.prototype.hasOwnProperty.call(PERIOD_RANGES, period) ? period : 'day';
      const rawSeries = Array.isArray(seriesByPeriod[activePeriod]) ? seriesByPeriod[activePeriod] : [];
      cachedSeries = rawSeries.filter((point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]) && point[1] > 0);

      if (resizeFrame) {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = null;
      }

      if (cachedSeries.length < 2) {
        cancelAnimation();
        requestStaticDraw();
        return;
      }

      if (shouldAnimate) {
        lastDrawProgress = 0;
        startAnimation();
      } else {
        cancelAnimation();
        requestStaticDraw();
      }
    }
  };
})();

// 最新主报价每分钟更新；历史趋势每五分钟更新。
const API_BASE = 'https://api.goldprice.yanrrd.com';
const historyStatusElement = document.querySelector('.history-status');
let lastPrimary = null;
let primaryFailed = false;
let lastHistoryRefresh = 0;
let refreshInProgress = false;

async function fetchPayload(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22000);
  try {
    const response = await fetch(`${API_BASE}${path}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timeout); }
}

function renderPrimary() {
  const timestamp = lastPrimary?.timestamp;
  priceElement.textContent = lastPrimary ? lastPrimary.price.toFixed(2) + ' CNY/克' : '暂无数据';
  timeElement.textContent = timestamp ? '报价时间：' + new Date(timestamp).toLocaleString() : '—';
  const status = GoldPriceModel.status(timestamp, primaryFailed);
  statusElement.textContent = status.text;
  statusElement.classList.remove('stopped', 'active');
  statusElement.classList.add(status.className);
}

async function refreshPrimary() {
  try {
    const payload = await fetchPayload('/price?currency=cny&unit=grams');
    const points = GoldPriceModel.series(payload);
    const latest = points[points.length - 1];
    if (latest && (!lastPrimary || latest[0] >= lastPrimary.timestamp)) {
      lastPrimary = { price: latest[1], timestamp: latest[0] };
    }
    primaryFailed = payload.updateFailed === true;
  } catch (_) { primaryFailed = true; }
  renderPrimary();
}

async function refreshHistory(animate) {
  const periods = Object.keys(PERIOD_RANGES);
  const results = await Promise.allSettled(periods.map(async period => {
    const payload = await fetchPayload(`/price?currency=cny&unit=grams&period=${period}`);
    return { points: GoldPriceModel.series(payload), failed: payload.updateFailed === true };
  }));
  const failed = [];
  results.forEach((result, index) => {
    const period = periods[index];
    if (result.status === 'fulfilled' && !result.value.failed) {
      cachedSeriesByPeriod[period] = result.value.points;
    } else {
      // 故障不清空上次成功曲线，也不混入对照数据。
      if (!cachedSeriesByPeriod[period].length && result.status === 'fulfilled') {
        cachedSeriesByPeriod[period] = result.value.points;
      }
      failed.push({ day: '24H', week: '7天', month: '30天' }[period]);
    }
  });
  historyStatusElement.textContent = failed.length ? `${failed.join('、')}曲线更新失败，已有曲线保留` : '';
  lastHistoryRefresh = failed.length ? 0 : Date.now();
  // 最新价请求较慢或失败时，仍可显示同一来源历史中的最后一笔真实报价。
  for (const points of Object.values(cachedSeriesByPeriod)) {
    const latest = points[points.length - 1];
    if (latest && (!lastPrimary || latest[0] > lastPrimary.timestamp)) {
      lastPrimary = { price: latest[1], timestamp: latest[0] };
    }
  }
  renderPrimary();
  changeBoardRenderer.render(cachedSeriesByPeriod);
  chartRenderer.render(cachedSeriesByPeriod, selectedPeriod, animate);
}

async function refreshPrices(animate = false) {
  if (refreshInProgress) return;
  refreshInProgress = true;
  try {
    const tasks = [refreshPrimary()];
    if (Date.now() - lastHistoryRefresh >= 5 * 60_000) tasks.push(refreshHistory(animate));
    await Promise.allSettled(tasks);
  } finally { refreshInProgress = false; }
}

// 功能：负责计算与渲染涨跌幅看板
const changeBoardRenderer = (() => {
  // 功能：计算指定周期的涨跌幅
  function calculateChange(dataPoints, duration, now) {
    if (!Array.isArray(dataPoints) || dataPoints.length === 0) {
      return null;
    }

    const startTime = now - duration;

    let baselinePrice = null;
    let baselineTimestamp = null;

    for (let i = dataPoints.length - 1; i >= 0; i -= 1) {
      const [timestamp, price] = dataPoints[i];
      if (timestamp <= startTime) {
        baselinePrice = price;
        baselineTimestamp = timestamp;
        break;
      }
      baselinePrice = price;
      baselineTimestamp = timestamp;
    }

    const latestPoint = dataPoints[dataPoints.length - 1];
    const latestPrice = latestPoint ? latestPoint[1] : null;

    if (baselinePrice == null || latestPrice == null) {
      return null;
    }

    const changeValue = latestPrice - baselinePrice;
    const changePercent = baselinePrice === 0 ? 0 : (changeValue / baselinePrice) * 100;

    return {
      changeValue,
      changePercent,
      baselinePrice,
      baselineTimestamp
    };
  }

  // 功能：将涨跌幅格式化为文本
  function formatChange(changeData) {
    if (!changeData) {
      return {
        arrowSymbol: '—',
        valueLines: ['—', '—'],
        extraText: '暂无数据',
        direction: 'none'
      };
    }

    const { changeValue, changePercent, baselinePrice } = changeData;
    const direction = changeValue > 0 ? 'up' : changeValue < 0 ? 'down' : 'flat';
    const absoluteValue = Math.abs(changeValue).toFixed(2);
    const absolutePercent = Math.abs(changePercent).toFixed(2);
    const arrowSymbol = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '▬';
    const signedValue = changeValue > 0 ? `${absoluteValue}` : changeValue < 0 ? `${absoluteValue}` : absoluteValue;
    const signedPercent = changePercent > 0 ? `${absolutePercent}%` : changePercent < 0 ? `${absolutePercent}%` : `${absolutePercent}%`;
    const valueLines = [signedValue, signedPercent];
    const extraText = `起始价：${baselinePrice.toFixed(2)}`;

    return { arrowSymbol, valueLines, extraText, direction };
  }

  // 功能：渲染涨跌信息
  function render(seriesByPeriod = {}) {
    const now = Date.now();
    const changeCache = {};

    Object.entries(PERIOD_RANGES).forEach(([period, duration]) => {
      const dataPoints = Array.isArray(seriesByPeriod[period]) ? seriesByPeriod[period] : [];
      changeCache[period] = calculateChange(dataPoints, duration, now);
    });

    changeValueElements.forEach((element) => {
      const period = element.getAttribute('data-period');
      const changeData = changeCache[period];
      const { arrowSymbol, valueLines, direction } = formatChange(changeData);
      element.innerHTML =
        `<span class="change-arrow" aria-hidden="true">${arrowSymbol}</span>` +
        `<span class="change-lines">` +
        `<span class="change-line">${valueLines[0]}</span>` +
        `<span class="change-line">${valueLines[1]}</span>` +
        `</span>`;
      element.classList.remove('change-up', 'change-down', 'change-flat');
      if (direction === 'up') {
        element.classList.add('change-up');
      } else if (direction === 'down') {
        element.classList.add('change-down');
      } else if (direction === 'flat') {
        element.classList.add('change-flat');
      }
    });

    changeExtraElements.forEach((element) => {
      const period = element.getAttribute('data-extra');
      const changeData = changeCache[period];
      const { extraText } = formatChange(changeData);
      element.textContent = extraText;
    });

    updateCardSelectionUI();
  }

  return { render };
})();

changeCards.forEach((card) => {
  const period = card.getAttribute('data-card-period');
  if (!Object.prototype.hasOwnProperty.call(PERIOD_RANGES, period)) {
    return;
  }

  card.addEventListener('click', (event) => {
    event.stopPropagation();
    setSelectedPeriod(period);
  });

  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setSelectedPeriod(period);
    }
  });
});

updateCardSelectionUI();

// 后台页面暂停轮询，返回页面时刷新；防止慢请求重叠。
refreshPrices(true);
setInterval(() => {
  if (!document.hidden) refreshPrices();
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshPrices();
});
