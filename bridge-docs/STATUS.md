# qqbot-bridge-pro STATUS

> 更新时间：2026-08-06 14:47｜真相源：`/sdcard/Download/qqbot-bridge-pro/package/`

## 状态定义

- **代码完成**：源码和 dist 已同步、语法检查通过。
- **已部署**：已安装/烧录到 Operit。
- **已验证**：经过真实 QQ/Operit 场景测试。
- **未暴露**：底层存在，但工具 API 或 UI 尚未提供正常入口。

## 当前完成度

| 能力 | 代码 | 部署 | 验证 | 备注 |
|---|---|---|---|---|
| Gateway 32146 收消息 | ✅ | ✅ | ✅ | nohup、探活、WS 握手已修 |
| QQ→Operit→AI→QQ | ✅ | ✅ | ✅ | 核心全链路已实测 |
| C2C 按 openid 分对话 | ✅ | ✅旧版 | ⏳ | 需两用户互不串线测试 |
| C2C openid→指定 chat 绑定 | ✅ | ⏳ | ⏳ | 新增 API，UI 待完成 |
| 已知 C2C 联系人按需查询 | ✅ | ⏳ | ⏳ | 只记录实际发来消息者 |
| 唯一 C2C 主动目标 | ✅ | ⏳ | ⏳ | 同步 `QQBOT_PRO_TARGET_OPENIDS` |
| 群按 group_openid 复用/聚合 | ✅旧架构 | ✅旧版 | ⏳ | 当前约25s/10条；目标为首条@起算60s、无满桶提前flush |
| 群昵称查询 | ✅ | ✅旧版 | ⏳ | 默认关闭；失败后四位 |
| Waifu 单聊 3 / 群 5 | ✅旧规则 | ⏳ | ⏳ | 当前`。！？`；目标加入归一化非空换行 |
| 文本候选目标兜底 | ✅ | ⏳ | ⏳ | 修复普通 send 不读候选问题 |
| 图片本地路径/URL发送 | ✅ | ✅旧版 | ⏳ | 需实发验证 |
| 多图片目录配置 | 底层✅ | ⏳ | ⏳ | 专用文件搜索工具/UI 未完成 |
| 环境变量角色卡/Waifu/自动回复 | ✅ | ⏳ | ⏳ | 已补实际读取 |
| 设置 UI | 源码旧底子 | ❌ | ❌ | 宿主 compose_dsl 加载问题；内容仍需重构 |
| 官方 stream_messages | 不实施 | — | — | 仅保留架构位置 |

## 本轮已修代码 Bug

1. 普通 `qqbot_pro_send` 不读取候选目标。
2. 声明了角色卡、Waifu、自动回复环境变量却不读取。
3. 群聚合回复没有按群 5 句切分。
4. 句子结束符错误地把英文符号、省略号和换行计数；现在只统计 `。！？`。
5. records 使用 `Number(ISO时间)` 导致排序失效；改为 `Date.parse`。
6. 停止自动回复后内存群桶未清理。
7. 群昵称默认开启导致额外 OpenAPI/token 消耗；改为默认关闭。
8. manifest 把官方流式写成已实现；已改为架构预留。

## 可实现但尚未完成

- 完整 UI：凭证、Gateway、默认自动回复、角色卡、C2C 绑定、唯一主动目标、单/群 Waifu、聚合参数、图片目录。
- 图片目录专用浏览/筛选 API。
- access token 缓存。
- QQ `err_code` 结构化映射和 Trace ID。
- “QQ 已发送但队列移除失败”的事务级幂等恢复。
- C2C 固定绑定失效时的自动降级策略。

## 应放弃或明确限制

- C2C QQ 昵称：官方没有稳定的通用资料接口；默认只使用 openid 后四位，称呼由用户对话/记忆决定。
- 跨 AppID 识别同一 QQ 用户：官方 openid 是 AppID 维度，本包不能自行打通。
- 绕过主动消息开关/频控/权限：平台限制，不能实现。
- 官方流式发送：技术上可做，但产品蓝图已放弃，本包不注册工具。
- 脚本自行修复 Operit compose_dsl 宿主加载器：不属于插件能力范围。

