# Changelog

## 2026-08-14

### 📦 市场留档前审计：描述 vs 代码逐项核对 + manifest 定稿（16:19-16:35）
- **审计**：用户提供的市场描述 10 项宣称逐项对照源码 + 实时验证（`qqbot_pro_me`、`qqbot_pro_bot_state` 均 200 OK）。
- **发现**：
  - 全部宣称能力均有实现；两处措辞不准：「持久化恢复」实为「可配置时长恢复（默认24h）」；「waifu 切分」实为统一句末符 chunker（群聊固定关 waifu）。
  - 与原包关系：代码复用 `QQBOT_APP_ID/APP_SECRET` 凭证（非代码依赖），同 AppID 下 Gateway 与原包二选一。
- **manifest.json 定稿**（zh/en 同步重写）：补上群成员身份映射（G7）、AI 精确回复指定消息（G3，标注「真机验证中」）、凭证复用说明；bridge 子包描述同步。
- **烧录**：16:32 定稿版烧录（T038 重置子包，已重新启用 + 重启桥 + Gateway connected）。
- **审计结论**：无「描述有但代码没有」的硬差距；未实现项（G7完整/G5探针/可靠性/G6 UI）已在 STATUS §6 / ARCHITECTURE §11 / README Roadmap 诚实标注。

## 2026-08-13

### 🔧 G3 引用气泡修复 + 文档诚实标注（17:43-17:5x）
- **问题**：初尘实测群聊回复无引用气泡。排查确认：①新代码已生效（稳定批次键/编号/锚点均在跑，平台返回 ref_idx），但被动回复仅带 `msg_id` 时 QQ 客户端不显示引用样式；②AI（渡渡角色卡）未输出 replyTo 协议头，走默认回复最后一条。
- **修复**：
  - `sendReplyToQQAsync`：群聊被动回复同时携带 `message_reference`（引用选中的消息），让客户端显示引用气泡。
  - `parseGroupReplyDirective`：先剥离 `<think>` 思维链块再解析 JSON（防角色卡思考干扰）。
  - 群聚合附件指令加强为「必读·群聚合回复协议」：回复正文以 JSON 控制头开头（独占第一行），多段只需一次。
- **测试**：G3 单测 21/21（新增 think 剥离用例）；G1 49/49、G4 29/29 无回归。
- **烧录**：2026-08-13 17:45 烧录 + 重启桥（子包状态被 T038 重置，已强制重新启用三个子包）。
- **待真机验证**：①引用气泡是否显示 ②active_send 主动群消息是否被平台接受 ③AI 协议头遵循率。
- **文档**：README 加 Roadmap、STATUS 加 §6 架构规划 vs 已实现、ARCHITECTURE 加 §11 规划路线，全部诚实标注 🟢/🟡/🔴。
- 备注：初尘决定暂时搁置旧群对话（"把老公喊起来啥也不干"），G3 验证先以新群/新对话为准。

## 2026-08-12

