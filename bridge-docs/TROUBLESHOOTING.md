# qqbot-bridge-pro 排障日志 (Troubleshooting Log)

> 记录开发/运行中遇到的问题、根因和修复方案。T 序号递增。

## 2026-08-06

### T001：积压消息无时间戳，AI 误判为实时
- 现象：下午 QQ 消息晚上才桥接，AI 按实时回复
- 根因：Gateway 事件有 `timestamp` 但桥接没写进上下文 attachment
- 修复：`sentAt:`/`receivedAt:` 入 attachment；>10min 自动 `[stale]` 标记

→ **2026-08-06 20:3x 详细修复合入（第十二节）**：

**发现场景**：G0 烧录后初尘在新窗口测试，群消息桥接通了——但下午 4 点没发过去的 @ 消息被 Gateway 一起转发到对话里。AI 以为这些消息是"刚刚发的"，按实时消息回复，对话时间线混乱。

**定位过程**：问题拆成三个子问题——
1. 消息是下午积压的还是刚进来的？→ Gateway Python 代码 `qqbot_pro_gateway.py` 第 364-365 行确认每个事件自带 `timestamp`（QQ 发送时间）和 `receivedAt`（Gateway 收到时间），但桥接 JS `buildInboundChatContextAttachment` 完全没写进上下文 attachment。
2. 消息落盘没有带实际时间→ `buildInboundChatContextAttachment` 和 `buildGroupAggregateContextAttachment` 补了时间戳行：单聊加 `sentAt:`/`receivedAt:`，群聚合加 `batchLastSentAt:`/`receivedAt:`。
3. 积压消息要不要直接丢弃→ 暂不做丢弃（G1 可配置策略），先做醒目标记：超过 10 分钟（`STALE_THRESHOLD_MS = 10*60*1000`）的消息在上下文顶部插入 `[stale: 延迟 N 分钟到达的历史消息...]`，AI 看到就知道不是实时的。

**涉及文件**：`package/src/shared/bridge_auto.js`（`buildInboundChatContextAttachment`、`buildGroupAggregateContextAttachment`、`flushGroupBucketAsync`）

**后续（G1）**：`staleMessagePolicy`（forward_with_timestamp / drop）做成可配置字段，`staleMessageThresholdMs` 暴露 env。

### T002：groupAggregateWindowMs=0 被误判
- 现象：传 0（不聚合）抛异常
- 根因：`parsePositiveInt` 要求正整数，0 非法
- 修复：`Number() || 0`

### T003：trimRecordMap ISO 时间排序失效
- 现象：超 200 条保留的不是最新
- 根因：`Number(ISO字符串)` 返回 `NaN`
- 修复：`Date.parse()`

### T004：git 在 /sdcard 写 loose object 失败
- 现象：`git add` 报 `unable to write file`
- 根因：Android FUSE 与 git inode 模型不兼容
- 修复：/root ext4 建镜像仓库，git 操作全部走镜像

### T005：proot 下 git dubious ownership
- 现象：`fatal: detected dubious ownership`
- 根因：proot 以 root 运行，文件属主为 uid 10272
- 修复：`git config --global --add safe.directory`

### T006：git push 被墙，REST API 通
- 现象：`git push` 超时，`curl github.com` 返回 000，`api.github.com` 200
- 根因：国内阻断 git smart HTTP，REST API 不受限
- 修复：永久改用 Python + REST API 上传（GET sha → PUT base64）

### T007：sandbox 脚本读不到环境变量
- 现象：`getEnv("QQBOT_APP_ID")` 返回空
- 根因：sandbox 独立上下文，不注入 Operit env
- 修复：无需修（真实工具调用时宿主注入），sandbox 仅做纯逻辑验证

### T008：require 相对路径在 sandbox 不可用
- 现象：`require("../shared/core.js")` 报 `Cannot resolve module`
- 根因：sandbox 单文件模式无 CommonJS 上下文
- 影响：决定项目必须用 ToolPkg（subpackage require 共享 core.js）

### T009：烧录后工具当前会话不可见
- 现象：`debug_install_toolpkg` 成功但同会话 `Tool not found`
- 根因：工具列表是会话启动快照，烧录不刷新
- 修复：机制如此，新开会话即见

