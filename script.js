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

// 功能：请求金价数据并包含历史数据
async function fetchGoldPrice() {
  try {
    const now = Date.now();
    const monthRange = 24 * 60 * 60 * 1000;
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
function updateDisplay(price, timestamp, dataPoints) {
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
  changeBoardRenderer.render(dataPoints);
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

// 功能：初始化页面并定时刷新
(async () => {
  const { price, timestamp, dataPoints } = await fetchGoldPrice();
  updateDisplay(price, timestamp, dataPoints);
})();

setInterval(async () => {
  const { price, timestamp, dataPoints } = await fetchGoldPrice();
  updateDisplay(price, timestamp, dataPoints);
}, 60000);
