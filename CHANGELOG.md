# Changelog

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