# Changelog

## 2026-08-07

### Epic G1：群事件分流与可恢复缓存 ✅（代码完成，未烧录未实测）

- `classifyEvent` 群消息分流：默认 `at_only` 只让 `GROUP_AT_MESSAGE_CREATE` 触发 AI；普通群消息返回 `context_only` 进环形缓存、不唤醒 AI、不落 Operit 对话。
- 新增群上下文环形缓存 `groupContextCache`：单群最新 `groupMaxItems`（30）、全局最新 `groupGlobalCacheMaxItems`（100）双层淘汰；`pushToGroupContextCache` / `trimGroupContextCacheGlobal`。
- 持久化与当天恢复：`bridge_state.js` 扩展 `buckets`/`context`；`persistGroupRuntimeStateAsync`（dirty + tick 末/stop 前落盘）、`restoreGroupRuntimeStateAsync`（默认恢复窗口 24h，可配 `QQBOT_PRO_GROUP_CACHE_RECOVERY_MAX_AGE_MS`，0=不恢复）。
- `flushDueGroupBucketsAsync` 并发改造：收集全部到期桶 + `groupFlushConcurrency`（默认3，clamp 1～8）有限并发。
- 群开关关闭时清空群桶+群缓存并落盘（Gateway 保持运行）。
- 新增工具 `qqbot_pro_group_context`：按 group_openid/锚点/前后条数查询持久化缓存，默认各5、最大20，结果只发模型不落盘。
- 配置 schema 增至 27 字段（新增 `groupCacheRecoveryMaxAgeMs`）。
- 新增 `scripts/test_g1_smoke.js`：22 项冒烟测试全过；src/dist 一致、全部 JS 语法检查通过。

### qqbot-pro：冷启动接续文档与目录统一 ✅（2026-08-07 凌晨）

- 新增 `HANDOFF.md`（200 行）：新窗口冷启动接续文档——项目速览/文件地图/已完成/Backlog/踩坑ADR/工作流程/凭证清单/Sprint Planning建议，三处落位（本地/GitHub/记忆库索引）
- 新增 `scripts/sync.sh`（41 行）：一键同步（主目录→dev_package）+ 全部语法检查。`ln -s` 方案因 Android FUSE 不支持 symlink 被否决（T012）
- 解决双副本漂移债（T013）：确定主目录为唯一真相源，dev_package 为烧录副本（会被 sync.sh 覆盖）
- HANDOFF/TROUBLESHOOTING/CHANGELOG 三文档同步更新

## 2026-08-06

### Epic G0：配置模型与迁移 ✅

- 新建 `src/shared/bridge_config.js`：26 字段唯一配置 schema（`FIELD_DEFS`、`BRIDGE_SCHEMA_VERSION=2`）
- 三级优先级：持久化 config > env 回退 > defaults
- int 越界 clamp、enum 非法值报错
- 旧字段迁移：`groupAggregateMaxItems`（桶满提前 flush）→ `groupMaxItems`（单群安全保留上限）
- `bridge_auto.js` 删除 126 行本地配置堆；`normalizeAutoReplyConfig` 薄代理到 bridge_config
- `flushDueGroupBucketsAsync` 废弃桶满提前 flush：超上限只保留最新 N 条 + overflowCount
- `qqbot_pro_bridge_configure` 扩展 10 个新参数，兼容旧参数，返回值新增 `changes`
- METADATA env 增加 9 个新变量声明；README 环境变量表同步

### G0 补充：AI 生成超时判定（G3 可提前部分）

- 新增 `groupAiTimeoutMs`（默认 120000，env `QQBOT_PRO_GROUP_AI_TIMEOUT_MS`）
- 群聚合 AI 调用使用专属超时 + 单次尝试，超时抛 `group_ai_timeout`
- 锚点过期安全阀：AI 返回后锚点超 4 分钟安全窗口 → `anchor_expired_dropped` 放弃并记录
- 完整降级决策树（replyTo / fallbackPreference / active_send 点名）写入 G3 蓝图，G3 实现

### G3 决策树钉入蓝图

- 时效降级：AI 在时效内→被动回复；锚点过期→active_send/drop；AI 超时→放弃+记录
- 原生 @ 独立实测，文本点名不冒充真 @

### 积压消息时间戳修复（T001）

- `buildInboundChatContextAttachment` 新增 `sentAt:`、`receivedAt:` 时间戳行
- `buildGroupAggregateContextAttachment` 新增 `batchLastSentAt:`、`receivedAt:`
- 积压检测（10 分钟阈值）：单聊/群聚合自动标记 `[stale: ...]`

### 文档

