# IPTV 智能边缘平台 — 项目需求明细（PRD v1.0）

## 一、项目概述

### 1.1 项目名称

```text
IPTVx
（IPTV 智能边缘平台）
```

---

## 1.2 项目目标

构建一个基于：

* Cloudflare Workers
* Edge Computing
* AI 智能分析
* 多源聚合
* 自动测速
* EPG 自动生成

的高可用 IPTV 智能平台。

平台目标：

```text
让 IPTV：
更稳定
更智能
更易维护
更低成本
```

---

# 二、核心问题

当前 IPTV 项目普遍存在：

| 问题         | 描述        |
| ---------- | --------- |
| 源失效快       | m3u 经常失效  |
| GitHub 不稳定 | 国内访问困难    |
| 无测速        | 用户随机命中垃圾源 |
| 无智能分类      | 频道命名混乱    |
| 无 EPG      | 用户体验差     |
| 无地区优化      | 不同运营商体验极差 |
| 无自动维护      | 需要人工维护    |

本项目目标是：

```text
实现自动化、智能化、边缘化 IPTV 平台
```

---

# 三、项目总体架构

```text
数据源
    ↓
Source Collector（采集器）
    ↓
Parser（解析器）
    ↓
AI Normalize（AI标准化）
    ↓
Validator（测速/健康检测）
    ↓
D1/KV 存储
    ↓
Smart Router（智能路由）
    ↓
用户访问
```

---

# 四、功能需求

# 4.1 Source Collector（源采集模块）

## 功能目标

自动采集 IPTV 数据源。

---

## 输入源类型

支持：

| 类型           | 示例                    |
| ------------ | --------------------- |
| GitHub m3u   | judy-gotv             |
| GitHub Raw   | raw.githubusercontent |
| jsDelivr CDN | cdn.jsdelivr.net      |
| 公开 m3u 地址    | http/https            |
| 用户自定义源       | upload/url            |
| Telegram（后期） | bot/channel           |

---

## 功能需求

### 基础功能

* 支持多源并发拉取
* 支持超时控制
* 支持重试
* 支持 gzip
* 支持缓存

---

## 数据输出

统一转换为：

```json
{
  "channel": "",
  "url": "",
  "group": "",
  "logo": "",
  "source": ""
}
```

---

# 4.2 Parser（解析模块）

## 功能目标

解析：

```text
m3u
m3u8
txt
xmltv
```

---

## 功能需求

### m3u解析

解析：

* EXTINF
* tvg-name
* tvg-logo
* group-title

---

## 输出格式

```json
{
  "name": "CCTV1",
  "group": "央视",
  "logo": "",
  "stream_url": ""
}
```

---

# 4.3 AI Normalize（AI标准化模块）

## 功能目标

解决：

```text
频道名称不统一
重复频道
分类混乱
```

---

## 功能需求

### 频道标准化

例如：

| 原始名称      | 标准化结果 |
| --------- | ----- |
| CCTV-1 HD | CCTV1 |
| CCTV1 综合  | CCTV1 |
| 央视1套      | CCTV1 |

---

## AI能力

### 使用方式

支持：

| 模式         | 说明    |
| ---------- | ----- |
| Rule-based | 正则    |
| Embedding  | 向量相似度 |
| LLM        | 大模型分类 |

---

## 输出格式

```json
{
  "raw_name": "",
  "normalized_name": "",
  "category": "",
  "region": "",
  "quality": ""
}
```

---

# 4.4 Validator（测速与健康检测模块）

## 功能目标

自动检测：

* 可用性
* 延迟
* 稳定性
* 地区可达性

---

## 功能需求

### 检测类型

| 类型      | 说明    |
| ------- | ----- |
| HEAD 检测 | 是否在线  |
| m3u8解析  | 是否可播放 |
| ts拉流    | 流畅度   |
| 首包时间    | 延迟    |
| 地区测试    | 国内/海外 |

---

## 状态机

| 状态       | 描述  |
| -------- | --- |
| healthy  | 正常  |
| unstable | 不稳定 |
| dead     | 已失效 |

---

## 自动处理

### 自动剔除

连续失败 N 次：

```text
自动下线
```

---

## 数据输出

```json
{
  "url": "",
  "latency": 120,
  "status": "healthy",
  "success_rate": 0.98
}
```

