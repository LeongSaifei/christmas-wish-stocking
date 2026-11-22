# 圣诞心愿邮局 🎄

一个可以分享给朋友的中文圣诞许愿网页。点击中央的针织圣诞袜，填写昵称（可选）和想要的礼物，把愿望真正保存到云端。

**直接打开并分享：[圣诞心愿邮局](https://leongsaifei.github.io/christmas-wish-stocking/)** · [备用网址](https://christmas-wish-stocking-7df218.adroitbun.chatgpt.site/)。上线与验证记录见 `DEPLOYMENT.md`。

## 页面与存储

- 原生 HTML / CSS / JavaScript，零前端依赖；所有插画和图标都是项目内原创 SVG，不依赖 CDN。
- 标题用思源宋体（Noto Serif SC）、手写句用霞鹜文楷，均只裁出页面用到的字并自托管（合计约 25 KB），Windows、安卓、微信里显示一致。改了这些文案后运行 `python scripts/subset-fonts.py` 重新生成，见脚本说明。
- 灯串用木夹挂住圣诞袜；三层景深飘雪；横格信纸与邮票；寄出后信封飞进袜口、铃铛轻晃。
- 不支持 `<dialog>` 的旧浏览器（iOS 15.3 及以下、旧版微信）自动降级为普通浮层；微信内点“分享”会提示使用右上角菜单。
- `og.png` 分享卡片（1200×630），转发到微信 / Telegram / X 时显示预览图。
- 手机适配、键盘操作、原生模态窗口、减少动态效果设置、雪花开关、分享/复制链接。
- 两个公开网址使用同一套 D1 存储。每只个人圣诞袜都有独立收件箱。原网址继续向网站发起人投递。
- 可替换为 Supabase 免费项目；含完整 SQL。不会用 localStorage、服务器内存、模拟计数或延时动画假装保存。
- 每只袜子的查看口令只出现于私密操作中。数据库保存口令摘要。持有口令的人可以打开对应的收件箱，网站维护者可在数据库中管理记录。

## 朋友之间怎么转发

1. 打开网页，点「创建我的圣诞袜」，填写朋友认得的昵称。把查看口令私下保存，换手机后仍可使用。口令遗失且原页面已关闭时，网站无法找回。
2. 复制「发给朋友的邀请链接」。朋友可以先点袜子给你写愿望，再点「我也要收集朋友的愿望」创建自己的袜子。他们把新生成的链接发出去，收到的愿望就归他们。原样转发任何邀请链接，仍会寄给该链接标出的收件人。
3. 点「打开我的收件箱」，粘贴自己的查看口令，按从新到旧的顺序阅读来信。时间显示为北京时间。

## 本地预览

安装 Node.js 22.13+（推荐 24 LTS），在本目录运行：

```sh
npm run dev
```

打开终端显示的本地地址。无需 `npm install`。想在手机上看效果：`HOST=0.0.0.0 npm run dev`，再用手机访问电脑的局域网 IP。本地预览默认不在生产 API 的 CORS 白名单内，因此本地提交会显示失败，不会伪造成功。需要完整联调时，在后端设置 `ALLOWED_ORIGINS=http://127.0.0.1:4173`，仅测试期间启用。测试愿望请标注“测试”。

```sh
npm test
npm run build
```

测试覆盖真实 SQLite 文件关闭/重新打开后的持久性、重试去重、回执冲突、服务端输入校验、请求大小、CORS、禁止匿名读取、每日容量限制及前端错误反馈。SQLite 测试是 D1 兼容 SQL 的本地验证；生产状态另见 `DEPLOYMENT.md`。

## 部署方式 A：GitHub Pages

1. 将本项目推送到你自己的公开 GitHub 仓库。
2. Settings → Pages → Source 选择 **GitHub Actions**。
3. 推送 `main`，或在 Actions 手动运行 **Deploy Christmas Post**。工作流先跑测试，再 `npm run build`，发布 `dist/client/`（即 `public/` 加上带内容哈希的 `?v=` 版本号，避免发版后新旧文件混用），不会公开数据库文件或管理凭据。
4. 在 `public/config.js` 设置存储。保留本项目当前 API 地址会把心愿交给本项目的收集者；**Fork 给自己使用时，必须换成你自己的后端**。
5. 使用 API 后端时，把新网页的完整 origin（如 `https://yourname.github.io`，不带路径）加入后端环境变量 `ALLOWED_ORIGINS`。GitHub Pages 的仓库子路径由相对资源路径支持。

GitHub Free 的公开仓库支持 Pages：[官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。

## 部署方式 B：Vercel 静态前端

导入此仓库，Framework Preset 选 Other。项目已有 `vercel.json`，构建命令 `npm run build`，输出目录 `dist/client`。使用免费 Hobby 方案前确认账号当前条款与个人用途限制。前端发布不等于有数据库；仍须配置下述 API / Supabase。换域名后同步后端 `ALLOWED_ORIGINS`。

## 后端 A：本次托管的 D1

`worker/api.js` 提供 `POST /api/wishes`，`.openai/hosting.json` 声明 D1 绑定 `DB`。`npm run build` 把静态资源和 API 打包为 Worker；Sites 发布工具将 `drizzle/` SQL 与日志作为数据库迁移应用。

- 以迁移顺序应用 `drizzle/0000_wishes.sql`、`0001_submit_counts.sql`、`0002_stockings.sql`。最后一个迁移新增 `stockings` 并为原有愿望表添加可空的 `stocking_id`。原有记录继续归网站发起人。
- 个人袜子使用 `POST /api/stockings/create` 创建，`info` 确认收件人，`wish` 投递。读信使用 `inbox` 并在请求体内提交查看口令。普通邀请只携带公开的 `?sock=` 编号。
- 每条愿望包含回执、昵称、内容、UTC 提交时间和收件袜子编号。空昵称表示匿名。
- 请求成功提交数据库后才返回 `201 {ok:true,id:...}`；同一回执和相同内容重试返回 `200`，不会新增记录。
- 输入在服务端重新校验；SQL 参数化；失败不回显内部错误；请求体最多 8 KB。
- 每天最多 2,000 条新愿望，按北京时间 0 点重置，数据库原子校验。
- 同一网络来源每天最多 5 条新愿望（环境变量 `PER_SOURCE_LIMIT` 可改）。只保存“IP + 每日盐”的 SHA-256 摘要，不存原始 IP；建议在后端设置随机的 `IP_SALT` 环境变量。重试同一张回执不占名额。迁移见 `drizzle/0001_submit_counts.sql`。
- 无法把此 Worker 直接部署成 GitHub Pages 函数。GitHub Pages 仅提供静态页面，API 必须保留独立运行。
- 当前托管资源及其额度由连接账号提供，**不承诺 Sites 永久免费**；可迁移到自有免费额度内的 Supabase。

查看愿望：进入 Sites 中的“圣诞心愿邮局”→ 设置 → 数据库 → `DB` → `wishes`。也可在当前聊天要求读取这个网站的愿望。不在公开网页设置“管理员密码”，避免公开源码泄露管理权限。

## 后端 B：Supabase（单收件箱示例）

此示例仅用于单个收集者。需要每人有自己的袜子时，请使用上面的 D1 后端。

1. 使用自己的账号创建 Free 项目。套餐与暂停政策以 [Supabase 定价](https://supabase.com/pricing) 为准。
2. 打开 SQL Editor，执行 `supabase/schema.sql` 一次（已用 PostgREST 的 `PT429` / `PT409` / `PT400` 错误码，前端能区分“今日已满”“回执冲突”和“内容无效”）。该脚本新建表，启用 RLS，撤销匿名直接访问，仅允许调用受限的提交函数。
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

- 寄信时保存可选昵称、愿望、时间、收件袜子编号和随机回执。创建袜子时保存收件人昵称、袜子编号、创建时间和口令摘要。防刷使用按天计算的 IP 摘要和计数。服务商可能保留访问日志。
- 回执是查询/删除时供收集者定位的编号，不是公开查询凭证。保存成功后截图留存。
- 收集者应在活动结束后 30 天内清理；目前没有自动清理任务。删除时先核对回执，再在受控数据库管理工具中删除对应行。
- 公开匿名写入口不等于完整防刷。蜜罐、按来源限流、每日总量和 CORS 能挡住大部分随手的脚本，但挡不住换 IP 的攻击；CORS 不是身份认证。大范围推广前建议再加服务端校验的 Turnstile。
- 网络超时可能发生在写入之后。保留当前窗口点击重试会复用回执；刷新后重新填写会生成新回执，可能新增一条。系统不把未确认的请求显示成成功。
- 可访问性包含键盘焦点、原生 dialog、控件标签与系统减少动态效果；免费托管与跨境服务在不同网络下的可达性需实际测试。

## 目录

```text
public/                 静态网页源文件（fonts/ 为子集字体及其 OFL 许可证）
worker/api.js           D1 写入 API
drizzle/                D1 数据库迁移
supabase/schema.sql     可选 Supabase 配置
scripts/                预览、构建、字体子集化
tests/                  持久保存、权限和失败路径测试
.github/workflows/      GitHub Pages 自动发布
```

MIT License。分享心意，不承诺愿望一定实现。
