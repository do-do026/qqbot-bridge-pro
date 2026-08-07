# qqbot-pro 项目状态（STATUS / Sprint Review）

> 更新时间：2026-08-06 00:30
> 里程碑：M1（第一批）进行中
> 维护者：渡渡 & 初尘

---

## 1. ✅ 已完成（Done）

### M0：架构与仓库
- [x] 官方 v2 API 差距分析（对照 sitemap 全量 + 关键页面细读）
- [x] 架构文档 `ARCHITECTURE.md`（335 行）：任务拆分 T01-T08 / W1-W5、里程碑 M0-M7、风险对策
- [x] GitHub 仓库 `do-do026/qqbot-pro`（公开，main 分支）
- [x] 开发环境：`SandboxPackage_DEV` skill 已安装（官方 types + 两份 guide + 42 个内置包示例）

### M1 第一批：基础增强包 `com.operit.qqbot_pro`（v0.1.0）
- [x] 包结构：manifest.json + dist/ + src/ + test/（ToolPkg 格式）
- [x] **T01 撤回消息** `qqbot_pro_recall`（单聊/群聊 DELETE）
- [x] **T02 Markdown 发送** `qqbot_pro_send`（msg_type=2）
- [x] **T06 引用回复**（message_reference）
- [x] **T07 输入中状态**（msg_type=6 input_notify）
- [x] **T03 群信息查询** `qqbot_pro_group_info`（GET /v2/groups/{openid}/info）
- [x] **T04 机器人群状态** `qqbot_pro_bot_state`（GET /v2/groups/{openid}/bot_state）
- [x] **T08 机器人资料** `qqbot_pro_me`（GET /users/@me）
- [x] 共享核心 `core.js`：凭证读取（复用 QQBOT_APP_ID/SECRET 环境变量）+ token 获取 + OpenAPI 请求 + buildSendBody
- [x] **真实安装验证**：`debug_install_toolpkg` 烧录成功，5 个工具全部注册
- [x] 测试脚本：`test/smoke_core.js`（buildSendBody 逻辑）、`test/verify_live.js`（真实链路）
- [x] 代码语法检查（node --check 全通过）

### M1 第二批：增强版 Gateway（v0.2.0，T05 事件放开）
- [x] **T05 事件放开**：增强版 Gateway（`qqbot_pro_gateway.py`）
  - 事件白名单全放开：INTERACTION_CREATE / GROUP_MEMBER_ADD / GROUP_ADD_ROBOT 等
  - INTERACTION_CREATE 的 scene 识别（c2c/group/guild，从 payload 判断）
  - 事件体补充 interactionType / interactionData 字段（按钮回调可用）
  - 独立控制端口 32146（与原包 32145 隔离）
- [x] **qqbot_pro_gateway 子包**（6 个工具）：
  - `qqbot_pro_gateway_start/stop/status`（服务管理）
  - `qqbot_pro_receive_events`（事件队列读取，可过滤 scene/event_type）
  - `qqbot_pro_clear_events`（清空队列）
  - `qqbot_pro_respond_interaction`（PUT /interactions/{id} 回应按钮回调）
- [x] v0.2.0 烧录成功：两个子包（basic + gateway）都已注册
- [x] 注意：⚠️ 同 AppID 下增强版 Gateway 与原包 Gateway 二选一运行（会互踢）

---

## 2. ⚠️ 待验证（Pending Verification）

| 项 | 状态 | 验证方式 |
|---|---|---|
| 工具真实调用（会话快照刷新后） | ⏳ 未测 | 下次新会话直接调 `qqbot_pro_me` |
| 撤回消息真实效果 | ⏳ 未测 | 发一条消息→撤回→确认对方可见撤回 |
| Markdown 渲染真实效果 | ⏳ 未测 | 给机器人发 Markdown 看渲染 |
| 引用回复真实效果 | ⏳ 未测 | 引用一条消息回复 |
| 输入中状态真实效果 | ⏳ 未测 | 发 msg_type=6 看对方"正在输入" |
| 群信息/群状态真实返回 | ⏳ 未测 | 需要 group_openid（从原包事件队列拿） |
| 凭证连通（sandbox 环境读不到 env） | ⏳ 工具执行上下文可读，已间接确认 | 原包正常运行证明 env 注入机制 OK |

---

## 3. 🐛 已知问题（Known Issues）

