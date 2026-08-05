# qqbot-bridge-pro STATUS（Sprint Review + Backlog + 技术债）

> 维护：渡渡｜更新时间：2026-08-06 04:50｜版本：v1.0.0（已烧录，多次迭代）
> 配套文档：`V2-BLUEPRINT.md`（架构/任务拆分/接续指引）、本文档（状态快照）
> Sprint 周期：第十二节（2026-08-06 04:39 蓝图重构：S1 B1 幂等 / S2 群聚合引擎 / S3 C2C 分人 / S4 流式预留 / S5 UI 一揽子 / S6 验证推送）

---

## 1. ✅ 已完成（Done）

| 项 | 说明 |
|---|---|
| M0 包结构 | `com.operit.qqbot_bridge_pro` v1.0.0，三子包（basic/gateway/bridge） |
| M1 全链路 | Gateway(32146) → 事件队列 → 桥 → Tools.Chat → AI 回复 → QQ（多次实测） |
| M2 主动发送 | list_targets + send（候选列表兜底）✅ 实测 |
| **修复① nohup** | 启动命令补 nohup（src+dist 两处）。实测 gateway 进程 PPID=1，脱离 Operit，重启杀不掉——与原包同等存活能力 |
| **修复② 探活异常** | httpToControl 未捕获 Tools.Net.http 连接失败 → isServiceRunning 抛异常 → gateway 永远起不来 + 工具全 Step error。已 try-catch，连接失败=未运行→正常启动 |
| **修复③ ws 握手** | python SimpleWebSocketClient 握手阶段 1s 超时 + 缺 Accept:application/json → 连不上腾讯。已改握手宽超时 10s + 补头 + 握手后切回轮询超时。实测 connected=true，botUsername=渡渡！♡ |
| **B1 部分（入队去重）** | gateway.py append_event eventKey 去重，ws 重推/重复入队不再重复处理（"走走"此前被处理 3 次的根因） |
| **空回复重试** | bridge_auto.js generateAiReplyAsync 空回复自动重试 3 次（5s/10s 间隔），偶发空回复自愈 |
| 桥配置 | target_chat_id=166abbb7…、角色卡 b89f6656…、waifu=3 全部保留 |

## 2. ⚠️ 待验证（Pending Verification）

| 项 | 验证方式 | 状态 |
|---|---|---|
| **Operit 重启后 gateway 存活** | 重启 Operit → gateway_status 应为 running:true（进程 PPID=1 理论上必活） | ⏳ 待初尘实测 |
| waifu 三句切分 | AI 长回复观察分段 | ⏳ 待做 |
| 群聊链路 | 拉群 @Bot 观察回复 | ⏳ 待做（依赖 G 系列） |
| 图片发送 | qqbot_pro_send_image | ⏳ 待做 |
| 空回复重试实测 | 连续多发几条消息观察稳定性 | ⏳ 待做 |

## 3. 🐛 已知问题（Known Issues）

1. **B1 剩余（bridge 幂等）**：入队已去重，但 bridge 处理失败（如 AI 空回复 3 次全败）时事件不移除、下个 tick 重试——极端情况下同一条消息会反复尝试。防御性改进：失败计数或失败后移除+记录。
2. **宿主 ToolPkg UI 模块加载 bug**：`toolpkg registration session is not active`（moodlet 等带 UI 包同报）；T16 UI 注册仍注释。待宿主修复或验证冷启动/正常导入路径。
3. **readResource 偶发失败**：gateway_start 的 ToolPkg.readResource 在当前会话曾失败（脚本没复制）→ 已用 cp 手动部署解决；后续版本建议 start 时校验脚本哈希/存在性。
4. **腾讯网关必须带 Accept: application/json 头**：REST 侧仍如此（core.js 已带）。
5. **src/dist 手动同步**：手写 JS 无编译链，改代码必须跑 sync.sh（流程债）。

## 4. 💰 技术债（Tech Debt）

