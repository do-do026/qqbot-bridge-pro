# QQ Bot 增强包（qqbot-pro）架构与实施路线图

> 版本：v0.1（架构草案）
> 日期：2026-08-06
> 状态：📋 待评审
> 作者：渡渡 & 初尘

---

## 1. 背景与目标

### 1.1 背景

现有 Operit 工具包 `com.operit.qqbot_bundle`（v0.3.0）已实现 QQ Bot 的基础能力：

- ✅ Gateway WebSocket 收消息（C2C / 群消息）
- ✅ 发送单聊/群聊文本
- ✅ 发送图片（整文件上传 + 富媒体）
- ✅ 自动回复桥（轮询 → Operit 对话 → AI → 回复 QQ）

但对照官方 v2 文档，仍有大量**可实现而未实现**的能力（详见第 2 节差距分析）。

### 1.2 目标

在不破坏、不顶替原包的前提下，建设一个**增强包 `qqbot-pro`**，按优先级补齐官方 API 能力，同时保持原包稳定性：

1. 补齐高频刚需（撤回、Markdown、查询类）
2. 升级体验类（官方流式、引用、输入状态）
3. 交互类（键盘按钮、事件放开）
4. 大文件类（分片上传、多类型富媒体）
5. 进阶类（多账号、Webhook、安全加固）

### 1.3 非目标（明确不做）

- ❌ 不重写原包 Gateway 核心（复用其 Python WebSocket 服务）
- ❌ 不接管原包的配置/状态文件（独立配置，可共存）
- ❌ 不实现频道（guild）体系（体量过大，作为独立后续项目评估）
- ❌ 不做 UI 界面（保持工具化，由 AI 自主调用）

---

## 2. 现状盘点

### 2.1 原包能力矩阵（`com.operit.qqbot_bundle` v0.3.0）

| 能力 | 子包 | 实现方式 | 状态 |
|---|---|---|---|
| AppID/AppSecret/沙箱配置 | qqbot | 持久化 config.json | ✅ |
| Gateway WebSocket 收消息 | qqbot | Python 服务（IDENTIFY/HEARTBEAT/RESUME） | ✅ |
| 事件队列读取/清空 | qqbot | 本地 HTTP 控制端口 | ✅ |
| 凭证测试 | qqbot | token 获取 + gateway 探测 | ✅ |
| 发送单聊文本 | qqbot | POST /v2/users/{openid}/messages (msg_type=0) | ✅ |
| 发送群聊文本 | qqbot | POST /v2/groups/{openid}/messages (msg_type=0) | ✅ |
| 发送图片 | qqbot | 整文件上传（curl）+ msg_type=7 | ✅（仅图片） |
| 自动回复桥 | qqbot_auto_reply | 轮询 + Operit Chat + 回复 | ✅ |
| 流式逐句回复（伪流式） | qqbot_auto_reply | AI 分句 + msg_seq 递增逐条发送 | ⚠️ 非官方流式 |
| 附件下载 | qqbot_auto_reply | 事件 attachments → 本地 | ✅ |
| 角色卡绑定/会话分组 | qqbot_auto_reply | Operit Chat API | ✅ |

### 2.2 官方 API 差距清单（可实现未实现）

#### A. 消息发送层

| # | 能力 | 官方端点 | 差距说明 | 优先级 |
|---|---|---|---|---|
| A1 | **Markdown 消息** | msg_type=2 | 原包只发纯文本 | 🔴 P0 |
| A2 | **官方流式消息** | POST /v2/users/{openid}/stream_messages | 原包"流式"是伪流式（多条独立消息） | 🔴 P0 |
| A3 | **撤回消息** | DELETE /messages/{id}（单聊+群聊） | 完全未实现 | 🔴 P0 |
| A4 | **引用回复** | message_reference 字段 | 未实现 | 🟡 P1 |
| A5 | **内嵌键盘** | keyboard 字段 | 未实现 | 🟡 P1 |
| A6 | **输入中状态** | msg_type=6 input_notify | 未实现 | 🟢 P2 |
| A7 | **互动召回** | is_wakeup | 未实现 | 🟢 P2 |
| A8 | **ARK/图文卡片** | msg_type=8 | 未实现 | 🟢 P2 |

#### B. 富媒体层

| # | 能力 | 官方端点 | 差距说明 | 优先级 |
|---|---|---|---|---|
| B1 | **视频/语音/文件发送** | file_type=2/3/4 | 现有工具只定位图片 | 🟡 P1 |
| B2 | **分片上传** | upload_prepare / part_finish | 只整文件上传，大文件受限 | 🟡 P1 |
| B3 | 上传即发送 | srv_send_msg=true | 未实现 | 🟢 P2 |

