# qqbot-pro 系统架构

> 更新日期：2026-08-12  
> 适用工程：`com.operit.qqbot_pro` v0.3.0  
> 读者：维护工程师、评审人员、测试人员和需求方

## 1. 系统目标

`qqbot-pro` 把 QQ Bot 建设成 Operit 的双向消息通道：

```text
QQ 用户或群聊
  → QQ Gateway WebSocket（收消息）
  → 事件分类、上下文缓存、群聚合与会话路由
  → Operit 对话 + 角色卡 + AI 生成回复
  → Waifu 分段、引用锚点、错误处理
  → QQ OpenAPI 回发
```

同时支持反向主动发送：Operit 工作流唤醒 AI 后，AI 可读取已配置的主动发送目标，自行决定是否向 QQ 发送文本或图片。

产品边界：不复制 QQ 客户端、不绕过腾讯平台限制，只提供可解释、可配置、可恢复的 Agent 消息通道。

## 2. 需求原则

### 2.1 身份与隐私

- 联系人 openid 只在对方实际发来消息后进入「已知联系人」状态，不预先把全部联系人注入模型上下文。
- 联系人查询默认只返回 openid 后四位；执行绑定或主动发送时才显式读取完整 openid。
- C2C openid、群 member_openid、QQ 号不是可互换标识，不做未经平台保证的身份合并。
- 用户想被怎样称呼，由显式成员绑定、对话上下文或记忆系统决定，不依赖易变的 QQ 昵称。

### 2.2 会话隔离

- 未绑定 C2C：按 `c2c:{openid}` 创建/复用独立 Operit 对话。
- 指定 C2C：通过 `c2cFixedBindings` 绑定到指定 Operit chatId。
- 群聊：按 `group:{group_openid}` 创建/复用独立对话。
- `target_chat_id` 的群固定目标语义已废弃，仅保留旧配置兼容读取，不参与路由。

### 2.3 群消息成本控制

- Gateway 继续接收普通群消息，但不代表每条都唤醒 AI。
- 触发策略：`at_only`（仅 @）、`keyword_or_at`（@ 或关键词）、`all`（全部）。
- 每个群独立聚合窗口，首条有效触发消息到达时开始计时；窗口时长可配置。
- 普通群消息进入有容量上限的本地缓存，供 automatic / agent_on_demand 上下文使用。
- 单群、全局缓存均按时间淘汰旧条目，避免无限膨胀。

### 2.4 可验证性

能力状态分四档，文档不得用「代码存在」代替「真实平台验证」：

- **代码完成**：src/dist 一致，语法与自动测试通过。
- **已部署**：ToolPkg 已烧录并启用。
- **已验证**：真实 QQ 与 Operit 场景测试成功。
- **产品完成**：配置入口、错误反馈、文档和边界对齐。

## 3. 运行时组件

ToolPkg ID `com.operit.qqbot_pro` 包含三个子包：

| 子包 | 责任 | 核心工具 |
|---|---|---|
| `qqbot_pro_basic` | 基础增强 API | `qqbot_pro_send`（文本/Markdown/引用/输入态）、`qqbot_pro_recall`、`qqbot_pro_group_info`、`qqbot_pro_bot_state`、`qqbot_pro_me` |
| `qqbot_pro_gateway` | 增强版 Gateway 管理 | `qqbot_pro_gateway_start/stop/status`、`qqbot_pro_receive_events`、`qqbot_pro_clear_events`、`qqbot_pro_respond_interaction` |
| `qqbot_pro_bridge` | 自动回复桥 + 群上下文 | `qqbot_pro_bridge_configure/status/start/stop/run_once`、`qqbot_pro_bridge_contacts`、`qqbot_pro_bridge_bind_c2c`、`qqbot_pro_bridge_set_proactive_target`、`qqbot_pro_bridge_list_image_folders`、`qqbot_pro_group_context` |

Gateway 是独立 Python 进程（`resources/qqbot_pro_gateway.py`），控制端口 `32146`，由 JS 工具经本地 HTTP 控制；桥是 Operit JS 运行时内的 `setInterval` 轮询循环。二者进程边界不同：Gateway 用 `nohup` 常驻，桥随 Operit JS 运行时重建，因此烧录后必须确认桥循环已重新拉起。

