# qqbot-pro V2 蓝图（桥接整合版）

> 用途：当前阶段唯一对照文档。先读本文件，再动手。
> 维护：渡渡｜更新时间：2026-08-06 01:45｜状态：M0 ✅ 完成，M1 代码完成待真实验证
> 关联：`HANDOFF.md`（V1 冷启动文档，M1 完成 v0.2.0 的历史快照）、`ARCHITECTURE.md`（V1 架构）、`STATUS.md`（V1 状态）

---

## 0. 三十秒速览

**目标**：把 Operit 原 QQ Bot 包（`com.operit.qqbot_bundle` v0.3.0）的全部能力**复用合并**进 qqbot-pro（`com.operit.qqbot_pro`），做成一个**能顶替原包**的完整包。不修改原包本体，只把功能搬进来。

**核心链路**：
```
QQ 发消息 → 增强 Gateway(32146) 收 → 事件队列
         → 自动回复桥 → Tools.Chat 唤醒 Operit AI（绑定指定对话）
         → AI 回复 → waifu 三句号切分 → 发回 QQ
工作流/AI 主动 → 调发送工具（候选列表选目标）→ 主动发 QQ（C2C/群）
流式预留 → /v2/users/{openid}/stream_messages 三态
```

**底座决策**：以 qqbot-pro 为底座（理由见 §3）。原包功能全部移植进来，最终**只保留一个包**，原包可停用/删除。

**版本目标**：`com.operit.qqbot_bridge_pro` v1.0.0（手写 JS，无编译链，dist 与 src 手动同步）。已烧录 ✅

---

## 1. 需求原文（初尘，2026-08-06 01:05 / 01:19）

1. 复用原包能力，不直接改原包；新包做完可顶替原包使用；包名可其他命名（带 Pro 即可）
2. 桥接进 Operit：QQ 发消息 → 指定对话框 → 唤醒 AI 回复 → 桥回 QQ
3. 工作流唤醒 AI 时，AI 可主动用本包给 QQ 发消息（个人/群）
4. 增加可填写的环境变量；绑定指定对话
5. waifu 模式：三个句号裁切一次，防触发消息限制
6. 留一个可以做流式的位置（官方 stream_messages API）
7. 所有功能合到一个包里；增强 Gateway / Pro（刚做的）为基础往里加；更久远的原包只做功能复用
8. 环境变量设置 AI 自主发消息的候选列表（群 + 个人）
9. 流式拆分阶段，拆成最小单位可实现的子任务

---

## 2. 现状盘点（合并前的能力矩阵）

### 2.1 原包 `com.operit.qqbot_bundle` v0.3.0（Aug 5 生效版，TS 编译，dist 比 src 新）

| 模块 | 能力 | 处理 |
|---|---|---|
| Gateway（Python，端口 **32145**） | WebSocket 收消息 → 事件队列 | 功能并入（Gateway 本体用 Pro 增强版替代） |
| 发消息 | C2C / 群文本、图片（素材上传 msg_type=7） | 复用 |
| 自动回复桥 | 轮询队列 → `Tools.Chat` 桥接 AI → 回复发回 QQ | **复用 dist 新版**（含 target_chat_id / waifu_flush_sentences=3 / QQBOT_TARGET_CHAT_ID） |
| 状态持久化 | `getPluginConfigDir(toolpkg_id)` 下 config.json + 桥状态 | 改名移植 |
| 生命周期 hooks | app create/foreground/terminate 自动启停 | 复用 |
| UI 设置页 | qqbot_settings（compose_dsl） | 可选移植（P2） |

### 2.2 qqbot-pro `com.operit.qqbot_pro` v0.2.0（手写 JS，无编译）

| 模块 | 能力 | 处理 |
|---|---|---|
| `shared/core.js` | 凭证 / OpenAPI / buildSendBody（文本/Markdown/引用/输入态） | **底座核心，扩展** |
| `qqbot_pro_basic`（5 工具） | 撤回 / send / 群信息 / 群状态 / 机器人资料 | 保留 + 扩展 |
| `qqbot_pro_gateway`（6 工具） | 增强 Gateway 管理（端口 **32146**，事件全放开，含 INTERACTION_CREATE）、队列读/清、respond_interaction | 保留，作为唯一 Gateway |
| 增强 Gateway py（1005 行） | 事件白名单全放开、scene 识别、interaction 字段 | **唯一 Gateway 底座** |
| main.js | 纯工具，无 UI / 无生命周期 hooks | 扩展（加 hooks） |

### 2.3 差异结论

- 原包**有**：自动回复桥、图片发送、生命周期、UI —— qqbot-pro **没有**
- qqbot-pro **有**：增强 Gateway、官方 v2 API 工具（撤回/Markdown/引用/输入态/查询）—— 原包没有
- 两者**都有**：凭证体系（同一套 env）、发消息基础、队列协议（同构，端口不同）

