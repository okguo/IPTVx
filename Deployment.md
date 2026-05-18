# IPTVx — Cloudflare Workers 部署指南

本文档说明如何将 IPTVx 部署到 Cloudflare Workers，并配置 KV、D1（可选）、Cron 定时任务及密钥。

---

## 一、前置条件

| 项目 | 要求 |
|------|------|
| Node.js | 18+（推荐 20+） |
| npm | 9+ |
| Cloudflare 账号 | [注册](https://dash.cloudflare.com/sign-up) |
| Wrangler CLI | 项目已包含，执行 `npm install` 即可 |

```bash
# 克隆/进入项目后安装依赖
cd IPTVx
npm install

# 登录 Cloudflare（首次部署必须）
npx wrangler login
```

---

## 二、创建 Cloudflare 资源

### 2.1 KV 命名空间（必须）

KV 用于缓存播放列表、频道数据、健康状态、EPG、用户 Session 等。

```bash
# 创建生产环境 KV
npx wrangler kv namespace create IPTV_KV

# 创建本地开发用 Preview KV
npx wrangler kv namespace create IPTV_KV --preview
```

命令输出示例：

```text
{ "id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
{ "preview_id": "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy" }
```

将 ID 填入 `wrangler.toml`：

```toml
[[kv_namespaces]]
binding = "IPTV_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"        # 上一步的 id
preview_id = "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy" # 上一步的 preview_id
```

> **说明**：代码中通过 `env.IPTV_KV` 访问 KV（binding 名称须与 `wrangler.toml` 一致）。

### 2.2 D1 数据库（可选，推荐生产环境）

D1 用于持久化频道、源流、Cron 日志、每日监控指标。未配置 D1 时，核心功能仍可通过 KV 运行。

```bash
# 创建 D1 数据库
npx wrangler d1 create iptvx-db
```

将返回的 `database_id` 写入 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "iptvx-db"
database_id = "REPLACE_WITH_D1_DATABASE_ID"
```

初始化表结构：

```bash
# 远程（生产）数据库
npx wrangler d1 execute iptvx-db --remote --file=./migrations/0001_init.sql

# 本地开发数据库
npx wrangler d1 execute iptvx-db --local --file=./migrations/0001_init.sql
```

### 2.3 Cron 定时任务

`wrangler.toml` 已配置每小时整点执行采集与测速：

```toml
[triggers]
crons = ["0 * * * *"]
```

部署后可在 Cloudflare Dashboard → Workers → 你的 Worker → **Triggers** 中查看 Cron 是否生效。

---

## 三、配置 wrangler.toml

完整示例（请替换占位符）：

```toml
name = "iptvx"
main = "worker/index.js"
compatibility_date = "2024-11-01"

[[kv_namespaces]]
binding = "IPTV_KV"
id = "你的_KV_ID"
preview_id = "你的_PREVIEW_KV_ID"

[triggers]
crons = ["0 * * * *"]

[[d1_databases]]
binding = "DB"
database_name = "iptvx-db"
database_id = "你的_D1_ID"

[vars]
ENVIRONMENT = "production"
```

### 3.1 环境变量与密钥

| 名称 | 类型 | 说明 |
|------|------|------|
| `ENVIRONMENT` | vars | 环境标识，默认 `production` |
| `ADMIN_API_KEY` | **Secret（推荐）** | 管理后台 / Admin API 鉴权密钥 |

**生产环境务必使用 Secret，不要将 Admin Key 明文提交到仓库：**

```bash
npx wrangler secret put ADMIN_API_KEY
# 按提示输入强密码，例如：随机 32 位字符串
```

开发环境可在 `wrangler.toml` 的 `[vars]` 中临时设置（当前默认为 `iptvx-admin-dev-key`，仅用于本地调试）。

---

## 四、本地开发与调试

```bash
# 启动本地 Worker（默认 http://127.0.0.1:8787）
npm run dev

# 使用本地 D1（若已配置）
npm run dev -- --local

# 运行单元测试
npm test
```

### 本地验证清单

```bash
# 健康检查
curl http://127.0.0.1:8787/health

# 触发一次完整采集（首次访问 m3u 较慢，或到管理后台手动 Cron）
curl http://127.0.0.1:8787/iptv.m3u

# 管理后台（需 Admin API Key）
curl -H "X-API-Key: iptvx-admin-dev-key" -X POST http://127.0.0.1:8787/api/admin/cron/trigger
```

---

## 五、部署到 Cloudflare

```bash
# 部署到 Cloudflare（生产）
npm run deploy

# 等价于
npx wrangler deploy
```

部署成功后会输出 Worker URL，例如：

```text
https://iptvx.<你的子域>.workers.dev
```

### 5.1 首次部署后建议操作

1. **手动触发一次 Cron**，预热 KV 缓存：
   ```bash
   curl -X POST https://iptvx.<子域>.workers.dev/api/admin/cron/trigger \
     -H "X-API-Key: 你的_ADMIN_API_KEY"
   ```
2. 访问 `/health` 确认 `healthy` / `channels` 有数据。
3. 访问 `/iptv.m3u` 确认返回 M3U 内容。

### 5.2 绑定自定义域名（可选）

1. Cloudflare Dashboard → **Workers & Pages** → 选择 `iptvx` → **Settings** → **Domains & Routes**
2. 添加 `Custom Domain`，例如 `iptv.example.com`
3. 确保该域名 DNS 由 Cloudflare 代理（橙色云朵）

之后可将播放器、客户端订阅地址改为自定义域名。

---

## 六、自定义配置

编辑 `config/config.js` 可修改：

- `SOURCE_LIST`：IPTV 源地址列表
- `EPG_SOURCES`：EPG/XMLTV 源
- `MAX_SOURCES_PER_CHANNEL`：每频道保留源数量
- `VALIDATE_TIMEOUT_MS`：测速超时
- `ROUTING`：国家 / ISP 路由加权规则

修改后重新部署：

```bash
npm run deploy
```

---

## 七、资源与配额说明

| 资源 | 用途 | 说明 |
|------|------|------|
| **Workers** | HTTP API、路由、Cron | 注意单次请求 CPU 时间；大批量测速由 Cron 异步执行 |
| **KV** | 缓存 m3u、channels、health、epg、用户数据 | 读写有延迟，适合缓存而非强一致 |
| **D1** | 频道/源持久化、Cron 日志、指标 | 可选；Cron 结束时会尝试同步 |
| **Cron** | 每小时采集 + 测速 + 更新 KV | 可在 Dashboard 查看执行记录 |

---

## 八、常见问题

### 8.1 `/iptv.m3u` 返回空或 503

- KV 中尚无 `playlist`：等待 Cron 执行，或手动触发 `/api/admin/cron/trigger`。
- 上游源不可达：检查 `config/config.js` 中 `SOURCE_LIST` 是否可访问。

### 8.2 Cron 未执行

- 确认 `wrangler.toml` 中 `[triggers] crons` 已配置且已重新 `deploy`。
- 免费套餐 Cron 有限制，请在 Dashboard → Triggers 查看状态。

### 8.3 Admin API 返回 401

- 请求头需携带：`X-API-Key: <ADMIN_API_KEY>`。
- 生产环境确认已执行 `wrangler secret put ADMIN_API_KEY`，且与请求中的 Key 一致。

### 8.4 D1 相关错误

- 未创建 D1 或未执行 migration：可暂时注释 `wrangler.toml` 中 `[[d1_databases]]` 块，仅使用 KV。
- 本地与远程数据库分离：开发用 `--local`，生产用 `--remote`。

### 8.5 查看实时日志

```bash
npx wrangler tail
```

---

## 九、部署检查表

- [ ] `npm install` 完成
- [ ] `npx wrangler login` 已登录
- [ ] KV `id` / `preview_id` 已填入 `wrangler.toml`
- [ ] （可选）D1 已创建并执行 `migrations/0001_init.sql`
- [ ] `ADMIN_API_KEY` 已通过 Secret 配置（生产）
- [ ] `npm run deploy` 成功
- [ ] `/health` 返回正常
- [ ] 已触发 Cron 且 `/iptv.m3u` 有内容
- [ ] （可选）自定义域名已绑定

---

## 十、更新与回滚

```bash
# 发布新版本
npm run deploy

# 在 Cloudflare Dashboard → Workers → Deployments 可查看历史版本并回滚
```

更多 API 与客户端用法见 [Usage.md](./Usage.md)。
