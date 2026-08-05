# qqbot-pro V2 蓝图（桥接整合版）

> 用途：当前阶段唯一对照文档。先读本文件，再动手。
> 维护：渡渡｜更新时间：2026-08-06 04:50｜状态：M0 ✅，M1 ✅ 已验证，M2 主动发送 ✅ 实测，M4 生命周期 ✅ 部分；**第十一节三连修复（nohup/探活/ws）+ B1 入队去重 + 空回复重试 全部完成；第十二节蓝图重构（初尘 04:39 决策：群聚合优先 / G3 放弃 / C2C 分人 / B1 提前 / M3 降级 / UI 最后打包）**
> 关联：`HANDOFF.md`（冷启动接续，含 04:05/04:18 修复快照）、`STATUS.md`（Sprint 状态）

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
- [x] T09 端到端验证：QQ 发消息 → Operit 指定对话出 AI 回复 → 桥回 QQ（waifu 3 句切分生效）✅ 2026-08-06 02:16 实测通过
- ✅ 出口：真实 QQ→AI→QQ 全链路通，绑定对话生效，waifu 切分生效

### M2 AI 主动发送（工作流场景）
- [x] T10 `qqbot_pro_list_targets`：读 env 候选列表返回给 AI ✅（已实现，env 已配）
- [x] T11 `qqbot_pro_send` 支持主动模式（不传 msg_id）+ 候选列表兜底取目标 ✅（已实现；主动发送 HTTP 实测通过）
- [ ] T12 群/个人分开处理 + 错误提示（send 候选兜底已实现，错误提示待完善）
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
- [x] T13 main.js：app create/foreground/terminate → 自动启停 Gateway + 自动回复桥（从原包移植）✅ 切 app 自动拉起实测通过
- [ ] T14 顶替原包验证：停原包 → 新包独立运行全链路 OK（挪至 S6）
- [x] T15 文档同步（本文件状态更新）+ GitHub 推送（REST API）✅ 2026-08-06 02:40
- [ ] T16（可选 P2）UI 设置页移植（挪至 S5，做成一揽子设置页）

---

### 里程碑重构（第十二节，初尘 2026-08-06 04:39 决策）

> 决策原文摘要：① 群聚合优先做，昵称尽力而为（群聊能带就带，私聊官方无接口）；② G3（群独立绑定）放弃；③ C2C 按人分对话——已知 openid 可绑指定对话（UI 管），其他 openid 自动按 c2c:openid 新建；④ B1 收尾优先；⑤ M3 流式只留架构位置；⑥ UI 等所有功能定型后一揽子打包；⑦ M4 T14 验证最后做。

#### S1 B1 收尾：bridge 处理幂等（P0，群聚合前置）✅ 2026-08-06 04:50 代码+烧录，待实测
- [x] 失败计数：同一 eventKey 处理失败（AI 空回复 3 次全败/发 QQ 失败）→ 失败计数 +1，达阈值（默认 3）→ 移除事件 + 记录 failure 状态
- [x] 不再无限重试：当前实现失败后不移除、下个 tick 重试，极端情况同一条反复尝试
- [ ] 出口：模拟连续失败，事件被移除且 records 有 failure 标记，不再重复处理

#### S2 群聚合引擎（G1+G2 合并，P0）✅ 2026-08-06 04:57 代码+烧录（config 字段生效），待群实测
- [x] 聚合窗口：tick 时按 group_openid 分桶；窗口 `groupAggregateWindowMs`（默认 25000，可配）到期 / 桶满 `groupAggregateMaxItems`（默认 10）→ flush 该群
- [x] flush 拼接：`[昵称] 消息1\n[昵称] 消息2\n…`（昵称尽力而为，见下）
- [x] 昵称获取（尽力而为）：`GET /v2/groups/{group_openid}/members/{member_openid}` → `username`（群昵称）；缓存 openid→昵称（TTL 1h，失败降级 openid 后 8 位）；**私聊 C2C 官方无用户资料接口，不做**
- [x] 单次 Tools.Chat 桥接 → AI 自行选择感兴趣的条目回复（assistant_instruction 增强：群里只回应值得回的消息，可点名可不点名）
- [x] 整批 eventKey 统一 remove（复用 gateway.removeGatewayEvents 数组入参）
- [x] 与 waifu 切分兼容：聚合文本仍是 AI 回复，切分逻辑不变
- [ ] 出口：群 5 人连续 @，Operit 对话只出现 1 条聚合 user 条目 + 1 条 AI 回复，QQ 群收到 1 条回复

