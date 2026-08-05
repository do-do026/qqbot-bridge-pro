# qqbot-bridge-pro STATUS（Sprint Review + Backlog + 技术债）

> 维护：渡渡｜更新时间：2026-08-06 04:18｜版本：v1.0.0（已烧录，多次迭代）
> 配套文档：`V2-BLUEPRINT.md`（架构/任务拆分/接续指引）、本文档（状态快照）
> Sprint 周期：第十一节（2026-08-06 03:40–04:18 三连修复 + B1 加固 + 空回复重试）

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
| UI 设置页 | T16 代码完成（616 行）但宿主 UI 加载 bug 阻塞注册 | P2→阻塞中 |

## 5. 📋 待办清单（Backlog）

- [x] **三连修复**（nohup / 探活 try-catch / ws 握手）✅ 2026-08-06 04:05
- [x] **B1 入队去重** ✅ 2026-08-06 04:18
- [x] **空回复重试** ✅ 2026-08-06 04:18
- [ ] B1 剩余：bridge 处理幂等（失败计数/移除策略）
- [ ] **G1 群消息聚合窗口**（P1）：窗口内同群多条 @ 整合一次 AI 调用
- [ ] **G2 AI 选择性回复**（P1）
- [ ] **G3 群独立绑定配置**（P2）
- [ ] M3 W1.1-W1.6 流式发送（单聊 stream_messages 三态）【P1】
- [ ] M4 T14 顶替原包验证（原包已停，新包独立运行中）
- [ ] **T16 UI 设置页**【P2→待宿主修复】：代码完成，注册阻塞中
- [ ] M4 T15 GitHub 推送（本次迭代未推，待推）

## 6. 🔁 当前架构完成情况（Reuse Status）

| 原模块 | 去向 | 状态 |
|---|---|---|
| qqbot-pro core.js | 底座核心 | ✅ 扩展 |
| qqbot-pro basic | basic 子包 | ✅ 扩展 |
| qqbot-pro gateway.py | 唯一 Gateway（32146） | ✅ 增强 + 修复 |
| 原包 qqbot_auto_reply.js | bridge_auto.js | ✅ 移植 + 空回复重试 |
| 原包 qqbot_service.js | gateway.js 底层 | ✅ 移植 + nohup/探活修复 |
| 原包 qqbot_runtime.js | main.js hooks | ✅ 移植（hook 实测触发） |

## 7. 📌 下次行动建议（Sprint Planning）

1. **P0：初尘实测**——重启 Operit 验证 gateway 存活；QQ 发消息验证全链路无空回复
2. **P1：T16 UI**——验证宿主 UI 加载是否修复（打开 main.js 注册注释烧录测试；坏则回滚）
3. **P1：M3 流式 / G1 群聚合**（按性价比）
4. **P2：B1 幂等收尾 / G2 / G3**

---

*本文档由渡渡维护，每次迭代结束必须同步更新。*