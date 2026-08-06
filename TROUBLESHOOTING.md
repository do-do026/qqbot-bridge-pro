# qqbot-bridge-pro 排障日志 (Troubleshooting Log)

> 记录开发/运行中遇到的问题、根因、修复方案和验证方法。
> 格式：问题 → 现象 → 根因 → 修复 → 验证 → 关联 Epic

---

## 2026-08-06

### T001：Gateway 积压消息落盘时无时间戳，AI 误判为实时消息

**现象**：
- 下午 QQ 群里发的 @Bot 消息，晚上桥接开启后才被转发到 Operit 对话
- AI 看到消息时以为是"刚刚发的"，按实时消息回复，造成对话混乱

**根因**：
- Gateway 事件自带 `timestamp`（QQ 用户发送时间）和 `receivedAt`（Gateway 接收时间），但桥接代码 `buildInboundChatContextAttachment` 没有把它们写进上下文 attachment
- 同时缺少积压检测：消息在 Gateway 队列堆积数小时后被处理，没有任何标记提醒 AI

**修复**（2026-08-06 20:4x，烧录验证）：
1. `buildInboundChatContextAttachment` 新增 `sentAt:`（来自 event.timestamp）和 `receivedAt:` 行
2. `buildGroupAggregateContextAttachment` 新增 `batchLastSentAt:` 和 `receivedAt:` 行（群聚合场景）
3. 积压检测（阈值 10 分钟）：
   - 单聊：attachment 顶部插入 `[stale: 延迟 N 分钟到达的历史消息...]`
   - 群聚合：遍历 events 找最旧 timestamp，超阈值则在聚合正文前加 `[stale: 本批消息最早发送于 N 分钟前...]`
4. 相关文件：`package/src/shared/bridge_auto.js`

**验证方法**：
- 查看入站消息的上下文 attachment 是否包含 `sentAt:` 和 `receivedAt:` 行
- 发送一条消息后暂停桥接 >10 分钟，再重新开启，检查落盘消息是否带 `[stale]` 标记

**关联 Epic**：G0 收尾（时间戳补漏）；G1（可配置 stale 策略：forward_with_timestamp / drop）

**待完善（G1）**：
- `staleMessagePolicy` 可配置字段（目前硬编码 10 分钟阈值，策略固定为 forward_with_timestamp）
- `staleMessageThresholdMs` 环境变量暴露
- Gateway 队列积压上报（status 工具显示 oldestEventAt / newestEventAt）

---

### T002：flushDueGroupBucketsAsync 中的 groupAggregateWindowMs=0 被 parsePositiveInt 误判

**现象**：配置 `group_aggregate_window_ms=0`（不聚合）时抛异常

**根因**：`processAutoReplyQueueOnceAsync` 用 `parsePositiveInt(latestContext.config.groupAggregateWindowMs, "groupAggregateWindowMs", 0)` 读取——`parsePositiveInt` 要求正整数，0 被判断为非法

**修复**（G0）：改为 `Number(latestContext.config.groupAggregateWindowMs) || 0`

---

### T003：trimRecordMap 用 Number() 解析 ISO 时间字符串导致排序失效

**现象**：records 超过 200 条时保留的不是最新 200 条

**根因**：`trimRecordMap` 里 `const updatedAt = Number(value?.updatedAt ?? 0)`——`updatedAt` 是 ISO 字符串（如 `2026-08-06T05:05:00.000Z`），`Number(ISO字符串)` 返回 `NaN`，排序完全失效

**修复**：改为 `Date.parse(value?.updatedAt ?? "") || 0`

---