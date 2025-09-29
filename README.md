# 金价监控 (Gold Price Status)

一个基于静态页面的黄金行情看板，提供实时价格、市场状态提醒和可视化背景，适合部署到 Cloudflare Pages 或任意静态托管平台。

## 功能特性

- **实时金价展示**：默认按人民币/克显示最新报价，数据来源自 `api.goldprice.yanrrd.com`（基于 World Gold Council 接口）。
- **多周期涨跌面板**：展示 5 分钟、1 小时、1 天等区间的涨跌幅及涨跌额，辅助判断短期趋势。
- **市场状态判定**：结合 Alpha Vantage 的市场状态 API 和最新报价时间，准确区分“交易中 / 休市 / 数据延迟”。
- **背景折线图**：在界面后方绘制低对比度折线图，兼顾装饰效果与文字可读性。
- **全屏与响应式适配**：一键切换全屏模式，桌面端横屏自动切换双列布局，提升大屏展示效果。
- **异常兜底**：当第三方接口异常时提供友好提示，并保留最近一次成功数据。

## 使用方式

### 本地预览

1. 克隆或下载仓库。
2. 直接用浏览器打开 `index.html` 即可查看效果；如需模拟线上环境，可使用任意静态服务器（例如 `npx serve`）。

### Cloudflare Pages 部署

1. 登录 [Cloudflare Pages](https://pages.cloudflare.com/)。
2. 新建项目并连接本仓库。
3. 构建命令留空，构建输出目录使用根目录。
4. 完成后即可通过 `*.pages.dev` 域名访问。

> 若希望自建后端代理，可将 `worker.js` 上传至 Cloudflare Workers，用于转发 World Gold Council 接口请求。

## 可选配置

### 自定义 Alpha Vantage API Key

默认使用官方示例 key (`demo`)，存在请求频率限制。建议在页面引入前设置 `window.GOLD_APP.alphaVantageKey`：

```html
<script>
  window.GOLD_APP = {
    alphaVantageKey: '你的 API Key'
  };
</script>
<script src="./script.js" defer></script>
```

### 调整刷新频率

默认每 5 秒拉取一次价格数据。如需修改，可在 `script.js` 中搜索 `REFRESH_INTERVAL` 常量调整。

## 数据说明

- 价格数据：来源于 World Gold Council 官方 API，经 Cloudflare Worker 进行简单代理。
- 市场状态：通过 Alpha Vantage `MARKET_STATUS` 接口获取，并结合纽约交易时段逻辑推断。

## 许可证

本项目使用 MIT 许可证，详见 [LICENSE](./LICENSE)。