- 新增 `TROUBLESHOOTING.md`（排障日志，T001/T002/T003）
- 新增 `CHANGELOG.md`
- 更新 README / V2-BLUEPRINT / STATUS / HANDOFF
- HANDOFF 文件地图补全

### Bug 修复

- `groupAggregateWindowMs=0` 被 parsePositiveInt 误判 → 改为 Number()
- `trimRecordMap` ISO 时间字符串排序失效 → Date.parse()（该修复由上个窗口完成，本轮文档记录）

### qqbot-pro M0：架构与仓库 ✅

- 官方 v2 API 全量差距分析（对照 sitemap + 关键页面细读）
- 架构文档 `ARCHITECTURE.md`（335 行）：任务拆分 T01-T08 / W1-W5、里程碑 M0-M7、风险对策
- GitHub 仓库 `do-do026/qqbot-pro`（公开，main 分支）
- 开发环境：`SandboxPackage_DEV` skill 已安装（官方 types + 两份 guide + 42 内置包示例）

### qqbot-pro M1 v0.1.0：基础增强子包 ✅（已烧录验证）

- 包结构：ToolPkg `com.operit.qqbot_pro`（manifest + dist + src + test，手写 JS，无需 TS 编译）
- **5 工具** `qqbot_pro_basic`：T01 撤回消息（单聊/群聊 DELETE）、T02 Markdown 发送、T06 引用回复、T07 输入中状态、T03 群信息查询、T04 机器人群状态、T08 机器人资料
- 共享核心 `shared/core.js`：凭证读取（复用 QQBOT_APP_ID/SECRET 环境变量）+ token 获取 + OpenAPI 请求 + buildSendBody
- 开发指南校准：使用 `debug_install_toolpkg` 烧录验证 + `debug_run_sandbox_script` 冒烟测试;确认 ToolPkg subpackage 机制（非普通 JS 包，因需要 require 模块共享）
- 测试脚本：`test/smoke_core.js`（buildSendBody 逻辑）、`test/verify_live.js`（真实链路）
- 踩坑记录 T004-T013 已录入 `TROUBLESHOOTING.md`

### qqbot-pro M1 v0.2.0：增强版 Gateway（T05 事件放开）✅（已烧录验证）

- 增强版 Gateway `qqbot_pro_gateway.py`（981→1003 行）：复制自原包并精准增强
  - `should_queue_event` 事件白名单全放开：INTERACTION_CREATE / GROUP_MEMBER_ADD / FRIEND_DEL 等
  - `infer_scene` 支持 INTERACTION_CREATE 的 scene 识别（从 payload.d.scene / chat_type 判断）
  - `build_event` 新增 `interactionType` / `interactionData` 字段
  - 独立控制端口 32146（与原包 32145 隔离）
- **6 工具** `qqbot_pro_gateway`：start/stop/status/receive_events/clear_events/respond_interaction（PUT /interactions/{id}）
- 关键发现（T010）：原包 `should_queue_event` 用前缀匹配，GROUP_MEMBER_ADD 等其实已入队，大幅减少 T05 工作量
- 烧录 v0.2.0 成功（两个子包 11 工具全部注册）

### 文档

- 新增 `STATUS.md`（Sprint Review：已完成/待验证/已知问题/技术债/backlog/复用情况/下次行动）
- 更新 `ARCHITECTURE.md` / `HANDOFF.md` / `TROUBLESHOOTING.md`
- 更新 `CHANGELOG.md`（本文件）

### qqbot-bridge-pro v1.0.0：桥接整合包诞生 ✅（已烧录，2026-08-06 01:05-02:00）

