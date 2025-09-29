# 金价监控 (Gold Price Status)

一个简单的黄金价格监控网页，可以通过 Cloudflare Pages 直接部署运行。

## 功能

- 实时显示黄金价格（人民币/克）
- 自动每5秒刷新一次数据
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

## 许可证

MIT