# IPTVx

IPTVx/
├─ README.md
├─ package.json
├─ wrangler.toml           # Cloudflare Worker 配置
├─ worker/
│  ├─ index.js            # Worker 主入口
│  ├─ routes/
│  │  ├─ api.js           # API路由
│  │  ├─ m3u.js           # IPTV m3u生成路由
│  │  └─ epg.js           # EPG生成路由
│  ├─ services/
│  │  ├─ collector.js     # 拉取源/多源聚合
│  │  ├─ validator.js     # 自动测速/健康检查
│  │  ├─ ai.js            # AI频道标准化/分类/去重
│  │  └─ epg.js           # EPG生成逻辑
│  └─ utils/
│     ├─ fetch.js         # 通用fetch封装
│     ├─ cache.js         # KV操作封装
│     └─ logger.js        # 日志工具
├─ cron/
│  └─ updateSources.js    # 定时拉取源/测速/更新KV
├─ config/
│  └─ config.js           # 源地址列表、测速策略、EPG源
└─ tests/                 # 单元测试

# **阶段1：基础架构（Worker + KV缓存）**

### TODO

1.  Worker 主入口 `index.js` 搭建 
    -  路由 `/iptv.m3u` 返回 KV 缓存 m3u 
    -  路由 `/` 返回健康检查 
2.  KV 命名空间绑定 
    -  存储 key: `playlist`
3.  Cron 定时触发 
    -  每小时更新 KV 
4.  Collector 模块 
    -  拉取 judy-gotv + iptv-org 源 
    -  合并成统一 m3u 
5.  简单失效过滤 
    -  过滤 udp:// / rtp:// 或空行 

### 核心伪代码

```plain
// worker/routes/m3u.js
import { getKV, setKV } from '../utils/cache.js';
import { collectSources } from '../services/collector.js';

export async function handleM3U(request, env) {
    let playlist = await getKV(env, 'playlist');
    if (!playlist) {
        playlist = await collectSources();
        await setKV(env, 'playlist', playlist);
    }
    return new Response(playlist, { headers: { 'Content-Type': 'application/vnd.apple.mpegurl' }});
}
```

---

# **阶段2：增强功能（多源 + 自动测速）**

### TODO

1.  Validator 模块 
    -  HEAD 请求/首包时间测速 
    -  超时标记失效源 
2.  多源聚合 
    -  每个频道保留 N 个源 
    -  KV 保存源健康分数 
3.  健康状态机 
    -  healthy / unstable / dead 
4.  地区智能路由 
    -  根据用户IP返回延迟最低源 
5.  Cron 触发测速 & KV更新 
6.  Dashboard 页面 
    -  查看源状态 / 延迟 / 健康度 

### 核心伪代码

```plain
// services/validator.js
export async function validateSource(url) {
    try {
        const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        return res.ok ? 'healthy' : 'dead';
    } catch {
        return 'dead';
    }
}
```

---

# **阶段3：智能化（AI + 自动分类 + EPG）**

### TODO

1.  AI 模块 `services/ai.js`
    -  频道标准化 
    -  分类（体育 / 新闻 / 少儿 / 港澳 / 电影） 
    -  去重（embedding similarity） 
2.  EPG 模块 `services/epg.js`
    -  聚合 iptv-org/epg + XMLTV 
    -  匹配频道名生成 XMLTV 
3.  自动标签系统 
    -  region / quality / genre 
4.  失效源 AI 检测 
    -  OCR logo / 识别广告台 
5.  AI 训练/更新策略 
    -  定期更新 embedding 或分类模型 

### 核心伪代码

```plain
// services/ai.js
export async function normalizeChannel(rawName) {
    // 使用 LLM 或 embedding 去重/标准化
    return await aiModel.normalize(rawName);
}

export async function classifyChannel(name) {
    return await aiModel.classify(name); // 返回分类标签
}
```

---

# **阶段4：SaaS化 / 高级功能**

### TODO

1.  用户系统 
    -  API Key / 登录 / 偏好存储 
2.  个性化推荐 
    -  推荐最优源 / 最佳线路 
3.  Web / App 播放端 
    -  HLS.js / DPlayer / ArtPlayer 
4.  边缘智能路由 
    -  根据用户地区/ISP优选节点 
5.  日志/监控 
    -  延迟 / 健康度 / 用户访问量 
6.  Web后台管理 
    -  频道/源管理 
    -  Cron任务可视化 
7.  AI高级功能 
    -  OCR识别logo 
    -  自动检测广告台/违规源 
    -  AI生成EPG & 分类标签 
8.  高级多源 fallback 
    -  主源失败 → 自动切换备用源 