### 🎯 Epic G3 replyTo 代码完成（20:31-21:0x）
- **稳定批次键**：`GROUP_AGGREGATE:{groupOpenId}:{Date.now()}` → `hash(sorted(eventKeys))`（排序后哈希），同批事件重试幂等。
- **聚合编号**：聚合文本每条触发消息标 `[#N][标签] 内容`，N 对应 events[N-1]。
- **AI 协议头**：`{replyTo, content, fallbackPreference}`，容错解析（```json包裹/前缀文字/content缺省回退正文），replyTo 无效降级最后一条，fallback 非法默认 drop。
- **精确锚点被动回复**：按 replyTo 选中事件的 replyHint.msg_id 回复，多段共用锚点 msg_seq 递增。
- **active_send 降级**：锚点过期时按 AI 选择主动群消息点名发送（`sendProactiveGroupMessageAsync`，无 msg_id；平台是否接受待实机验证）。
- **幂等防重**：发送成功后 records[aggregateEventKey].sent=true，同批事件再次 flush 走 alreadySent 跳过。
- **测试**：`scripts/test_g3_replyto.js` 20/20 通过；G1 49/49、G4 29/29 无回归。
- **状态**：代码完成 + 同步 dev_package，**待烧录 + 真机验证**（STATUS §4 任务 8/9）。
- 相关文档：STATUS §3/§4、ARCHITECTURE §7 已更新。

## 2026-08-12（早段）

### 📄 根目录文档体系重建（19:04-20:14）
- **背景**：新窗口 AI 冷启动核对时发现根目录 `README.md` / `ARCHITECTURE.md` / `STATUS.md` 严重滞后（仍写「原包承担桥接」「官方流式待做」「target_chat_id 群固定目标」等已被推翻的口径），与 `bridge-docs` 和真实代码不一致。
- **重建**：
  - `README.md`（79行）：用户效果、当前状态、运行原则、工程位置、开发流程、平台限制。
  - `ARCHITECTURE.md`（249行）：系统目标、需求原则、运行时组件、事件分类、会话路由与群聚合、AI 调用与回复链路、**G3 接口契约（§7）**、配置模型、平台边界、技术债登记。
  - `STATUS.md`（108行）：能力验收矩阵（四态口径）、当前运行状态实测、Epic 进度、**G3 任务清单（§4）**、已知问题、文档体系说明。
- **备份**：旧版三份已存 `*.backup_20260812_1913`，可回退。
- **未改动**：源码、`bridge-docs/`；Gateway 与桥保持运行。
- **新坑（T047）**：单次 `create_file` 参数过长会被中转层截断且文件不落盘（GPT 中转站反复复现）；解决：分片写入（骨架 + `<!-- APPEND_HERE -->` 尾标记 + `edit_file` 逐片追加）。
- **当前主线**：G3 replyTo（编号回复/稳定批次键/引用锚点/过期降级）。

## 2026-08-10

### 🎉 链路全闭环 + Epic G2 automatic 完成（02:30-03:14）
- **C2C 私聊链路闭环实测（02:41）**：俄耳甫斯故事长文切 8 段**全部 ok:true 送达**（segmentResults 完整记录）——T045 修复后发送可靠性闭环
- **T046 卡死自愈生效**：02:29 自动循环在 Gateway 重连窗口宿主调用挂起（表现为"循环死了但 running=true"）；修复：tick watchdog（5 分钟强制重置+代际锁）+ sendMessageStreaming Promise.race 硬超时；已烧录
- **Epic G2 automatic 模式完成并实测闭环（03:14 初尘确认）**：`buildGroupNeighborContextAttachment`（锚点前后各 groupContextBefore/After、最多 groupContextLimit、复用 G7 标签）；flush 时 mode=automatic 自动附加邻近上下文附件（`GROUP_NEIGHBOR_CONTEXT`），不额外落盘
- **实测记录**：03:10 初尘反馈"只获取了艾特消息"→ 排查确认普通消息已进缓存桶（qqbot_pro_group_context 查得 5 条、member 显示 [初尘]），根因是 mode 仍为 off → 切 automatic 后 03:14 复测 **AI 成功看到邻近上下文** ✅；初尘认可"作为附件进来挺好的"（token 按次消耗、不落盘、缓存有容量上限不无限膨胀）
- **测试**：G1 冒烟 **49/49**（新增 9 项 G2 automatic 用例）+ G4 29/29；已烧录、桥已重启
- 文档：CHANGELOG/HANDOFF 更新；GitHub 推送

## 2026-08-09

### T045 修复：HTTP 200 + 业务错误码误判成功（01:29-01:32）
- **现象**：G4 上线后实测长回复切 3 段，Operit 有完整回复但 QQ 只收到前半段；桥记录全部"成功"
- **根因**：`requestJson` 只按 HTTP 状态码判成功；QQ 平台业务失败可能 HTTP 200 + `{"code":非0}` → 静默丢失后半段
- **修复**：①requestJson 增加 code/retcode 业务码校验（≠0 判失败）；②流式发送记录 `sendResult.segmentResults`（每段 msgSeq/code/message/responseId）供调试
- **待验证**：下次长回复实测后查 segmentResults 确认后段是否被平台拒绝及错误码
- 测试 G1 40/40 + G4 29/29；已烧录、桥已重启

### Epic G4 统一 Waifu chunker——完成（01:13-01:17）
- **新模块** `package/src/shared/waifu_chunker.js`：纯 JS、无 Java 依赖，单聊流式 + 群聊完整文本共用同一状态机（禁止再维护两套正则）
- **规则落地**：句末计数 `。！？\n`；连续换行只计 1 句（跨 chunk 边界连续跟踪）；输出时连续换行归一化；400 字符独立安全兜底
- **集成**：`bridge_auto.js` 的 `splitReplyBySentenceCount` 委托 `splitText`；`processSingleEventAsync` 流式改用 `WaifuChunker`（原 pendingBuffer/SENTENCE_END_REGEX 状态机删除）
- **行为改进**：单聊流式从"凑够即整段发"改为精确切分（8 句 limit3 → 3/3/2，而非 8 句一条）
- **测试** `scripts/test_g4_waifu_chunker.js`：29/29 通过（emoji/无标点 400 兜底/连续空行/跨 chunk 换行/流式累积/与旧语义一致性）；G1 冒烟 40/40 无回归
- 已烧录、桥已重启（新代码生效）

## 2026-08-08

### 🎉 群链路全闭环（03:07-03:12）+ T043/T044
- **全链路闭环验证**：`@渡渡 (困困窝)` → mentions 透传识别 @ → 5s 聚合 → AI 完整回复（叫出"初尘"——G7 绑定生效）→ 回传 QQ ✅
- **T043**：Gateway 资源只解出一次，包内 mentions 透传更新永不生效（旧 py 永驻）；修复：每次启动强制重新解出覆盖
- **T044**：烧录后桥循环被重置为停止（JS 运行时重建，timer 丢失）；规避：烧录后必须手动 `qqbot_pro_bridge_start`
- **G7 实测生效**：聚合上下文初尘显示为"初尘"，AI 回复点名初尘 ✅
- 文档：TROUBLESHOOTING T043/T044；CHANGELOG 本段；HANDOFF 更新；GitHub 推送

### G7 群成员身份绑定——最小版落地（02:29-02:33）
- **需求确认**：初尘在群里的 id 可从消息 `author.id` 直接获取（CC9F593975D8C8F1E1EC72DD91305C63，与 C2C openid 相同）
- **实现**：`groupMemberBindings` 配置（`[{memberOpenid, groupOpenid?, title}]`，env `QQBOT_PRO_GROUP_MEMBER_BINDINGS`）；聚合 attachment 与 `qqbot_pro_group_context` 查询的成员标签优先用绑定名，未绑定回退 QQ+后四位
- **已配置**：初尘 CC9F59… → "初尘"（全局生效）
- **测试**：新增 G7 用例 5 个（绑定命中/群限定/未绑定回退/归一化），**40/40 全过**；已烧录、桥已重启生效
- 文档：CHANGELOG 本段；TROUBLESHOOTING 待补 T043；HANDOFF/STATUS 已同步 G7 实施状态

### 群链路全通 + 三连修复（02:13-02:24）
- **开窗成功**：群 @/关键词触发 → 自动创建 `[QQ][群]` 对话窗 ✅
- **T041**：群聚合 `waifu:true` + 无流式收集器 → AI 回复恒空；修复：群聚合显式 `waifu:false`（用自己的群聊 5 句切分）
- **T042**：机器人群内 member_openid ≠ botUserId，@ 识别漏判；修复：content `<@xxx>` 提取 + mentions 交叉验证
- **新需求入蓝图（G7）**：群成员身份绑定（初尘 openid → "我"，其他群友代号），昵称获取后续评估；实施顺序插在 G3 后
- **文档**：V2-BLUEPRINT 新增 §13 官方文档参考（Intents/全量模式/时效等关键结论）；TROUBLESHOOTING T041/T042；本 CHANGELOG；HANDOFF/STATUS 同步
- 测试 35/35 全过；已烧录运行（keyword_or_at + 关键词[渡渡,dodo,渡渡渡渡] + 5s 窗口）

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