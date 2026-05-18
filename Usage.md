# IPTVx — 快速使用指南

IPTVx 是基于 Cloudflare Workers 的智能 IPTV 边缘平台，提供 M3U 订阅、EPG、智能路由、多源 Fallback、Web 播放器与管理后台。

> 部署步骤请参阅 [Deployment.md](./Deployment.md)。

---

## 一、服务地址

部署完成后，假设 Worker 地址为：

```text
https://iptvx.example.workers.dev
```

下文以 `BASE_URL` 代指该地址。

---

## 二、核心功能速览

| 功能 | 地址 | 说明 |
|------|------|------|
| 健康检查 | `GET /health` | 服务状态与源健康统计 |
| M3U 订阅 | `GET /iptv.m3u` | IPTV 客户端播放列表 |
| EPG | `GET /epg.xml` | 节目单 XMLTV |
| 监控面板 | `GET /dashboard` | 源状态概览 |
| Web 播放器 | `GET /player` | 浏览器播放（HLS/DPlayer/ArtPlayer） |
| 管理后台 | `GET /admin` | 频道管理、Cron、监控 |
| 个性化推荐 | `GET /api/recommend` | 按地区/偏好推荐频道 |

---

## 三、IPTV 客户端订阅

### 3.1 标准 M3U

在 TiviMate、IPTV Smarters、PotPlayer 等客户端中添加订阅地址：

```text
BASE_URL/iptv.m3u
```

示例：

```text
https://iptvx.example.workers.dev/iptv.m3u
```

### 3.2 启用多源 Fallback 代理

在 M3U 中将流地址替换为 Worker 代理，主源失败时可自动切换备用源：

```text
BASE_URL/iptv.m3u?proxy=1
```

### 3.3 EPG 节目单

```text
BASE_URL/epg.xml
```

在客户端 EPG 设置中填入上述地址（若客户端支持 URL 导入）。

---

## 四、Web 播放器

浏览器打开：

```text
BASE_URL/player
```

### 常用参数

| 参数 | 示例 | 说明 |
|------|------|------|
| `channel` | `?channel=CCTV1` | 频道 ID（标准化名称，如 CCTV1） |
| `player` | `?player=artplayer` | 播放器：`artplayer` / `dplayer` / `hlsjs` |

示例：

```text
BASE_URL/player?channel=CCTV1&player=artplayer
```

### 备用源切换

播放失败时点击页面上的 **「切换备用源」**，或调用 Stream API（见下文）。

---

## 五、用户账号与 API Key

### 5.1 注册

```bash
curl -X POST BASE_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"your_password"}'
```

响应中包含 `apiKey`，请妥善保存（仅显示一次逻辑上应自行备份）。

### 5.2 登录

```bash
curl -X POST BASE_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"your_password"}'
```

响应中的 `token` 用于 Bearer 认证。

### 5.3 认证方式

任选其一附加到请求：

```http
X-API-Key: iptvx_xxxxxxxx
```

或

```http
Authorization: Bearer <登录返回的 token>
```

---

## 六、用户偏好与推荐

### 6.1 获取偏好

```bash
curl BASE_URL/api/user/preferences \
  -H "X-API-Key: YOUR_API_KEY"
```

### 6.2 更新偏好

```bash
curl -X PUT BASE_URL/api/user/preferences \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "favorite_categories": ["新闻", "体育"],
    "preferred_region": "CN",
    "preferred_quality": "HD",
    "preferred_isp": "电信",
    "blocked_channels": ["某广告台"]
  }'
```

### 6.3 获取个性化推荐

```bash
curl "BASE_URL/api/recommend?limit=10" \
  -H "X-API-Key: YOUR_API_KEY"
```

未登录也可访问，但不会应用个人偏好。

---

## 七、流媒体与 Fallback API

### 7.1 获取最优流（302 重定向）

```bash
# 重定向到当前最优源
curl -L "BASE_URL/api/stream/CCTV1"

# 指定使用第 2 备用源（fallback 索引从 0 开始）
curl -L "BASE_URL/api/stream/CCTV1?fallback=1"
```

### 7.2 JSON 格式（便于播放器集成）

