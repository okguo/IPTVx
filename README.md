# IPTVx — Serverless IPTV Aggregator / 无服务器 IPTV 聚合服务

> **A multi-source IPTV aggregation service running entirely on Cloudflare Workers, with AI-powered channel normalization, live sports scraping, and zero hosting cost.**
>
> **一个完全运行在 Cloudflare Workers 上的多源 IPTV 聚合服务，具备 AI 频道标准化、体育直播爬取、零托管成本的特性。**

[![Deploy to Cloudflare Workers](https://img.shields.io/badge/Deploy-Cloudflare%20Workers-f38020?style=flat-square&logo=cloudflare)](#%E4%B8%80%E9%94%AE%E9%83%A8%E7%BD%B2--one-click-deploy)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js)](https://nodejs.org/)

---

## Features / 功能特性

| 功能 | 说明 | Feature | Description |
|------|------|---------|-------------|
| 🔄 **多源聚合** | 自动从 5+ 开源源拉取并合并频道 | 🔄 **Multi-source Aggregation** | Auto-fetch and merge channels from 5+ open sources |
| 🤖 **AI 频道标准化** | 智能去重、标准化名称（CCTV-1 → CCTV1）、分类归一 | 🤖 **AI Channel Normalization** | Smart dedup, name standardization, category normalization |
| ⚽ **体育直播爬取** | 定时爬取咖啡直播赛事源，自动归入体育分类 | ⚽ **Live Sports Scraping** | Scheduled scraping of live sports sources, auto-categorized |
| 📺 **三维分类矩阵** | 主分类 × 画质等级 × 子类型（4K/8K 专区、体育细分等） | 📺 **3D Category Matrix** | Primary × Quality × Sub-category (4K/8K zone, sports sub-cats) |
| 📊 **多因子排序** | 画质+健康评分+源冗余度+CCTV顺序+收藏加成 | 📊 **Multi-Factor Ranking** | Quality + health + source count + CCTV order + favorites |
| 🏷️ **白名单过滤** | 只保留高价值频道，自动剔除低质量/失效频道 | 🏷️ **Whitelist Filtering** | Only keep high-value channels, auto-filter low-quality/dead ones |
| ⏰ **Cron 自动更新** | 每小时自动刷新频道和源状态 | ⏰ **Cron Auto-refresh** | Hourly auto-refresh of channels and source status |
| 🌐 **EPG 增强** | 聚合 iptv-org EPG，智能 XMLTV ID 映射 + 占位节目 | 🌐 **Enhanced EPG** | Aggregated EPG with smart XMLTV ID mapping + fallback programmes |
| 📈 **测速历史** | 持久化测速结果，支持频道健康趋势分析 | 📈 **Validation History** | Persisted validation with channel health trend analysis |
| 🔍 **源管理** | 失效源自动剔除、源质量报告、手动控制 | 🔍 **Source Management** | Auto-remove dead sources, quality reports, manual control |
| 🌍 **智能路由** | 基于地区/ISP 的智能源路由 + fallback 代理 | 🌍 **Smart Routing** | Region/ISP-based source routing + fallback proxy |
| 🖼️ **Logo 补全** | 自动补全频道图标（iptv-org logos） | 🖼️ **Logo Enrichment** | Auto-complete channel logos from iptv-org |
| ⭐ **收藏系统** | 用户收藏频道、个性化推荐 | ⭐ **Favorites** | User channel favorites, personalized recommendations |
| 🔗 **HLS 代理** | 主源失败时自动代理中转 M3U8 流 | 🔗 **HLS Proxy** | Auto-proxy M3U8 when direct connection fails |
| 🔎 **源发现** | 自动扫描 GitHub IPTV 仓库发现新源 | 🔎 **Source Discovery** | Auto-scan GitHub IPTV repos for new sources |
| 🧠 **LLM 支持** | 可选 LLM 模式进行智能频道分类 | 🧠 **LLM Support** | Optional LLM mode for smart channel classification |
| 💾 **零托管成本** | 完全运行在 Cloudflare 免费套餐上 | 💾 **Zero Hosting Cost** | Runs entirely on Cloudflare's free tier |

---

## Architecture / 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  /iptv.m3u   │    │   /epg.xml   │    │  /api/stats  │  │
│  │  M3U 播放列表 │    │  EPG 节目单   │    │  统计接口     │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                   │          │
│  ┌──────▼──────────────────▼───────────────────▼───────┐   │
│  │              Worker Router (index.js)                │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │                                  │
│  ┌──────────────────────▼──────────────────────────────┐   │
│  │              Collector Service                       │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────────┐   │   │
│  │  │ 外部 M3U 源 │ │ 咖啡直播 API │ │ 咪咕体育静态源   │   │   │
│  │  │ 5+ sources │ │ live sports │ │ static sources  │   │   │
│  │  └────────────┘ └────────────┘ └────────────────┘   │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │                                  │
│  ┌──────────────────────▼──────────────────────────────┐   │
│  │              AI Service (ai.js)                      │   │
│  │  • 频道名称标准化  • 智能分类  • 去重  • 白名单过滤   │   │
│  │  • Name normalization • Classification • Dedup       │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │                                  │
│  ┌──────────────────────▼──────────────────────────────┐   │
│  │            KV Cache (IPTV_KV)                        │   │
│  │  playlist | channels | health | epg                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                         ▲                                  │
│  ┌──────────────────────┴──────────────────────────────┐   │
│  │         Cron Trigger (每小时 / hourly)                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Channel Categories / 频道分类

| 分类 Category | 数量 Count | 示例 Examples |
|---------------|------------|---------------|
| **央视频道** | 24 | CCTV1 ~ CCTV17, CGTN 系列 |
| **卫视频道** | 32 | 湖南卫视, 浙江卫视, 东方卫视, 江苏卫视, 北京卫视... |
| **港澳台** | 16 | 凤凰中文, 凤凰资讯, TVB 翡翠台, TVB 明珠台, HOY 系列 |
| **体育** | 18+ | NBA/英超/西甲等赛事直播（咖啡直播源实时更新） |
| **影视** | 4 | CHC 家庭影院, 第一剧场, 风云剧场, 黑莓电影 |
| **少儿动漫** | 14 | 金鹰卡通, 卡酷少儿, 优漫卡通, CN 卡通... |

---

## Compared to Similar Projects / 与同类项目对比

| 特性 Feature | IPTVx | iptv-org | m3u-to-epg | other-scraper |
|--------------|-------|----------|------------|---------------|
| **多源聚合** Multi-source | ✅ 5+ 源自动合并 | ❌ 单源列表 | ❌ | ⚠️ 有限 |
| **AI 标准化** AI Normalization | ✅ 智能去重/分类 | ❌ 手动维护 | ❌ | ❌ |
| **体育直播** Live Sports | ✅ 实时爬取 | ❌ | ❌ | ❌ |
| **白名单过滤** Whitelist | ✅ 只保留高价值频道 | ❌ | ❌ | ❌ |
| **零成本托管** Zero Cost | ✅ Cloudflare 免费 | ✅ GitHub Pages | ❌ 需自建 | ❌ 需服务器 |
| **Cron 自动更新** Auto-refresh | ✅ 每小时 | ✅ GitHub Actions | ❌ | ⚠️ |
| **智能分类** Smart Categories | ✅ 6+ 分类 | ⚠️ 手动分组 | ❌ | ❌ |
| **频道名称优化** Name Optimization | ✅ 赛事+队伍+主播 | ❌ 原始名称 | ❌ | ❌ |
| **M3U 输出** M3U Output | ✅ | ✅ | ✅ | ⚠️ |
| **EPG 支持** EPG | ✅ | ✅ | ✅ | ❌ |

### IPTVx 核心优势 / Key Advantages

1. **赛事信息实时展示** — 频道名称自动格式化为"赛事 主队 vs 客队（主播）"格式
2. **零运维成本** — 无需服务器，Cloudflare 免费套餐即可运行
3. **智能质量管控** — 白名单机制确保每个频道都是高价值的
4. **体育直播优先** — 咖啡直播源实时爬取，NBA/英超/西甲等赛事自动分类
5. **开发者友好** — 提供 `/api/stats` 等 RESTful API，方便集成

---

## Quick Start / 快速开始

### Subscribe / 订阅

```
https://<your-domain>/iptv.m3u
```

直接粘贴到你的 IPTV 播放器中（如 TiviMate、IPTV Pro、Kodi 等）。

### API Endpoints / 接口

| Endpoint | Method | Description / 说明 |
|----------|--------|-------------------|
| `GET /iptv.m3u` | GET | M3U 播放列表（支持 `?proxy=1` 代理模式） |
| `GET /epg.xml` | GET | EPG 节目单 |
| `GET /health` | GET | 服务健康状态 |
| `GET /api/stats` | GET | 频道统计 |
| `GET /api/metrics` | GET | 访问指标（7 天趋势） |
| `GET /api/recommend` | GET | 个性化推荐 |
| `GET /api/validation/trend?channel=CCTV1` | GET | 频道测速趋势 |
| `GET /api/source/report` | GET | 源质量报告 |
| `GET /api/source/active` | GET | 活跃源列表 |
| `POST /api/source/status?url=xxx&status=active` | POST | 设置源状态 |
| `GET /api/health/score` | GET | 健康评分分布 |
| `GET /api/health/score?channel=CCTV1` | GET | 单频道健康评分 |
| `GET /api/source/discovery` | GET | 源发现历史 |
| `POST /api/source/discovery` | POST | 触发源发现 |
| `GET /api/user/favorites` | GET | 收藏频道列表 |
| `POST /api/user/favorites` | POST | 添加收藏 |
| `DELETE /api/user/favorites` | DELETE | 移除收藏 |
| `GET /api/stream/{channelId}` | GET | 流代理（支持 `?proxy=1`） |
| `GET /dashboard` | GET | Web 仪表盘 |
| `GET /player` | GET | Web 播放器 |
| `GET /admin` | GET | 管理后台 |
| `GET /api/admin/cron/status` | GET | Cron 状态（需 API Key） |
| `POST /api/admin/cron/trigger` | POST | 手动触发采集（需 API Key） |

---

## One-Click Deploy / 一键部署

### Option 1: Deploy via CLI / 命令行部署

```bash
# 1. Clone the repository / 克隆仓库
git clone https://github.com/your-username/IPTVx.git
cd IPTVx

# 2. Install dependencies / 安装依赖
npm install

# 3. Login to Cloudflare / 登录 Cloudflare
npx wrangler login

# 4. Create KV namespace / 创建 KV 命名空间
npx wrangler kv:namespace create IPTV_KV

# 5. Update wrangler.toml with the KV ID / 更新 KV ID
# Edit kv_namespaces.id in wrangler.toml

# 6. Deploy / 部署
npm run deploy
```

### Option 2: Deploy via Cloudflare Dashboard / 控制台部署

1. Fork 此仓库到你的 GitHub 账号
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
3. 进入 **Workers & Pages** → **Create Application** → **Connect to Git**
4. 选择你 Fork 的仓库
5. 设置构建命令：`npm install`，部署命令：`npx wrangler deploy`
6. 在 **Settings** → **Variables** 中添加环境变量：
   - `ADMIN_API_KEY`: 你的管理 API 密钥
7. 点击 **Deploy**

### Option 3: Deploy via Wrangler CLI (Recommended) / CLI 部署（推荐）

```bash
# 安装 Wrangler CLI
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 克隆项目
git clone https://github.com/your-username/IPTVx.git && cd IPTVx

# 安装依赖
npm install

# 创建 D1 数据库
wrangler d1 create iptvx-db
# 复制输出的 database_id 到 wrangler.toml

# 创建 KV 命名空间
wrangler kv:namespace create IPTV_KV
# 复制输出的 id 到 wrangler.toml

# 部署
wrangler deploy

# 验证部署
curl https://<your-worker>.workers.dev/health
```

### Post-Deploy Setup / 部署后配置

```bash
# 1. 手动触发首次采集
curl -X POST https://<your-domain>/api/admin/cron/trigger \
  -H "X-API-Key: your-admin-api-key"

# 2. 等待 1-3 分钟后检查状态
curl https://<your-domain>/health

# 3. 查看频道统计
curl https://<your-domain>/api/stats

# 4. 获取播放列表
curl https://<your-domain>/iptv.m3u
```

---

## Configuration / 配置

### 环境变量 / Environment Variables

| Variable | Description / 说明 | Default |
|----------|-------------------|---------|
| `ADMIN_API_KEY` | 管理 API 密钥 / Admin API key | `admin-key` |
| `IPTVX_BASE_URL` | 服务基础 URL / Base URL | `https://iptvx.***.workers.dev` |

### 频道白名单 / Channel Whitelist

在 `config/config.js` 中配置要保留的频道：

```javascript
CHANNEL_WHITELIST: {
  enabled: true,
  cctv: ['CCTV1', 'CCTV2', /* ... */],          // 央视频道
  satellite: ['湖南卫视', '浙江卫视', /* ... */],  // 卫视频道
  hkmo: ['凤凰中文', 'TVB翡翠台', /* ... */],      // 港澳台
  sports_patterns: [/CCTV5.*体育/i, /* ... */],   // 体育频道正则
  movies_patterns: [/CHC.*影院/i, /* ... */],      // 影视频道正则
  kids_patterns: [/少儿/i, /* ... */],             // 少儿频道正则
}
```

### 直播源配置 / Source Configuration

```javascript
SOURCE_LIST: [
  'https://raw.githubusercontent.com/Jsnzkpg/Jsnzkpg/Jsnzkpg/Jsnzkpg1.m3u',
  'https://raw.githubusercontent.com/Kimentanm/aptv/master/m3u/iptv.m3u',
  'https://iptv.yang-1989.eu.org/m3u/Gather.m3u',
  // Add more sources here...
],
```

### 咖啡直播 / Kafei Live Sports

```javascript
KAFEI_SOURCE: {
  enabled: true,
  apiUrl: 'https://www.kafeizhibo.com/api/v1/archor',
  crawlIntervalMs: 30 * 60 * 1000, // 30 minutes
}
```

---

## Project Structure / 项目结构

```
IPTVx/
├── config/
│   └── config.js              # 源列表、白名单、策略配置
├── cron/
│   └── updateSources.js       # Cron 定时任务入口
├── scripts/
│   ├── crawl-kafei.js         # 咖啡直播爬虫
│   └── crawl-migu.js          # 咪咕体育爬虫
├── tests/
│   ├── ai.test.js             # AI 模块单元测试
│   ├── parser.test.js         # 解析器单元测试
│   ├── phase4.test.js         # 高级功能测试
│   ├── validator-lite.test.js # 轻量测速测试
│   └── validator.test.js      # 测速模块测试
├── worker/
│   ├── index.js               # Worker 主入口 + 路由
│   ├── routes/
│   │   ├── api.js             # RESTful API 路由
│   │   ├── epg.js             # EPG 生成路由
│   │   ├── m3u.js             # M3U 播放列表路由
│   │   ├── stream.js          # 流代理路由
│   │   ├── user.js            # 用户偏好/收藏路由
│   │   ├── auth.js            # 认证路由
│   │   ├── player.js          # 播放器页面
│   │   └── admin.js           # 管理后台
│   ├── services/
│   │   ├── ai.js              # AI 频道标准化/分类/去重
│   │   ├── aiAdvanced.js      # 高级 AI 处理
│   │   ├── aiLLM.js           # LLM 模式接入
│   │   ├── collector.js       # 多源聚合 + 咖啡直播爬取
│   │   ├── epg.js             # EPG 生成逻辑
│   │   ├── validator.js       # 频道健康检查/测速
│   │   ├── validationHistory.js # 测速历史持久化
│   │   ├── sourceManager.js   # 源池管理
│   │   ├── sourceDiscovery.js # 源自动发现
│   │   ├── healthScore.js     # 健康评分体系
│   │   ├── logo.js            # Logo 自动补全
│   │   ├── fallback.js        # 流 fallback + HLS 代理
│   │   ├── router.js          # 智能源路由
│   │   ├── recommend.js       # 个性化推荐
│   │   ├── metrics.js         # 访问指标
│   │   ├── auth.js            # 认证服务
│   │   ├── bootstrap.js       # 自动引导
│   │   └── db.js              # D1 数据库同步
│   ├── middleware/
│   │   └── request.js         # 请求中间件
│   └── utils/
│       ├── cache.js           # KV 缓存操作
│       ├── crypto.js          # 加密工具
│       ├── fetch.js           # Fetch 封装
│       ├── logger.js          # 日志工具
│       ├── parser.js          # M3U 解析器
│       └── validator-lite.js  # 轻量测速
├── wrangler.toml              # Cloudflare Workers 配置
├── package.json
└── README.md
```

---

## API Documentation / API 文档

### `GET /iptv.m3u`

返回 M3U 格式的播放列表。

**Response Headers / 响应头:**

```
Content-Type: application/vnd.apple.mpegurl
Access-Control-Allow-Origin: *
```

### `GET /health`

返回服务健康状态。

**Response / 响应:**

```json
{
  "status": "ok",
  "channels": 108,
  "healthy": 0,
  "unstable": 0,
  "dead": 0,
  "unknown": 251,
  "updated_at": "2026-05-20T01:28:38.226Z",
  "playlist_ready": true
}
```

### `GET /api/stats`

返回频道统计信息。

**Response / 响应:**

```json
{
  "channels": 108,
  "byCategory": {
    "央视频道": 24,
    "卫视频道": 32,
    "港澳台": 16,
    "体育": 18,
    "影视": 4,
    "少儿动漫": 14
  },
  "topChannels": [...]
}
```

### `POST /api/admin/cron/trigger`

手动触发采集流水线。

**Headers / 请求头:**

```
X-API-Key: your-admin-api-key
```

---

## FAQ / 常见问题

### Q: 为什么有些频道无法播放？/ Why can't some channels be played?

A: IPTV 源的可用性取决于源服务器。Cron 每小时自动刷新，失效频道会被自动剔除。
A: Channel availability depends on source servers. Cron auto-refreshes hourly, dead channels are removed.

### Q: 如何添加自定义频道？/ How to add custom channels?

A: 在 `config/config.js` 的 `MIGU_SOURCE.staticList` 中添加静态源。
A: Add static sources in `MIGU_SOURCE.staticList` in `config/config.js`.

### Q: 部署成本是多少？/ What is the deployment cost?

A: **零成本**。Cloudflare Workers 免费套餐包含 10 万次请求/天，足够个人使用。
A: **Zero cost**. Cloudflare Workers free tier includes 100K requests/day, sufficient for personal use.

### Q: 如何更新源列表？/ How to update source list?

A: 编辑 `config/config.js` 中的 `SOURCE_LIST`，然后重新部署。
A: Edit `SOURCE_LIST` in `config/config.js` and redeploy.

---

## License / 许可证

MIT License — see [LICENSE](LICENSE) for details.

---

## Star History / Star 趋势

[![Star History Chart](https://api.star-history.com/svg?repos=your-username/IPTVx&type=Date)](https://star-history.com/#your-username/IPTVx&Date)

---

## Contributing / 贡献

欢迎提交 Issue 和 Pull Request！ / Issues and Pull Requests are welcome!

---

<div align="center">

**Made with ❤️ for the IPTV community**

[Report Bug](https://github.com/your-username/IPTVx/issues) · [Request Feature](https://github.com/your-username/IPTVx/issues)

</div>
