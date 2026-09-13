# 金价监控 (Gold Price Status)

一个简单的黄金价格监控网页，可以通过 Cloudflare Pages 直接部署运行。

## 功能

- 实时显示黄金价格（人民币/克）
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
5. 点击 "保存并部署"

部署完成后，Cloudflare Pages 会提供一个 `*.pages.dev` 域名，您可以通过该域名访问应用。

## 数据来源

本应用使用 [World Gold Council](https://www.gold.org/) 的 API 获取黄金价格数据。

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

无需安装依赖，运行 `node --test test/*.test.cjs`。覆盖时间参数、历史空数据、休市最后报价、重试校验、缓存降级、单位换算、对照隔离、HTTP 方法和请求超时。

## 许可证

MIT