---

## 3. 架构决策（ADR）

| # | 决策 | 理由 |
|---|---|---|
| D1 | **以 qqbot-pro 为底座** | 手写 JS 无编译链最干净；增强 Gateway 已就位（事件全放开）；官方 API 工具已全；刚做完结构最熟 |
| D2 | Gateway 唯一化：统一跑 **qqbot_pro_gateway.py（端口 32146）** | 自动回复桥需读队列；双 Gateway 同 AppID 会互踢；32146 为增强版（事件全放开） |
| D3 | 自动回复桥从原包 **dist 新版**移植（非 src 旧版） | dist 已含 target_chat_id / waifu_flush_sentences=3，正是需求要的；src 是旧版 |
| D4 | 原包 shared 模块改名移植：`qqbot_state→bridge_state`、`qqbot_service→bridge_service`、`qqbot_openapi→并入 core.js`、`qqbot_common→并入 core.js` | 保持移植逻辑尽量不动，只改常量（端口/脚本名/toolpkg_id/状态目录），降低回归风险 |
| D5 | 状态目录用 `getPluginConfigDir(com.operit.qqbot_pro)` | 与原包物理隔离，互不污染 |
| D6 | 凭证复用 `QQBOT_APP_ID` / `QQBOT_APP_SECRET` | 原包已配置即生效；保留独立覆盖位（技术债） |
| D7 | 同 AppID 双 Gateway 互踢 → 顶替原包时先停原包 | 文档 + 工具描述双重警告 |
| D8 | 纯 JS 不引 TS；dist=src 手动 cp，沿用 sync.sh | 最轻量，V1 已验证 |

---

## 4. 目标架构（合并后）

```
com.operit.qqbot_pro v1.0.0
├── manifest.json                     # 子包：basic / gateway / bridge
├── resources/qqbot_pro_gateway.py    # 增强版 Gateway（唯一，32146）
├── src/
│   ├── main.js                       # registerToolPkg + 生命周期 hooks（自动启停）
│   ├── shared/
│   │   ├── core.js                   # [扩展] 凭证/OpenAPI/buildSendBody + 图片上传 + 流式 + 候选列表
│   │   ├── bridge_state.js           # [移植] 配置/桥状态持久化（toolpkg_id→pro）
│   │   ├── bridge_service.js         # [移植] Gateway 进程管理/队列（端口→32146，脚本→qqbot_pro_gateway.py）
│   │   └── bridge_auto.js            # [移植] 自动回复桥（dist 新版，target_chat_id/waifu 三句切分）
│   └── packages/
│       ├── qqbot_pro_basic.js        # [扩展] 5 工具 + 图片发送 + 流式发送 + 候选目标
│       ├── qqbot_pro_gateway.js      # [保留] 6 工具（对齐统一 Gateway）
│       └── qqbot_pro_bridge.js       # [新增] 5 工具：configure/status/start/stop/run_once
```

**合并后完整工具清单（16 工具）**：

| 子包 | 工具 |
|---|---|
| basic | `qqbot_pro_recall` / `qqbot_pro_send` / `qqbot_pro_send_image`(新) / `qqbot_pro_send_stream`(新，W1) / `qqbot_pro_group_info` / `qqbot_pro_bot_state` / `qqbot_pro_me` / `qqbot_pro_list_targets`(新，AI 候选) |
| gateway | `qqbot_pro_gateway_start` / `stop` / `status` / `qqbot_pro_receive_events` / `qqbot_pro_clear_events` / `qqbot_pro_respond_interaction` |
| bridge | `qqbot_pro_bridge_configure` / `qqbot_pro_bridge_status` / `qqbot_pro_bridge_start` / `qqbot_pro_bridge_stop` / `qqbot_pro_bridge_run_once` |

---

## 5. 环境变量设计（manifest env 声明 + core.js 读取）

| 变量 | 说明 | 必填 | 来源 |
|---|---|---|---|
| `QQBOT_APP_ID` | QQ Bot AppID | ✅ | 复用原包 |
| `QQBOT_APP_SECRET` | QQ Bot AppSecret | ✅ | 复用原包 |
| `QQBOT_PRO_SANDBOX` | 沙箱 OpenAPI 开关（true/false） | 可选 | 已有 |
| `QQBOT_TARGET_CHAT_ID` | 绑定指定 Operit 对话 ID（桥接固定会话） | 可选 | 原包移植 |
| `QQBOT_PRO_TARGET_OPENIDS` | **AI 主动发消息候选个人**（逗号/换行分隔 openid 列表） | 可选 | 新增 |
| `QQBOT_PRO_TARGET_GROUP_OPENIDS` | **AI 主动发消息候选群**（逗号/换行分隔 group_openid 列表） | 可选 | 新增 |
| `QQBOT_PRO_CHARACTER_CARD` | 桥接会话角色卡 ID | 可选 | 新增 |
| `QQBOT_PRO_WAIFU_FLUSH` | waifu 切分数（句子结束符个数，默认 3） | 可选 | 新增 |
| `QQBOT_PRO_AUTO_REPLY` | 是否启用自动回复桥（true/false） | 可选 | 新增 |

