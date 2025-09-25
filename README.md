# 金价监控 (Gold Price Status)

一个面向移动端和桌面端的极简黄金价格看板。页面会自动进入全屏模式，并且每隔 60 秒从代理 API 获取最新的人民币/克黄金价格。

## 功能特性

- 📈 读取 Cloudflare Worker 代理的黄金实时价格数据，并显示最新一条报价
- ⏱️ 每 60 秒自动刷新一次数据，同时展示用户本地时区的更新时间
- 🖥️ / 📱 自适应不同屏幕尺寸，提供全屏按钮与点击退出全屏的体验
- 🚨 网络异常或缺少数据时，会直接在界面上显示提示，方便排查问题

## 目录结构

```
.
├── index.html   # 页面结构与样式
├── script.js    # 页面交互、数据刷新逻辑
├── worker.js    # Cloudflare Worker，代理官方黄金价格 API
└── README.md
```

## 工作流程

1. 浏览器请求部署在 Cloudflare Pages 上的静态页面。
2. 页面通过 `script.js` 调用托管在 Cloudflare Worker 上的 `/price` 接口。
3. Worker 将请求转发到 World Gold Council 的官方 API，并将结果返回给前端。
4. 前端解析最新的价格与时间戳，更新到页面上。

## 本地预览

1. 直接在本地用任意静态服务器（如 `npx serve`）运行根目录。
2. 浏览器访问本地地址即可看到页面效果。
3. 若要测试真实数据，请确保 `worker.js` 已部署并更新脚本中使用的接口地址。

## 部署到 Cloudflare

### 1. 部署 Cloudflare Worker

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2. 新建 Worker，并将 `worker.js` 内容粘贴进去。
3. 绑定自定义域名或使用默认的 `*.workers.dev` 域名。
4. 记下最终的 Worker 地址，例如 `https://api.example.workers.dev/price`。

### 2. 部署静态页面至 Cloudflare Pages

1. 将仓库推送到 GitHub/GitLab 等版本库。
2. 在 Cloudflare Pages 中选择“创建项目” → “连接到 Git”。
3. 构建命令留空，输出目录留空（默认为根目录）。
4. 如果 Worker 地址与默认值不同，请修改 `script.js` 中的 `targetUrl`。
5. 部署完成后即可使用 Pages 提供的 `*.pages.dev` 域名访问页面。

## 接口说明

- Worker 接口：`GET /price?currency=cny&unit=grams`
- 可选参数：
  - `starttime`、`endtime`：毫秒级时间戳，默认获取最近 10 分钟数据
  - `debug`：若为 `true`，响应会附带调试信息
- 默认返回字段：
  - `chartData`：包含所请求货币的历史报价数组
  - `currency` / `unit`：当前请求的货币与单位
  - `starttime` / `endtime`：实际使用的时间区间
  - `requestTime`：Worker 返回响应的时间

## 许可证

本项目基于 [MIT License](LICENSE) 开源。
