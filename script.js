// =============== 页面变量 ===============
const priceElement = document.querySelector('.price');
const timeElement = document.querySelector('.time');
const statusElement = document.querySelector('.status');
const changeValueElements = document.querySelectorAll('.change-value');
const changeExtraElements = document.querySelectorAll('.change-extra');
const fullscreenButton = document.getElementById('fullscreenButton');

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

// 功能：渲染背景折线图，提升视觉同时保持可读性
const backgroundChartRenderer = (() => {
  const canvas = document.getElementById('backgroundChart');

  if (!canvas || !canvas.getContext) {
    return {
      render: () => {},
      refresh: () => {}
    };
  }

  const context = canvas.getContext('2d');
  let cachedPoints = [];

  // 功能：根据数据绘制折线
  function drawChart() {
    const rect = canvas.getBoundingClientRect();
    const devicePixelRatio = window.devicePixelRatio || 1;

    const displayWidth = Math.max(1, Math.floor(rect.width * devicePixelRatio));
    const displayHeight = Math.max(1, Math.floor(rect.height * devicePixelRatio));

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);

    if (!cachedPoints || cachedPoints.length < 2) {
      return;
    }

    const priceValues = cachedPoints
      .map(([, price]) => Number(price))
      .filter((value) => Number.isFinite(value));

    if (priceValues.length < 2) {
      return;
    }

    const minPrice = Math.min(...priceValues);
    const maxPrice = Math.max(...priceValues);
    const priceRange = Math.max(maxPrice - minPrice, 0.0001);

    const horizontalMargin = 120 * devicePixelRatio;
    const verticalMargin = 100 * devicePixelRatio;
    const chartWidth = Math.max(20 * devicePixelRatio, canvas.width - horizontalMargin * 2);
    const chartHeight = Math.max(20 * devicePixelRatio, canvas.height - verticalMargin * 2);

    const plottedPoints = priceValues.map((price, index) => {
      const progress = index / (priceValues.length - 1);
      const x = horizontalMargin + progress * chartWidth;
      const y = canvas.height - verticalMargin - ((price - minPrice) / priceRange) * chartHeight;
      return { x, y };
    });

    const firstPoint = plottedPoints[0];
    const lastPoint = plottedPoints[plottedPoints.length - 1];

    context.save();
    context.beginPath();
    plottedPoints.forEach(({ x, y }, index) => {
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.lineTo(lastPoint.x, canvas.height - verticalMargin);
    context.lineTo(firstPoint.x, canvas.height - verticalMargin);
    context.closePath();

    const gradient = context.createLinearGradient(0, verticalMargin, 0, canvas.height - verticalMargin);
    gradient.addColorStop(0, 'rgba(255, 210, 128, 0.24)');
    gradient.addColorStop(1, 'rgba(255, 210, 128, 0.03)');
    context.fillStyle = gradient;
    context.fill();
    context.restore();

    context.save();
    context.beginPath();
    plottedPoints.forEach(({ x, y }, index) => {
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.strokeStyle = 'rgba(255, 214, 120, 0.85)';
    context.lineWidth = 2.4 * devicePixelRatio;
    context.shadowColor = 'rgba(255, 190, 92, 0.45)';
    context.shadowBlur = 18 * devicePixelRatio;
    context.stroke();
    context.restore();

    context.save();
    const glowRadius = 42 * devicePixelRatio;
    const glowGradient = context.createRadialGradient(
      lastPoint.x,
      lastPoint.y,
      0,
      lastPoint.x,
      lastPoint.y,
      glowRadius
    );
    glowGradient.addColorStop(0, 'rgba(255, 214, 120, 0.55)');
    glowGradient.addColorStop(1, 'rgba(255, 214, 120, 0.02)');
    context.fillStyle = glowGradient;
    const glowX = Math.max(0, lastPoint.x - glowRadius);
    const glowY = Math.max(0, lastPoint.y - glowRadius);
    const glowWidth = Math.min(glowRadius * 2, canvas.width - glowX);
    const glowHeight = Math.min(glowRadius * 2, canvas.height - glowY);
    context.fillRect(glowX, glowY, glowWidth, glowHeight);
    context.restore();
  }

  // 功能：保存数据并触发绘制
  function render(dataPoints) {
    cachedPoints = Array.isArray(dataPoints)
      ? dataPoints
          .slice(-240)
          .filter((point) => Array.isArray(point) && point.length >= 2)
          .sort((a, b) => a[0] - b[0])
      : [];
    drawChart();
  }

  // 功能：在视口尺寸发生变化时刷新画布
  function refresh() {
    drawChart();
  }

  window.addEventListener('resize', refresh);
  window.addEventListener('orientationchange', refresh);

  return {
    render,
    refresh
  };
})();

// 功能：通过 Alpha Vantage API 获取市场开闭状态
const marketStatusService = (() => {
  const API_ENDPOINT = 'https://www.alphavantage.co/query?function=MARKET_STATUS&apikey=';
  const REQUEST_TIMEOUT = 6500;
  const CACHE_DURATION = 5 * 60 * 1000;

  let cachedStatus = null;

  // 功能：构造用于展示的默认状态对象
  function createUnknownStatus(reason = '第三方市场状态不可用') {
    return {
      state: 'unknown',
      detail: reason,
      fetchedAt: Date.now(),
      source: 'local'
    };
  }

  // 功能：判断缓存是否仍然有效
  function isCacheValid() {
    if (!cachedStatus) {
      return false;
    }
    if (cachedStatus.state === 'unknown') {
      return false;
    }
    return Date.now() - cachedStatus.fetchedAt < CACHE_DURATION;
  }

  // 功能：调用第三方接口并解析外汇市场的开闭状态
  async function fetchStatusFromAPI() {
    const apiKey = (window.GOLD_APP && window.GOLD_APP.alphaVantageKey) || 'demo';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(`${API_ENDPOINT}${apiKey}`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (GoldPriceStatus Dashboard)'
        }
      });

      if (!response.ok) {
        throw new Error(`Alpha Vantage 请求失败：${response.status}`);
      }

      const payload = await response.json();
      const markets = Array.isArray(payload.markets) ? payload.markets : [];
      const forexMarket = markets.find((market) => market.market_type === 'Forex');

      if (!forexMarket || typeof forexMarket.current_status !== 'string') {
        throw new Error('未能从 Alpha Vantage 解析外汇市场状态');
      }

      const normalizedState = forexMarket.current_status.toLowerCase();

      return {
        state: normalizedState === 'open' ? 'open' : 'closed',
        detail: `Alpha Vantage Forex 市场状态：${forexMarket.current_status}`,
        fetchedAt: Date.now(),
        source: 'Alpha Vantage'
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // 功能：公开获取市场状态的方法，含缓存与兜底
  async function getStatus() {
    if (isCacheValid()) {
      return cachedStatus;
    }

    try {
      const status = await fetchStatusFromAPI();
      cachedStatus = status;
      return status;
    } catch (error) {
      console.error('获取第三方市场状态失败：', error);
      const fallbackStatus = createUnknownStatus(error instanceof Error ? error.message : String(error));
      return fallbackStatus;
    }
  }

  return {
    getStatus,
    createUnknownStatus
  };
})();

// 功能：请求金价数据并包含历史数据
async function fetchGoldPrice() {
  try {
    const now = Date.now();
    const monthRange = 30 * 24 * 60 * 60 * 1000;
    const starttime = now - monthRange;
    const targetUrl = `https://api.goldprice.yanrrd.com/price?currency=cny&unit=grams&starttime=${starttime}&endtime=${now}`;
    let response;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Compatible; Browser)'
        }
      });

      if (response.status === 200) {
        break;
      }

      retryCount++;
      if (retryCount === maxRetries) {
        throw new Error(`请求失败,状态码: ${response.status}`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const responseData = await response.json();

    const currencyKey = (responseData.currency || 'CNY').toUpperCase();
    const dataPoints = responseData.chartData && responseData.chartData[currencyKey] ? responseData.chartData[currencyKey] : [];

    if (dataPoints.length > 0) {
      const latest = dataPoints[dataPoints.length - 1];
      return { price: latest[1], timestamp: latest[0], dataPoints };
    }

    return { price: '无数据', timestamp: null, dataPoints: [] };
  } catch (error) {
    console.error('Fetch error:', error);
    console.error('获取数据失败');
    return { price: '获取数据失败', timestamp: null, dataPoints: [] };
  }
}

// 功能：刷新页面显示
function updateDisplay(price, timestamp, dataPoints, remoteStatus = marketStatusService.createUnknownStatus()) {
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

  marketStatusRenderer.render(timestamp, remoteStatus);
  changeBoardRenderer.render(dataPoints);
  backgroundChartRenderer.render(dataPoints);
}

// 功能：负责渲染市场状态提示
const marketStatusRenderer = (() => {
  const STALE_THRESHOLD = 45 * 60 * 1000;
  const TRADING_TIMEZONE = 'America/New_York';
  const DAILY_BREAK_START = 17 * 60;
  const DAILY_BREAK_END = 18 * 60;
  const SUNDAY_OPEN_MINUTES = 18 * 60;
  const FRIDAY_CLOSE_MINUTES = 17 * 60;

  // 功能：获取纽约时间的星期与分钟数
  function getNewYorkTimeParts(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: TRADING_TIMEZONE,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(date);
    const mapped = {};

    parts.forEach((part) => {
      if (part.type !== 'literal') {
        mapped[part.type] = part.value;
      }
    });

    return {
      weekday: mapped.weekday,
      hour: Number.parseInt(mapped.hour, 10),
      minute: Number.parseInt(mapped.minute, 10)
    };
  }

  // 功能：基于纽约时间判断是否处于休市时段
  function isScheduledClosed(date = new Date()) {
    const { weekday, hour, minute } = getNewYorkTimeParts(date);
    const minutes = hour * 60 + minute;

    if (weekday === 'Sat') {
      return true;
    }

    if (weekday === 'Sun' && minutes < SUNDAY_OPEN_MINUTES) {
      return true;
    }

    if (weekday === 'Fri' && minutes >= FRIDAY_CLOSE_MINUTES) {
      return true;
    }

    if (minutes >= DAILY_BREAK_START && minutes < DAILY_BREAK_END) {
      return true;
    }

    return false;
  }

  // 功能：根据时间戳与第三方状态综合判断市场状态
  function determineStatus(latestTimestamp, remoteStatus) {
    const normalizedStatus = remoteStatus && typeof remoteStatus === 'object' ? remoteStatus : marketStatusService.createUnknownStatus();
    const now = Date.now();
    const isDataStale = !latestTimestamp || now - latestTimestamp > STALE_THRESHOLD;

    if (normalizedStatus.state === 'closed') {
      return { text: '⛔ 市场休市', className: 'stopped', tooltip: normalizedStatus.detail };
    }

    if (normalizedStatus.state === 'open') {
      if (!latestTimestamp) {
        return { text: '🟠 市场交易中（无有效报价）', className: 'delayed', tooltip: normalizedStatus.detail };
      }

      if (isDataStale) {
        return { text: '🟠 市场交易中（行情源延迟）', className: 'delayed', tooltip: normalizedStatus.detail };
      }

      return { text: '🟢 交易中', className: 'active', tooltip: normalizedStatus.detail };
    }

    if (!latestTimestamp) {
      return { text: '⛔ 数据不可用', className: 'stopped', tooltip: normalizedStatus.detail };
    }

    if (isScheduledClosed(new Date(now))) {
      return { text: '⛔ 市场休市', className: 'stopped', tooltip: normalizedStatus.detail };
    }

    if (isDataStale) {
      return { text: '⏸ 数据延迟', className: 'delayed', tooltip: normalizedStatus.detail };
    }

    return { text: '🟢 交易中', className: 'active', tooltip: normalizedStatus.detail };
  }

  // 功能：渲染市场状态
  function render(latestTimestamp, remoteStatus) {
    const status = determineStatus(latestTimestamp, remoteStatus);
    statusElement.textContent = status.text;
    statusElement.classList.remove('stopped', 'active', 'delayed');
    statusElement.classList.add(status.className);
    if (status.tooltip) {
      statusElement.setAttribute('title', status.tooltip);
    } else {
      statusElement.removeAttribute('title');
    }
  }

  return { render };
})();

// 功能：负责计算与渲染涨跌幅看板
const changeBoardRenderer = (() => {
  const PERIOD_CONFIG = {
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000
  };

  // 功能：计算指定周期的涨跌幅
  function calculateChange(dataPoints, duration) {
    if (!Array.isArray(dataPoints) || dataPoints.length === 0) {
      return null;
    }

    const now = Date.now();
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
      return { valueText: '—', extraText: '暂无数据' };
    }

    const { changeValue, changePercent, baselinePrice } = changeData;
    const sign = changeValue >= 0 ? '+' : '';
    const valueText = `${sign}${changeValue.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`;
    const extraText = `起始价：${baselinePrice.toFixed(2)}`;

    return { valueText, extraText };
  }

  // 功能：渲染涨跌信息
  function render(dataPoints) {
    changeValueElements.forEach((element) => {
      const period = element.getAttribute('data-period');
      const duration = PERIOD_CONFIG[period];
      const changeData = calculateChange(dataPoints, duration);
      const { valueText } = formatChange(changeData);
      element.textContent = valueText;
    });

    changeExtraElements.forEach((element) => {
      const period = element.getAttribute('data-extra');
      const duration = PERIOD_CONFIG[period];
      const changeData = calculateChange(dataPoints, duration);
      const { extraText } = formatChange(changeData);
      element.textContent = extraText;
    });
  }

  return { render };
})();

// 功能：统一刷新所有数据并处理错误
async function refreshDashboard() {
  try {
    const [priceResult, statusResult] = await Promise.allSettled([
      fetchGoldPrice(),
      marketStatusService.getStatus()
    ]);

    const pricePayload = priceResult.status === 'fulfilled'
      ? priceResult.value
      : { price: '获取数据失败', timestamp: null, dataPoints: [] };

    const remoteStatus = statusResult.status === 'fulfilled'
      ? statusResult.value
      : marketStatusService.createUnknownStatus(statusResult.reason instanceof Error ? statusResult.reason.message : '第三方状态请求失败');

    updateDisplay(pricePayload.price, pricePayload.timestamp, pricePayload.dataPoints, remoteStatus);
  } catch (error) {
    console.error('刷新页面时出现错误：', error);
  }
}

// 功能：初始化页面并定时刷新
(async () => {
  await refreshDashboard();
})();

setInterval(refreshDashboard, 60000);