## 14:32 新需求状态

| 能力 | 状态 | 默认/边界 |
|---|---|---|
| 唯一配置 schema（G0） | ✅代码完成 | bridge_config.js：27字段、schema v2、clamp+迁移 |
| 每群首条 @ 起算独立窗口 | ✅代码完成（G1） | 默认60000ms，可UI/API/env改 |
| 普通群消息仅作上下文、不唤醒AI | ✅代码完成（G1） | 默认at_only；普通消息进持久化环形缓存 |
| 前后文三态 | 📋规划完成（G2实施） | off/automatic/agent_on_demand，默认off；查询工具已可用 |
| 前后文条数 | 📋规划完成（G2实施） | 前5/后5，单次最多20；查询工具已实现默认值 |
| 单群安全保留 | ✅代码完成 | 默认最新30条；不再提前flush，只保留最新+overflow计数 |
| 全局群上下文缓存 | ✅代码完成（G1） | 默认最新100条；跨群按时间淘汰 |
| 到期群并发flush | ✅代码完成（G1） | 默认3，安全范围1～8 |
| 缓存/聚合桶持久化与当天恢复 | ✅代码完成（G1） | auto_reply_state.json 持久化；默认恢复窗口24h（QQBOT_PRO_GROUP_CACHE_RECOVERY_MAX_AGE_MS），0=不恢复，关一两天再开旧缓存直接丢弃 |
| 落盘边界（仅@落盘、上下文只发模型） | ✅代码完成（G1）+ G5待验证 | 普通群消息永不落 Operit 对话；桥接 Prompt 不落盘依赖 G5 Hook 探针 |
| 编号replyTo/引用目标 | 📋规划完成 | 只让@触发消息成为候选（G3） |
| 过期主动发送/放弃 | 📋规划完成 | 根据AI fallbackPreference并记录原因（G3） |
| 换行参与Waifu | 📋规划完成（G4实施） | 连续换行归一化后计一次 |
| 桥接Prompt不落盘 | 🔬有参考路径待验证 | before_send_to_model Finalize Hook（G5） |
| C2C/群桥接独立开关 | ✅底层已有+群清理已补（G1） | 只影响送AI，Gateway照常接收；关群开关清群缓存 |

## G0 完成记录（2026-08-06 15:0x）

- 新建 `src/shared/bridge_config.js`：唯一 schema（26 字段，含 `groupAiTimeoutMs` 群聚合 AI 超时）、三级优先级（持久化 config > env > defaults）、int clamp + enum 校验、`LEGACY_MIGRATIONS` 旧字段迁移、`normalizeC2cFixedBindings` 收编。
- `bridge_auto.js` 删 126 行本地配置堆；`normalizeAutoReplyConfig` 薄代理到 bridge_config；`writeAutoReplyConfigAsync` 直接写回完整 schema；`flushDueGroupBucketsAsync` 废弃桶满提前 flush（超 `groupMaxItems` 只保留最新 N 条 + overflowCount）；`processAutoReplyQueueOnceAsync` 的 `groupAggregateWindowMs=0` 不再被 parsePositiveInt 误伤。
- 超时判定提前落地：群聚合 AI 调用用 `groupAiTimeoutMs`（120s）+ 单次尝试，超时抛 `group_ai_timeout`；AI 返回后锚点超 4 分钟安全窗口 → `anchor_expired_dropped` 放弃并记录（完整 active_send 点名降级待 G3）。
- `qqbot_pro_bridge_configure` 扩展 10 个新参数（group_ai_timeout_ms / group_message_mode / group_context_mode / group_context_enabled / group_context_before / group_context_after / group_context_limit / group_max_items / group_global_cache_max_items / group_flush_concurrency），兼容旧 `group_aggregate_max_items`，返回值新增 `changes`。
- METADATA env 增加 9 个新变量声明；README 环境变量表同步。
- src/dist 一致、sync.sh 全过（8 JS + 1 Python）、27 项冒烟测试全过。
- **未烧录**：dev_package 已同步，真实 Operit 部署/验收待下一步（新会话可见新工具）。