候选列表解析规则：`core.js::readTargetCandidates()` 读取两个 env → 按 `[,\n;]` 分割 → trim → 去重 → 空项忽略。`qqbot_pro_list_targets` 返回 `{c2c:[], group:[]}` 给 AI 看；`qqbot_pro_send` 不传 openid/group_openid 时从候选列表取（可选 `target_index` 指定）。

---

## 6. 里程碑与任务拆分（敏捷）

> 每个任务必须有可验证的出口标准。完成一个标记一个 ✅。

### M0 合并底座（先行）
- [x] T01 搭包结构：manifest v1.0.0 + 三个子包骨架 + 目录初始化
- [x] T02 core.js 扩展：并入原包 qqbot_common 工具函数 + uploadMediaFile（图片上传）+ readTargetCandidates
- [x] T03 main.js 注册生命周期 hooks（已完成，含自动启停）
- [x] T04 sync.sh 同步 + 语法检查 + `debug_install_toolpkg` 烧录 ✅ 18 工具注册（basic7 + gateway6 + bridge5）
- ✅ 出口：包可烧录、工具全注册、原包不受影响

### M1 Gateway 统一 + 自动回复桥（核心链路）
- [x] T05 bridge_service.js 移植（合并进 gateway.js 底层函数，端口 32146）：进程管理/队列协议对齐 32146 + qqbot_pro_gateway.py
- [x] T06 gateway.js 工具层对齐统一 Gateway（新增 ensureGatewayStarted/queryGatewayEvents/removeGatewayEvents 等底层导出）（start/stop/status/receive/clear 指向同一服务）
- [x] T07 bridge_auto.js 移植（dist 新版，waifu 三句切分/绑定对话/环境变量全保留）：轮询队列 → Tools.Chat 桥接 → waifu 三句切分 → 发回 QQ
- [x] T08 qqbot_pro_bridge.js 工具定义（configure/status/start/stop/run_once）（configure/status/start/stop/run_once，含 target_chat_id / waifu_flush_sentences / 角色卡 / QQBOT_PRO_AUTO_REPLY）
- [ ] T09 端到端验证：QQ 发消息 → Operit 指定对话出 AI 回复 → 桥回 QQ（waifu 3 句切分生效）
- ✅ 出口：真实 QQ→AI→QQ 全链路通，绑定对话生效，waifu 切分生效

### M2 AI 主动发送（工作流场景）
- [ ] T10 `qqbot_pro_list_targets`：读 env 候选列表返回给 AI
- [ ] T11 `qqbot_pro_send` 支持主动模式（不传 msg_id）+ 候选列表兜底取目标
- [ ] T12 群/个人分开处理 + 错误提示（无候选时明确报错引导配置 env）
- ✅ 出口：工作流里 AI 调 send 能主动发到指定 QQ/群

### M3 流式发送（最小子任务拆分）
- [ ] W1.1 core.js：`sendStreamMessage` 基础请求函数（input_mode/input_state/index/content_type/content_raw/msg_id/event_id/stream_msg_id/msg_seq）
- [ ] W1.2 首片：index=0, input_state=1, 无 stream_msg_id → 从响应拿 id
- [ ] W1.3 续片：index=n, input_state=1, 携带上一片 stream_msg_id
- [ ] W1.4 结束片：input_state=10, 同 stream_msg_id
- [ ] W1.5 封装 `qqbot_pro_send_stream`：AI 传完整文本 → 内部按长度分片 → 自动三态（可选 content_type=text/markdown）
- [ ] W1.6 错误处理：40007（前缀不可改）→ 切 append 模式重发；50002（频率限制）→ 退避重试
- [ ] W2 群聊流式：官方文档未确认 `/v2/groups/{gid}/stream_messages`，**预留同构位置**（工具参数留 group_openid，接口待验证）
- [ ] W3（可选 P2）AI 流式输出直连：sendMessageStreaming 的 onIntermediateResult → stream_messages 分片下发（与 waifu 切分协同）
- ✅ 出口：send_stream 单聊三态全通，错误码处理正确