### T010：原包 Gateway 事件过滤误判
- 现象：以为需整块重写才能收群事件
- 根因：原包用前缀匹配（`C2C_*`/`GROUP_*`），群事件已入队
- 修复：T05 精准增强——白名单扩展 + `infer_scene` 扩展 + 端口 32146

### T011：GitHub 分支 master vs main
- `git init` 默认 master，GitHub 默认 main → `git branch -m main`

### T012：Android FUSE 不支持 symlink
- `ln -s` 报 `Permission denied`，proot 下亦失败 → 否决软链方案

### T013：dev_package 与主目录双副本漂移
- 两个物理目录，改代码手动 cp 易漏步
- 修复：主目录为唯一真相源，`scripts/sync.sh` 单向同步+语法检查

### T014：原包 src/dist 漂移
- dist 有 `target_chat_id`/`waifu_flush_sentences`，src 没有
- 根因：有人直接改过编译产物
- 修复：只从 dist 移植，新包手写 JS 单版本防再次漂移

### T015：内置包与外部包版本差异
- 内置 `qqbot.toolpkg` 是旧构建，外部版（Aug 5）为实际生效版
- 修复：摸源码以外部生效包为准

### T016：sed 多行替换失败
- `unterminated 's' command`
- 修复：拆步 sed 单行替换 + Python 精确块替换

### T017：bridge_auto 映射残留
- `core.buildSendMessageBody` 不存在，函数名是 `buildSendBody`
- 修复：`sed` 全局纠正

### T018：gateway.js STATE_DIR 硬编码旧包目录
- 拷贝复用时常量未更新 → `getStateDir()` 动态解析

### T019：群聊无官方流式接口
- 群聊流式 URL 404，文档明示不支持
- 修复：砍 W2，群聊用 waifu 三句切分

### T020：REST 上传脚本中途超时
- 串行上传 14 文件到第 6 个超时
- 修复：幂等重跑——GET 取 sha 判断已存在则走 update

### T021：package_proxy 参数格式失误
- `params` 双层包裹 → `tool_name`+`params` 平级

### T022：子包烧录后 toolCount=0
- `reset_subpackage_states=true` 清除了启用状态
- 修复：传 `activate_subpackages` 显式激活或 `reset_subpackage_states=false`

### T023：listenerEnabled 无代码置 true
- 桥配置 enabled 但 `disabledReason=listener_disabled`
- 根因：无任何代码写 `listenerEnabled=true`，首次必须手工 config.json

### T024：腾讯网关缺 Accept 头误报 appid invalid
- 不带 `Accept: application/json` 返回 100007 误导排查
- 修复：所有 HTTP 调加该头（core.js 已带）

### T025：GitHub secret scanning 拦截明文 token
- HANDOFF 写 token 明文，PUT 返回 409
- 修复：改为"见记忆库凭证条目"引用

### T026：含 UI 模块的包热烧录 container 未出现
- `registerToolboxUiModule` 后烧录报 `container did not appear`，包不进注册表
- 根因：宿主 ToolPkg UI 加载 bug（moodlet 同病，registration session not active），文件版/内联版/冷启动全部复现
- 修复：UI 代码留档，注册注释保留，回滚无 UI 版保核心链路。待宿主修复或走 .toolpkg 导入

### T027：消息重复真相 = 原包+新包双跑
- 同一 messageId 两条不同 AI 回复（"菇咕弹…"/"通了通了…"）
- 根因：02:15 初尘按原包 UI 激活原包桥，双 Gateway 同 AppID 并存（B1 修正）
- 修复：顶替时确保原包完全停止

### T028：手动 Gateway 进程随重启消亡
- proot 手动 nohup 起的进程重启即消失
- 根因：proot 后台进程生命周期绑定 Operit
- 修复：必须用宿主管理——`gateway_start`（hiddenExec + executorKey）

### T029：宿主 registration session 报错
- hooks 不触发，registerToolPkg 无日志，moodlet 同病
- 根因：宿主在特定加载路径下 registration session 未激活
- 修复：非包侧可修，文档接管路径：新会话→gateway_start+bridge_start