#### S3 C2C 分人对话（P1）✅ 2026-08-06 05:05 代码+烧录，待多用户实测
- [x] 配置新增：`c2cFixedBindings: [{ openid, chatId, title? }]`（数组，持久化到 config.json；UI 在 S5 管理）
- [x] resolveBoundChatIdAsync 改造：c2c 场景先查 fixedBindings → 命中用指定 chatId；未命中 → 自动按 `c2c:{openid}` 新建独立对话（现有 binding 机制已支持，放开即可）
- [x] **target_chat_id 在 C2C 场景退役**：不再让所有私聊挤进同一对话；群聊场景保留（无 target_chat_id 时按 `group:{gid}` 自动建，行为不变）
- [ ] 出口：绑定 openid A → 消息进指定对话；未绑定 openid B → 自动新建独立对话；A/B 互不串，AI 不会混淆说话人

#### S4 M3 流式架构预留（P2，本次可不做）
- [ ] W1.1 仅此一项：core.js 新增 `sendStreamMessage` 基础请求函数（input_mode/input_state/index/content_type/content_raw/msg_id/event_id/stream_msg_id/msg_seq 全参数 + 错误码 40007/50001/50002 注释）
- [ ] W1.2-W1.6（三态/封装/错误处理）后置，不封工具
- [ ] 出口：函数存在，语法检查通过（不实际发消息）

#### S5 T16 UI 一揽子（P2，最后做）
- [ ] 设置页（compose_dsl，代码已有 616 行底子）扩为完整版：c2cFixedBindings 管理（openid↔对话绑定增删）、群聚合参数（窗口/桶容量/昵称开关）、waifu/桥配置、角色卡
- [ ] 走外部 packages 导入链路打包 .toolpkg（绕开 debug_install_toolpkg 的 container 检查宿主 bug）
- [ ] 出口：工具箱设置页可见可用，配置实时生效

#### S6 M4 验证 + 推送（P2，最后做）
- [ ] T14 顶替原包验证：原包保持停用，新包独立运行全链路
- [ ] T15 GitHub 推送（REST API，勿 git push）

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

- [x] 包名最终确认：`com.operit.qqbot_pro`（保留现名，版本升 v1.0.0）是否 OK？→ 已确认用 `com.operit.qqbot_bridge_pro` v1.0.0（第十二节）
- [x] 原包停用时机：M4 顶替验证时停，还是现在就停 → 原包已停（防双 Gateway），新包独立运行中
- [x] UI 设置页：M4 T16 是否要做 → 要做，挪到 S5 做成一揽子设置页（含 C2C 绑定管理）
- [x] 群聊流式：官方文档没找到群 stream_messages → S4 仅预留单聊 W1.1，群流式砍掉
- [x] G3 群独立绑定 → **放弃**（初尘：不记群友是谁，G3 很后排甚至放弃）
- [x] 群昵称能力 → 官方有 `GET /v2/groups/{group_id}/members/{member_id}`（返回群昵称 username），S2 尽力而为实现
- [x] C2C 昵称能力 → **官方无用户资料接口**（用户管理模块为空），私聊只能 openid 区分，不做昵称

---

*本文件由渡渡维护。每个里程碑完成必须同步更新状态（✅ 标记 + HANDOFF.md + GitHub）。*

---

## 10. 新会话接续指引（2026-08-06 04:50 快照）

**当前进度**：M0 ✅ 全绿（18 工具已烧录），M1 ✅ 已验证（T09 全链路 02:16 实测），M2 主动发送 ✅，M4 生命周期 ✅ 部分（hook 实测触发）；三连修复（nohup/探活/ws）+ B1 入队去重 + AI 空回复重试 已上线；**第十二节蓝图重构完成**（初尘 04:39 决策，见 §6 里程碑重构）：群聚合优先（G1+G2 合并为 S2）、G3 放弃、C2C 分人对话立项（S3）、B1 收尾提前（S1）、M3 降级仅留 W1.1（S4）、UI 最后统一打包（S5）、验证推送殿后（S6）。

**工具可见性**：烧录后新工具需新会话可见（老规矩）。

**下一步操作清单**：
1. **初尘实测**：重启 Operit → `qqbot_pro_gateway_status` 应为 running:true（验证 nohup 存活）；QQ 发消息验证全链路无空回复
2. **S1 B1 收尾**（P0，群聚合前置）：bridge 失败计数/移除策略
3. **S2 群聚合引擎**（P0）：聚合窗口 + 群昵称尽力而为（`/v2/groups/{gid}/members/{mid}` → username）+ AI 选择性回复
4. **S3 C2C 分人对话**（P1）：c2cFixedBindings + 未绑定自动按 openid 建独立对话；target_chat_id 在 C2C 退役
5. **S4 M3 流式预留**（P2）：core.js 只加 sendStreamMessage 基础函数
6. **S5 UI 一揽子**（P2）：设置页含 c2cFixedBindings 管理，走外部 packages 导入链路
7. **S6 T14 顶替验证 + T15 GitHub 推送**（P2，REST API，勿 git push）

