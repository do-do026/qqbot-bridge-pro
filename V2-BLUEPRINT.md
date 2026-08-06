# qqbot-bridge-pro 产品与技术蓝图

> 重构时间：2026-08-06 11:50。本文是需求、平台边界和验收语义的唯一主文档。

## 1. 产品目标

做一个可顶替 Operit 原 QQ Bot 包的独立 ToolPkg：QQ 收消息后桥入 Operit 对话，唤醒 AI，回复再桥回 QQ；Operit 工作流唤醒 AI 时，AI 也可选择主动给指定用户发消息。

原则：不修改原包；同一 AppID 只保留一个 Gateway；只把已经实现或明确可实现的能力写进插件描述。

## 2. 平台查证结论

### 2.1 QQ Bot API v2 明确提供

- C2C：`C2C_MESSAGE_CREATE`、发送单聊消息、官方单聊流式消息。
- 群聊：`GROUP_AT_MESSAGE_CREATE` / `GROUP_MESSAGE_CREATE`、发送群消息。
- 主动消息、互动召回消息、携带 msg_id/event_id 的被动回复。
- 文本、Markdown、富媒体；图片/视频/语音/文件需先上传取得 `file_info`。
- openid 唯一身份机制：user/group/member openid 都是 Bot/AppID 或群关系维度，不能等同 QQ 号。
- 主动消息由用户开关、机器人权限、频控和关系状态共同约束。
- 相同 msg_id 可能重复推送，应结合 msg_seq/事件键去重。

### 2.2 QQ 官方没有满足本需求的能力

- 没有稳定的 C2C 通用用户昵称资料接口可供本包低成本获取。
- 不能绕过用户关闭主动消息、频率限制或权限限制。
- 不能把不同 AppID 下的 openid 自行认定为同一用户。

### 2.3 Operit 脚本开发能力

Operit 提供 Tool METADATA、环境变量读取/写入、HTTP、Files、Java Bridge、生命周期 Hook、Chat 服务和 ToolPkg compose_dsl UI，因此以下能力在技术上可实现：

- Gateway 常驻与启停；本地状态持久化。
- openid→chatId 绑定；按 openid/group_openid 创建和复用 Operit 对话。
- Agent 按需查询联系人/配置，并通过工具主动发送。
- 角色卡、Waifu、图片目录和桥接参数的 UI/API 配置。
- 官方 stream_messages HTTP 调用。

Operit 当前的限制：此宿主版本对 ToolPkg compose_dsl UI 的热烧录/外部导入存在模块加载错误。插件可以保留和重构 UI 源码，但不能从脚本侧修复宿主加载器。

## 3. 最终会话语义

### 3.1 C2C

1. openid 只在该用户实际给 Bot 发消息后进入已知联系人状态。
2. 不把所有 openid 自动注入 AI 上下文；AI 需要时调用联系人工具。默认仅返回后四位，明确绑定或发送时才允许揭示完整 openid。
3. 指定 openid 可通过 UI/API 绑定指定 Operit `target_chat_id`。
4. 未绑定 openid 自动按 `c2c:{openid}` 创建/复用独立对话。
5. 全局 `target_chat_id` 在 C2C 场景退役；固定私聊使用 `c2c_fixed_bindings`。
6. C2C 不查询 QQ 昵称；识别时提供 openid 后四位。用户想被怎样称呼由对话上下文和记忆系统决定。

### 3.2 群聊

1. 默认按 `group:{group_openid}` 创建/复用 Operit 对话，这是当前性价比最高且可解释的方案。
2. 当前代码仍是约 25 秒/10 条提前触发的旧实现；目标架构改为每群首条有效 @ 消息起算、默认 60 秒，并废弃"桶满提前 flush"，详见 §12。
3. 群友不绑定独立 Operit 对话。
4. 群昵称查询默认关闭；关闭或失败时使用 `QQ`+member_openid 后四位。
5. `target_chat_id` 仅保留为群聊固定目标兼容配置。

## 4. 主动发送语义