#### C. 查询/管理层

| # | 能力 | 官方端点 | 差距说明 | 优先级 |
|---|---|---|---|---|
| C1 | **群信息查询** | GET /v2/groups/{openid}/info | 未实现 | 🟡 P1 |
| C2 | **机器人群状态** | GET /v2/groups/{openid}/bot_state | 未实现 | 🟡 P1 |
| C3 | 机器人资料 | GET /users/@me | 未实现 | 🟢 P2 |

#### D. 事件层

| # | 能力 | 官方事件 | 差距说明 | 优先级 |
|---|---|---|---|---|
| D1 | **事件放开** | GROUP_ADD_ROBOT / GROUP_MEMBER_ADD / FRIEND_DEL 等 | Gateway 只过滤 C2C_*/GROUP_*/FRIEND_* 消息事件 | 🟡 P1 |
| D2 | **按钮回调** | INTERACTION_CREATE | 未处理（配合 A5 键盘） | 🟡 P1 |
| D3 | 被动消息状态 | C2C_MSG_RECEIVE / REJECT 等 | 未处理 | 🟢 P2 |
| D4 | 引用消息解析 | msg_elements 嵌套结构 | 未解析 | 🟢 P2 |
| D5 | 语音 ASR 文本 | asr_refer_text | 未利用 | 🟢 P2 |

#### E. 架构/工程层

| # | 能力 | 说明 | 优先级 |
|---|---|---|---|
| E1 | **Webhook 模式** | 官方支持 Ed25519 签名 HTTP 回调，与 WebSocket 并列 | 🟠 P3 |
| E2 | **多账号** | 单配置单账号，无法多机器人 | 🟠 P3 |
| E3 | SSRF 防护 | 附件下载不校验 URL | 🟡 P1（安全） |
| E4 | Markdown 感知分块 | 长回复按代码块感知切分 | 🟢 P2 |
| E5 | 频道体系 | 子频道消息/频道管理/论坛等（sitemap 数十端点） | ⚫ 不做 |

---

## 3. 设计原则

### 3.1 不顶替原包（核心约束）

```
com.operit.qqbot_bundle（原包）  ——  保持不动，继续可用
        │
        │ 复用（只读引用）
        ▼
com.operit.qqbot_pro（新包）  ——  独立安装、独立配置、独立版本
```

- **复用**：新包直接复用原包的 `qqbot_gateway_service.py`（Python Gateway）、`qqbot_state.ts` 状态管理思路
- **隔离**：新包使用独立的 `toolpkg_id`（`com.operit.qqbot_pro`），配置写入独立文件，不触碰原包 config.json
- **兼容**：新包安装/卸载不影响原包；两者可同时启用（但不建议同时跑两个 Gateway 连接同一 AppID——同账号多连接会被挤下线，这一点要在文档中标注）

### 3.2 分层架构

```
┌─────────────────────────────────────────────────┐
│  工具层（Operit Tools 暴露面）                      │
│  qqbot_pro_send / recall / stream / keyboard ... │
├─────────────────────────────────────────────────┤
│  业务层（组合与编排）                               │
│  自动回复增强、按钮交互、多账号路由                    │
├─────────────────────────────────────────────────┤
│  协议层（OpenAPI 客户端扩展）                       │
│  buildSendBody / upload / stream session / query │
├─────────────────────────────────────────────────┤
│  传输层（收消息）                                   │
│  复用原包 Gateway（WebSocket）→ 事件管道             │
└─────────────────────────────────────────────────┘
```

### 3.3 包结构规划

```
com.operit.qqbot_pro/
├── manifest.json            # 包元数据（独立 toolpkg_id）
├── resources/
│   └── qqbot_pro_gateway.py # v2 版 Gateway（在原件上扩展事件过滤，不改原件）
├── src/
│   ├── packages/
│   │   ├── qqbot_pro.ts     # 基础增强工具
│   │   └── qqbot_pro_auto.ts# 自动回复增强
│   └── shared/
│       ├── openapi_v2.ts    # 扩展 API 客户端
│       ├── stream_session.ts# 官方流式会话管理
│       ├── upload_chunk.ts  # 分片上传
│       ├── keyboard.ts      # 键盘构造/解析
│       ├── event_router.ts  # 事件分类路由
│       └── config_v2.ts     # 独立配置
└── dist/
```

---

## 4. 任务清单与工期评估

### 4.1 难度分级标准

| 级别 | 含义 | 参考工期 |
|---|---|---|
| 🟢 轻量 | 单文件小改动，无新依赖 | 0.5 天（半个工期） |
| 🟡 中等 | 涉及 1-2 个模块，需联调 | 1 个工期 |
| 🟠 较重 | 跨模块，需设计 | 2-3 个工期 |
| 🔴 重型 | 新子系统 | 独立里程碑 |