### M4 生命周期 + 收尾
- [ ] T13 main.js：app create/foreground/terminate → 自动启停 Gateway + 自动回复桥（从原包移植）
- [ ] T14 顶替原包验证：停原包 → 新包独立运行全链路 OK
- [ ] T15 文档同步（本文件状态更新）+ GitHub 推送（REST API）
- [ ] T16（可选 P2）UI 设置页移植（qqbot_settings）

---

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| 同 AppID 双 Gateway 互踢 | 顶替时先停原包；工具描述 + 文档双重警告；状态页显示 Gateway 占用情况 |
| 原包 src/dist 漂移（dist 含 target_chat_id 但 src 没有） | 只从 dist 移植，不反向同步 src；新包统一手写 JS 单版本 |
| 凭证耦合（复用原包 env，原包改凭证会失效） | 技术债：预留 `QQBOT_PRO_APP_ID/SECRET` 独立覆盖位（P2） |
| 移植逻辑回归（改常量引入 bug） | bridge_* 模块只改常量不动逻辑；每步用 `debug_run_sandbox_script` 验证小片段 |
| QQ 主动消息频率/时长限制 | waifu 三句切分 + MAX_BUFFER 400 兜底；send_stream 错误码处理 |
| 新工具当前会话不可见 | 机制如此：烧录后**新开会话**验证（V1 已踩过） |

---

## 8. 工作流（沿用 V1，真相源 = 主目录）

```bash
# 铁律：只编辑 /sdcard/Download/qqbot-pro/package/（真相源）
# 1. 改代码 → 2. bash scripts/sync.sh（同步 dev_package + 语法检查）
# 3. operit_editor:debug_install_toolpkg（source_path=/sdcard/Download/Operit/dev_package/qqbot_pro）
# 4. 新开会话验证工具
# 5. GitHub REST API 推送（不要 git push）
# 6. 更新本文件状态 + HANDOFF.md
```

---

## 9. 待确认 / 开放问题

- [ ] 包名最终确认：`com.operit.qqbot_pro`（保留现名，版本升 v1.0.0）是否 OK？
- [ ] 原包停用时机：M4 顶替验证时停，还是现在就停（避免双 Gateway 隐患）？
- [ ] UI 设置页：M4 T16 是否要做（不着急的话 P2）
- [ ] 群聊流式：官方文档没找到群 stream_messages，保持预留还是砍掉？

---

*本文件由渡渡维护。每个里程碑完成必须同步更新状态（✅ 标记 + HANDOFF.md + GitHub）。*

---

## 10. 新会话接续指引（2026-08-06 01:45 快照）

**当前进度**：M0 ✅ 全绿（18 工具已烧录），M1 代码完成（bridge_auto 移植 + gateway 统一）**待真实验证**。

**工具可见性**：`debug_install_toolpkg` 注册的新工具**当前会话不可见**，必须**新开会话**才能看到 `qqbot_bridge_pro_*` 工具。

**下一步操作清单（新会话执行）**：
1. `qqbot_bridge_pro_bridge:qqbot_pro_bridge_configure` 迁移原包配置：
   - enabled=true, chat_group="QQ Bot"
   - target_chat_id="166abbb7-969d-4b24-b90d-60366681ecd8"（原包绑定对话）
   - character_card_id="b89f6656-a296-426c-8b98-94493e7f8a72"
   - assistant_instruction="你是渡渡。这是从QQ桥接过来的消息，请自然回复对方。回复发给QQ，注意：不要主动打扰对方、不要发无关的主动消息，只在对方发来消息时响应。"
   - waifu_flush_sentences=3, start_now=true
2. 若 Gateway 未自动起：`qqbot_bridge_pro_gateway:qqbot_pro_gateway_start`（端口 32146，同 AppID 与原包二选一，原包已停 ✅）
3. 让初尘给 QQ bot 发一条消息 → 验证：Gateway 收到 → 桥接 Operit 指定对话 → AI 回复 → waifu 三句切分 → 发回 QQ
4. `qqbot_pro_bridge_status` 检查 bindings/records；`qqbot_pro_gateway_status` 检查连接
5. AI 主动发送候选：环境变量 `QQBOT_PRO_TARGET_OPENIDS`（个人 openid，逗号分隔）、`QQBOT_PRO_TARGET_GROUP_OPENIDS`（群 group_openid）→ `qqbot_pro_list_targets` 查看 → `qqbot_pro_send` / `qqbot_pro_send_image` 发送
6. 验证通过后：GitHub REST API 推送 + 更新本文档状态

**包位置**：
- 真相源：`/sdcard/Download/qqbot-bridge-pro/package/`
- dev_package：`/sdcard/Download/Operit/dev_package/qqbot_bridge_pro/`
- 安装产物：`com.operit.qqbot_bridge_pro.toolpkg`（外部 packages 目录）