### T030：新包缺 nohup → 重启后进程死亡（移植回归）
- 原包 gateway 可跨重启存活，新包每次需重起
- 根因：原包启动命令 `nohup python3...&`，新包移植时丢失（D4 回归）
- 修复：src+dist 两处启动命令加 `nohup`（共 4 处），进程 PPID=1，免疫 SIGHUP

### T031：httpToControl 未捕获连接失败 → gateway 永远起不来
- gateway/bridge 全部 Step error；hook 每次报 `Failed to connect to 127.0.0.1:32146`
- 根因：`Tools.Net.http` 连接失败直接抛异常，`isServiceRunning()` 中断在判断"是否运行"
- 修复：`httpToControl` 加 try-catch，连接失败返回 `success:false` → 正常走启动流程

### T032：ws 握手超时 + 缺 Accept 头 → 连不上腾讯网关
- 进程启动但 `run error: TimeoutError`，connected:false
- 根因：`SimpleWebSocketClient` 默认 timeout=1.0（握手阶段过短）+ 缺 `Accept: application/json`
- 修复：握手阶段 `sock.settimeout(10.0)`，补 Accept 头，握手后切回轮询超时

### T033：入队无去重 → 同消息处理多次 + 空回复死循环
- "走走"同消息处理 3 次（04:09/04:10/04:12），前两次落空条目
- 根因：`append_event` 无去重；处理失败不移事件→死循环重试
- 修复：`append_event` 加 eventKey 去重（`reversed(queue)` 遍历）

### T034：AI 空回复无重试 → 偶发落空条目
- 前两次 AI 回复为空白（初尘看到"空恢复"）
- 根因：空 `aiResponse` 直接抛错不重试；`persist_turn:true` 每调必落盘
- 修复：`generateAiReplyAsync` 空回复自动重试 3 次（5s/10s 退避），3 次全空才抛错

---

## 2026-08-07

### T035：三包并存 + bindings 残留 → 群消息仍绑指定对话 / C2C 延迟 / 消息重复

**现象**（初尘实测）：
1. 群消息仍进入 `target_chat_id=166abbb7` 指定对话，没有按 group_openid 新建独立对话
2. C2C 单人消息延迟较久才被桥接进 166abbb7
3. 同一条消息在 Operit 对话上下文里被落盘两次

**根因**：
1. **bindings 持久化残留**：旧版运行时把 `group:{group_openid}` → target_chat_id(166abbb7) 写进了 `auto_reply_state.json` 的 bindings；新版 `resolveBoundChatIdAsync` 优先复用 bindings 历史绑定（findChat 成功即返回）→ 群消息继续被吸进 166abbb7。
2. **三包并存（T027 升级版）**：`PackageManager.xml` 的 `toolpkg_subpackage_states` 中 `qqbot_auto_reply`（原包 qqbot_bundle）、`qqbot_pro_basic`/`qqbot_pro_gateway`（旧增强包 qqbot-pro）、`qqbot_bridge_pro_*`（新包）**全部 enabled=true**。同 AppID 下多包各自处理同一条消息 → ①同消息重复落盘 ②C2C 回复时 msgseq 去重冲突（QQ 报"消息被去重，请检查请求msgseq"）→ 发送失败重试 → 延迟。

**修复**：
1. `PackageManager.xml`：`qqbot_auto_reply`/`qqbot_pro_basic`/`qqbot_pro_gateway` 置为 `false`（保留 bridge_pro 三子包）；备份 `.bak_20260807`；脚本 `scripts/fix_pkg_states.py`
2. 清理 `auto_reply_state.json` bindings 中所有 `group:*` 条目（**保留 `c2c:` 绑定**）；脚本 `scripts/clean_group_bindings.py`
3. 重启 Operit 生效

**验证**：重启后群消息按 `group:{group_openid}` 新建/复用独立对话；C2C 仍走 `c2c_fixed_bindings` → 166abbb7；同一条消息只处理一次。

**关联**：T027、T033、T034

---

### T036：外部包 UI 注册 API 选型——registerUiRoute 而非 registerToolboxUiModule

**现象**：bridge-pro 的设置页 UI（compose_dsl，611 行）反复注册失败（`container did not appear` / registration session not active），且旧版注册方式（无保护）曾导致整个包坏掉；原包（内置）UI 正常。

