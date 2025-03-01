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
    const timeRange = url.searchParams.get('timeRange') || '5m'; // 默认5分钟
    
    return await fetchGoldPriceProxy(currency, unit, timeRange);
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
 * @param {string} timeRange - 时间范围，如 '5m'(5分钟)、'1h'(1小时)、'1d'(1天)
 * @returns {Response} - 返回给浏览器的响应对象
 * 
 * 主要功能：
 * 1. 根据参数计算时间范围
 * 2. 构建目标URL请求金价数据
 * 3. 发送请求并处理可能的错误
 * 4. 设置CORS头信息允许跨域访问
 */
async function fetchGoldPriceProxy(currency = 'cny', unit = 'grams', timeRange = '5m') {
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
  
  // 获取当前时间戳（毫秒）
  let now = Date.now();
  let start;
  
  // 根据时间范围参数计算开始时间
  switch(timeRange) {
    case '5m':
      start = now - 5 * 60 * 1000; // 5分钟
      break;
    case '15m':
      start = now - 15 * 60 * 1000; // 15分钟
      break;
    case '1h':
      start = now - 60 * 60 * 1000; // 1小时
      break;
    case '4h':
      start = now - 4 * 60 * 60 * 1000; // 4小时
      break;
    case '1d':
      start = now - 24 * 60 * 60 * 1000; // 1天
      break;
    case '1w':
      start = now - 7 * 24 * 60 * 60 * 1000; // 1周
      break;
    case '1m':
      start = now - 30 * 24 * 60 * 60 * 1000; // 1个月（约30天）
      break;
    default:
      start = now - 5 * 60 * 1000; // 默认5分钟
  }
  
  // 使用当前时间作为结束时间
  let end = now;
  
  // 构建目标URL，根据参数请求相应的金价数据
  let targetUrl = `https://fsapi.gold.org/api/goldprice/v11/chart/price/${currency}/${unit}/${start},${end}`;

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
    
    // 检查是否有数据
    if (responseData.chartData && 
        responseData.chartData[currency.toUpperCase()] && 
        responseData.chartData[currency.toUpperCase()].length === 0 && 
        responseData.chartData.asOfDate) {
      // 如果没有价格数据但有asOfDate，说明可能是黄金停盘
      // 重新调整时间再次请求
      const asOfDate = new Date(responseData.chartData.asOfDate);
      now = asOfDate.getTime();
      
      // 根据时间范围重新计算开始时间
      switch(timeRange) {
        case '1d':
          start = now - 24 * 60 * 60 * 1000;
          break;
        case '1w':
          start = now - 7 * 24 * 60 * 60 * 1000;
          break;
        case '1m':
          start = now - 30 * 24 * 60 * 60 * 1000;
          break;
        default:
          start = now - 30000000; // 约8小时，确保能获取到最近的数据
      }
      
      end = now;
      
      // 重新构建URL并发送请求
      targetUrl = `https://fsapi.gold.org/api/goldprice/v11/chart/price/${currency}/${unit}/${start},${end}`;
      fetchResponse = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Compatible; Cloudflare Worker)'
        }
      });
      
      // 解析新的响应数据
      const newResponseData = await fetchResponse.json();
      
      // 构建响应对象，包含更多元数据
      const responseObj = {
        chartData: newResponseData.chartData,
        currency: currency.toUpperCase(),
        unit: unit,
        timeRange: timeRange,
        requestTime: new Date().toISOString()
      };
      
      return new Response(JSON.stringify(responseObj), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        }
      });
    }
    
    // 构建响应对象，包含更多元数据
    const responseObj = {
      chartData: responseData.chartData,
      currency: currency.toUpperCase(),
      unit: unit,
      timeRange: timeRange,
      requestTime: new Date().toISOString()
    };
    
    return new Response(JSON.stringify(responseObj), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      }
    });
    
  } catch (err) {
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