**包位置**：
- 真相源：`/sdcard/Download/qqbot-bridge-pro/package/`
- dev_package：`/sdcard/Download/Operit/dev_package/qqbot_bridge_pro/`
- 部署脚本：`/sdcard/Download/Operit/plugins/com.operit.qqbot_bridge_pro/qqbot_pro_gateway.py`（改 resource 后需手动 cp 覆盖，start 只在脚本不存在时复制）

---

## 11. 新需求：会话管理增强（2026-08-06 初尘提出，04:39 重构版）

> 场景：群里多人 @Bot 时避免回复不过来、避免 Operit 对话被单条消息刷爆；私聊多人时避免 AI 分不清谁在说话。
> **重构（04:39 初尘决策）**：原 G1+G2 合并为 **S2 群聚合引擎**（P0）；**G3 群独立绑定放弃**；新增 **S3 C2C 分人对话**（P1）。
> **昵称能力查证（04:41 官方文档）**：
> - 群聊：`GET /v2/groups/{group_id}/members/{member_id}` → 返回 `username`（群昵称）、`member_role`（owner/admin/member）、`joined_at` ✅ **群聚合可带昵称**
> - 私聊 C2C：官方"用户管理"模块无任何资料接口（只有机器人链接授权）❌ **C2C 拿不到昵称**，只能 openid 区分

### S2 群聚合引擎（P0，原 G1+G2）

**目标**：轮询窗口内（默认 25s，可配）同一群的多条消息 → 整合成一条**带昵称**的落盘文本 → 一次 AI 调用回复 → 回复发回该群（一次）。AI 自行选择感兴趣的条目回应，不刷屏，不记谁是谁。

**设计**：
```
tick 时：对 group 事件按 group_openid 分组，落在窗口内的消息进 pending 桶
窗口到期（或桶满 N 条 / 距首条超时）：flush 该群
  → 昵称尽力而为：调 GET /v2/groups/{gid}/members/{mid} 拿群昵称
     缓存 openid→昵称（TTL 1h）；接口失败降级 openid 后 8 位
  → 拼接："[昵称A] 消息1\n[昵称B] 消息2\n…"
  → 单次 Tools.Chat 桥接（沿用现有 binding 机制）
  → AI 回复（assistant_instruction 引导：群里只回应值得回的消息）
  → 该批 eventKey 统一 remove
```

**配置新增**：`groupAggregateWindowMs`（默认 25000）、`groupAggregateMaxItems`（默认 10）、`groupNicknameEnabled`（默认 true，昵称总开关，关掉纯 openid 尾号）。
**出口标准**：群 5 人连续 @，Operit 对话只出现 1 条聚合 user 条目 + 1 条 AI 回复，QQ 群收到 1 条回复。

### S3 C2C 分人对话（P1，新增）

**目标**：私聊按人分对话，AI 不会把不同 QQ 用户当成同一个人。

**设计**：
```
配置：c2cFixedBindings: [{ openid, chatId, title? }]（持久化 config.json，S5 UI 管理）
resolveBoundChatIdAsync 改造（c2c 场景）：
  ① 命中 c2cFixedBindings → 用指定 chatId（绑定的"熟人"固定对话）
  ② 未命中 → 自动按 c2c:{openid} 新建独立对话（现有 binding 机制放开即可）
target_chat_id：C2C 场景退役（不再让所有私聊挤同一对话）；群聊场景保留原行为
```

**出口标准**：绑定 openid A → 消息进指定对话；未绑定 openid B → 自动新建独立对话；A/B 互不串，AI 不会混淆说话人。

### 与现有里程碑的关系

- S1（B1 幂等）是 S2 的前置（聚合窗口若收到重复事件会重复聚合；处理失败若不移除会反复重试）。
- S2 落盘格式与 waifu 切分兼容（聚合文本仍是 AI 回复，切分逻辑不变）。
- 实现位置：bridge_auto.js 的 `processAutoReplyQueueOnceAsync` 改造（群桶逻辑）+ `resolveBoundChatIdAsync` 改造（C2C 分人）+ core.js 新增昵称获取/缓存。

---

*本文件由渡渡维护。每个里程碑完成必须同步更新（✅ 标记 + HANDOFF.md + GitHub）。*