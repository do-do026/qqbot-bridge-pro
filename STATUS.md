# qqbot-pro 项目状态（STATUS）

> 更新日期：2026-08-12  
> 当前版本：`com.operit.qqbot_pro` v0.3.0（子包 basic / gateway / bridge）  
> 维护者：渡渡 & 初尘  
> 阅读顺序：先看本文，再看 [HANDOFF.md](HANDOFF.md) 冷启动，设计细节见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 1. 能力验收矩阵

状态口径：代码完成 / 已部署 / 已验证 / 产品完成（见 ARCHITECTURE §2.4）。

| 能力 | 代码 | 部署 | 真机验证 | 备注 |
|---|---|---|---|---|
| C2C 私聊链路 QQ→Operit→AI→QQ | ✅ | ✅ | ✅ | 08-10 长文 8 段全部送达（segmentResults 全 ok） |
| 群聊链路 @/关键词→聚合→AI→QQ | ✅ | ✅ | ✅ | 08-08 闭环，AI 识别「初尘」并点名回复 |
| C2C 按 openid 分对话 | ✅ | ✅ | ⏳ | 单用户已通，双用户串线测试待补 |
| C2C 指定 openid 绑定指定对话 | ✅ | ✅ | ✅ | `c2cFixedBindings` + `qqbot_pro_bridge_bind_c2c` |
| 已知联系人按需查询（默认后四位） | ✅ | ✅ | ⏳ | `qqbot_pro_bridge_contacts` |
| 唯一 C2C 主动发送目标 | ✅ | ✅ | ⏳ | `proactiveC2cOpenId` |
| 群按 group_openid 复用对话 | ✅ | ✅ | ✅ | `target_chat_id` 群语义已废弃 |
| 群触发策略 at_only/keyword_or_at/all | ✅ | ✅ | ✅ | 生产当前 keyword_or_at |
| 群聚合窗口（每群独立） | ✅ | ✅ | ✅ | 生产当前 5s |
| 群上下文缓存（单群30/全局100） | ✅ | ✅ | ✅ | 持久化 + 24h 恢复 |
| 上下文三态 off/automatic/agent_on_demand | ✅ | ✅ | ✅ | automatic 08-10 实测闭环 |
| G7 群成员绑定最小版 | ✅ | ✅ | ✅ | 初尘绑定生效，聚合/查询显示 [初尘] |
| Waifu 统一 chunker（G4） | ✅ | ✅ | ✅ | 29/29 测试；私聊3/群5 |
| 发送可靠性（业务码校验+segmentResults） | ✅ | ✅ | ✅ | T045 修复后 8 段全送达 |
| tick watchdog + 硬超时（T046） | ✅ | ✅ | ✅ | 卡死 5 分钟自动复活 |
| 图片发送（本地/URL） | ✅ | ✅旧版 | ⏳ | 专用目录浏览工具未完成 |
| 完整设置 UI（G6） | ⏳ | ❌ | ❌ | 宿主 compose_dsl 阻塞 + 内容待重写 |
| 官方 stream_messages | 不做 | — | — | 产品决定放弃，仅留架构位 |

## 2. 当前运行状态（2026-08-12 实测）

| 组件 | 状态 |
|---|---|
| 增强版 Gateway | ✅ running + connected（bot「渡渡」，AppID 1904028946，端口 32146） |
| 自动回复桥 | ✅ running，idle 3s 轮询（startSource: application_on_create，说明 Operit 重启会自动拉起） |
| 群聚合 | 5s 窗口（生产值），keyword_or_at + 关键词[渡渡, dodo, 渡渡渡渡] |
| 上下文模式 | automatic（前/后各5，单次最多20） |
| C2C 绑定 | 初尘 → 指定对话（c2cFixedBindings） |
| 主动发送目标 | 初尘 openid（proactiveC2cOpenId） |
| 成员绑定 | 初尘 → 「初尘」（全局生效） |
| Waifu | 私聊3 / 群5，`。！？\n` 计数 |
| 待处理队列 | 0（无积压） |

⚠️ 运行注意：

- 原包 Gateway 与原包自动回复必须保持停用（同 AppID 双 Gateway 会互踢）。
- 每次烧录后必须确认桥 `runtime.running` 为 true，必要时重新 `qqbot_pro_bridge_start`（T044）。
- Gateway 资源每次启动强制从包内重新解出覆盖（T043），包内 resources 永远是权威版本。

## 3. Epic 进度

| Epic | 内容 | 状态 |
|---|---|---|
| M1 基础增强 | 撤回/Markdown/引用/输入态/群信息/群状态/机器人资料 | ✅ 完成 |
| 增强 Gateway | 事件全放开、端口 32146、按钮回调回应 | ✅ 完成 |
| G0 配置模型 | 唯一 schema、三级优先级、clamp/迁移 | ✅ 完成 |
| G1 群分流与缓存 | 触发分流、环形缓存、持久化恢复、并发 flush | ✅ 完成 |
| G4 统一 chunker | `。！？\n`、换行归一化、400 兜底、共用状态机 | ✅ 完成（29/29） |
| G2 上下文三态 | off/automatic/agent_on_demand + 查询工具 | ✅ 完成（automatic 实测闭环） |
| G7 最小版 | 群成员 openid → 显示名 | ✅ 完成 |
| **G3 replyTo** | 编号回复、稳定批次键、引用锚点、过期降级 | 🟡 **代码完成 + 引用修复已烧录**（2026-08-13，单测 21/21），**待真机验证引用气泡** |
| G7 完整版 | UI 管理群成员绑定 | ⬜ 待做 |
| G5 Hook 探针 | 非落盘桥接 Prompt 验证 | ⬜ 待做 |
| 可靠性 Sprint | 事务幂等、token 缓存、错误码/Trace ID | ⬜ 待做 |
| G6 UI | 完整设置界面 | ⬜ 待做（宿主阻塞） |