## 4. 事件分类与触发策略

Gateway 收消息后统一入事件队列；桥的 `classifyEvent` 按场景和事件类型分流：

| 场景 | 事件类型 | 处理 |
|---|---|---|
| C2C | `C2C_MESSAGE_CREATE` | 直接进入单聊处理：路由到对话 → AI → 回发 |
| 群 | `GROUP_AT_MESSAGE_CREATE` 或含 mentions/@ 标记的 `GROUP_MESSAGE_CREATE` | 进入该群聚合桶 |
| 群 | 普通 `GROUP_MESSAGE_CREATE` | 只写入上下文缓存，不唤醒 AI（触发策略决定是否升级） |
| 群 | 命中关键词（`keyword_or_at` 模式） | 视为触发，进入聚合桶 |

群消息模式 `groupMessageMode`：

- `at_only`：仅 @ 机器人的消息触发。
- `keyword_or_at`：@ 或命中 `groupKeywords` 触发（当前生产配置）。
- `all`：全部群消息触发。

关键事实（T039/T042 踩坑结论）：QQ 开启「接收所有消息」后，@ 消息以 `GROUP_MESSAGE_CREATE` 推送、@ 标记在 `mentions` 与消息正文 `<@xxx>` 中；机器人群内 member_openid 与全局 botUserId 不同，需要「mentions 含机器人 id 或 content 提取 @ 目标」交叉识别。

## 5. 会话路由与群聚合模型

### 5.1 会话路由

`resolveBoundChatIdAsync` 决策顺序：

1. C2C 且命中 `c2cFixedBindings` → 使用绑定的 chatId。
2. C2C 未绑定 → `c2c:{openid}` 创建/复用对话。
3. 群聊 → `group:{group_openid}` 创建/复用对话（唯一语义，不绑固定目标）。

### 5.2 群聚合桶（内存）

- 每个 `group_openid` 一个桶，记录 `events[]`、`firstAt`、`lastAt`。
- 首条有效触发消息开始计时，`groupAggregateWindowMs` 后到期（生产当前 5000ms）。
- 单群达到 `groupMaxItems`（默认 30）后不再提前 flush，只保留最新 N 条并累计 overflow 计数。
- 到期桶按 `groupFlushConcurrency`（默认 3，clamp 1～8）有限并发 flush；按 chatId 串行、跨 chat 并发。
- 聚合键当前为 `GROUP_AGGREGATE:{groupOpenId}:{Date.now()}` —— 这是已登记的技术债，G3 需改为稳定事件集合哈希。

### 5.3 上下文缓存（可持久化）

- 所有群消息（@ 与普通）写入 `groupContextCache`（内存 Map）。
- 单群最新 `groupMaxItems`、全局最新 `groupGlobalCacheMaxItems`（默认 100）双层淘汰。
- 状态镜像落盘到 `auto_reply_state.json`；恢复只恢复 `groupCacheRecoveryMaxAgeMs`（默认 24h）内条目，过期丢弃，0 = 不恢复。
- 普通群消息只在桥接侧缓存，不写入 Operit 对话历史（G5 未验证前，automatic 附件是否随轮次落盘仍有风险，见 2.4 与 README 运行原则）。

### 5.4 上下文三态（G2）

| 模式 | 行为 |
|---|---|
| `off` | 不附加上下文，AI 只看聚合文本 |
| `automatic` | flush 时自动附加锚点前后各 `groupContextBefore/After`（默认 5，clamp 0～20）条，单次最多 `groupContextLimit`（默认 20） |
| `agent_on_demand` | 不自动附加；AI 调用 `qqbot_pro_group_context` 按需查询 |

上下文附件复用 G7 成员标签（绑定名优先，未绑定 `QQ`+后四位），锚点默认最后一条事件；「向后取」在窗口结束时取，不在触发瞬间伪造后文。

### 5.5 群成员身份绑定（G7 最小版）

`groupMemberBindings: [{ memberOpenid, groupOpenid?, title }]`，聚合文本与上下文查询的成员标签优先使用绑定 title，未绑定回退 `QQ`+后四位。`groupOpenid` 留空 = 全局生效。