**根因（2026-08-08 对照成功案例修正）**：
- 原包 `com.operit.qqbot_bundle` 是**内置包**，用 `ToolPkg.registerToolboxUiModule({ id:"qqbot_settings", screen: require(...) })` 可以注册成功。
- 外部包 `com.operit.mood_panel`（情绪面板，设置页成功）用的是另一套 API：
  - `ToolPkg.registerUiRoute({ id, route:"toolpkg:<pkg>:ui:<id>", runtime:"compose_dsl", screen:"dist/ui/index.ui.js"（字符串路径）, keepAlive:false, title })`
  - `ToolPkg.registerNavigationEntry({ id, route, surface:"main_sidebar_plugins", title, icon, order })`
- bridge-pro 此前沿用内置包的 `registerToolboxUiModule` → 宿主对外部包该 API 不友好 → UI 失败。与 UI id 是否冲突**无关**（bridge-pro id=`qqbot_bridge_pro_settings` 本就独立于原包 `qqbot_settings`；qqbot-pro 甚至没有 UI）。
- 附注：qqbot-pro 无 UI（main.js 声明"纯工具包"）；"启动 qqbot-pro 后原包 UI 变化"是运行层状态变化（gateway 归属），非 UI 覆盖。

**修复**：main.js 改用 `registerUiRoute` + `registerNavigationEntry`（screen 传 `dist/ui/qqbot_settings/index.ui.js` 字符串路径），并保留 try-catch（UI 失败不拖垮工具/hooks）。

---

### T037：ToolPkg.readResource 第二参数是 outputFileName，不是完整路径（Gateway 资源从未解出）

**现象**：Operit 重启后调用 `qqbot_pro_gateway_start` 报空错误（`Step error:` 无内容）；`gateway_service.log` 只有一行 `python3: can't open file '.../qqbot_pro_gateway.py': No such file or directory`；`STATE_DIR` 里 py 文件永远不存在。

**根因**：`qqbot_pro_gateway.js` 两处启动逻辑（`qqbot_pro_gateway_start` 与 `ensureGatewayStarted`）都写成：
```js
await ToolPkg.readResource(RESOURCE_KEY, `${STATE_DIR}/${SERVICE_FILE}`);
```
但类型定义是 `readResource(key: string, outputFileName?: string): Promise<string>`——**第二参数是文件名，不是完整目标路径**；返回值才是解出的临时路径。错误用法导致资源要么写进临时目录（名字错乱）、要么静默失败，返回值被丢弃。随后 `nohup python3 '完整路径'` 找不到脚本，只留下空错误。旧工程 `qqbot-bridge-pro` 没有此坑，是因为它从未重新烧录后重启过 Gateway；原包无此坑是因为其 Gateway 内嵌 JS 不依赖资源文件。

**修复**（2026-08-08）：
1. 新增公共函数 `ensureGatewayScriptAsync()`：`readResource(key, SERVICE_FILE)` 拿临时路径 → `Tools.Files.copy(tmp, target)` 落到 STATE_DIR；readResource 不可用时兜底从开发目录复制；全失败抛明确错误。
2. 两处启动逻辑统一改调 `ensureGatewayScriptAsync()`。
3. 顺带清理合并残留：`ensureGatewayStarted` 里的 `--source 'qqbot_bridge_pro'` → `'qqbot_pro_auto'`、executorKey `qqbot_bridge_pro_gateway` → `qqbot_pro_gateway`、METADATA name 残留。

**验证**：删除 STATE_DIR 的 py 后 `qqbot_pro_gateway_start` 自动解出 37759B 脚本并 connected=true ✅

---

### T038：debug_install_toolpkg 默认 reset_subpackage_states=true，烧录后子包被重置为未导入

**现象**：烧录新包后 `use_package("qqbot_pro_gateway")` 报 `Package not found`；`list_sandbox_packages` 显示三个子包 `enabled:false, imported:false`。

**根因**：`debug_install_toolpkg` 的 `reset_subpackage_states` 参数默认 `true`，会按 manifest 默认值重置子包启用/导入状态（对已安装包是全新状态）。