- 产品主路径只配置一个 C2C 主动目标 openid。
- 工作流唤醒 AI 后，AI自行决定是否发送；不要求每次唤醒都发。
- `qqbot_pro_bridge_set_proactive_target` 设置目标并同步兼容环境变量 `QQBOT_PRO_TARGET_OPENIDS`。
- 文本和图片工具也允许显式传 openid/group_openid，便于调试和高级场景。
- 发送成功与否受 QQ 平台限制，本包返回结构化失败，不承诺绕过限制。

## 5. Gateway 与自动回复

- Gateway 监听和自动回复是两个状态。
- 开启 Gateway 后，默认自动回复为 true；用户可单独关闭自动回复而保留 Gateway。
- 关闭监听时停止 Gateway、停止自动回复并清理内存聚合桶。
- Gateway 使用 nohup 常驻，生命周期 Hook 在应用创建/回前台时按配置探活并拉起。
- UI 与 Agent API 都应能修改凭证、监听、自动回复和桥接配置。

## 6. Waifu 规则

- 默认开启。
- 仅 `。！？` 计为句子结束；逗号、顿号、波浪线、破折号、括号、换行、英文标点和省略号不累计句数。
- C2C 默认 3 句一分。
- 群聊默认 5 句一分。
- 任何场景仍保留 400 字符安全兜底，避免没有中文句号时无限增长。
- UI/API 可分别修改单聊和群聊句数。

## 7. 图片发送

已实现：

- 本地文件路径上传发送。
- 网络图片 URL 下载、上传、发送。
- C2C/群场景分别走对应素材上传接口。

规划：

- `QQBOT_PRO_IMAGE_FOLDERS` 配置多个允许目录。
- 提供专用图片目录浏览/筛选工具，AI按需获取文件名和路径，而非自动把全部文件送入上下文。
- UI 管理目录列表。

## 8. UI 范围

完整 UI 必须覆盖原 QQ Bot UI 的全部能力，并新增：

1. AppID/AppSecret、沙箱、连接测试。
2. Gateway 启动/停止/重启/状态/队列。
3. 自动回复默认开关、C2C/群开关、轮询和超时。
4. 角色卡选择与环境变量同步。
5. 已知 C2C openid 列表、后四位显示、openId→chatId 绑定增删。
6. 唯一主动 C2C 目标。
7. 单聊/群聊 Waifu 开关和句数。
8. 群聚合窗口、条数、群昵称尝试开关。
9. 多图片目录配置。
10. 状态和最近错误。

UI 当前是"可实现但宿主阻塞"，不能描述为已交付。底层配置必须始终有 Tool API，不依赖 UI 才能运行。

## 9. 官方流式决策

QQ 官方提供 C2C `stream_messages`，Operit 也具备 HTTP 实现条件。但产品蓝图明确放弃当前实现：

- 不注册 `qqbot_pro_send_stream`。
- 不在 manifest/README 写成已支持。
- core 保留可插入 `sendStreamMessage` 的架构位置与 ADR，不影响普通消息和 Waifu 分段。

## 10. 差距分类

### 可以实现，继续做

- 完整 UI。
- 图片目录浏览/筛选 API。
- access token 缓存、错误码/Trace ID。
- 事务级发送幂等。
- 固定绑定失效降级。

### 不可实现/应放弃

- 稳定获取所有 C2C QQ 昵称。
- 跨 AppID 统一识别用户。
- 绕过主动消息限制。
- 插件自行修复 Operit UI 宿主加载器。
- 官方流式发送：不是技术不可行，而是产品决定放弃，只留架构位。

### 纯代码 Bug，必须修

- 文本发送候选兜底缺失。
- 声明环境变量但不读取。
- 群聚合不走 5 句切分。
- 错误的句末字符集。
- ISO 时间排序错误。
- 停止后群桶残留。
- metadata/manifest/实际工具漂移。

## 11. 验收标准

- 两个 C2C 用户发消息，自动进入两个不同 Operit 对话。
- 将用户 A openid 绑定 chat X 后，A 后续消息进入 X；B 不受影响。
- AI 只有调用联系人工具时才看到已知 openid 列表。
- 工作流唤醒 AI 后可向唯一主动目标发文本和图片。
- 群消息按 group_openid 复用，五人连续消息只产生一轮聚合 AI 调用。
- 群昵称关闭时只展示后四位；不额外调用昵称接口。
- 当前代码单聊 3、群 5，只按 `。！？` 计数；目标规则增加归一化后的非空换行，详见 §12.4。
- Gateway 能独立常驻、停止；关闭监听同时停止自动回复。
- 所有底层可配置项在工具 API 有可选参数；不配置时使用安全默认值。
- 文档、manifest、METADATA、src、dist 一致。