## 6. AI 调用与回复链路

### 6.1 AI 调用

桥通过 `Tools.Chat.sendMessageStreaming` 调用 Operit AI：

- 单聊：`waifu=true`，流式结果经 `onIntermediateResult` 收集后按句分段发送。
- 群聚合：`waifu=false`（T041 结论），直接拿完整回复再按群聊句数切分。
- 超时：`aiTimeoutMs`/`groupAiTimeoutMs` 传宿主；T046 另加 JS 侧 `Promise.race` 硬超时兜底，防止宿主 timeout 不生效导致 tick 永久挂起。
- 空回复：单聊最多重试 3 次（递增退避）；群聚合只试 1 次，超时/空回复标记 `group_ai_timeout`。

### 6.2 回复分段（G4 统一 chunker）

`shared/waifu_chunker.js` 是单聊流式与群聊完整回复共用的唯一状态机：

- 句末计数：`。！？\n`；连续换行归一化为 1 句（跨 chunk 边界连续跟踪）。
- 默认切分数：私聊 3、群聊 5；可配置。
- 400 字符独立安全兜底：无句末符文本不会无限增长。
- 发送为串行链（每条等待上一条 HTTP 返回），保证 `msg_seq` 严格递增、避免平台频控乱序。

### 6.3 发送可靠性

- `requestJson` 同时校验 HTTP 状态码与业务码（`code`/`retcode` ≠ 0 判失败）——修复 T045 静默丢段。
- 流式发送把每段真实响应写入 `sendResult.segmentResults`（msgSeq/code/message/responseId），供状态查询定位被拒段。
- 发送成功与事件移除不是原子操作；`records` 以 eventKey 记录 `chat_done` 去重，但「QQ 已发送、队列移除失败」的事务级幂等仍为技术债（可靠性 Sprint）。

### 6.4 运行保护（T046）

- tick 层 watchdog：上次 tick 启动超过 5 分钟未结束 → 强制重置 `autoReplyTickActive` 并作废旧代际，防止「循环死了但 running=true」假象。
- 烧录 SOP：`debug_install_toolpkg` 后 JS 运行时重建，桥定时器丢失，必须重新 `qqbot_pro_bridge_start`。

## 7. G3 接口契约（当前开发入口）

G3 目标：让 AI 从聚合批次中选择具体回复目标，并实现引用锚点与过期降级。
> 状态：**2026-08-12 已按本契约实现**（`bridge_auto.js`，20/20 测试通过），**待烧录 + 真机验证**。以下为契约原文，实现细节以源码为准。

### 7.1 聚合消息编号

聚合文本中每条触发消息带局部编号：

```text
[#1][初尘][12:00] 第一条内容
[#2][QQ5C63][12:00] 第二条内容
```

插件内部维护 `index → { eventKey, messageId, replyHint }` 映射。仅 @ 触发消息进入 replyTo 候选；普通上下文消息不得成为候选。

### 7.2 AI 结构化回复协议

AI 在回复开头返回 JSON 控制头（只发给模型解析，不进入 QQ 消息）：

```json
{ "replyTo": 2, "content": "回复正文", "fallbackPreference": "active_send" }
```

- `replyTo`：选中的消息编号；缺省/无效时降级为最后一条消息。
- `fallbackPreference`：锚点过期时的降级方式：
  - `active_send`：降级为主动群消息，文本点名目标（`[QQ后四位]`，尽力而为；客户端原生 @ 需单独实机验证）。
  - `drop`：放弃发送并记录原因（如 `anchor_expired` + 时间差）。

### 7.3 稳定批次键（技术债修复）

聚合键从 `GROUP_AGGREGATE:{groupOpenId}:{Date.now()}` 改为稳定哈希：`hash(sorted(eventKeys))`，保证同一批事件重试时幂等，不再因时间戳生成不同 key 导致重复回复。

### 7.4 时效决策树

