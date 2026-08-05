# qqbot-bridge-pro STATUS（Sprint Review + Backlog + 技术债）

> 维护：渡渡｜更新时间：2026-08-06 02:40｜版本：v1.0.0（已烧录）
> 配套文档：`V2-BLUEPRINT.md`（架构/任务拆分/接续指引）、本文档（状态快照）
> Sprint 周期：第十节（2026-08-06 02:04–02:40）

---

## 1. ✅ 已完成（Done）

| 项 | 说明 |
|---|---|
| M0 包结构 | `com.operit.qqbot_bridge_pro` v1.0.0，三子包（basic/gateway/bridge），manifest + resources 就位 |
| M0 core.js 扩展 | 凭证/OpenAPI/buildSendBody + 图片上传 uploadMediaFile + AI 候选列表 readTargetCandidates/resolveSendTarget |
| M0 main.js | 生命周期 hooks 注册（application_on_create/foreground/terminate 自动启停） |
| M0 烧录 | `debug_install_toolpkg` ✅ 18 工具注册（basic 7 + gateway 6 + bridge 5） |
| M1 Gateway 统一 | 底层函数并入 gateway.js：ensureGatewayStarted/queryGatewayEvents/removeGatewayEvents/stopGateway，端口 32146，状态目录动态化 |
| M1 自动回复桥移植 | bridge_auto.js（原包 dist 新版）：target_chat_id / QQBOT_TARGET_CHAT_ID / waifu_flush_sentences=3 / 角色卡 / 桥接指令 全保留 |
| M1 状态持久化 | bridge_state.js（getPluginConfigDir 独立目录，与原包物理隔离） |
| 原包停用 | Gateway + 自动回复桥均已停（防同 AppID 互踢）✅ 已核实（原包 config listenerEnabled=false） |
| **M1 T09 端到端真实验证** | **2026-08-06 02:16–02:27 全链路跑通**：QQ 发消息 → Gateway(32146) 收 → 绑定对话 166abbb7… 唤醒 AI → 回复发回 QQ ✅；回复同时落盘 Operit 对话 ✅；waifu 配置生效 ✅ |
| **M4 T13 生命周期验证** | **切 app 触发 application_on_create hook 自动拉起桥**（startSource=application_on_create）✅ |
| **M2 T10-T12 AI 主动发送** | list_targets 已实现 ✅；`QQBOT_PRO_TARGET_OPENIDS` 已配置（CC9F593975D8C8F1E1EC72DD91305C63）✅；**主动发送实测通过**（不经过 Gateway，直接 OpenAPI POST /v2/users/{openid}/messages，status 200 送达）✅ |
| 桥配置迁移 | 原包配置已迁移：target_chat_id=166abbb7-…、角色卡 b89f6656-…、渡渡指令、waifu=3、listenerEnabled=true |

## 2. ⚠️ 待验证（Pending Verification）

| 项 | 验证方式 | 状态 |
|---|---|---|
| waifu 三句切分实测 | 让 AI 长回复，观察 QQ 收到分段（3 句号一截） | ⏳ 待做 |
| 群聊链路 | 拉群 → @Bot → 观察群回复 | ⏳ 待做（依赖 G 系列） |
| AI 主动发送（经工具链） | 新会话 `qqbot_pro_list_targets` + `qqbot_pro_send`（候选兜底） | ⏳ 待做（新会话工具可见后） |
| 图片发送 | `qqbot_pro_send_image`（本地/URL） | ⏳ 待做 |
| 自动重启恢复 | Operit 重启后 Gateway/桥自动拉起 | ⏳ 待做 |

## 3. 🐛 已知问题（Known Issues）

1. **消息重复到达**（P1，本次实测发现）：同一 messageId 在绑定对话出现多条 user 条目（"试一下——"出现 2 次、"喵喵喵…"出现 2 次），其中一次触发 AI 空回复；runtime.lastError 曾出现 `AI returned an empty response` 与 `消息被去重，请检查请求msgseq`。疑似 Gateway 事件入队无按 eventKey 去重 + 处理失败重试导致重复投递。→ 修复方向：Gateway 入队去重 + 桥处理按 eventKey 幂等。
2. **腾讯网关必须带 `Accept: application/json` 头**（P1，本次实测踩坑）：不带返回 `{"code":100007,"message":"appid invalid"}`，极易误导排查凭证。core.js 已带，但任何手写调用必须注意。
3. **子包烧录后启用状态未保留**：`debug_install_toolpkg` 的 `reset_subpackage_states=true` 会把子包启用状态重置，导致工具数 0。本次已用 `activate_subpackages` 显式激活修复。
4. **`listenerEnabled` 无代码置 true**：gateway.js 不写该字段，bridge 只在 false 时把 enabled 打回 false——首次配置必须手工写 config.json。
5. **群消息处理无 @ 检查 + 串行**：classifyEvent 无 mention 判断（依赖 QQ 平台只推 @ 消息），每条群消息独立 AI 调用且串行（ai_timeout_ms=180s），群消息风暴会积压延迟。
6. **原包 src/dist 漂移**：只从 dist 移植，不反向同步 src（流程债）。
7. **T16 UI 热烧录 container 加载失败**（本次实测）：`registerToolboxUiModule` 注册（文件版/内联版均试）会导致 `debug_install_toolpkg` 报 "container did not appear"，包不进注册表。UI 代码已完成（`src/ui/qqbot_settings/index.ui.js`，616 行，含群增强预留），main.js 中注册已注释。疑似 compose_dsl UI 模块需冷启动注册或宿主热烧录兼容限制 → 待冷启动/新会话验证。