## 12. 群窗口与上下文架构增补（2026-08-06 14:32）

### 12.1 确认后的产品语义

- 每个 `group_openid` 有独立聚合窗口。
- Gateway 开启后，该群第一条符合处理策略的 @Bot 消息到达时记录 `firstAt` 并开始窗口；默认 60 秒，不按自然分钟对齐。
- 窗口时长必须是配置，不得硬编码：UI、Agent 工具和 `QQBOT_PRO_GROUP_AGGREGATE_WINDOW_MS` 均可修改，默认 `60000`。
- Gateway 继续接收普通群消息；桥接策略默认 `at_only`，普通群消息不唤醒 AI。C2C 与群聊开关都只控制"是否送给 AI/自动回复"，不改变 Gateway 订阅。
- 窗口结束后，将本窗口内有效 @ 消息编号为 `#1...#N`，AI 返回有效 `replyTo` 后选择对应原事件的 `msg_id`/`message_reference`。
- 如果被动回复锚点过期：AI 的回复若具有明显针对性，降级为主动群消息并尽力文本点名；若内容可回可不回，则放弃发送并记录原因。真正的客户端原生 @ 能力需单独实测，不能只凭文本 `@昵称` 承诺。

### 12.2 可选前后文

普通群消息可以作为 @ 消息的邻近上下文，但不直接唤醒 AI：

- 总开关：`groupContextEnabled` / `QQBOT_PRO_GROUP_CONTEXT_ENABLED`，默认关闭；UI 和 Agent 均可切换。
- 默认每条 @ 消息向前 5 条、向后 5 条；允许分别配置，也可提供统一环境变量 `QQBOT_PRO_GROUP_CONTEXT_LIMIT=5`。
- 单次交给 AI 的邻近上下文最大 `20` 条；任何 UI/API/env 输入都必须 clamp 到 0～20。
- AI 在运行中可以选择是否请求上下文；"允许上下文"与"每次自动附带上下文"应拆成两个概念，避免无意义 token 消耗。
- 第一阶段建议实现 `off / automatic / agent_on_demand` 三态：默认 `off`；`automatic` 自动附带；`agent_on_demand` 只在 AI 明确调用查询工具时返回。
- 上下文消息与 @ 触发消息必须有不同标记，普通上下文不得进入 `replyTo` 候选，除非后续明确扩展。

### 12.3 容量与并发

- 单群聚合安全上限可配置：`QQBOT_PRO_GROUP_MAX_ITEMS`，默认 30；超过后不提前 flush，只保留该群最新 N 条并记录 overflow/dropCount。
- Gateway/桥接全局上下文缓存采用独立最新保留上限：建议默认 100，可配置 `QQBOT_PRO_GROUP_GLOBAL_CACHE_MAX_ITEMS`；达到上限后跨群按时间淘汰最旧项、保留最新项。
- 同时 flush 到期群的最大并发数可配置：`QQBOT_PRO_GROUP_FLUSH_CONCURRENCY`，默认 3；必须 clamp 到安全范围，例如 1～8。
- 现有 `groupAggregateMaxItems=10` 的"桶满提前 flush"语义废弃，迁移为单群安全保留上限；配置迁移需要兼容旧字段但不能继续一字段两义。

### 12.4 Waifu 规则更新

- 句末计数调整为 `。！？\n`。
- 连续换行先归一化为单个换行；空白行不重复累计。
- 单聊默认 3，群聊默认 5，400 字符仍作独立安全兜底。
- 单聊流式分段和群聊完整文本分段必须抽成一个共享 chunker，禁止继续维护两套正则。

### 12.5 临时桥接 Prompt

已找到内置 `com.operit.message_insert_bundle` 的可参考实现：