### 4.2 单工期可完成的任务（轻量，可独立交付）

| 任务 | 级别 | 改动点 | 验收标准 |
|---|---|---|---|
| T01 撤回消息 | 🟢 | openapi_v2 加 DELETE 调用；新增 `qqbot_pro_recall` 工具 | 能撤回 2 分钟内自己发的单聊/群聊消息 |
| T02 Markdown 发送 | 🟢 | buildSendBody 支持 msg_type=2 + markdown 字段 | 单聊/群聊可发 Markdown，渲染正常 |
| T03 群信息查询 | 🟢 | 新增 `qqbot_pro_group_info` 工具 | 返回群名、人数等 |
| T04 机器人群状态 | 🟢 | 新增 `qqbot_pro_bot_state` 工具 | 返回机器人在群内状态 |
| T05 事件放开 | 🟢 | Gateway 过滤函数扩展白名单 | GROUP_MEMBER_ADD 等事件入队可见 |
| T06 引用回复 | 🟡 | buildSendBody 支持 message_reference | 回复带引用样式 |
| T07 输入中状态 | 🟢 | 新增 msg_type=6 发送 | 对方可见"正在输入" |
| T08 机器人资料 | 🟢 | GET /users/@me | 返回机器人昵称/头像 |

> **小计**：T01-T08 合计约 **1.5-2 个工期**，是第一批交付物，价值密度最高。

### 4.3 需拆分为多个小任务的工作（拼装式）

#### W1：官方流式消息（A2）——约 2-3 个工期

| 子任务 | 内容 | 依赖 |
|---|---|---|
| W1.1 | stream session 管理（stream_msg_id 生命周期） | 无 |
| W1.2 | 首片/续片/结束片三态发送 | W1.1 |
| W1.3 | 与 AI 流式输出衔接（Operit Chat 流式 → QQ 流式分片） | W1.2 + T02 |
| W1.4 | 错误处理与超时（40007 前缀不可改 / 50002 频控） | W1.2 |

#### W2：键盘按钮交互（A5+D2）——约 2-3 个工期

| 子任务 | 内容 | 依赖 |
|---|---|---|
| W2.1 | 键盘构造器（rows/buttons/action 序列化） | T02 |
| W2.2 | 发送端支持 keyboard 字段 | W2.1 |
| W2.3 | INTERACTION_CREATE 事件放开 + 解析 | T05 |
| W2.4 | 回调响应（PUT /interactions/{id}） | W2.3 |
| W2.5 | 与自动回复桥集成（按钮触发指令 → AI） | W2.4 |

#### W3：分片上传（B2）——约 2-3 个工期

| 子任务 | 内容 | 依赖 |
|---|---|---|
| W3.1 | upload_prepare（获取 upload_id/block_size/预签名 URL） | 无 |
| W3.2 | 分片 PUT + part_finish | W3.1 |
| W3.3 | 合并完成（POST /files 带 upload_id） | W3.2 |
| W3.4 | 断点重试 + 大小阈值（>20MB 自动走分片） | W3.3 |

#### W4：多类型富媒体（B1）——1-2 个工期

| 子任务 | 内容 | 依赖 |
|---|---|---|
| W4.1 | 通用媒体工具（file_type 1-4 全支持） | 无 |
| W4.2 | 与 W3 分片集成（大视频自动分片） | W3 |

#### W5：多账号（E2）——约 3-4 个工期（架构级）

| 子任务 | 内容 | 依赖 |
|---|---|---|
| W5.1 | 配置模型重构（账号数组） | 无 |
| W5.2 | Gateway 多实例管理 | W5.1 |
| W5.3 | 事件路由（按账号/会话分发） | W5.2 |
| W5.4 | 自动回复桥多账号化 | W5.3 |

### 4.4 重型任务（独立里程碑，暂缓）

| 任务 | 说明 | 建议 |
|---|---|---|
| Webhook 模式（E1） | Ed25519 验签 + HTTP 服务 + 与 Gateway 切换 | 放到 M6，先做 WebSocket 增强 |
| 频道体系（E5） | 数十个端点 | 明确不做，独立评估 |
| SSRF 防护（E3） | 附件下载 URL 校验（DNS 解析 + 内网段拒绝） | 可拆为单工期，建议优先做 |

---

## 5. 实施路线图（里程碑）