- 新包 `com.operit.qqbot_bridge_pro`（QQ Bot Bridge Pro）：合并原包 qqbot_bundle 全部能力 + qqbot-pro 增强能力，可顶替原包，不修改原包
- 包结构：manifest v1.0.0 + 三子包（basic 7 / gateway 6 / bridge 5 = 18 工具），resources 增强 Gateway（端口 32146）
- core.js 扩展：并入原包 qqbot_common 工具函数 + uploadMediaFile / buildSendMediaBody（图片发送）+ readTargetCandidates / resolveSendTarget（AI 主动发送候选列表）
- gateway.js：STATE_DIR 动态化（getPluginConfigDir）+ 新增底层导出 ensureGatewayStarted / stopGateway / queryGatewayEvents / removeGatewayEvents / clearGatewayEvents
- bridge_state.js：状态持久化移植（独立状态目录，与原包物理隔离）
- bridge_auto.js：自动回复桥移植（原包 dist 新版：target_chat_id / waifu_flush_sentences=3 / QQBOT_TARGET_CHAT_ID / 角色卡 / 桥接指令全保留）
- main.js：生命周期 hooks（application_on_create / foreground / terminate 自动启停 Gateway + 桥）
- 原包 Gateway + 自动回复桥已停（防同 AppID 互踢）；原包配置备份为迁移素材（target_chat_id=166abbb7-…、角色卡 b89f6656-…、渡渡指令）
- 官方文档确认：单聊流式 `/v2/users/{openid}/stream_messages` 三态；**群聊无流式**（明示不支持）→ 砍 W2，群聊用 waifu 切分
- 新环境变量：QQBOT_PRO_TARGET_OPENIDS / QQBOT_PRO_TARGET_GROUP_OPENIDS（AI 主动发送候选）、QQBOT_PRO_CHARACTER_CARD、QQBOT_PRO_WAIFU_FLUSH、QQBOT_PRO_AUTO_REPLY（复用 QQBOT_TARGET_CHAT_ID）
- GitHub：新建 `do-do026/qqbot-bridge-pro` 仓库，REST API 推送 21 文件（README / V2-BLUEPRINT / STATUS / HANDOFF / manifest / src 全部 / resources / scripts / .gitignore）
- 文档：V2-BLUEPRINT.md（从 qqbot-pro 移入 + 更新 M0 ✅ + 第 10 节接续指引）、STATUS.md（7 板块）、HANDOFF.md（70 行冷启动）、README.md
- 待验证：M1 真实验证需新会话（T009 机制）；M2 候选发送收尾；M3 流式 W1.1-W1.6；M4 生命周期 + 顶替 + UI

### 关键决策记录

- 采用 ToolPkg 而非普通 JS 包（T008：require 模块共享）
- 手写 JS 而非 TS（暂时，无编译链路，包长大再升级）
- 复用原包环境变量凭证（QQBOT_APP_ID/SECRET）
- git push 改用 REST API（T006：smart HTTP 被墙）
- 不修改原包（用户约束：独立增强，原包继续承担收消息+自动回复桥）

### qqbot-bridge-pro 第十节：M1 验证 + M2 主动发送 + B1 真相 + T16 UI ✅（2026-08-06 02:04-03:47）

- **M1 T09 端到端真实验证 ✅**（02:16）：QQ→Gateway(32146)→绑定对话 166abbb7→AI→回 QQ 全链路通；回复同时落盘 Operit 对话；M4 T13 生命周期顺带验证（切 app 自动拉起桥，startSource=application_on_create）
- **M2 主动发送实测 ✅**（02:23）：`QQBOT_PRO_TARGET_OPENIDS` 配置（CC9F593975D8C8F1E1EC72DD91305C63）+ 直接 OpenAPI POST 送达 QQ（踩 Accept 头坑 T024）；`QQBOT_TARGET_CHAT_ID` env 兜底确认
- **桥配置迁移**：listenerEnabled=true + target_chat_id + 角色卡 b89f6656 + waifu=3 落盘新包 config.json（手工补 listenerEnabled，T023）
- **B1 真相修正**（03:10）：消息重复 = 原包+新包同 AppID 双跑（02:15 初尘按原包 UI 激活原包桥），非 Gateway 去重 bug；原包停止后自愈
- **T16 UI 设置页代码完成**（612 行，compose_dsl：状态/凭证/自动化含绑定对话 ID/群增强 G1-G3 预留/运行控制，双语）；宿主 ToolPkg UI 模块加载 bug（`toolpkg registration session is not active`，官方 moodlet 佐证）→ 注册注释保留，UI 留档 `src/ui/qqbot_settings/index.ui.js`
- **群聊增强设计入蓝图 §11**：G1 聚合窗口（默认 25s，groupAggregateWindowMs/MaxItems）/ G2 选择性回复 / G3 群独立绑定（groupTargetChatId / groupAutoCreateChat）
- **原包停用 + 接管验证**：原包 listenerEnabled=false + 进程已杀 ✅；新包 Gateway 手动起可连通，但进程随 Operit 重启消亡（T028）→ 需新会话 `qqbot_pro_gateway_start` + `qqbot_pro_bridge_start` 宿主管辖接管（HANDOFF 03:25 紧急快照）
- **密钥审计**：16 文件 grep 零硬编码，凭证全走环境变量
- **GitHub**：STATUS / HANDOFF / V2-BLUEPRINT / UI 源码（src+dist）/ main.js 全部推送；踩 secret scanning 明文 token 拦截（T025）
- **遗留**：新会话接管 → B1 收尾 → G1 群聚合 → G2/G3 → M3 流式 → T16 UI 待宿主修复/市场导入路径