- 需要落盘时使用 `ToolPkg.registerPromptInputHook` 的 `before_process` 阶段。
- 不落盘时使用 `ToolPkg.registerPromptFinalizeHook` 的 `before_send_to_model` 阶段。
- 因而"桥接 Prompt 只在当轮发给模型、不保存聊天记录"具有可行实现路径，不再直接放弃。
- 风险：QQ 桥通过 `Tools.Chat.sendMessageStreaming` 后台向指定 chat 发送，必须先验证 Prompt Finalize Hook 是否对这种程序化 Chat 调用触发、能否准确识别目标 chat/turn，且不会注入普通 Operit 手输消息。
- 若 Hook 不覆盖程序化发送，则回退到短控制附件落盘或等待宿主提供 `ephemeral_instruction`；禁止使用难以验证的数据库后删消息 hack。

### 12.6 新 Epic 与子任务

#### Epic G0：配置模型与迁移（最先做）✅ 已完成（2026-08-06 15:0x，15:2x 补 groupAiTimeoutMs）

1. ~~建立唯一配置 schema 和字段表。~~ ✅ 已收敛到 `src/shared/bridge_config.js`：`FIELD_DEFS` 26 字段、`BRIDGE_SCHEMA_VERSION=2`。
2. ~~明确优先级：持久化 config > env 初始化/回退 > defaults；UI 与 Agent 均调用同一个 configure service。~~ ✅ `normalizeBridgeConfig` 实现三级优先级；`qqbot_pro_bridge_configure` 已扩展全部新参数；`writeAutoReplyConfigAsync` 直接写回完整 schema，不再手写字段清单。
3. ~~新增/迁移窗口、上下文模式、前后条数、单群上限、全局缓存、flush 并发、群消息模式。~~ ✅ 新字段已入 schema 并暴露 configure 参数与 env（见 README 环境变量表）。
4. ~~对所有数值做范围校验和 clamp。~~ ✅ int 越界 clamp、enum 非法值报错；env 值同样 clamp。
5. ~~废弃旧 `groupAggregateMaxItems` 提前 flush 语义并提供迁移。~~ ✅ `LEGACY_MIGRATIONS` 自动迁移到 `groupMaxItems`（单群安全保留上限）；`flushDueGroupBucketsAsync` 已改为超上限只保留最新 N 条并累计 overflow，不再提前 flush；configure 兼容旧参数 `group_aggregate_max_items` 并返回 `changes` 迁移说明。
6. ~~AI 生成超时判定（G3 可提前部分）~~ ✅ 提前落地：群聚合 AI 调用使用 `groupAiTimeoutMs`（默认 120s）+ 单次尝试，超时/空回复抛 `group_ai_timeout` 并进入失败重试；AI 返回后锚点超过 4 分钟安全窗口 → 放弃发送并记录 `anchor_expired_dropped`（完整 active_send 主动点名降级依赖 G3 replyTo 协议）。

配套：`bridge_auto.js` 删除 126 行本地配置堆（DEFAULT_AUTO_REPLY_CONFIG/normalizeC2cFixedBindings）；src/dist 同步、8 JS + 1 Python 语法检查通过、27 项冒烟测试全过（scripts/test_g0_config.js 跑完已删）。

#### Epic G1：群事件分流与可恢复缓存

1. `GROUP_AT_MESSAGE_CREATE` 作为默认触发事件。
2. 普通 `GROUP_MESSAGE_CREATE` 只进上下文环形缓存，不唤醒 AI。
3. 每群独立 firstAt；用事件 `receivedAt` 重建窗口，避免重启后重新等一分钟。
4. 单群最新 30/可配置、全局最新 100/可配置的双层淘汰。
5. C2C/group 开关关闭时清理对应待处理状态，但 Gateway 保持运行。

#### Epic G2：上下文查询

1. off/automatic/agent_on_demand 三态。
2. 前 5、后 5、最大 20。
3. @ 事件与上下文消息编号隔离。
4. Agent 查询工具必须按 group、anchor event、before/after/limit 请求，不能一次泄露全部群缓存。
5. 测试普通消息不会自己触发 AI。

#### Epic G3：编号 replyTo 与时效降级