```
M0 ── 架构与仓库（本次）✅
   │
M1 ── 轻量包：撤回 + Markdown + 查询 + 事件放开（T01-T05）        [1 工期]
   │
M2 ── 体验包：引用 + 输入状态 + 机器人资料 + SSRF 防护（T06-T08+E3）[1 工期]
   │
M3 ── 流式包：官方流式消息（W1）                                  [2-3 工期]
   │
M4 ── 交互包：键盘按钮 + INTERACTION_CREATE（W2）                [2-3 工期]
   │
M5 ── 媒体包：多类型富媒体 + 分片上传（W4 + W3）                  [3-4 工期]
   │
M6 ── 架构包：多账号 + Webhook（W5 + E1）                        [4-5 工期]
   │
M7 ──（评估）频道体系
```

**关键路径**：M1 → M2 → M3 → M4，其中 M3 依赖 M1 的 Markdown（W1.3 需要流式发 Markdown）。

**并行可行性**：M1、M2 可并行；M4 的 W2.1/W2.2 不依赖 M3，可与 M3 并行。

---

## 6. 风险与对策

| 风险 | 等级 | 对策 |
|---|---|---|
| 原包 Gateway 事件过滤写死，放开后事件量暴增 | 🟡 | 事件放开做成可配置白名单，默认保守 |
| 官方流式接口 40007（前缀不可改）导致消息错乱 | 🔴 | W1.4 严格按文档实现 append/replace 模式，先实现 replace |
| 同 AppID 双 Gateway 连接互踢 | 🔴 | 文档明确警告：pro 与原包不可同时启用同账号；提供检测逻辑 |
| 键盘按钮权限滥用 | 🟡 | 按钮 permission 字段默认 type=2（所有人），敏感操作由 AI 二次确认 |
| 分片上传网络中断 | 🟡 | 预签名 URL 可重试；part_finish 幂等 |
| fine-grained PAT 无 repo 写权限 | 🟢 | 已确认 do-do026 token 含 repo 权限（2026-08-06 验证） |
| 包市场审核 | 🟢 | 若上架市场，需按 Operit 包规范补齐描述/截图 |

---

## 7. 附录

### 7.1 官方 v2 API 对照表（完整）

| 官方端点 | 方法 | 原包 | qqbot-pro |
|---|---|---|---|
| /v2/users/{openid}/messages | POST | ✅ 文本 | +Markdown/键盘/引用/输入态/卡片 |
| /v2/users/{openid}/stream_messages | POST | ❌ | ✅ W1 |
| /v2/users/{openid}/messages/{id} | DELETE | ❌ | ✅ T01 |
| /v2/users/{openid}/files | POST | ✅ 图片 | +视频/语音/文件 +分片 |
| /v2/groups/{openid}/messages | POST | ✅ 文本 | +Markdown/键盘/引用/卡片 |
| /v2/groups/{openid}/messages/{id} | DELETE | ❌ | ✅ T01 |
| /v2/groups/{openid}/files | POST | ✅ 图片 | +多类型 +分片 |
| /v2/groups/{openid}/info | GET | ❌ | ✅ T03 |
| /v2/groups/{openid}/bot_state | GET | ❌ | ✅ T04 |
| /users/@me | GET | ❌ | ✅ T08 |
| /gateway | GET | ✅ | 复用 |
| /v2/groups/{gid}/upload_prepare | POST | ❌ | ✅ W3 |
| /v2/users/{uid}/upload_prepare | POST | ❌ | ✅ W3 |
| /v2/groups/{gid}/upload_part_finish | POST | ❌ | ✅ W3 |
| /v2/users/{uid}/upload_part_finish | POST | ❌ | ✅ W3 |
| /interactions/{id} | PUT | ❌ | ✅ W2.4 |
| /v2/generate_url_link | POST | ❌ | 评估 |

### 7.2 事件订阅对照表

| 事件 | 原包 | qqbot-pro |
|---|---|---|
| C2C_MESSAGE_CREATE | ✅ | 复用 |
| GROUP_AT_MESSAGE_CREATE | ✅ | 复用 |
| GROUP_MESSAGE_CREATE | ✅ | 复用 |
| FRIEND_ADD | ✅（入队） | 解析 |
| GROUP_ADD_ROBOT / DEL_ROBOT | ❌ | ✅ T05 |
| GROUP_MEMBER_ADD / REMOVE | ❌ | ✅ T05 |
| FRIEND_DEL | ❌ | ✅ T05 |
| INTERACTION_CREATE | ❌ | ✅ W2 |
| C2C_MSG_RECEIVE / REJECT | ❌ | 评估 |
| GROUP_MSG_RECEIVE / REJECT | ❌ | 评估 |
| SUBSCRIBE_MESSAGE_STATUS | ❌ | 评估 |

---

*本文档为架构草案，任务编号（T/W）为实施锚点。任何任务开工前，先在本仓库开 Issue 引用对应编号。*