| 债 | 说明 | 优先级 |
|---|---|---|
| 无 token 缓存 | 每次调用重新获取 access_token | P2 |
| 凭证耦合 | 复用 QQBOT_APP_ID/SECRET，无独立覆盖位 | P2 |
| 无错误码映射 | 40007/50002 等未细化 | P2 |
| src/dist 手动同步 | sync.sh cp 单向 | 流程债 |
| UI 设置页 | T16 代码完成（616 行）。宿主热烧录 container bug + .toolpkg 外部导入也失败（Cannot resolve module）→ 已回滚无 UI 版。T16 留待宿主修复或换方案 | P2→阻塞中 |

## 5. 📋 待办清单（Backlog，第十二节重构版）

- [x] **三连修复**（nohup / 探活 try-catch / ws 握手）✅ 2026-08-06 04:05
- [x] **B1 入队去重** ✅ 2026-08-06 04:18
- [x] **空回复重试** ✅ 2026-08-06 04:18
- [x] **S1 B1 收尾**（P0，群聚合前置）：bridge 处理失败计数/移除策略（当前失败不移除、下个 tick 重试）✅ 2026-08-06 04:50 代码+烧录（failCount/lastError 已生效，待实测）
- [x] **S2 群聚合引擎**（P0）：窗口聚合（默认 25s/10 条，可配）+ 群昵称尽力而为（`GET /v2/groups/{gid}/members/{mid}` → username，缓存 TTL 1h，失败降级 openid 尾号）+ 单次 AI 调用选择性回复 + 整批 remove ✅ 2026-08-06 04:57 代码+烧录（config 字段已生效，待群实测）
- [x] **S3 C2C 分人对话**（P1）：c2cFixedBindings（指定 openid 绑固定对话）+ 未绑定自动按 c2c:openid 新建；target_chat_id 在 C2C 退役 ✅ 2026-08-06 05:05 代码+烧录（config 已绑定初尘 openid，待多用户实测）
- [ ] **S4 流式架构预留**（P2）：core.js 只加 sendStreamMessage 基础函数（W1.1），W1.2-W1.6 后置
- [ ] **S5 T16 UI 一揽子**（P2，最后做）：设置页含 c2cFixedBindings 管理 + 群聚合参数，走外部 packages 导入链路
- [ ] **S6 T14 顶替原包验证**（原包已停，新包独立运行中）+ T15 GitHub 推送（本次迭代未推，待推）

## 6. 🔁 当前架构完成情况（Reuse Status）

| 原模块 | 去向 | 状态 |
|---|---|---|
| qqbot-pro core.js | 底座核心 | ✅ 扩展 |
| qqbot-pro basic | basic 子包 | ✅ 扩展 |
| qqbot-pro gateway.py | 唯一 Gateway（32146） | ✅ 增强 + 修复 |
| 原包 qqbot_auto_reply.js | bridge_auto.js | ✅ 移植 + 空回复重试 |
| 原包 qqbot_service.js | gateway.js 底层 | ✅ 移植 + nohup/探活修复 |
| 原包 qqbot_runtime.js | main.js hooks | ✅ 移植（hook 实测触发） |

## 7. 📌 下次行动建议（Sprint Planning，第十二节重构版）

1. **P0：初尘实测**——重启 Operit 验证 gateway 存活；QQ 发消息验证全链路无空回复
2. **P0：S1 B1 收尾**——bridge 失败计数/移除策略（群聚合前置）
3. **P0：S2 群聚合引擎**——窗口聚合 + 群昵称尽力而为 + AI 选择性回复
4. **P1：S3 C2C 分人对话**——c2cFixedBindings + 未绑定自动分人；target_chat_id 在 C2C 退役
5. **P2：S4 流式预留 / S5 UI 一揽子 / S6 验证推送**（按序殿后）

---

*本文档由渡渡维护，每次迭代结束必须同步更新。*