# Changelog

## 2026-08-08

### T039 @消息误杀修复 + keyword_or_at 关键词触发（01:5x-02:0x）
- **根因**：QQ「接收所有消息」全量模式下 @ 消息以 `GROUP_MESSAGE_CREATE` 推送、@ 标记在 `mentions`；Gateway 未透传 mentions + 桥只认 AT 事件类型 → @ 消息被 `group_message_not_at` 误杀
- **修复**：Gateway 透传 mentions；`isGroupAtEventType` 加 mentions 兜底（id/user_openid/member_openid 匹配机器人）
- **新功能**：`groupMessageMode` 增加 `keyword_or_at`；新增 `groupKeywords`（数组/JSON/逗号分隔，env `QQBOT_PRO_GROUP_KEYWORDS`）；命中关键词也触发聚合
- **T040**：sync.sh 增加 src→dist 同步（曾因只改 src 烧录旧代码）
- 聚合窗口已按用户要求调为 **5 秒**；测试 31 项全过；已烧录生效（keyword_or_at + 关键词[渡渡,dodo,渡渡渡渡]）
- 文档：TROUBLESHOOTING T039/T040；本 CHANGELOG；GitHub 推送

### qqbot-pro v0.3.0 合并后首轮真机修复（01:1x-01:5x）
- **T037 Gateway 资源解出修复**：`ToolPkg.readResource` 第二参数应为 `outputFileName` 而非完整路径（返回值是临时路径）；新增 `ensureGatewayScriptAsync()` 统一解资源+落盘+兜底，两处启动逻辑改调；顺带清理合并残留（`--source 'qqbot_bridge_pro'` / executorKey / METADATA name）
- **验证**：删除 STATE_DIR 的 py 后启动自动解出 37759B 并 connected=true ✅
- **T038 烧录重置子包状态**：`debug_install_toolpkg` 默认 `reset_subpackage_states=true`，烧录后需重新 `set_sandbox_package_enabled` 启用三子包
- 全链路恢复：增强版 Gateway connected（渡渡在线）+ 桥 idle 轮询（C2C 绑定初尘 / 群聚合 60s at_only / waifu 3+5）
- 文档同步：TROUBLESHOOTING T037/T038；本 CHANGELOG；HANDOFF/STATUS 更新；GitHub 推送

## 2026-08-07

### Epic G1：群事件分流与可恢复缓存 ✅ 代码完成，未烧录
- `classifyEvent` 群消息分流：`at_only` 仅 `GROUP_AT_MESSAGE_CREATE` 唤醒 AI；普通消息 `context_only` 进环形缓存
- `groupContextCache`：单群 30 条 / 全局 100 条双层淘汰，`persistGroupRuntimeStateAsync` + `restoreGroupRuntimeStateAsync`（24h 窗口）
- `flushDueGroupBucketsAsync` 并发化（默认 3，上限 8）；新工具 `qqbot_pro_group_context`
- 配置 schema 增至 27 字段；`test_g1_smoke.js` 22 项全过

### qqbot-pro：冷启动接续与目录统一 ✅
- 新增 `HANDOFF.md`、`scripts/sync.sh`；软链接因 FUSE 否决（T012），主目录为唯一真相源

## 2026-08-06

### Epic G0：配置模型与迁移 ✅
- `bridge_config.js`：26 字段 schema（持久化 > env > defaults），int clamp、enum 报错
- `bridge_auto.js` 删 126 行本地配置；`qqbot_pro_bridge_configure` 扩展 10 参数
- `groupAiTimeoutMs`（120s）、锚点过期安全阀（4min）、G3 降级决策树

### 积压消息时间戳修复 T001
- `sentAt:`/`receivedAt:` 入上下文 attachment；>10min 自动 `[stale]` 标记

