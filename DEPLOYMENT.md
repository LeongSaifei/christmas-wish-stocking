# 本次上线记录

核验日期：2026-11-18（北京时间）。

## 公开访问

- 主分享地址：[GitHub Pages](https://leongsaifei.github.io/christmas-wish-stocking/)
- 同一网站的托管地址：[圣诞心愿邮局](https://christmas-wish-stocking-7df218.adroitbun.chatgpt.site/)
- 公开源码：[LeongSaifei/christmas-wish-stocking](https://github.com/LeongSaifei/christmas-wish-stocking)

两个网页使用同一 D1 数据库；不需要访客登录。GitHub Pages 构建发布工作流已经成功，两个公开网址已通过无登录 HTTP 请求验证。

## 已核验

- Sites 生产部署成功；数据库 `DB` 中存在 `wishes` 表。
- GitHub Pages 来源跨域提交返回 `201` 和有效回执。
- 同一请求重复提交返回 `200`、相同回执，数据库中只有一条对应记录。
- 用数据库管理工具重新读取，确认测试愿望实际持久保存。
- 本地 5 组自动测试全部通过：持久性、去重、私密读取边界、输入/容量校验、错误反馈。
- 浏览器查看桌面页面及 390px 手机宽度的表单，页面无水平溢出。

验证限制：线上浏览器导航工具后续超时，因此没有把线上浏览器点击全流程声称为已完成；线上公开页面和跨域写入由独立 HTTP 请求验证，保存结果由真实数据库读取确认。可选 Supabase SQL 尚未在独立 Supabase 实例运行。

数据库中保留标注“测试”的上线核验记录，便于区分真实愿望。维护者可在数据库管理界面按回执删除；不提供公共删除接口。

## 如何查看收集结果

在 Sites 中打开“圣诞心愿邮局”，进入设置 → 数据库 → `DB` → `wishes`。或在本聊天中说“查看圣诞网站收集到的愿望”，由连接的数据库读取工具查询。

## 费用与可迁移性

GitHub Pages 前端使用公开仓库免费托管。当前真实写入服务使用已连接的 Sites / D1 资源，其额度与费用以账号为准，不能承诺永久零成本。仓库包含可迁移到 Supabase Free 的配置、SQL、权限边界与步骤；没有开通任何付费套餐。

Vercel、独立 Supabase 是可选部署说明，本次未创建对应账号或实例。README 中写明所需操作，没有虚构它们的部署链接。

## 更新

静态页面修改后推送 GitHub `main` 自动更新 Pages。`worker/`、D1 迁移或 Sites 页面更新需要通过 Sites 发布流程重新构建并发布；仅推送 GitHub 不会更新 Sites API。不要删除或改写已上线的迁移，后续变更新增迁移文件。