1. **当前会话看不到新工具**：工具列表是会话快照，`debug_install_toolpkg` 注册后需**新开会话**才可见。不是 bug，是机制。
2. **sandbox 独立脚本读不到环境变量**：`debug_run_sandbox_script` 不注入软件设置 env，`verify_live.js` 在 sandbox 里验证会报 Missing env。真实 ToolPkg 工具执行时由宿主注入，与原包一致。**不影响生产**。
3. **dev_package 与主目录需要手动同步**：开发目录 `/sdcard/Download/Operit/dev_package/qqbot_pro` 与 `/sdcard/Download/qqbot-pro/package` 是两个副本，改了一边要 cp 同步。后续考虑软链或统一目录。

---

## 4. 💰 技术债（Tech Debt）

| 债 | 说明 | 计划 |
|---|---|---|
| 无 TS 类型声明 | 当前用纯 JS 手写，无 types 目录、无 tsc | 若包长大或需 UI，升级 TS |
| 无自动构建脚本 | dist 与 src 靠手动 cp 同步 | 后续加 build.sh / package.json |
| 错误码未细化 | 现在只返回 message，未映射官方错误码表（40007/50002 等） | W1.4 时补 |
| 无 token 缓存 | 每次调用都重新获取 access_token（原包也没缓存） | 可加内存缓存（expires_in） |
| 无超时重试 | 网络抖动直接失败 | 后续加指数退避 |
| 凭证复用耦合 | 依赖原包环境变量，若原包卸载/改凭证会失效 | 可加 `QQBOT_PRO_APP_ID/SECRET` 独立覆盖 |

---

## 5. 📋 待办清单（Backlog / TODO）

### M1 剩余
- [ ] **T05 事件放开**：Gateway 事件白名单扩展（GROUP_ADD_ROBOT / GROUP_MEMBER_ADD / FRIEND_DEL / INTERACTION_CREATE）——需要复制增强版 Gateway，与原包二选一运行
- [ ] 移植图片发送（复用原包 curl 上传思路）→ 归入 W4

### M2 体验包
- [ ] SSRF 防护（附件 URL 校验）
- [ ] Markdown 感知分块

### M3 流式包
- [ ] W1.1 流式会话管理（stream_msg_id）
- [ ] W1.2 首片/续片/结束片三态
- [ ] W1.3 AI 流式衔接
- [ ] W1.4 错误处理（40007/50002）

### M4 交互包
- [ ] W2.1 键盘构造器 → W2.5 桥集成（5 个子任务）

### M5 媒体包
- [ ] W3.1-W3.4 分片上传（4 个子任务）
- [ ] W4.1-W4.2 多类型富媒体（2 个子任务）

### M6 架构包
- [ ] W5.1-W5.4 多账号（4 个子任务）
- [ ] E1 Webhook 模式

### 明确不做
- [ ] 频道（guild）体系（E5）

---

## 6. 🔁 原包能力复用情况（Reuse Status）

| 原包能力 | 是否已复用进 qqbot-pro | 说明 |
|---|---|---|
| AppID/AppSecret 凭证 | ✅ 已复用 | 读同一环境变量，原包配置即生效 |
| Gateway WebSocket 收消息 | ❌ 未复用 | 原包继续承担；T05 将提供增强版二选一 |
| 事件队列读取 | ❌ 未复用 | 同上 |
| 自动回复桥（qqbot_auto_reply） | ❌ 未复用 | 原包继续承担；新包专注补缺失能力 |
| 图片发送（qqbot_send_image） | ❌ 未移植 | 归入 W4 多类型富媒体 |
| 文本发送 | ✅ 超集 | 新包 qqbot_pro_send 支持文本+Markdown+引用+输入态 |

**架构立场**：原包继续承担"收消息 + 自动回复桥"（稳定运行中），新包专注"补齐官方 API 缺失能力"，两者配合使用。T05 例外——事件放开必须动 Gateway，方案是**新包内置增强版 Gateway 副本**（不修改原包文件），运行时二选一。

---

## 7. 📌 下次行动建议

1. 新开会话，实测 `qqbot_pro_me` / `qqbot_pro_send`
2. 从原包事件队列拿一个 group_openid，实测 `qqbot_pro_group_info` / `qqbot_pro_bot_state`
3. T05 事件放开（增强版 Gateway）
4. 同步 dev_package 与主目录（或统一目录结构）