## G1 完成记录（2026-08-07 00:3x）

- **事件分流**：`classifyEvent` 新增群消息分流——`at_only`（默认）下 `GROUP_AT_MESSAGE_CREATE` 才触发 AI；普通 `GROUP_MESSAGE_CREATE` 返回 `context_only`，只进上下文环形缓存并移出 Gateway 队列，不唤醒 AI、不落 Operit 对话。
- **上下文环形缓存**：新增 `groupContextCache`（内存 Map）；所有群消息（@ + 普通）入缓存；单群最新 `groupMaxItems`（默认30）截断，全局最新 `groupGlobalCacheMaxItems`（默认100）跨群按事件时间淘汰最旧项。
- **持久化与当天恢复**：`bridge_state.js` 扩展 `buckets`/`context` 镜像；`persistGroupRuntimeStateAsync`（dirty 标记 + tick 末/stop 前落盘）；`restoreGroupRuntimeStateAsync` 启动时恢复，只恢复 `groupCacheRecoveryMaxAgeMs`（默认 86400000=24h）内条目，过期直接丢弃（0=不恢复任何旧缓存）；恢复后写回清理过期数据。
- **并发 flush**：`flushDueGroupBucketsAsync` 改为收集全部到期桶 + `groupFlushConcurrency`（默认3，clamp 1～8）有限并发；跨群并发、群内串行。
- **开关粒度清理**：显式关闭 `group_enabled` 时清空群桶+群缓存并落盘，Gateway 保持运行。
- **查询工具（G2 核心）**：新增 `qqbot_pro_group_context`（按 group_openid + 可选 anchor_event_key/anchor_msg_id/anchor_index + before/after，默认各5、最大20；结果含 eventKey/eventType/isAtEvent/member/sentAt/receivedAt/content）；METADATA + env 声明同步。
- 配置 schema 增至 27 字段（新增 `groupCacheRecoveryMaxAgeMs`）。
- 新增 `scripts/test_g1_smoke.js`（22 项冒烟测试全过）；src/dist 一致、全部 JS 语法检查通过。
- **未烧录**：真实 Operit 部署/验收待下一步（需新会话加载新工具）。

## 2026-08-08 运行备忘

- **桥接状态**：已重新启用（enabled=true）；C2C 绑定指向 41712e3a（临时窗口，角色卡 flash）；Gateway 正常收消息。Waifu 分句与 UI 需求见蓝图 §12.4 / G6，不重复登记。
- **语气问题（跟进中）**：绑定对话的角色卡决定回复人格（41712e3a 是 flash 非渡渡）；渡渡本人语气也疑似"被夺舍"（可能涉及模型 provider / assistantInstruction / 角色卡关联），初尘正在排查，**后续再议，勿动现有绑定**。

## 下一阶段实施入口

按 `V2-BLUEPRINT.md §12` 执行，不应直接先写 UI：

1. ~~G0 配置 schema 与旧字段迁移~~ ✅ 已完成（bridge_config.js）。
2. ~~G1 群事件分流、可恢复缓存和双层容量~~ ✅ 代码完成（2026-08-07，22 项冒烟测试过；未烧录未实测）。
3. **G4 统一 Waifu chunker**（当前入口）。
4. **G2 上下文三态收尾**（查询工具已可用，automatic 自动附带待做）。
5. **G3 replyTo、引用与时效降级**。
6. **G5 Prompt Finalize Hook 探针**。
7. 可靠性 Sprint。
8. G6 完整 UI。
9. 全链路验收后才更新代码/部署/验证状态。

## 原有功能后续验收

1. 两个 C2C openid 测试自动分对话。
2. 绑定其中一个 openid 到指定 chat，验证后续消息进入指定对话。
3. 工作流唤醒 AI，验证唯一主动目标文本/图片发送。
4. Gateway stop/start、Operit 重启、网络失败恢复。
5. 新群架构完成后再测 60 秒窗口、上下文、replyTo、并发和容量淘汰。
6. 完成 UI 后再做最终顶替原包验收。