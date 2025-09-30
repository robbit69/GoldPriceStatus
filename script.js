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
  const rootStyle = getComputedStyle(document.documentElement);
  const parseInset = (propertyName) => {
    const value = rootStyle.getPropertyValue(propertyName);
    return Number.parseFloat(value) || 0;
  };

  return {
    top: parseInset('--safe-top'),
    right: parseInset('--safe-right'),
    bottom: parseInset('--safe-bottom'),
    left: parseInset('--safe-left')
  };
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
    document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
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
      console.error('进入全屏失败：', error);
    }
  }

  // 功能：退出全屏或伪全屏模式
  async function exitFullscreen() {
    if (isIOS) {
      handleExitFullscreen();
      return;
    }
    if (!document.fullscreenElement) {
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

    const chartHeight = availableHeight * 0.7;
    const verticalOffset = safeArea.top + (availableHeight - chartHeight) / 2;

    const toX = (timestamp) => {
      const ratio = (timestamp - minTime) / timeRange;
      const x = ratio * width;
      return Math.min(width, Math.max(0, x));
    };
    const toY = (price) => {
      const normalized = (price - minPrice) / priceRange;
      return verticalOffset + chartHeight - normalized * chartHeight;
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

  requestStaticDraw();

  return {
    render(seriesByPeriod = {}, period = 'day', shouldAnimate = false) {
      const activePeriod = Object.prototype.hasOwnProperty.call(PERIOD_RANGES, period) ? period : 'day';
      const rawSeries = Array.isArray(seriesByPeriod[activePeriod]) ? seriesByPeriod[activePeriod] : [];
      cachedSeries = rawSeries.filter((point) => Array.isArray(point) && point.length >= 2);

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

// 功能：请求指定时间范围内的金价序列
async function fetchPriceSeries(starttime, endtime) {
  const targetUrl = `https://api.goldprice.yanrrd.com/price?currency=cny&unit=grams&starttime=${starttime}&endtime=${endtime}`;
  let response;
  let retryCount = 0;
  const maxRetries = 3;
  let lastError = null;

  while (retryCount < maxRetries) {
    try {
      response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Compatible; Browser)'
        }
      });

      if (response.status === 200) {
        break;
      }

      lastError = new Error(`请求失败,状态码: ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    retryCount += 1;
    if (retryCount === maxRetries) {
      throw lastError || new Error('请求失败');
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (!response) {
    throw lastError || new Error('未获取到响应');
  }

  const responseData = await response.json();
  const currencyKey = (responseData.currency || 'CNY').toUpperCase();
  const dataPoints = responseData.chartData && responseData.chartData[currencyKey];

  if (Array.isArray(dataPoints)) {
    return dataPoints;
  }

  return [];
}

// 功能：请求金价数据并包含多周期历史数据
async function fetchGoldPrice() {
  try {
    const now = Date.now();
    const periodEntries = Object.entries(PERIOD_RANGES);
    const seriesByPeriod = createEmptySeriesMap();

    const results = await Promise.allSettled(
      periodEntries.map(([_, duration]) => fetchPriceSeries(now - duration, now))
    );

    results.forEach((result, index) => {
      const period = periodEntries[index][0];

      if (result.status === 'fulfilled') {
        seriesByPeriod[period] = result.value;
      } else {
        console.error(`获取 ${period} 周期数据失败:`, result.reason);
      }
    });

    const orderedPeriods = ['day', 'week', 'month'];
    let latestPoint = null;

    orderedPeriods.forEach((period) => {
      const series = seriesByPeriod[period];
      if (Array.isArray(series) && series.length > 0) {
        const candidate = series[series.length - 1];
        if (!latestPoint || candidate[0] > latestPoint[0]) {
          latestPoint = candidate;
        }
      }
    });

    if (latestPoint) {
      return { price: latestPoint[1], timestamp: latestPoint[0], seriesByPeriod };
    }

    return { price: '无数据', timestamp: null, seriesByPeriod };
  } catch (error) {
    console.error('Fetch error:', error);
    console.error('获取数据失败');
    return { price: '获取数据失败', timestamp: null, seriesByPeriod: createEmptySeriesMap() };
  }
}

// 功能：刷新页面显示
function updateDisplay(price, timestamp, seriesByPeriod, shouldAnimate = false) {
  if (typeof price === 'number') {
    priceElement.textContent = price.toFixed(2) + ' CNY/克';
  } else {
    priceElement.textContent = price;
  }
  if (timestamp) {
    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    timeElement.textContent = '更新时间：' + new Date(timestamp).toLocaleString(undefined, {
      timeZone: userTimeZone
    });
  } else {
    timeElement.textContent = '—';
  }

  marketStatusRenderer.render(timestamp);
  cachedSeriesByPeriod = Object.assign(createEmptySeriesMap(), seriesByPeriod);
  changeBoardRenderer.render(cachedSeriesByPeriod);
  chartRenderer.render(cachedSeriesByPeriod, selectedPeriod, shouldAnimate);
}

// 功能：负责渲染市场状态提示
const marketStatusRenderer = (() => {
  const CLOSED_THRESHOLD = 2 * 60 * 60 * 1000;

  // 功能：根据时间戳判断是否停盘
  function determineStatus(latestTimestamp) {
    if (!latestTimestamp) {
      return { text: '⛔ 数据不可用', className: 'stopped' };
    }

    const now = Date.now();
    const diff = now - latestTimestamp;

    if (diff > CLOSED_THRESHOLD) {
      return { text: '⛔ 已停盘', className: 'stopped' };
    }

    return { text: '🟢 交易中', className: 'active' };
  }

  // 功能：渲染市场状态
  function render(latestTimestamp) {
    const status = determineStatus(latestTimestamp);
    statusElement.textContent = status.text;
    statusElement.classList.remove('stopped', 'active');
    statusElement.classList.add(status.className);
  }

  return { render };
})();

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
    const signedValue = changeValue > 0 ? `${absoluteValue} CNY` : changeValue < 0 ? `${absoluteValue} CNY` : absoluteValue;
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

// 功能：初始化页面并定时刷新
(async () => {
  const { price, timestamp, seriesByPeriod } = await fetchGoldPrice();
  updateDisplay(price, timestamp, seriesByPeriod, true);
})();

setInterval(async () => {
  const { price, timestamp, seriesByPeriod } = await fetchGoldPrice();
  updateDisplay(price, timestamp, seriesByPeriod, false);
}, 60000);
