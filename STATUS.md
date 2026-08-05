# qqbot-bridge-pro STATUS（Sprint Review + Backlog + 技术债）

> 维护：渡渡｜更新时间：2026-08-06 01:55｜版本：v1.0.0（已烧录）
> 配套文档：`V2-BLUEPRINT.md`（架构/任务拆分/接续指引）、本文档（状态快照）

---

## 1. ✅ 已完成（Done）

| 项 | 说明 |
|---|---|
| M0 包结构 | `com.operit.qqbot_bridge_pro` v1.0.0，三子包（basic/gateway/bridge），manifest + resources 就位 |
| M0 core.js 扩展 | 凭证/OpenAPI/buildSendBody + 图片上传 uploadMediaFile + AI 候选列表 readTargetCandidates/resolveSendTarget |
| M0 main.js | 生命周期 hooks 注册（application_on_create/foreground/terminate 自动启停） |
| M0 烧录 | `debug_install_toolpkg` ✅ 18 工具注册（basic 7 + gateway 6 + bridge 5） |
| M1 Gateway 统一 | 底层函数并入 gateway.js：ensureGatewayStarted/queryGatewayEvents/removeGatewayEvents/stopGateway，端口 32146，状态目录动态化（getPluginConfigDir） |
| M1 自动回复桥移植 | bridge_auto.js（原包 dist 新版）：target_chat_id / QQBOT_TARGET_CHAT_ID / waifu_flush_sentences=3 / 角色卡 / 桥接指令 全保留 |
| M1 状态持久化 | bridge_state.js（getPluginConfigDir 独立目录，与原包物理隔离） |
| 原包停用 | Gateway + 自动回复桥均已停（防同 AppID 互踢） |
| 官方文档确认 | 单聊流式 `/v2/users/{openid}/stream_messages` 三态确认；**群聊无流式**（文档明示）→ 砍掉 W2 |
| 桥配置迁移素材 | 原包配置已备份（target_chat_id=166abbb7-…、角色卡 b89f6656-…、渡渡指令、waifu=3） |

## 2. ⚠️ 待验证（Pending Verification）

| 项 | 验证方式 | 状态 |
|---|---|---|
| 新会话工具可见性 | 新开会话确认 `qqbot_bridge_pro_*` 工具出现 | ⏳ 待做 |
| 桥配置迁移 + 启动 | 新会话 configure（迁移原配置）→ gateway_start → bridge_start | ⏳ 待做 |
| QQ→Operit→QQ 全链路 | 初尘给 QQ bot 发消息，看 AI 回复 + waifu 三句切分 | ⏳ 待做 |
| 绑定指定对话 | 确认回复落在 target_chat_id 指定对话 | ⏳ 待做 |
| AI 主动发送候选 | 配 QQBOT_PRO_TARGET_OPENIDS 后 list_targets + send | ⏳ 待做 |
| 生命周期自动启停 | 重启 Operit 后 Gateway/桥是否自动拉起 | ⏳ 待做（M4） |

## 3. 🐛 已知问题（Known Issues）

1. **新工具当前会话不可见**：`debug_install_toolpkg` 注册的工具需**新开会话**才可见（机制，非 bug）。
2. **群聊无官方流式**：文档明示"群消息不支持流式参数"，W2 群聊流式已砍；群聊用 waifu 切分（普通群消息接口）替代。
3. **原包 src/dist 漂移**：原包 dist 含 target_chat_id 但 src 没有（改过编译产物）——已规避：只从 dist 移植，不反向同步。
4. **同 AppID 双 Gateway 互踢**：原包已停；若日后原包被重新启用需先停 bridge-pro Gateway。
5. `sync.sh` 报 `test` 目录缺失警告（无害，新包暂无 test 目录）。

## 4. 💰 技术债（Tech Debt）

| 债 | 说明 | 优先级 |
|---|---|---|
| 无 token 缓存 | 每次调用重新获取 access_token（继承 V1） | P2 |
| 凭证耦合 | 复用 QQBOT_APP_ID/SECRET，原包改凭证会失效；预留 `QQBOT_PRO_APP_ID/SECRET` 独立覆盖位未做 | P2 |
| 无错误码映射 | 官方 40007/50002/40034100 等未细化到工具提示 | P2（流式时顺带） |
| UI 设置页未移植 | 原包 qqbot_settings（compose_dsl）→ M4 T16 可选 P2 | P2 |
| src/dist 手动同步 | 手写 JS 无编译链，靠 sync.sh cp；改代码后必须跑 sync.sh | 流程债 |
| W2 群流式预留代码 | 官方无此接口，预留位置未写代码（同构注释） | 已砍，不写 |

## 5. 📋 待办清单（Backlog）

- [ ] M1 T09 端到端真实验证（新会话）【P0，下一件事】
- [ ] M2 T10-T12 AI 主动发送候选：list_targets 已实现 ✅，send 候选兜底 + 错误提示待完善【P1】
- [ ] M3 W1.1-W1.6 流式发送（单聊 stream_messages 三态 + 错误处理）【P1，拆成最小子任务在 BLUEPRINT §6】
- [ ] M4 T13-T15 生命周期验证 + 顶替原包 + GitHub 推送【P1】
- [ ] M4 T16 UI 设置页移植【P2，可选】
- [ ] GitHub 仓库创建 + REST API 推送（do-do026/qqbot-bridge-pro）【P0，本次收尾】

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
| 原包 `qqbot_service.js` | → gateway.js 底层函数（端口/脚本名改造） | ✅ 移植 |
| 原包 `qqbot_auto_reply.js` | → `bridge_auto.js`（dist 新版） | ✅ 移植 |
| 原包 `qqbot_runtime.js` | → main.js 生命周期 hooks | ✅ 移植 |
| 原包 `qqbot_settings` UI | 未移植 | ⏳ P2 可选 |

## 7. 📌 下次行动建议（Sprint Planning）

**预算**：无外部预算约束；Token 额度受 API 供应商影响（历史断联过）。

**下个 Sprint 排期**（按性价比）：
1. **P0：新会话真实验证**（0.5 工期）——开新对话 → 读 BLUEPRINT 第 10 节 → configure 迁移 → 启 Gateway/桥 → 初尘发消息验证全链路 → 修 bug
2. **P0：GitHub 推送**（0.5 工期）——创建 `do-do026/qqbot-bridge-pro` + REST API 上传（package + 文档）
3. **P1：M2 AI 主动发送收尾**（0.5 工期）——send 候选兜底、错误提示、初尘填 openid 候选 env
4. **P1：M3 流式 W1.1-W1.6**（1-2 工期）——按 BLUEPRINT §6 最小子任务推进
5. **P2：M4 生命周期验证 + 顶替 + UI 移植**（1 工期）

**资源重排**：若 API 额度紧张 → 优先 P0 两项（验证 + 推送），M3 流式延后不阻塞核心链路。

---

*本文档由渡渡维护，每次迭代结束必须同步更新。*