## 4. 💰 技术债（Tech Debt）

| 债 | 说明 | 优先级 |
|---|---|---|
| 无 token 缓存 | 每次调用重新获取 access_token（继承 V1） | P2 |
| 凭证耦合 | 复用 QQBOT_APP_ID/SECRET，原包改凭证会失效；预留 QQBOT_PRO_APP_ID/SECRET 独立覆盖位未做 | P2 |
| 无错误码映射 | 官方 40007/50002/40034100 等未细化到工具提示 | P2 |
| UI 设置页未移植 | 原包 qqbot_settings（compose_dsl）→ M4 T16 可选 P2（评估：中低工作量，主要是字段映射，0.5–1 工期） | P2 |
| src/dist 手动同步 | 手写 JS 无编译链，靠 sync.sh cp；改代码后必须跑 sync.sh | 流程债 |
| 群无流式 | 官方无群 stream_messages（文档明示），已砍 | 已砍 |

## 5. 📋 待办清单（Backlog）

- [x] M1 T09 端到端真实验证（2026-08-06 02:16 完成）
- [x] M4 T13 生命周期验证（切 app 自动拉起 ✅）
- [x] M2 T10-T12 AI 主动发送（env 候选已配 + 主动发送 HTTP 实测通过；工具链验证待新会话）
- [ ] **G1 群消息聚合窗口**（新需求，P1）：轮询窗口内（20–30s）同一群多条 @ 消息 → 整合成一条带昵称的文本落盘 → 一次 AI 调用回复。防条目爆炸 + 防回复不过来
- [ ] **G2 AI 选择性回复**（新需求，P1）：聚合模式下 AI 从多条消息里挑值得回的（或 assistant_instruction 引导）；支持"只回 @ 我的"
- [ ] **G3 群独立绑定配置**（新需求，P2）：群是否绑定主对话 vs 自动创建群专属对话（per group_openid）可配置
- [ ] **B1 消息去重修复**（P1）：Gateway 入队按 eventKey 去重 + 桥处理幂等
- [ ] M3 W1.1-W1.6 流式发送（单聊 stream_messages 三态 + 错误处理）【P1】
- [ ] M4 T14 顶替原包验证（停原包 → 新包独立运行全链路 OK）【P1】
- [ ] M4 T15 GitHub 推送（本次已推 ✅，后续每次迭代同步）
- [ ] M4 T16 UI 设置页移植【P2→进行中】：代码已完成（616 行，凭证/自动化/绑定对话/群增强预留 G1-G3/运行控制），热烧录 container 加载失败，待冷启动验证后启用注册

## 6. 🔁 当前架构完成情况（Reuse Status）

| 原模块 | 去向 | 状态 |
|---|---|---|
| qqbot-pro `shared/core.js` | 底座核心，扩展 | ✅ 保留 + 扩展 |
| qqbot-pro `qqbot_pro_basic.js` | basic 子包 | ✅ 保留 + send_image/list_targets |
| qqbot-pro `qqbot_pro_gateway.js` | gateway 子包 | ✅ 保留 + 底层函数 |
| qqbot-pro `qqbot_pro_gateway.py` | 唯一 Gateway（端口 32146） | ✅ 保留 |
| 原包 `qqbot_common.js` | 并入 core.js | ✅ 复用 |
| 原包 `qqbot_openapi.js` | 并入 core.js（uploadMediaFile/buildSendMediaBody） | ✅ 复用 |
| 原包 `qqbot_state.js` | → `bridge_state.js` | ✅ 移植 |
| 原包 `qqbot_service.js` | → gateway.js 底层函数 | ✅ 移植 |
| 原包 `qqbot_auto_reply.js` | → `bridge_auto.js`（dist 新版） | ✅ 移植 |
| 原包 `qqbot_runtime.js` | → main.js 生命周期 hooks | ✅ 移植 |
| 原包 `qqbot_settings` UI | 未移植 | ⏳ P2 可选 |

## 7. 📌 下次行动建议（Sprint Planning）

**下个 Sprint 排期**（按性价比）：
1. **P0：B1 消息去重修复**（1 工期）——重复到达已影响体验，且是群场景的前提
2. **P0：G1 群聚合窗口**（1–2 工期）——群聊核心体验，拆最小子任务（聚合窗口→昵称映射→单次 AI→落盘格式）
3. **P1：G2 选择性回复**（0.5 工期，可与 G1 同做）
4. **P1：M3 流式 W1.1-W1.6**（1–2 工期）
5. **P2：G3 / T16 / 凭证覆盖位**（各 0.5–1）

**资源重排**：API 额度紧张时优先 B1+G1（群体验），流式可延后。

---

*本文档由渡渡维护，每次迭代结束必须同步更新。*