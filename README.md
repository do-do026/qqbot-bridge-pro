# qqbot-bridge-pro（QQ Bot Bridge Pro）

Operit 的独立 QQ Bot 桥接包。它把基础 QQ Bot 收发、增强 Gateway、Operit 对话桥接和 AI 主动发送能力合并到一个 ToolPkg 中，不修改原包；同一 AppID 下应只运行一个 Gateway。

## 已经能做

- Gateway WebSocket 常驻收取 C2C、群消息及增强事件，支持独立启动、停止和状态查询。
- QQ 消息桥入 Operit，并将 AI 回复发回 QQ；支持文本、Markdown、引用、输入态和图片。
- C2C 按 `openid` 隔离：指定 openid 可绑定指定 Operit `target_chat_id`；其他用户按 openid 自动创建独立对话。
- 已发来消息的 C2C 联系人可由 AI 按需查询，不会把全部联系人自动注入 AI 上下文；默认只返回后四位，明确绑定/发送时才揭示完整 openid。
- 群聊按 `group_openid` 复用对话并支持聚合；群昵称查询默认关闭，关闭或失败时只用 openid 后四位区分。
- 当前 Waifu 实现只统计 `。！？`：单聊默认 3 句，群聊默认 5 句，并保留 400 字符兜底；新增规划将加入归一化后的非空换行，尚未实施。
- 可设置唯一 C2C 主动发送目标；工作流唤醒 AI 后可主动发送文本或图片。主动消息仍受 QQ 用户开关、频控及平台权限约束。
- 图片可使用本地路径或网络 URL；可配置多个本地图片目录供 AI 按需查询/选择。
- 环境变量、工具 API 和持久化配置均可用于角色卡、Waifu、聚合、绑定、主动目标等设置。

## 能做但本包当前未完成

- 完整设置 UI：源码已有底子，但宿主 compose_dsl ToolPkg UI 注册/导入仍有兼容问题；当前核心设置由工具 API 和环境变量完成。
- QQ 官方 C2C `stream_messages`：官方提供接口，Operit 也可发 HTTP 请求；本项目保留架构位置，但按产品决定不实现、不注册发送工具。
- 图片目录浏览/搜索的专用工具：环境变量和目录读取底层已就位，仍需补文件筛选 API 和 UI。
- 更完善的 access token 缓存、错误码映射、事务级发送幂等和完整故障注入测试。

## Operit/QQ 平台限制

- `openid` 不是 QQ 号，并且是 Bot/AppID 维度的身份；群内 `member_openid` 也不能当作 C2C `openid` 使用。
- QQ C2C 没有稳定的通用用户昵称资料接口；因此本包不强依赖 QQ 昵称。用户希望被如何称呼，应由对话上下文或记忆系统处理。
- 主动消息可能因用户关闭主动消息、机器人权限、平台频控或关系限制而失败，插件无法绕过。
- UI 是否能注册取决于 Operit 当前 ToolPkg compose_dsl 宿主版本；脚本本身不能修复宿主模块加载器。

## 关键语义

- `target_chat_id` 当前仅作为**群聊固定目标**。
- 私聊按照 openid 分离；固定私聊绑定使用 `c2c_fixed_bindings` 或 `qqbot_pro_bridge_bind_c2c`。
- 未绑定 C2C 联系人会自动按 `c2c:{openid}` 创建/复用对话。
- 群聊默认按 `group:{group_openid}` 创建/复用对话；可选固定群聊目标。

## 环境变量

| 变量 | 用途 |
|---|---|
| `QQBOT_APP_ID` / `QQBOT_APP_SECRET` | QQ Bot 凭证 |
| `QQBOT_PRO_SANDBOX` | 沙箱开关 |
| `QQBOT_TARGET_CHAT_ID` | 群聊固定 Operit 对话 ID |
| `QQBOT_PRO_CHARACTER_CARD` | 桥接角色卡 ID |
| `QQBOT_PRO_WAIFU_FLUSH` | 单聊 Waifu 句数，默认 3 |
| `QQBOT_PRO_AUTO_REPLY` | 自动回复默认开关 |
| `QQBOT_PRO_TARGET_OPENIDS` | 当前主动 C2C 目标/兼容候选列表 |
| `QQBOT_PRO_TARGET_GROUP_OPENIDS` | 主动群消息候选 |
| `QQBOT_PRO_IMAGE_FOLDERS` | 本地图片目录，逗号/换行/分号分隔 |

## 官方依据

- QQ Bot API v2：消息收发、唯一身份、主动/被动消息、富媒体上传与频控。
- QQ Agent 接入文档：QQ 插件属于消息通道；图片理解、语音转录和记忆等能力取决于 Agent/模型/Skills。
- Operit 脚本指南：Tool METADATA、环境变量、HTTP、Files、Java Bridge、生命周期 Hook 与 ToolPkg UI。

详细设计与状态见 `V2-BLUEPRINT.md`、`STATUS.md`、`HANDOFF.md`。

## 新增规划（2026-08-06 14:32）

- 群聚合按 `group_openid` 独立计时；Gateway 开启后，该群第一条有效 @Bot 消息到达时开始计时，默认收集 60 秒，窗口结束后一次交给 AI 选择回复内容。
- 目标群聚合窗口可由 UI、Agent 工具和环境变量修改：`QQBOT_PRO_GROUP_AGGREGATE_WINDOW_MS`，默认 `60000`；当前代码仍是旧窗口，待按 G0/G1 实施。
- 普通群消息继续由 Gateway 原始事件能力接收，但默认不唤醒 AI；新增 `at_only/all` 事件处理策略，默认 `at_only`。
- 每条 @ 消息可选读取前后文，默认前后各 5 条；上下文开关、数量和最大 20 条限制由 UI/Agent/环境变量控制。该上下文不是默认自动聚合，AI 可在启用后按需使用。
- 单群安全上限默认 30 条；超过后该群只保留最新 30 条。Gateway 全局队列上限和最新保留数另行配置，最多同时 flush 的群数默认 3，均可调整。
- 群聚合 AI 使用编号返回 `replyTo`，插件据此选择原消息 `msg_id`/`message_reference`。QQ 官方支持被动回复和消息引用，但一分钟聚合加 AI 生成可能接近群消息时效；过期时降级为主动群消息或记录放弃原因。
- 换行参与 Waifu 计数；连续换行先归一化。默认单聊 3 句、群聊 5 句，计数符号为 `。！？\n`。
- 已找到 `com.operit.message_insert_bundle` 的实现：它在 `before_process` 与 `before_send_to_model` 两个 Hook 分流，关闭持久化时只在发送给模型前注入、不写入聊天记录。桥接 Prompt 将优先尝试复用这一机制；是否能覆盖 `Tools.Chat.sendMessageStreaming` 仍需实测，未验证前不宣称完成。
- C2C 与群聊只改变桥接处理开关；Gateway 继续正常接收消息。