---

# 4.5 Smart Router（智能路由模块）

## 功能目标

根据：

* 用户地区
* 运营商
* 延迟
* 稳定性

返回最佳源。

---

## 功能需求

### 用户地区识别

识别：

* 国家
* 城市
* ISP

---

## 智能优选

例如：

```text
上海电信
→ 返回上海最快源
```

---

## Fallback机制

主源失败：

```text
自动切换备用源
```

---

# 4.6 EPG 模块

## 功能目标

自动生成节目单。

---

## 数据来源

支持：

| 来源           | 示例    |
| ------------ | ----- |
| iptv-org/epg | XMLTV |
| 第三方 XMLTV    | xml   |
| AI 自动生成      | LLM   |

---

## 功能需求

### 自动匹配频道

根据：

```text
normalized_name
```

匹配 EPG。

---

## 输出

```xml
<programme>
</programme>
```

---

# 4.7 多源聚合模块

## 功能目标

一个频道：

```text
多个源
```

---

## 功能需求

### 去重

相同频道：

```text
自动聚合
```

---

## 排序

根据：

* latency
* success_rate
* region

排序。

---

# 4.8 KV 缓存模块

## 功能目标

减少：

* GitHub 请求
* 实时测速压力

---

## 缓存内容

| Key      | 内容    |
| -------- | ----- |
| playlist | m3u   |
| epg      | xml   |
| health   | 健康数据  |
| channels | 标准化数据 |

---

# 4.9 D1 数据库模块

## 功能目标

持久化：

* 频道
* 源
* 健康状态
* 用户数据

---

## 表结构

---

### channels

```sql
CREATE TABLE channels (
  id INTEGER PRIMARY KEY,
  name TEXT,
  normalized_name TEXT,
  category TEXT,
  region TEXT
);
```

---

### streams

```sql
CREATE TABLE streams (
  id INTEGER PRIMARY KEY,
  channel_id INTEGER,
  url TEXT,
  latency INTEGER,
  status TEXT
);
```

---

# 五、非功能需求

# 5.1 性能需求

| 指标       | 要求      |
| -------- | ------- |
| Worker响应 | < 500ms |
| m3u生成    | < 2s    |
| 首屏播放     | < 3s    |

---

# 5.2 稳定性需求

| 指标         | 要求    |
| ---------- | ----- |
| 可用性        | 99.9% |
| 自动恢复       | 支持    |
| 多源fallback | 支持    |

---

# 5.3 可扩展性

支持：

* AI模块扩展
* 多地区节点
* 多平台播放器

---

# 六、AI 功能需求

# 6.1 AI频道分类

自动分类：

* 体育
* 新闻
* 港澳
* 电影
* 少儿

---

# 6.2 AI 去重

判断：

```text
是否同一频道
```

---

# 6.3 AI 推荐

根据：

* 用户地区
* ISP
* 历史质量

推荐最佳源。

---

# 七、API需求

# 7.1 IPTV API

## GET /iptv.m3u

返回：

```text
m3u
```

---

# 7.2 EPG API

## GET /epg.xml

返回：

```xml
xmltv
```

---

# 7.3 Health API

## GET /health

返回：

```json
{
  "healthy": 1234,
  "dead": 200
}
```

---

# 八、部署需求

# 8.1 Cloudflare Workers

运行：

* API
* Router
* Validator

---

# 8.2 Cloudflare KV

缓存：

* m3u
* epg
* health

---

# 8.3 Cloudflare D1

存储：

* channels
* streams
* metrics

---

# 九、未来扩展

# 9.1 SaaS 化

支持：

* 用户系统
* API Key
* 订阅

---

# 9.2 Web播放器

支持：

* HLS.js
* DPlayer
* ArtPlayer

---

# 9.3 AI 高级能力

包括：

* OCR Logo识别
* AI 内容分类
* AI 广告检测
* AI 违规检测

---

# 十、项目阶段规划

| 阶段      | 目标               |
| ------- | ---------------- |
| Phase 1 | Worker + KV + 聚合 |
| Phase 2 | Validator + 智能测速 |
| Phase 3 | AI 标准化 + EPG     |
| Phase 4 | SaaS + 推荐系统      |
