// =============== 页面常量和 DOM 引用 ===============
const REFRESH_INTERVAL = 60000; // 自动刷新间隔（毫秒）
const priceElement = document.querySelector('.price');
const timeElement = document.querySelector('.time');
const fullscreenButton = document.getElementById('fullscreenButton');

/* 功能：检测当前设备是否为 iOS */
function detectIOS() {
  return /iP(ad|od|hone)/i.test(navigator.userAgent);
}

const isIOS = detectIOS();

/* 功能：应用全屏或伪全屏时的样式 */
function applyFullscreenStyles() {
  document.body.classList.add('fullscreen');
  fullscreenButton.style.display = 'none';
}

/* 功能：退出全屏后恢复默认样式 */
function removeFullscreenStyles() {
  document.body.classList.remove('fullscreen');
  fullscreenButton.style.display = 'block';
}

/* 功能：请求进入全屏或伪全屏 */
async function enterFullscreen() {
  if (isIOS) {
    applyFullscreenStyles();
    return;
  }

  try {
    await document.documentElement.requestFullscreen();
    applyFullscreenStyles();
  } catch (error) {
    console.error('进入全屏失败：', error);
  }
}

/* 功能：退出全屏或伪全屏 */
async function exitFullscreen() {
  if (isIOS) {
    if (document.body.classList.contains('fullscreen')) {
      removeFullscreenStyles();
    }
    return;
  }

  if (!document.fullscreenElement) {
    return;
  }

  try {
    await document.exitFullscreen();
  } catch (error) {
    console.error('退出全屏失败：', error);
  } finally {
    removeFullscreenStyles();
  }
}

/* 功能：绑定全屏相关的事件 */
function bindFullscreenEvents() {
  fullscreenButton.addEventListener('click', event => {
    event.stopPropagation();
    enterFullscreen();
  });

  document.addEventListener('click', () => {
    exitFullscreen();
  });
}

/* 功能：将时间戳格式化为用户所在时区的时间 */
function formatTimestamp(timestamp) {
  if (!timestamp) {
    return '—';
  }

  const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Date(timestamp).toLocaleString(undefined, { timeZone: userTimeZone });
}

/* 功能：获取最新的黄金价格 */
async function fetchGoldPrice() {
  try {
    const targetUrl = 'https://api.goldprice.yanrrd.com/price?currency=cny&unit=grams';
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Compatible; Browser)'
        }
      });

      if (response.status === 200) {
        const responseData = await response.json();
        const currencyData = responseData.chartData?.CNY ?? [];

        if (currencyData.length > 0) {
          const latest = currencyData[currencyData.length - 1];
          return { price: latest[1], timestamp: latest[0] };
        }

        return { price: '无数据', timestamp: null };
      }

      if (attempt === maxRetries) {
        throw new Error(`请求失败,状态码: ${response.status}`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error('Fetch error:', error);
    return { price: '获取数据失败', timestamp: null };
  }

  return { price: '无数据', timestamp: null };
}

/* 功能：更新价格和时间显示 */
function updateDisplay(price, timestamp) {
  if (typeof price === 'number') {
    priceElement.textContent = `${price.toFixed(2)} CNY/克`;
  } else {
    priceElement.textContent = price;
  }

  timeElement.textContent = `更新时间：${formatTimestamp(timestamp)}`;
}

/* 功能：从网络获取数据并更新页面 */
async function refreshPrice() {
  const { price, timestamp } = await fetchGoldPrice();
  updateDisplay(price, timestamp);
}

/* 功能：设置定时自动刷新 */
function startAutoRefresh() {
  setInterval(() => {
    refreshPrice();
  }, REFRESH_INTERVAL);
}

/* 功能：初始化整个页面逻辑 */
function init() {
  bindFullscreenEvents();
  refreshPrice();
  startAutoRefresh();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
