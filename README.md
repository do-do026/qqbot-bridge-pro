# qqbot-pro

`qqbot-pro` 是面向 Operit 的 QQ Bot 通道增强包。它将 QQ Gateway、Operit 对话路由、AI 自动回复、主动发送和群消息上下文管理整合在一个独立 ToolPkg 中。

项目不修改原包 `com.operit.qqbot_bundle`。两个包可以同时安装，但同一 AppID 在运行时只能保留一个 Gateway；当前生产链路由 `qqbot-pro` 接管，原包 Gateway 和原包自动回复应保持停用。

## 用户效果

### 私聊

- QQ 用户首次发来消息后，系统才记录该联系人的 openid；不会预先把全部联系人暴露给 AI。
- 未绑定联系人按 openid 自动创建独立 Operit 对话，避免不同用户串线。
- 指定联系人可以绑定到指定 Operit 对话；该绑定只影响目标联系人。
- AI 可按需查询已知联系人。默认仅显示 openid 后四位；执行绑定或主动发送时才显式读取完整 openid。
- 可配置一个主要的 C2C 主动发送目标，供 Operit 工作流唤醒 AI 后自主决定是否发消息。

### 群聊

- 每个 `group_openid` 自动创建并复用独立 Operit 对话，不支持把所有群强制汇入一个固定对话。
- Gateway 可以接收普通群消息；是否唤醒 AI 由桥接策略决定：仅 @、@ 或关键词、全部消息。
- 触发消息在每个群独立的防抖窗口内聚合，一次交给 AI，避免逐条唤醒和刷屏。
- 普通群消息进入有容量上限的本地上下文缓存。上下文支持三种模式：关闭、自动附带、AI 按需查询。
- 群成员可绑定可读名称；未绑定成员使用 `QQ` 加 openid 后四位显示，不强依赖不稳定的昵称接口。

### 回复与媒体

- 支持文本、Markdown、引用字段、输入状态、撤回、群信息查询、机器人群状态查询和机器人资料查询。
- 图片支持本地路径和网络 URL；多目录浏览/筛选的专用工具仍待补齐。
- Waifu 分段由统一 chunker 处理：默认私聊 3 句、群聊 5 句；`。！？` 和归一化后的换行计数，400 字符作为无标点安全上限。
- QQ 官方 `stream_messages` 不属于当前产品目标。项目保留架构位置，但不注册官方流式发送工具。

## 当前状态

截至 2026-08-12：

- C2C 私聊 `QQ → Operit → AI → QQ` 已真实闭环，长回复 8 段全部送达。
- 群聊 `@/关键词 → 聚合 → AI → QQ` 已真实闭环。
- 群上下文 automatic 模式已真实验证，AI 能读取触发消息附近的普通群消息。
- G0 配置模型、G1 群分流与缓存、G2 上下文三态、G4 统一 chunker、G5 落盘验证、G7 最小成员绑定、G3 replyTo、G6 设置 UI 均已完成。
- 当前开发入口：可靠性 Sprint（事务幂等 / access_token 缓存 / 错误码结构化）。

实时进度见 [STATUS.md](STATUS.md)，工程设计见 [ARCHITECTURE.md](ARCHITECTURE.md)，冷启动接续见 [HANDOFF.md](HANDOFF.md)。历史设计、变更和排障记录在 [bridge-docs](bridge-docs/) 中。

## 运行原则

1. 同一 AppID 只运行一个 Gateway。
2. 原包自动回复与 `qqbot-pro` 自动回复不能同时处理同一账号。
3. 配置通过统一 configure API、环境变量或后续 UI 修改，不直接手工改状态文件。
4. openid 属于 Bot/AppID 或群关系维度，不是 QQ 号；不同 AppID 下不能自行合并身份。
5. 主动消息受用户开关、机器人权限、关系状态和平台频控约束，插件不能绕过。
6. 普通群消息缓存本身不消耗模型 token；automatic 模式在触发时附带上下文，会消耗该次模型调用的 token。
7. automatic 上下文通过 `userMessage` 附件传入且该轮使用 `persist_turn: true`，**已确认会随本轮落盘进 Operit 历史**（G5 验证 2026-08-16）；如需隔离需走 Prompt Hook 机制（当前接受现状）。

## 工程位置

- 真相源：`/sdcard/Download/qqbot-pro/package/`
- 开发烧录副本：`/sdcard/Download/Operit/dev_package/qqbot_pro/`
- ToolPkg ID：`com.operit.qqbot_pro`
- 子包：`qqbot_pro_basic`、`qqbot_pro_gateway`、`qqbot_pro_bridge`
- Gateway 控制端口：`32146`

## 开发流程

1. 只修改主目录 `package/src` 与 `package/resources`。
2. 运行 `scripts/sync.sh`，同步 src → dist → dev_package，并执行语法检查。
3. 运行 G1/G2 冒烟测试和 G4 chunker 测试。
4. 使用 Operit 的 `debug_install_toolpkg` 烧录。
5. 烧录后确认三个子包启用，并检查 Gateway 与桥的运行状态；必要时重启。
6. 更新 README、ARCHITECTURE、STATUS、HANDOFF 和 bridge-docs 中对应记录。
7. 使用 `scripts/upload_qqbot_pro.py` 通过 GitHub REST API 上传。

## 平台限制

- QQ 没有适合本需求的稳定通用 C2C 昵称接口。
- 真正的客户端原生 @、被动回复时效和主动群发降级必须以 QQ 实机结果为准。
- ToolPkg UI 是否可用取决于 Operit 宿主版本；底层能力不能依赖 UI 才能运行。

## Roadmap（规划中，尚未实现）

> 详细对照见 STATUS.md §6（架构规划 vs 已实现）。当前主线：可靠性 Sprint（事务幂等 / token 缓存 / 错误码结构化）。

- **G7 完整版**：用界面管理群成员绑定（当前为配置 API）。
- **可靠性 Sprint**：事务级幂等、access_token 缓存、错误码/Trace ID 结构化。
- **双账号隔离实测**：两个 C2C 用户互不串线的真机验收。
- **automatic 上下文落盘隔离**（可选）：用 Prompt Hook「注入但不落盘」替代当前随轮次落盘（G5 已验证会落盘，接受现状）。
- **明确不做**：官方 stream_messages（产品决定放弃）。

## License

保留所有权利。