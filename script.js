// =============== 页面变量 ===============
const priceElement = document.querySelector('.price');
const timeElement = document.querySelector('.time');
const fullscreenButton = document.getElementById('fullscreenButton');

// 检测是否为 iOS 设备
const isIOS = /iP(ad|od|hone)/i.test(navigator.userAgent);

// =============== 全屏按钮事件：进入全屏 / 伪全屏 ===============
fullscreenButton.addEventListener('click', (event) => {
  event.stopPropagation(); // 阻止事件冒泡，避免触发退出全屏
  if (isIOS) {
    // iOS 采用伪全屏：直接添加 CSS 类
    document.body.classList.add('fullscreen');
    fullscreenButton.style.display = 'none';
  } else {
    // 非 iOS 使用 Fullscreen API
    document.documentElement.requestFullscreen()
      .then(() => {
        document.body.classList.add('fullscreen');
        fullscreenButton.style.display = 'none';
      })
      .catch(err => console.error('进入全屏失败：', err));
  }
});

// =============== 页面点击事件：退出全屏 / 退出伪全屏 ===============
document.addEventListener('click', () => {
  if (isIOS) {
    if (document.body.classList.contains('fullscreen')) {
      document.body.classList.remove('fullscreen');
      fullscreenButton.style.display = 'block';
    }
  } else {
    if (document.fullscreenElement) {
      document.exitFullscreen()
        .then(() => {
          document.body.classList.remove('fullscreen');
          fullscreenButton.style.display = 'block';
        })
        .catch(err => console.error('退出全屏失败：', err));
    }
  }
});

// =============== 获取金价数据 ===============
async function fetchGoldPrice() {
  try {
    // 获取当前时间戳（毫秒）
    let now = Date.now();
    // 计算5分钟（300000毫秒）前的时间戳作为开始时间
    let start = now - 300000;
    // 使用当前时间作为结束时间
    let end = now;
    
    // 构建目标URL，请求CNY（人民币）单位的金价数据，单位为克ß
    let targetUrl = `https://api.goldprice.yanrrd.com/price?currency=cny&unit=grams`;
    
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
      
      // 等待1秒后重试
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const responseData = await response.json();
    
    if (responseData.chartData && responseData.chartData.CNY && responseData.chartData.CNY.length > 0) {
      const latest = responseData.chartData.CNY[responseData.chartData.CNY.length - 1];
      return { price: latest[1], timestamp: latest[0] };
    }
    
    return { price: '无数据', timestamp: null };
  } catch (error) {
    console.error('Fetch error:', error);
    console.error('获取数据失败');
    return { price: '获取数据失败', timestamp: null };
  }
}

// =============== 更新界面显示 ===============
function updateDisplay(price, timestamp) {
  if (typeof price === 'number') {
    priceElement.textContent = price.toFixed(2) + ' CNY/克';
  } else {
    priceElement.textContent = price;
  }
  if (timestamp) {
    // 检测用户浏览器的时区
    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // 根据用户时区格式化时间
    timeElement.textContent = '更新时间：' + new Date(timestamp).toLocaleString(undefined, {
      timeZone: userTimeZone
    });
  } else {
    timeElement.textContent = '—';
  }
}

// =============== 初始化 + 定时刷新 ===============
(async () => {
  const { price, timestamp } = await fetchGoldPrice();
  updateDisplay(price, timestamp);
})();

setInterval(async () => {
  const { price, timestamp } = await fetchGoldPrice();
  if (!isNaN(price)) {
    updateDisplay(price, timestamp);
  } else {
    console.log(JSON.stringify({
      price: price,
      timestamp: timestamp
    }, null, 2));
  }
}, 60000);