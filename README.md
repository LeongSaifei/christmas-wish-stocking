# 圣诞心愿邮局 🎄

一个可以分享给朋友的中文圣诞许愿网页。点击中央的针织圣诞袜，填写昵称（可选）和想要的礼物，把愿望真正保存到云端。

## 页面与存储

- 原生 HTML / CSS / JavaScript，零前端依赖；所有插画都是项目内原创 SVG，不依赖外部字体、图片或 CDN。
- 圣诞灯串、飘雪、摇摆袜子、打开反馈、信笺表单、成功盖章与随机回执。
- 手机适配、键盘操作、原生模态窗口、减少动态效果设置、雪花开关、分享/复制链接。
- 默认通过独立 API 写入 Cloudflare D1 持久数据库。GitHub Pages 和 Sites 页面共用同一个收件箱。
- 可替换为 Supabase 免费项目；含完整 SQL。不会用 localStorage、服务器内存、模拟计数或延时动画假装保存。
- 愿望不公开展示，访客没有列表/查询/删除接口。只有数据库所有者可以查看。

## 本地预览

安装 Node.js 22.13+（推荐 24 LTS），在本目录运行：

```sh
npm run dev
```

打开终端显示的本地地址。无需 `npm install`。本地预览默认不在生产 API 的 CORS 白名单内，因此本地提交会显示失败，不会伪造成功。需要完整联调时，在后端设置 `ALLOWED_ORIGINS=http://127.0.0.1:4173`，仅测试期间启用。测试愿望请标注“测试”。

```sh
npm test
npm run build
```

测试覆盖真实 SQLite 文件关闭/重新打开后的持久性、重试去重、回执冲突、服务端输入校验、请求大小、CORS、禁止匿名读取、每日容量限制及前端错误反馈。SQLite 测试是 D1 兼容 SQL 的本地验证；生产状态另见 `DEPLOYMENT.md`。

## 部署方式 A：GitHub Pages

1. 将本项目推送到你自己的公开 GitHub 仓库。
2. Settings → Pages → Source 选择 **GitHub Actions**。
3. 推送 `main`，或在 Actions 手动运行 **Deploy Christmas Post**。工作流只发布 `public/`，不会公开数据库文件或管理凭据。
4. 在 `public/config.js` 设置存储。保留本项目当前 API 地址会把心愿交给本项目的收集者；**Fork 给自己使用时，必须换成你自己的后端**。
5. 使用 API 后端时，把新网页的完整 origin（如 `https://yourname.github.io`，不带路径）加入后端环境变量 `ALLOWED_ORIGINS`。GitHub Pages 的仓库子路径由相对资源路径支持。

GitHub Free 的公开仓库支持 Pages：[官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。

## 部署方式 B：Vercel 静态前端

导入此仓库，Framework Preset 选 Other。项目已有 `vercel.json`，输出目录为 `public`，不需要构建。使用免费 Hobby 方案前确认账号当前条款与个人用途限制。前端发布不等于有数据库；仍须配置下述 API / Supabase。换域名后同步后端 `ALLOWED_ORIGINS`。

## 后端 A：本次托管的 D1

`worker/api.js` 提供 `POST /api/wishes`，`.openai/hosting.json` 声明 D1 绑定 `DB`。`npm run build` 把静态资源和 API 打包为 Worker；Sites 发布工具将 `drizzle/` SQL 与日志作为数据库迁移应用。

- 每条数据：`id`、`nickname`、`gift`、`created_at`（UTC）。空昵称表示匿名。
- 请求成功提交数据库后才返回 `201 {ok:true,id:...}`；同一回执和相同内容重试返回 `200`，不会新增记录。
- 输入在服务端重新校验；SQL 参数化；失败不回显内部错误；请求体最多 8 KB。
- 每天最多 2,000 条新愿望（UTC），数据库原子校验。可修改 API 的上限。
- 无法把此 Worker 直接部署成 GitHub Pages 函数。GitHub Pages 仅提供静态页面，API 必须保留独立运行。
- 当前托管资源及其额度由连接账号提供，**不承诺 Sites 永久免费**；可迁移到自有免费额度内的 Supabase。

查看愿望：进入 Sites 中的“圣诞心愿邮局”→ 设置 → 数据库 → `DB` → `wishes`。也可在当前聊天要求读取这个网站的愿望。不在公开网页设置“管理员密码”，避免公开源码泄露管理权限。

## 后端 B：Supabase（可选替代）

1. 使用自己的账号创建 Free 项目。套餐与暂停政策以 [Supabase 定价](https://supabase.com/pricing) 为准。
2. 打开 SQL Editor，执行 `supabase/schema.sql` 一次。该脚本新建表，启用 RLS，撤销匿名直接访问，仅允许调用受限的提交函数。
3. 在项目 Connect / API Keys 中取得项目 URL 与 **publishable key**。
4. 编辑 `public/config.js`：

```js
window.WISH_CONFIG = Object.freeze({
  storage: 'supabase',
  apiBase: '',
  supabaseUrl: 'https://你的项目.supabase.co',
  supabasePublishableKey: '你的 publishable key'
});
```

5. 重新部署。用两个不同设备各提交一条带“测试”标记的愿望，在 Supabase Table Editor → `christmas_wishes` 确认记录独立存在。
6. 用公开 key 尝试直接查询表，应失败；调用提交函数应成功。不要新增允许匿名 SELECT 的策略。

公开 key 不是保密凭据，数据库权限才是安全边界。[Supabase API keys 文档](https://supabase.com/docs/guides/getting-started/api-keys)。**绝不能把 `service_role`、`sb_secret_`、数据库密码或 GitHub token 放入前端或 Git。**

脚本通过 `SECURITY DEFINER` 受限函数写入，固定空 `search_path`，不使用动态 SQL。对自行改写的权限/函数应重新验证。可选 Supabase 方案未接入本次生产实例，不声称已完成线上验证。

## 隐私、数据管理与限制

详见 `PRIVACY.md`，网页也包含提交前可读的隐私说明。

- 仅收集可选昵称、愿望、时间和随机回执，不要求登录。应用不存 IP、邮箱、电话、地址、广告标识；服务商仍可能保留访问日志。
- 回执是查询/删除时供收集者定位的编号，不是公开查询凭证。保存成功后截图留存。
- 收集者应在活动结束后 30 天内清理；目前没有自动清理任务。删除时先核对回执，再在受控数据库管理工具中删除对应行。
- 公开匿名写入口不等于完整防刷。蜜罐、每日总量和 CORS 不能阻止脚本攻击；CORS 不是身份认证。大范围推广前应加服务端校验的 Turnstile / 按用户或网络来源限流，并同步隐私说明。
- 网络超时可能发生在写入之后。保留当前窗口点击重试会复用回执；刷新后重新填写会生成新回执，可能新增一条。系统不把未确认的请求显示成成功。
- 可访问性包含键盘焦点、原生 dialog、控件标签与系统减少动态效果；免费托管与跨境服务在不同网络下的可达性需实际测试。

## 目录

```text
public/                 可独立部署的静态网页
worker/api.js           D1 写入 API
drizzle/                D1 数据库迁移
supabase/schema.sql     可选 Supabase 配置
scripts/                预览和构建，无运行依赖
tests/                  持久保存、权限和失败路径测试
.github/workflows/      GitHub Pages 自动发布
```

MIT License。分享心意，不承诺愿望一定实现。
