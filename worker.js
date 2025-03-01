// -----------------------
// Cloudflare Worker 入口
// 该 Worker 用于代理请求第三方 API
// -----------------------
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

/**
 * 处理请求的核心函数
 * @param {Request} request - 来自浏览器的请求对象
 * @returns {Response} - 返回给浏览器的响应对象
 */
async function handleRequest(request) {
  // 解析当前请求的 URL
  const url = new URL(request.url);

  // 路由判断：根据 pathname 判断要执行什么逻辑
  if (url.pathname === '/price') {
    // 如果是访问 '/price' 路径，则执行代理请求逻辑
    // 从查询参数中获取配置
    const currency = url.searchParams.get('currency') || 'cny'; // 默认人民币
    const unit = url.searchParams.get('unit') || 'grams'; // 默认克
    
    // 获取时间范围参数
    const now = Date.now();
    const defaultStartTime = now - 10 * 60 * 1000; // 默认往前十分钟
    
    const starttime = parseInt(url.searchParams.get('starttime')) || defaultStartTime;
    const endtime = parseInt(url.searchParams.get('endtime')) || now;
    
    // 获取 debug 参数
    const debug = url.searchParams.get('debug') === 'true';
    
    return await fetchGoldPriceProxy(currency, unit, starttime, endtime, debug);
  } else {
    // 如果路径不是 '/price'，返回 404
    return new Response('Not found', { status: 404 });
  }
}

/**
 * 代理请求函数：请求第三方金价接口并返回
 * 
 * @param {string} currency - 货币单位，如 'cny'(人民币) 或 'usd'(美元)
 * @param {string} unit - 重量单位，如 'grams'(克) 或 'ounces'(盎司)
 * @param {number} starttime - 开始时间戳（毫秒）
 * @param {number} endtime - 结束时间戳（毫秒）
 * @param {boolean} debug - 是否开启调试模式
 * @returns {Response} - 返回给浏览器的响应对象
 * 
 * 主要功能：
 * 1. 验证参数
 * 2. 构建目标URL请求金价数据
 * 3. 发送请求并处理可能的错误
 * 4. 设置CORS头信息允许跨域访问
 */
async function fetchGoldPriceProxy(currency = 'cny', unit = 'grams', starttime, endtime, debug = false) {
  // 创建调试信息对象
  const debugInfo = {
    request_time: new Date().toISOString().replace('T', ' ').substr(0, 19),
    time_start: new Date().toISOString().replace('T', ' ').substr(0, 19),
    params: {
      currency,
      unit,
      starttime,
      endtime,
      debug
    }
  };
  
  // 将货币单位转为小写
  currency = currency.toLowerCase();
  // 将重量单位转为小写
  unit = unit.toLowerCase();
  
  // 验证参数
  if (!['cny', 'usd', 'eur', 'gbp', 'jpy', 'aud', 'cad', 'chf', 'inr'].includes(currency)) {
    return new Response('不支持的货币单位', { 
      status: 400,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  if (!['grams', 'ounces', 'kilos'].includes(unit)) {
    return new Response('不支持的重量单位', { 
      status: 400,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  // 验证时间戳参数
  if (isNaN(starttime) || isNaN(endtime) || starttime >= endtime) {
    return new Response('无效的时间范围参数', { 
      status: 400,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  // 构建目标URL，根据参数请求相应的金价数据
  let targetUrl = `https://fsapi.gold.org/api/goldprice/v11/chart/price/${currency}/${unit}/${starttime},${endtime}`;
  
  // 记录API请求信息
  debugInfo.APIserverHostname = 'fsapi.gold.org';
  debugInfo.protocol = 'https';
  debugInfo.uri = targetUrl;
  debugInfo.route = 'fsapi.gold.org';
  debugInfo.cached = false;

  const startTime = new Date();
  let fetchResponse;
  try {
    // 尝试发送请求到目标API
    // 设置User-Agent头以标识请求来自Cloudflare Worker
    fetchResponse = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Compatible; Cloudflare Worker)'
      }
    });
    
    // 解析响应数据
    const responseData = await fetchResponse.json();
    
    // 记录请求完成时间
    const endTime = new Date();
    debugInfo.time_stop = endTime.toISOString().replace('T', ' ').substr(0, 19);
    debugInfo.time = `${(endTime - startTime) / 1000} secs`;
    
    // 处理响应数据
    let resultData = responseData;
    let usedStarttime = starttime;
    let usedEndtime = endtime;
    
    // 检查是否有数据
    if (!responseData.chartData || 
        !responseData.chartData[currency.toUpperCase()] || 
        responseData.chartData[currency.toUpperCase()].length === 0) {
      
      // 如果没有价格数据，说明可能是黄金停盘或时间范围不合适
      // 重新调整时间再次请求，获取最近48小时的数据
      const now = new Date();
      usedEndtime = now.getTime();
      usedStarttime = usedEndtime - 48 * 60 * 60 * 1000;
      
      // 重新构建URL并发送请求
      const newTargetUrl = `https://fsapi.gold.org/api/goldprice/v11/chart/price/${currency}/${unit}/${usedStarttime},${usedEndtime}`;
      debugInfo.retryUri = newTargetUrl;
      
      const retryResponse = await fetch(newTargetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Compatible; Cloudflare Worker)'
        }
      });
      
      // 解析新的响应数据
      resultData = await retryResponse.json();
    }
    
    // 构建完整的响应对象
    const responseObj = {
      chartData: resultData.chartData,
      currency: currency.toUpperCase(),
      unit: unit,
      starttime: usedStarttime,
      endtime: usedEndtime,
      requestTime: new Date().toISOString()
    };
    
    // 如果开启了调试模式，添加调试信息
    if (debug) {
      // 更新响应大小信息
      const responseJson = JSON.stringify(responseObj);
      debugInfo.response_size = responseJson.length;
      debugInfo.size = `${(responseJson.length / 1024).toFixed(2)} KB`;
      
      // 添加调试信息到响应对象
      responseObj.system = debugInfo;
    }
    
    return new Response(JSON.stringify(responseObj), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      }
    });
    
  } catch (err) {
    // 如果开启了调试模式，添加错误信息到调试对象
    if (debug) {
      debugInfo.error = err.message;
      debugInfo.error_stack = err.stack;
      
      const endTime = new Date();
      debugInfo.time_stop = endTime.toISOString().replace('T', ' ').substr(0, 19);
      debugInfo.time = `${(endTime - startTime) / 1000} secs`;
      
      // 返回带有调试信息的错误响应
      return new Response(JSON.stringify({
        error: '获取金价数据失败',
        message: err.message,
        system: debugInfo
      }), { 
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    // 如果请求失败，返回502错误（Bad Gateway）
    return new Response('获取金价数据失败: ' + err.message, { 
      status: 502,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