1. AI 在 `groupAiTimeoutMs`（默认 120s）内返回且原消息在被动回复时效内（群约 5 分钟，预留 60s 安全边界）→ 按 `replyTo` 选中消息的 msg_id 被动回复，可选携带 `message_reference`。
2. AI 已返回但锚点过期 → 按 `fallbackPreference` 执行 active_send 或 drop（当前代码已有 4 分钟安全阀丢弃路径，active_send 待实现）。
3. AI 生成超时 → 标记 `group_ai_timeout`，不重复生成，事件进失败重试（failCount 上限 3）。

### 7.5 边界

- `message_reference` 底层支持已存在（core.js），但尚未接到 AI 选择的群消息锚点。
- 真正的客户端原生 @、引用样式、主动群消息是否被平台接受，必须实机验证后才可写入文档为「已验证」。

## 8. 配置模型

唯一 schema 位于 `shared/bridge_config.js`（约 30 字段，`BRIDGE_SCHEMA_VERSION=2`），所有字段走统一归一化：

- 优先级：持久化 config > 环境变量 > 默认值。
- 数值字段做 clamp，枚举字段非法值报错；旧字段通过 `LEGACY_MIGRATIONS` 迁移。
- UI 与 Agent 工具都必须调用统一 configure 服务，禁止直接写 config.json。
- 环境变量以 `QQBOT_PRO_` 前缀暴露，完整清单见 `bridge-docs/README.md`。

关键字段一览（代码默认值）：

| 字段 | 默认 | 说明 |
|---|---|---|
| `groupAggregateWindowMs` | 60000 | 群聚合窗口（生产当前 5000） |
| `groupAiTimeoutMs` | 120000 | 群聚合 AI 生成超时 |
| `groupMessageMode` | at_only | 触发策略（生产当前 keyword_or_at） |
| `groupMaxItems` | 30 | 单群安全保留上限 |
| `groupGlobalCacheMaxItems` | 100 | 全局缓存上限 |
| `groupFlushConcurrency` | 3 | 到期群并发 flush |
| `groupCacheRecoveryMaxAgeMs` | 86400000 | 缓存恢复窗口（24h） |
| `groupContextMode` | off | 上下文三态（生产当前 automatic） |
| `groupContextBefore/After/Limit` | 5/5/20 | 上下文条数，clamp 0～20 |
| `waifuFlushSentences` / `groupWaifuFlushSentences` | 3 / 5 | 私聊/群聊切分句数 |
| `groupMemberBindings` | [] | G7 成员绑定 |
| `c2cFixedBindings` | [] | C2C 固定绑定 |
| `proactiveC2cOpenId` | 空 | 唯一主动发送目标 |

## 9. 平台边界与明确不做

- C2C 昵称：QQ 没有适合本需求的稳定通用资料接口；用 openid 后四位 + 用户自述称呼。
- 跨 AppID 身份合并：openid 是 AppID 维度，不做。
- 绕过平台限制：主动消息开关、频控、权限均不可绕过。
- 官方 `stream_messages`：技术上可做，产品决定不做，只保留架构位置。
- UI：宿主 compose_dsl 加载问题属于 Operit 宿主限制，底层能力不得依赖 UI。
- 原生 @、引用样式、主动群发是否被接受：必须实机验证后写状态。

## 10. 技术债登记

| 债 | 影响 | 计划 |
|---|---|---|
| 聚合键含 `Date.now()` | 同批重试幂等失效，可能重复回复 | G3 改稳定事件集合哈希 |
| 事务级幂等不完整 | QQ 已发送但队列移除失败 → 可能重复回复 | 可靠性 Sprint |
| token 无缓存 | 每次 API 调用重新获取 access_token | 可靠性 Sprint |
| 错误码/Trace ID 未结构化 | 排障依赖手工看 message | 可靠性 Sprint |
| automatic 附件是否落盘未验证 | 可能随轮次进入 Operit 历史 | G5 Hook 探针 |
| UI 未完成 | 配置只能走 API/env | G6 |
| src/dist 手工同步 | 漏同步会烧旧代码 | sync.sh 已缓解，长期建编译流程 |
| `target_chat_id` 兼容读取残留 | 误导新读者 | 文档已声明废弃，代码后续清理 |

*本文件由渡渡与初尘维护，随工程迭代更新。当前主线入口：G3（见第 7 节）。*