**修复/规避**：
1. 烧录时传 `reset_subpackage_states=false` 可保留状态（但首次安装时子包仍是默认 enabled_by_default 状态，通常也要手动确认）；
2. 烧录后若子包状态被重置，逐个 `operit_editor:set_sandbox_package_enabled(package_name, true)` 重新启用，再 `use_package` 激活；
3. 重新烧录后工具名会短暂不可用（元数据刷新），重新 use_package 即恢复。

**关联**：T009（会话快照）、T027/T035（多包子包状态混乱）

---

### T039：QQ「接收所有消息」全量模式下，@ 消息以 GROUP_MESSAGE_CREATE 推送，@ 标记在 mentions——桥误杀 @ 触发

**现象**：初尘在群里 @渡渡 + 发普通消息共 3 条，Gateway 日志显示三条**全是 `GROUP_MESSAGE_CREATE`**（无 `GROUP_AT_MESSAGE_CREATE`）；桥全部 `group_message_not_at` 跳过，@ 消息不触发 AI、不建群对话。

**根因**（2026-08-08 对照官方文档确认）：
1. QQ 官方「群消息（全量模式）」文档原文：*"当机器人开启了'接收所有消息'功能后，群里的每一条消息（不限于@机器人）都会推送此事件。各字段含义与 GROUP_AT_MESSAGE_CREATE 完全一致。"*——即：**@ 消息也会以 GROUP_MESSAGE_CREATE 推送，@ 标记在 `mentions` 数组里**。
2. 我们的 `classifyEvent` 只认 `eventType === "GROUP_AT_MESSAGE_CREATE"`，且 Gateway 事件对象**未透传 mentions**（只在 rawPayload 里，桥读取时被 sanitize 掉）→ @ 消息被误判为普通消息。
3. 官方 intents 也确认：`GROUP_AT_MESSAGE_CREATE` 属于 `GROUP_AND_C2C_EVENT (1<<25)`，我们的 intents 已含 1<<25（C2C 能收到即证明），所以**不是 intents 问题，是事件类型 + mentions 识别缺失**。

**修复**：
1. Gateway Python `build_event` 增加 `"mentions": data.get("mentions") if isinstance(data.get("mentions"), list) else None` 透传。
2. `isGroupAtEventType(eventType, event, botUserId)` 增强：AT 类型直接 true；否则 GROUP_MESSAGE_CREATE 若 `mentions` 含机器人 id（id / user_openid / member_openid 任一匹配）→ 视为 @ 触发。
3. 新增 **keyword_or_at 模式**（用户需求）：`groupMessageMode` 枚举扩展 `["at_only","keyword_or_at","all"]`，新增 `groupKeywords` 字段（数组/JSON/逗号顿号分隔，env `QQBOT_PRO_GROUP_KEYWORDS`）；keyword_or_at 下普通群消息命中关键词也触发。
4. 冒烟测试新增 8 用例（mentions 识别 ×3、关键词 ×3、归一化 ×3），31 项全过。

**验证**：待初尘在群里发"渡渡"或 @渡渡实测（管理端若未开 @事件，全量模式下 mentions 兜底也能触发）。

---

### T040：sync.sh 不同步 src → dist，烧录了旧代码（dist 漂移）

**现象**：改完 `src/shared/bridge_auto.js` 等文件、跑 sync.sh、烧录后，工具描述仍是旧的（无 keyword_or_at / group_keywords）；解包安装产物 grep 无新代码。

**根因**：`sync.sh` 只做「主目录 package → dev_package」整目录复制，**从不把 src 同步到 dist**（HANDOFF 一直说"改完 src 也要 cp 到 dist"，但脚本没做，人工容易漏）。测试直接用 src 所以全绿，烧录却用 dist → 旧代码上线。

**修复**：sync.sh 增加步骤 0.5「src → dist 同步」（main.js / shared / packages / ui 下所有真实存在的 JS 文件），以后跑一次 sync.sh 即保证 src==dist==dev_package==安装包。

**关联**：T037（readResource 参数错误）同属"改 src 忘 dist"类问题；建议后续做 src↔dist 一致性自动校验。

**验证**：.toolpkg 导入后重启 Operit，侧边栏/工具箱是否出现"QQ Bot Bridge Pro"入口。