### 第十二节：G0 补充 + 烧录验证 + 文档体系升级 ✅ 14:54-20:57
- **需求一致性核对**：跨对话读取"QQBot桥接包需求差异核对"，G0 蓝图与初尘 14:32 需求逐条对账，全部一致
- **G0 补充·超时判定提前落地**：`groupAiTimeoutMs` 字段（默认 120000）；群聚合 AI 调用 120s/单次尝试→超时抛 `group_ai_timeout`；锚点超 4 分钟→`anchor_expired_dropped` 放弃+记录。完整降级决策树（replyTo/fallbackPreference/active_send）钉入 G3
- **G0 补充·积压消息时间戳修复**（20:3x）：`buildInboundChatContextAttachment` 加 `sentAt:`/`receivedAt:`；群聚合加 `batchLastSentAt:`；>10min 自动 `[stale]` 标记
- **烧录验证**：15:59 首次烧录，三个子包启用，configure 参数列表出现全部 26 字段；20:3x 二次烧录（时间戳修复），真机新窗口全链路通
- **文档体系升级**：新增 `TROUBLESHOOTING.md`（T001-T003）、`CHANGELOG.md`、`DEVLOG.md`（含第十二节）；HANDOFF 文件地图补全
- **GitHub 推送**：REST API 批量推送 README/V2-BLUEPRINT/STATUS/HANDOFF/CHANGELOG/TROUBLESHOOTING，全部 200/201

### Bug 修复
- `groupAggregateWindowMs=0` 误判 → `Number()`；`trimRecordMap` ISO 排序失效 → `Date.parse()`

### qqbot-pro M0-M1 ✅
- 架构 `ARCHITECTURE.md`（335 行），手写 JS 免编译
- v0.1.0：`core.js` + 5 工具（撤回/Markdown/引用/输入态/查询），首烧录成功
- v0.2.0：增强 Gateway（端口 32146），6 工具；T010：原包用前缀匹配，T05 大幅减量

### qqbot-bridge-pro v1.0.0 诞生 ✅ 01:05-02:00
- 新包 `com.operit.qqbot_bridge_pro`，三子包 18 工具，可顶替原包
- core.js 373 行、gateway.js STATE_DIR 动态化、bridge_state/auto 移植
- 原包配置迁移：target_chat_id=166abbb7…、角色卡 b89f6656、waifu=3
- 群聊无流式→砍 W2，用 waifu 切分；5 新 env 候选列表
- GitHub 建仓 + REST API 推 21 文件（T006：smart HTTP 被墙，永久 REST）

### 第十节：M1 验证 + M2 主动发送 + B1 真相 + T16 UI ✅ 02:04-03:47
- M1 全链路：QQ→Gateway→绑定对话→AI→QQ，回复落盘 ✅
- M2 主动发送：env 候选兜底，OpenAPI POST 送达（T024：缺 Accept 头误报 appid invalid）
- B1 真相修正（03:10）：重复 = 原包+新包同 AppID 双跑（初尘 02:15 按原包 UI 激活了原包桥），非去重 bug
- T16 UI 612 行 compose_dsl 完成；宿主 ToolPkg UI bug（registration session not active）→ 注释保留
- 群聊蓝图：G1 聚合窗口（25s）/ G2 选择性回复 / G3 群独立绑定
- 原包已停；手动 gateway 重启消亡（T028）；工具列表为会话快照（T009）

### 第十一节：三连修复 + B1 去重/空回复重试 + 闭环 ✅ 03:40-04:23
- 修复① nohup（T030）：移植丢失 → 补上，进程 PPID=1，免疫 SIGHUP
- 修复② 探活抛异常（T031）：`httpToControl` 未捕获连接失败 → 加 try-catch
- 修复③ ws 握手（T032）：1s 超时+缺 Accept 头 → 10s 宽超时+补头，connected=true
- B1 入队去重（T033）：`append_event` eventKey 检查；"走走"同消息 3 次处理根因
- 空回复重试（T034）：最多 3 次 5s/10s 退避，不再落盘空条目
- T16 UI 二次实测：宿主 bug 复现 → 回滚；手动打包 .toolpkg SOP 入 HANDOFF §5
- 文档全刷至 04:18；认知：gateway 独立进程 vs bridge JS 定时器 = 进程边界
- GitHub REST 推送 10 文件全 OK