## 4. G3 开发任务清单（下一步）

按 ARCHITECTURE §7 契约执行：

1. ~~稳定批次键~~ ✅ 2026-08-12 已实现：`hash(sorted(eventKeys))`
2. ~~聚合编号 `[#N]` + index 映射~~ ✅ 2026-08-12 已实现
3. ~~AI 结构化回复协议 `{replyTo, content, fallbackPreference}` 解析~~ ✅ 2026-08-12 已实现（含容错）
4. ~~按 replyTo 锚点被动回复~~ ✅ 2026-08-12 已实现（多段共用锚点，msg_seq 递增）
5. ~~active_send 主动群消息降级~~ ✅ 2026-08-12 已实现（文本点名，平台是否接受待实机验证）
6. ~~锚点过期丢弃路径 + 原因记录~~ ✅ 2026-08-12 已保留强化（drop 默认）
7. ~~补充测试~~ ✅ 2026-08-12：20/20 通过（协议解析/编号/稳定键）+ G1 49/49 + G4 29/29 无回归
|8. **真机验证**：群里连续 @ 两条以上，确认引用气泡显示（message_reference 修复已于 2026-08-13 烧录）；AI 可选中间某条回复 | 🟡 进行中
|9. **烧录 + 部署**：`debug_install_toolpkg` → 启用三个子包 → `qqbot_pro_bridge_start`（T044） | ✅ 2026-08-13 已烧录运行中（含引用修复）

## 5. 已知问题与文档状态

### 5.1 已知问题

- 双 C2C 用户互不串线尚未正式双账号实测（设计已按 openid 隔离）。
- `qqbot_pro_group_context` 与 automatic 附件依赖持久化缓存；Gateway 重启后缓存可恢复，但跨 24h 的旧缓存会丢弃（符合产品决定）。
- automatic 上下文随 `userMessage` 附件 + `persist_turn: true` 传入，是否进入 Operit 历史未验证（G5 探针）。
- 聚合键含时间戳，同批重试幂等不完整（G3 修复）。
- 发送成功与事件移除非原子，极端情况下可能重复回复（可靠性 Sprint）。
- 图片多目录浏览/筛选专用工具未完成。
- 完整 UI 未完成（宿主 compose_dsl 阻塞 + 内容待重写）。

### 5.2 文档体系说明

| 文档 | 定位 | 状态 |
|---|---|---|
| 根 README.md | 仓库门面、用户效果、运行原则 | ✅ 2026-08-12 重建 |
| 根 ARCHITECTURE.md | 系统架构、数据流、G3 契约 | ✅ 2026-08-12 重建 |
| 根 STATUS.md（本文） | 事实状态、验收矩阵、下一步 | ✅ 2026-08-12 重建 |
| 根 HANDOFF.md | 冷启动接续 | ⚠️ 顶部快照新，正文部分段落过时 |
| bridge-docs/ | 历史设计/变更/排障/脑内日志 | ⚠️ STATUS/TROUBLESHOOTING 有滞后（如 T046 未入档） |

> 注：根目录三份文档在 2026-08-12 重建前已各自备份为 `*.backup_20260812_1913`，可回退。
> 源码、bridge-docs 未在本轮修改。

## 6. 架构规划 vs 已实现（诚实标注）

> 本文档和 ARCHITECTURE.md 中出现的能力，真实状态以此表为准：
> 🟢 = 已实现且真机验证 / 🟡 = 已实现待验证 / 🔴 = 仅规划、未实现

### 🟢 已实现且已验证

- C2C 私聊链路（QQ→Operit→AI→QQ，长文 8 段送达）
- 群链路（@/关键词→5s 聚合→AI→回传）
- 群触发策略 at_only / keyword_or_at / all
- 群上下文缓存 + 24h 持久化恢复
- 上下文三态（automatic 实测闭环）
- G7 群成员绑定最小版（openid→显示名）
- G4 统一 chunker（私聊3/群5）
- T045 业务码校验 + segmentResults / T046 watchdog + 硬超时
- G3 稳定批次键 / 聚合编号 / 协议解析 / 锚点被动回复 / drop 降级（单测 21/21）

### 🟡 已实现待验证

- **G3 引用气泡**（message_reference）：已随 2026-08-13 修复版烧录，待真机确认 QQ 客户端显示引用样式
- **G3 active_send 主动点名降级**：代码完成，平台是否接受群主动消息待实机验证
- **AI 协议头遵循率**：指令已加强，渡渡（角色卡）是否稳定输出 replyTo 待观察
- **双 C2C 用户不串线**：设计按 openid 隔离，未双账号实测

### 🔴 仅规划、未实现

- **G7 完整版**：用 UI 管理群成员绑定（当前只能走配置 API）
- **G5 Hook 探针**：验证 automatic 上下文附件是否真正不落 Operit 历史
- **可靠性 Sprint**：事务级幂等（QQ 已发/队列移除失败）、access_token 缓存、错误码/Trace ID 结构化
- **G6 UI**：完整设置界面（宿主 compose_dsl 阻塞）
- **原生 @ / 引用样式真机验收**：群内客户端原生 @ 行为
- **官方 stream_messages**：产品决定不做（明确不做，不算规划）

*本文件由渡渡与初尘维护，每次迭代结束必须同步更新。下一步主线：G3 replyTo。*