// =============== 页面变量 ===============
const priceElement = document.querySelector('.price');
const timeElement = document.querySelector('.time');
const statusElement = document.querySelector('.status');
const statusTextElement = document.querySelector('.status-text');
const statusIndicatorElement = document.querySelector('.status-indicator');
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
      const latestPrice = Number(latest[1]);
      const latestTimestamp = Number(latest[0]);
      // 功能：将时间戳与价格转换为数字，确保后续计算准确
      const normalizedPoints = dataPoints.map(([time, value]) => [Number(time), Number(value)]);
      return { price: latestPrice, timestamp: latestTimestamp, dataPoints: normalizedPoints };
    }

    return { price: '无数据', timestamp: null, dataPoints: [] };
  } catch (error) {
    console.error('Fetch error:', error);
    console.error('获取数据失败');
    return { price: '获取数据失败', timestamp: null, dataPoints: [] };
  }
}

// 功能：刷新页面显示
function updateDisplay(price, timestamp, dataPoints) {
  if (typeof price === 'number' && Number.isFinite(price)) {
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
  changeBoardRenderer.render(dataPoints);
  backgroundChartRenderer.render(dataPoints);
}

// 功能：负责渲染市场状态提示
const marketStatusRenderer = (() => {
  const STALE_THRESHOLD = 15 * 60 * 1000; // 超过 15 分钟没有新数据则视为延迟
  const CLOSED_THRESHOLD = 2 * 60 * 60 * 1000; // 超过 2 小时没有新数据则视为停盘
  const MARKET_TIME_ZONE = 'America/New_York';
  const WEEKDAY_INDEX = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6
  };

  // 功能：提取指定时区的星期与时间信息
  function getTimeZoneParts(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'long'
    });

    const parts = formatter.formatToParts(date).reduce((accumulator, part) => {
      if (part.type !== 'literal') {
        accumulator[part.type] = part.value;
      }
      return accumulator;
    }, {});

    return {
      weekdayIndex: WEEKDAY_INDEX[parts.weekday] ?? 0,
      hour: Number(parts.hour ?? 0),
      minute: Number(parts.minute ?? 0)
    };
  }

  // 功能：判断是否处于交易所计划停盘时间
  function isClosedBySchedule(referenceDate = new Date()) {
    const { weekdayIndex, hour, minute } = getTimeZoneParts(referenceDate, MARKET_TIME_ZONE);
    const minutesOfDay = hour * 60 + minute;
    const maintenanceStart = 17 * 60;
    const maintenanceEnd = 18 * 60;

    if (weekdayIndex === 6) {
      return true; // 周六全天停盘
    }

    if (weekdayIndex === 0 && minutesOfDay < maintenanceEnd) {
      return true; // 周日开盘前停盘
    }

    if (weekdayIndex === 5 && minutesOfDay >= maintenanceStart) {
      return true; // 周五收盘后停盘
    }

    if (minutesOfDay >= maintenanceStart && minutesOfDay < maintenanceEnd) {
      return true; // 每日例行维护时间停盘
    }

    return false;
  }

  // 功能：根据最新时间戳判断交易状态
  function determineStatus(latestTimestamp) {
    if (!latestTimestamp) {
      return {
        text: '⛔ 数据不可用',
        className: 'stopped',
        indicatorColor: 'rgba(255, 140, 106, 0.95)'
      };
    }

    const now = Date.now();
    const diff = now - latestTimestamp;
    const scheduleClosed = isClosedBySchedule(new Date(now));

    if (scheduleClosed) {
      return {
        text: '⛔ 已停盘',
        className: 'stopped',
        indicatorColor: 'rgba(255, 138, 109, 0.95)'
      };
    }

    if (diff > CLOSED_THRESHOLD) {
      return {
        text: '⛔ 已停盘',
        className: 'stopped',
        indicatorColor: 'rgba(255, 138, 109, 0.95)'
      };
    }

    if (diff > STALE_THRESHOLD) {
      return {
        text: '🟡 行情延迟',
        className: 'delayed',
        indicatorColor: 'rgba(255, 220, 105, 0.9)'
      };
    }

    return {
      text: '🟢 交易中',
      className: 'active',
      indicatorColor: 'rgba(122, 255, 195, 0.9)'
    };
  }

  // 功能：渲染市场状态
  function render(latestTimestamp) {
    const status = determineStatus(latestTimestamp);
    if (statusTextElement) {
      statusTextElement.textContent = status.text;
    } else {
      statusElement.textContent = status.text;
    }
    statusElement.classList.remove('stopped', 'active', 'delayed');
    statusElement.classList.add(status.className);
    if (statusIndicatorElement) {
      statusIndicatorElement.style.backgroundColor = status.indicatorColor;
      statusIndicatorElement.style.boxShadow = `0 0 14px ${status.indicatorColor}`;
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

// 功能：负责在背景画布上绘制价格折线
const backgroundChartRenderer = (() => {
  const canvas = document.getElementById('backgroundChart');

  if (!canvas) {
    return { render: () => {} };
  }

  const context = canvas.getContext('2d');

  if (!context) {
    return { render: () => {} };
  }
  let cachedDataPoints = [];

  // 功能：根据屏幕尺寸与 DPR 调整画布大小
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(window.innerWidth, 1);
    const height = Math.max(window.innerHeight, 1);

    const displayWidth = Math.floor(width);
    const displayHeight = Math.floor(height);

    if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(dpr, dpr);
  }

  // 功能：绘制背景辅助网格
  function drawGrid(width, height, paddingX, paddingY) {
    context.save();
    context.setLineDash([6, 12]);
    context.lineWidth = 1;
    context.strokeStyle = 'rgba(255, 255, 255, 0.08)';

    const horizontalLines = 4;
    for (let index = 1; index <= horizontalLines; index += 1) {
      const y = paddingY + ((height - paddingY * 2) / (horizontalLines + 1)) * index;
      context.beginPath();
      context.moveTo(paddingX, y);
      context.lineTo(width - paddingX, y);
      context.stroke();
    }

    const verticalLines = 6;
    for (let index = 1; index <= verticalLines; index += 1) {
      const x = paddingX + ((width - paddingX * 2) / (verticalLines + 1)) * index;
      context.beginPath();
      context.moveTo(x, paddingY * 0.5);
      context.lineTo(x, height - paddingY * 0.5);
      context.stroke();
    }

    context.restore();
  }

  // 功能：绘制折线及填充效果
  function drawLine(points, width, height, paddingX, paddingY) {
    if (points.length < 2) {
      return;
    }

    let minPrice = Number.POSITIVE_INFINITY;
    let maxPrice = Number.NEGATIVE_INFINITY;
    let minTimestamp = points[0][0];
    let maxTimestamp = points[points.length - 1][0];

    points.forEach(([timestamp, price]) => {
      minPrice = Math.min(minPrice, price);
      maxPrice = Math.max(maxPrice, price);
      minTimestamp = Math.min(minTimestamp, timestamp);
      maxTimestamp = Math.max(maxTimestamp, timestamp);
    });

    const priceRange = maxPrice - minPrice || 1;
    const timeRange = maxTimestamp - minTimestamp || 1;
    const availableWidth = width - paddingX * 2;
    const availableHeight = height - paddingY * 2;
    const step = Math.max(1, Math.ceil(points.length / 600));
    const sampledPoints = [];

    for (let index = 0; index < points.length; index += step) {
      sampledPoints.push(points[index]);
    }

    const lastPoint = points[points.length - 1];
    if (sampledPoints[sampledPoints.length - 1] !== lastPoint) {
      sampledPoints.push(lastPoint);
    }

    context.save();
    context.beginPath();

    let firstPoint = true;
    sampledPoints.forEach(([timestamp, price]) => {
      const ratioX = (timestamp - minTimestamp) / timeRange;
      const ratioY = (price - minPrice) / priceRange;
      const x = paddingX + ratioX * availableWidth;
      const y = height - paddingY - ratioY * availableHeight;

      if (firstPoint) {
        context.moveTo(x, y);
        firstPoint = false;
      } else {
        context.lineTo(x, y);
      }
    });

    context.strokeStyle = 'rgba(255, 231, 140, 0.72)';
    context.lineWidth = 2.6;
    context.shadowColor = 'rgba(255, 238, 170, 0.35)';
    context.shadowBlur = 22;
    context.stroke();

    const gradient = context.createLinearGradient(0, paddingY, 0, height - paddingY);
    gradient.addColorStop(0, 'rgba(255, 220, 120, 0.22)');
    gradient.addColorStop(1, 'rgba(255, 220, 120, 0)');

    context.lineTo(width - paddingX, height - paddingY);
    context.lineTo(paddingX, height - paddingY);
    context.closePath();
    context.globalAlpha = 0.85;
    context.fillStyle = gradient;
    context.fill();
    context.restore();
  }

  // 功能：根据缓存数据重新绘制背景
  function redraw() {
    resizeCanvas();
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    context.clearRect(0, 0, width, height);

    if (!Array.isArray(cachedDataPoints) || cachedDataPoints.length < 2) {
      return;
    }

    const paddingUnit = Math.min(width, height);
    const paddingX = paddingUnit * 0.08;
    const paddingY = paddingUnit * 0.2;

    drawGrid(width, height, paddingX, paddingY);
    drawLine(cachedDataPoints, width, height, paddingX, paddingY);
  }

  // 功能：外部渲染接口
  function render(dataPoints) {
    cachedDataPoints = Array.isArray(dataPoints) ? dataPoints : [];
    redraw();
  }

  window.addEventListener('resize', redraw);
  window.addEventListener('orientationchange', () => {
    setTimeout(redraw, 120);
  });

  redraw();

  return { render };
})();

// 功能：初始化页面并定时刷新
(async () => {
  const { price, timestamp, dataPoints } = await fetchGoldPrice();
  updateDisplay(price, timestamp, dataPoints);
})();

setInterval(async () => {
  const { price, timestamp, dataPoints } = await fetchGoldPrice();
  updateDisplay(price, timestamp, dataPoints);
}, 60000);