```bash
curl "BASE_URL/api/stream/CCTV1?format=json" \
  -H "X-API-Key: YOUR_API_KEY"
```

响应示例：

```json
{
  "url": "http://...",
  "index": 0,
  "total": 3,
  "status": "healthy",
  "latency": 120,
  "channel": "CCTV1",
  "fallbacks": ["http://备用源1...", "http://备用源2..."]
}
```

### 7.3 带 Fallback 的迷你播放列表

```bash
curl "BASE_URL/api/stream/playlist?channel=CCTV1"
```

---

## 八、监控与管理

### 8.1 监控面板

| 页面/API | 地址 |
|----------|------|
| Dashboard | `BASE_URL/dashboard` |
| 统计数据 | `GET BASE_URL/api/stats` |
| 访问指标 | `GET BASE_URL/api/metrics` |

### 8.2 管理后台

1. 浏览器打开：`BASE_URL/admin`
2. 在页面顶部输入 **Admin API Key**
3. 可查看 Cron 历史、访问监控、频道列表，并手动触发采集

手动触发 Cron（命令行）：

```bash
curl -X POST BASE_URL/api/admin/cron/trigger \
  -H "X-API-Key: YOUR_ADMIN_API_KEY"
```

### 8.3 Admin API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/channels` | 频道列表 |
| PUT | `/api/admin/channels/{normalized_name}` | 更新频道（如分类） |
| GET | `/api/admin/cron/status` | Cron 状态 |
| POST | `/api/admin/cron/trigger` | 立即执行采集流水线 |
| GET | `/api/admin/metrics` | 管理端监控数据 |

> 所有 Admin API 需使用 `ADMIN_API_KEY`（请求头 `X-API-Key`）。

---

## 九、健康检查

```bash
curl BASE_URL/health
```

示例响应：

```json
{
  "status": "ok",
  "service": "IPTVx",
  "healthy": 1200,
  "unstable": 50,
  "dead": 30,
  "channels": 800,
  "country": "CN",
  "colo": "HKG"
}
```

---

## 十、典型使用场景

### 场景 A：仅作 M3U 订阅源

1. 部署并完成首次 Cron（见 Deployment.md）
2. 客户端订阅：`BASE_URL/iptv.m3u`
3. EPG（可选）：`BASE_URL/epg.xml`

### 场景 B：需要稳定播放与自动换源

1. 订阅：`BASE_URL/iptv.m3u?proxy=1`
2. 或使用 Web 播放器 / Stream API 的 fallback 参数

### 场景 C：多用户 SaaS

1. 用户注册获取 API Key
2. 设置偏好（地区、分类、屏蔽频道）
3. 使用 `BASE_URL/api/recommend` 获取个性化列表
4. 播放时携带 `X-API-Key` 以应用偏好路由

### 场景 D：运维管理

1. 定期查看 `BASE_URL/dashboard` 或 `/api/metrics`
2. 源异常时在 `BASE_URL/admin` 手动触发 Cron
3. 在 `config/config.js` 中调整 `SOURCE_LIST` 后重新部署

---

## 十一、频道 ID 说明

Stream API 与播放器使用的 `channel` 参数一般为 **标准化频道名**，例如：

| 显示名称 | channel 参数 |
|----------|----------------|
| CCTV-1 综合 | `CCTV1` |
| 凤凰中文 | `凤凰中文`（或 URL 编码后的形式） |

可通过 `GET /api/recommend` 或管理后台频道列表查看 `normalized_name`。

---

## 十二、本地开发快速体验

```bash
npm install
npm run dev
```

| 步骤 | 操作 |
|------|------|
| 1 | 打开 http://127.0.0.1:8787/admin |
| 2 | 输入 Admin Key：`iptvx-admin-dev-key`（见 wrangler.toml） |
| 3 | 点击「立即运行 Cron」 |
| 4 | 打开 http://127.0.0.1:8787/player?channel=CCTV1 |
| 5 | 或订阅 http://127.0.0.1:8787/iptv.m3u |

---

## 十三、相关文档

- [README.md](./README.md) — 项目结构与阶段规划
- [Requirements.md](./Requirements.md) — 产品需求说明
- [Deployment.md](./Deployment.md) — Cloudflare Workers 部署指南