1. 稳定批次键：hash(sorted eventKeys)，禁止 Date.now 作为幂等键。
2. AI JSON/结构化协议 `{replyTo, content, fallbackPreference}`。
3. 选择对应 msg_id/message_reference；群 5 分钟时效预留安全边界。
4. **时效降级决策树（2026-08-06 15:2x 初尘确认语义）**：
   - AI 在 `groupAiTimeoutMs`（默认 120000，可配 `QQBOT_PRO_GROUP_AI_TIMEOUT_MS`）内返回，且原消息仍在被动回复时效内 → 按 `replyTo` 被动回复。
   - AI 已返回内容，但锚点已过期 → 按 `fallbackPreference`：
     - `active_send`：降级为主动群消息，文本点名目标（`[QQ后四位]`，尽力而为；真正的客户端原生 @ 单独实测，不凭文本承诺）；
     - `drop`：放弃发送并本地记录原因（如 `anchor_expired` + 时间差）。
   - AI 生成超时（超过 `groupAiTimeoutMs`）→ 本轮不发送，标记 `group_ai_timeout`，记录原因；事件进入失败重试策略（failCount），不重复生成。**该判定已在 G0 落地（群调用 120s/单次尝试 + 4 分钟锚点安全阀）**；G3 剩余部分为 replyTo 协议与 active_send 主动点名。
5. 真正原生 @ 单独做平台实测。

#### Epic G4：统一 Waifu chunker

1. 抽独立模块。
2. `。！？\n`、连续换行归一化、400 字兜底。
3. 单聊流式和群完整回复共用同一状态机。
4. 覆盖 emoji、无标点、连续空行测试。

#### Epic G5：非落盘 Prompt 兼容验证

1. 做最小 ToolPkg Hook 探针。
2. 验证后台 `Tools.Chat.sendMessageStreaming` 是否经过 before_send_to_model。
3. 验证只修改模型请求、不改变持久化 user turn。
4. 验证多 chat 并发时不会串 prompt。
5. 成功后再移植 message_insert 的双阶段模式。

#### Epic G6：UI（字段稳定后做）

覆盖原 QQ Bot UI，并增加窗口、上下文三态、前后条数、容量、并发、replyTo/降级策略、Waifu 与桥接 Prompt 持久化选项。UI 只能调用统一配置服务，禁止直接写 config.json。

### 12.7 实施顺序

1. G0 配置 schema/迁移。
2. G1 事件分流与可恢复缓存。
3. G4 统一 chunker（可与 G1 并行，但合并前先统一测试）。
4. G2 上下文查询。
5. G3 replyTo/引用/过期降级。
6. G5 临时 Prompt 探针与实现。
7. 可靠性 Sprint：事务状态机、token 缓存、错误码/Trace ID、故障注入。
8. G6 UI。
9. 全链路验收、文档审计与发布。

### 12.8 新增技术债/屎山风险

- Gateway 原始队列既承担消息总线又承担一分钟缓冲，存在查询 limit 截断和队列淘汰风险；应引入桥接侧持久化事件/上下文 store。
- 前后文里的"后 5 条"天然需要延迟或二次补齐；必须定义是窗口结束时向后取，不能在 @ 到达瞬间伪造后文。
- 上下文缓存、聚合桶、records 三套状态若分别写文件会产生一致性问题；应统一为版本化 store 和原子写策略。
- 多群并发 flush 会并发调用同一个 Chat/Gateway/OpenAPI；需按 chatId 串行、跨 chat 有限并发，不能只做粗暴 Promise.all。
- replyTo 控制协议与自然语言回复混合会解析脆弱；应有严格 schema、容错解析和纯文本降级。
- 主动降级发送与被动回复频控不同，必须记录发送模式、错误码与平台 Trace ID。
- Prompt Finalize Hook 是全局 Hook；若不建立 turn token/chatId 白名单，可能污染普通聊天，是高风险实现点。
- 配置字段继续堆在 `bridge_auto.js` 会变成 God Object；应拆分 config、router、aggregate_store、context_store、reply_selector、chunker、sender。
- src/dist 手工复制仍是流程债；至少让 sync.sh 校验 hash，长期应建立编译/生成流程。
- 当前 UI 源码仍含已放弃 G3 和过时字段，正式启用前必须重写，不能在旧 UI 上继续补丁叠补丁。