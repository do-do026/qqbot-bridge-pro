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
2. 不把所有 openid 自动注入 AI 上下文；AI 需要时调用联系人工具。
3. 指定 openid 可通过 UI/API 绑定指定 Operit `target_chat_id`。
4. 未绑定 openid 自动按 `c2c:{openid}` 创建/复用独立对话。
5. 全局 `target_chat_id` 在 C2C 场景退役；固定私聊使用 `c2c_fixed_bindings`。
6. C2C 不查询 QQ 昵称；识别时提供 openid 后四位。用户想被怎样称呼由对话上下文和记忆系统决定。

### 3.2 群聊

1. 默认按 `group:{group_openid}` 创建/复用 Operit 对话，这是当前性价比最高且可解释的方案。
2. 同群消息默认 25 秒/10 条聚合，一次唤醒 AI；避免逐条刷爆对话。
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

UI 当前是“可实现但宿主阻塞”，不能描述为已交付。底层配置必须始终有 Tool API，不依赖 UI 才能运行。

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
- 单聊 3、群 5，且只按 `。！？` 计数。
- Gateway 能独立常驻、停止；关闭监听同时停止自动回复。
- 所有底层可配置项在工具 API 有可选参数；不配置时使用安全默认值。
- 文档、manifest、METADATA、src、dist 一致。