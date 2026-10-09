# 行情看板 (Gold Price Status)

复用同一套价格展示、背景折线图和涨跌幅卡片，监控黄金、比特币和选定股票，通过 Cloudflare Pages 部署运行。

## 功能

- 实时显示黄金价格（人民币/克）
- 左上角切换黄金、比特币或股票，记住上次选择和最近选择的股票
- 股票代码支持美股（`AAPL`、`TSLA`）、A 股（`600519`、`000001`）和港股（`0700.HK`，或选择港股市场输入 `700`）
- 比特币显示 USD/BTC；股票显示行情源的报价币种/股，不做隐含汇率换算
- 各资产独立显示过去 24H、7 天和 30 天曲线；切换时取消旧请求，旧资产的迟到响应不能覆盖新资产
- 主报价和独立对照价每分钟刷新；历史曲线每五分钟刷新
- 后台页面暂停轮询，返回页面自动刷新
- 获取失败时保留已有报价/曲线，并明确提示失败
- 显示真实报价时间，不用刷新时间冒充报价时间
- 支持全屏显示模式
- 适配移动设备和桌面设备

## 部署方法

1. 登录到 [Cloudflare Pages](https://pages.cloudflare.com/)
2. 点击 "创建项目"
3. 选择 "连接到 Git"，选择您的代码仓库
4. 设置构建选项：
   - 构建命令：留空
   - 构建输出目录：留空（默认为根目录）
5. 点击 "保存并部署"。仓库中的 `functions/api/market.js` 会随 Pages 部署，`wrangler.toml` 固定输出目录和兼容日期；不要只上传 HTML/JS 文件而遗漏 Functions。

部署完成后，Cloudflare Pages 会提供一个 `*.pages.dev` 域名，您可以通过该域名访问应用。

现有项目 `goldpricestatus` 已连接此仓库，推送 `master` 自动发布前端及 Pages Functions，自定义域名为 `goldprice.yanrrd.com`。

## 数据来源

本应用使用 [World Gold Council](https://www.gold.org/) 的 API 获取黄金价格数据。

比特币和股票通过同源 `GET /api/market?asset=bitcoin` 或 `GET /api/market?asset=stock&symbol=AAPL` 获取 Yahoo Finance 数据。支持 `GET` 和 `HEAD`；无效参数返回 400，代码无行情返回 404，上游失败且无成功缓存返回 502。无需新增 API 密钥。

接口返回一个月的 30 分钟采样收盘价，由页面划分为 24H、7 天和 30 天曲线；缺失或停盘期间不补造数据。最新报价使用源提供的报价时间，和历史采样点分别保留。不同资产的源币种、曲线、缓存和请求隔离，股票报价可能延迟。最近交易已在 24H 之前时，24H 曲线及卡片可以暂无数据，不冒充当天成交。

Pages 行情缓存每分钟更新；上游故障可返回不超过 24 小时的成功缓存，并标记 `updateFailed`、`stale`。页面更新失败时保留当前资产已有报价与曲线。

[gold-api.com](https://gold-api.com/docs) 仅提供独立对照报价，人民币每金衡盎司除以 31.1034768 转为每克。不同来源不合并进走势图，也不会自动替换主报价。

数据时间较旧不等于一定闭市，因此页面显示“可能休市或数据延迟”。接口失败单独显示“更新失败”。这些是参考行情，不是银行或金店的成交报价。

## Worker

将 `worker.js` 部署到现有 Cloudflare Worker `goldprice`，保留自定义域名 `api.goldprice.yanrrd.com`。

- `GET /price?currency=cny&unit=grams`：原来源最新报价。仅此模式在空数据时扩大到七天查找最后报价。
- `GET /price?period=day|week|month`：原来源历史趋势，空数据不改变所查询周期。
- `GET /price?starttime=毫秒&endtime=毫秒`：兼容原来的精确历史范围，最大 366 天。
- `GET /compare?currency=cny&unit=grams`：独立 gold-api.com 最新价。
- 支持 GET、HEAD 和 OPTIONS；错误参数返回 400，上游失败且无可用缓存返回 502。

使用 Cloudflare Cache API：最新价与对照价缓存 60 秒，历史周期缓存五分钟；上游失败时可返回不超过 24 小时的上次成功缓存，并设置 `updateFailed`、`stale`。缓存按数据中心保存，不保证跨地区持久存在。报价本身的新旧由 `dataTimestamp` / `ageSeconds` 表示；`fetchedAt` 是成功拉取时间。

部署顺序：先更新 Worker 并验证 `/compare`、`/price`，再发布前端。修改前的线上 Worker 版本为 `1cb8b50a`；旧前端提交为 `3885da3`。需要回退时使用 Cloudflare 部署历史及 Git 历史。

## 测试

无需安装依赖，运行 `node --test test/*.test.cjs`。覆盖时间参数、历史空数据、休市最后报价、重试校验、缓存降级、单位换算、对照隔离、HTTP 方法、请求超时、全屏进入/退出、股票代码规范化、市场数据校验和资产切换竞态。

本地普通网络可使用 `npx wrangler pages dev .` 同时运行静态页面和 Pages Functions；黄金仍使用线上 Worker。云环境的出站请求需沿用现有代理及证书信任配置，勿关闭 TLS 校验。

## 许可证

MIT
