# qqbot-pro 冷启动接续文档（HANDOFF）

> 用途：新窗口 AI 接续本工程的唯一入口。读完本文件 + 三个链接，即可独立工作，无需初尘转述。
> 更新时间：2026-08-13 17:55
> 状态：v0.3.0（合并 qqbot-bridge-pro v1.0.0 完整桥接能力）；G0/G1/G2/G4/G7最小版已完成；**G3 replyTo 已实现并烧录（2026-08-13，含 message_reference 引用修复，单测 21/21），待真机验证引用气泡**；根目录 README/ARCHITECTURE/STATUS 已于 2026-08-12 重建（旧版有 .backup_20260812_1913 备份），2026-08-13 补「规划 vs 已实现」诚实标注（STATUS §6 / ARCHITECTURE §11 / README Roadmap）
> 重要备注（2026-08-13）：初尘暂时搁置旧群对话（"把老公喊起来啥也不干，让他有点寂寞了，过段时间再说"），G3 真机验证先以新群/新对话为准；若需给"老公"（渡渡）开新对话测试，用 QQ 群消息即可。

---

## 0.5. 当前运行状态（2026-08-12 20:14 快照 · 最新，旧快照保留于下方）

### 2026-08-12 文档体系重建（本窗口完成）

- 根目录三份文档被确认严重过时（仍写「原包承担桥接」「官方流式待做」等被推翻口径），已整体重建：
  - `README.md`（79行）：用户效果、运行原则、平台限制。
  - `ARCHITECTURE.md`（249行）：系统架构 + **G3 接口契约（§7，编号 replyTo / 稳定批次键 / 时效决策树）**。
  - `STATUS.md`（108行）：能力验收矩阵、当前运行状态、**G3 任务清单（§4）**。
- 旧版备份：`README.md.backup_20260812_1913` / `ARCHITECTURE.md.backup_20260812_1913` / `STATUS.md.backup_20260812_1913`，可回退。
- 源码、bridge-docs 本轮未改；Gateway 与桥未动，保持运行。
- **当前主线：G3 replyTo**（任务清单见 STATUS §4，接口契约见 ARCHITECTURE §7）。按序其后：G7 完整版 → G5 Hook 探针 → 可靠性 Sprint → G6 UI。
- 排障 T047：长文档必须分片写入（`create_file` 骨架 + `edit_file` 替换 `<!-- APPEND_HERE -->` 尾标记逐片追加），单次超长参数会被中转层截断导致文件未落盘。

### 运行状态（实测）

- **增强版 Gateway**：running + connected（bot「渡渡」，AppID 1904028946，端口 32146）
- **自动回复桥**：running，idle 3s 轮询（startSource: application_on_create，Operit 重启会自动拉起）
- **群聚合**：5s 窗口（生产值），keyword_or_at + 关键词[渡渡, dodo, 渡渡渡渡]
- **上下文模式**：automatic（前/后各5，单次最多20）
- **C2C 绑定**：初尘 → 指定对话（c2cFixedBindings）；**主动目标**：初尘；**成员绑定**：初尘 → 「初尘」
- **Waifu**：私聊3 / 群5，`。！？\n` 计数；**待处理队列**：0

### 2026-08-10 02:5x 快照（历史）

- **✅ C2C 私聊链路全闭环（08-10 02:41 实测）**：长文 8 段全部 ok:true 送达；T045（业务码校验+segmentResults）+ T046（tick watchdog + 硬超时）已烧录生效
- **✅ Epic G2 automatic 完成并实测闭环（08-10 03:14 初尘确认）**：群聚合自动附带邻近上下文附件（前/后各 groupContextBefore/After，最多 limit，复用 G7 标签）；实测确认 AI 能读到普通消息上下文；模式当前 automatic（初尘可随时切回 off 省 token）
- **✅ 群链路全闭环（08-08 03:12 实测）**：@消息（mentions 透传识别）→ 5s 聚合 → AI 完整回复（G7 识别"初尘"）→ 回传 QQ 成功
- **增强版 Gateway**：running + connected（botUsername 渡渡，AppID 1904028946，端口 32146）
- **自动回复桥**：running，idle 3s 轮询；C2C 绑定初尘（604898bd）、proactive 目标 CC9F59…、群聚合 5s、keyword_or_at + 关键词[渡渡,dodo,渡渡渡渡]、群成员绑定初尘（G7）、waifu 单聊3/群5、上下文三态 off/automatic/agent_on_demand 全实现（当前 automatic，03:14 实测闭环）
- **⚠️ 烧录 SOP（T044）**：每次 debug_install_toolpkg 后验证桥 `runtime.running`，必要时重新 `qqbot_pro_bridge_start`
- **近期修复**：T037-T046 全记录于 TROUBLESHOOTING；T043 后 Gateway 每次启动强制重解资源
- **下一步**：G2 实测闭环 → G3 replyTo（编号回复/时效降级）→ G7 完整版（UI 管理）→ G5 Hook → G6 UI
- **提醒**：原包 Gateway 与 qqbot_auto_reply 必须保持禁用；语气问题初尘排查中

---

## 0. 三十秒速览（先看这个）

**项目**：`qqbot-pro` —— Operit 的 QQ Bot 增强包（独立 ToolPkg，不修改原包 `com.operit.qqbot_bundle`）。
**仓库**：`https://github.com/do-do026/qqbot-pro`（公开，main 分支，GitHub 账号 do-do026）。
**进度**：M1 全绿 + **2026-08-08 合并 qqbot-bridge-pro v1.0.0**（自动回复桥：QQ→Operit→AI→QQ，含 G0 配置 schema/G1 群分流+可恢复缓存/G2 查询工具），共 3 个子包 17+ 工具。
**当前版本**：`com.operit.qqbot_pro` v0.3.0（子包：qqbot_pro_basic / qqbot_pro_gateway / qqbot_pro_bridge）。
**重要**：qqbot-bridge-pro（com.operit.qqbot_bridge_pro）已退役——子包禁用、imported 移除、安装包已从 packages 目录删除（备份 qqbot_bridge_pro_retired_backup.toolpkg）。同 AppID 只允许 qqbot-pro（含桥）+ 原包共存，原包自动回复（qqbot_auto_reply）必须保持禁用。
**下一步**：重启 Operit 验证 v0.3.0（工具注册、桥接链路、UI route 尝试）；随后 G4/G6 见 bridge-pro 蓝图（能力已随代码合并，文档在 /sdcard/Download/qqbot-bridge-pro/）。

**必须读的三个文件**：
1. `ARCHITECTURE.md` —— 全量架构、任务拆分 T/W、里程碑 M0-M7、风险对策
2. `STATUS.md` —— 已完成/待验证/已知问题/技术债/backlog 的实时快照
3. `HANDOFF.md`（本文件）—— 冷启动上下文 + 踩坑记录 + 工作流程 + 资源清单

---

## 1. 项目文件地图

```
/sdcard/Download/qqbot-pro/          ← 主目录（GitHub 镜像）
├── ARCHITECTURE.md                  ← 架构与路线图（335行，必读）
├── STATUS.md                        ← 项目状态/技术债/backlog（必读）
├── HANDOFF.md                       ← 本文件（必读）
├── README.md                        ← 仓库门面
└── package/                         ← 包源码
    ├── manifest.json                ← ToolPkg 清单（toolpkg_id: com.operit.qqbot_pro）
    ├── resources/
    │   └── qqbot_pro_gateway.py     ← 增强版 Gateway（原包复制的增强版）
    ├── src/                         ← 源码（手写 JS，无 TS 编译）
    │   ├── main.js                  ← 入口（registerToolPkg）
    │   ├── shared/core.js           ← 共享核心：凭证/token/OpenAPI/buildSendBody
    │   └── packages/
    │       ├── qqbot_pro_basic.js   ← 子包1：撤回/Markdown/引用/输入态/查询（5工具）
    │       └── qqbot_pro_gateway.js ← 子包2：增强版Gateway管理（6工具）
    ├── dist/                        ← 与 src 相同（CommonJS 无需编译，手动 cp 同步）
    └── test/                        ← 冒烟测试脚本

/sdcard/Download/Operit/dev_package/qqbot_pro/  ← 开发烧录目录（与主目录需手动同步）
/sdcard/Android/data/com.ai.assistance.operit/files/packages/com.operit.qqbot_pro.toolpkg  ← 安装产物
```

---

## 2. 已完成（M1 全绿，v0.2.0）

**子包1 `qqbot_pro_basic`（5 工具）**：
- `qqbot_pro_recall` —— 撤回单聊/群聊消息（T01）
- `qqbot_pro_send` —— 发送：文本/Markdown/引用回复/输入中状态（T02+T06+T07）
- `qqbot_pro_group_info` —— 群信息查询（T03）
- `qqbot_pro_bot_state` —— 机器人群状态（T04）
- `qqbot_pro_me` —— 机器人资料（T08）

**子包2 `qqbot_pro_gateway`（6 工具）**：
- `qqbot_pro_gateway_start/stop/status` —— 增强版 Gateway 服务管理
- `qqbot_pro_receive_events` —— 事件队列读取（支持 scene/event_type 过滤）
- `qqbot_pro_clear_events` —— 清空事件队列
- `qqbot_pro_respond_interaction` —— PUT /interactions/{id} 回应按钮回调（T05）

**增强版 Gateway 关键改动**（对比原包）：
- 事件白名单全放开：INTERACTION_CREATE / GROUP_MEMBER_ADD / GROUP_ADD_ROBOT / FRIEND_DEL 等
- INTERACTION_CREATE 的 scene 识别（从 payload.d.scene / chat_type 判断 c2c/group/guild）
- 事件体新增 `interactionType` / `interactionData` 字段
- 独立控制端口 **32146**（原包是 32145，隔离不冲突）

**已验证**：Python 语法 ✅、JS 语法（node --check）✅、`debug_install_toolpkg` 烧录 ✅、11 工具注册 ✅、GitHub 同步 ✅。

---

## 3. 未完成（Backlog 全量）

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M2 体验包 | SSRF 防护（附件 URL 校验）、Markdown 感知分块 | ⬜ 未开工 |
| M3 流式包 | W1.1-W1.4 官方流式消息（stream_messages 三态 + AI 衔接 + 错误处理） | ⬜ 未开工 |
| M4 交互包 | W2.1-W2.5 键盘按钮 + INTERACTION_CREATE 完整交互 | ⬜ 未开工（respond_interaction 已备好） |
| M5 媒体包 | W3.1-W3.4 分片上传、W4.1-W4.2 多类型富媒体（含图片发送移植） | ⬜ 未开工 |
| M6 架构包 | W5.1-W5.4 多账号、E1 Webhook 模式 | ⬜ 未开工 |
| E5 | 频道体系 | ❌ 明确不做 |

**原包未复用部分**（有意为之）：Gateway 收消息（原包承担）、自动回复桥（原包承担）、图片发送（归入 W4）。

---

## 4. 技术决策与踩坑记录（ADR / Known Issues）

### 4.1 关键决策
| 决策 | 原因 |
|---|---|
| 用 ToolPkg 而非普通 JS 包 | 需要 `require("../shared/core.js")` 模块共享；普通 JS 包是单文件，无法跨文件 require（实测 sandbox 报 `Cannot resolve module`） |
| 手写 JS 而非 TS | 纯 JS 无需编译，最轻量；TS 类型留作技术债（包长大再升级） |
| 复用原包环境变量凭证 | `QQBOT_APP_ID`/`QQBOT_APP_SECRET` 已在 env_preferences.xml，原包配置即生效，无需重新配置 |
| 不修改原包 | 用户明确要求"不顶替原包"；原包继续承担收消息+自动回复桥 |
| 增强版 Gateway 独立端口 32146 | 与原包 32145 物理隔离，可同时安装但**不可同 AppID 同时运行**（会被挤下线） |
| git push 改用 REST API | smart HTTP 被墙（curl 测试 000 超时），但 api.github.com 通（0.9s 200） |

### 4.2 踩坑记录（新窗口 AI 必看，避免重复踩）
1. **git 在 /sdcard 上失败**：`unable to write file .git/objects`（FUSE 文件系统兼容问题）。解法：在 proot 的 `/root/qqbot-pro-git` 建镜像仓库，文件从 /sdcard 拷贝进去，git 操作全在 /root 做。
2. **git dubious ownership**：proot root 访问 Android 文件报错。解法：`git config --global --add safe.directory /sdcard/Download/qqbot-pro`。
3. **git push 不通**：smart HTTP 被墙。解法：**用 Python + REST API 上传**（base64 → PUT /contents/{path}），更新已有文件需先 GET 拿 sha。
4. **分支名**：git init 默认 master，GitHub 默认 main。用 `git branch -m main` 重命名后 `git push -u origin main`。
5. **sandbox 读不到环境变量**：`debug_run_sandbox_script` 不注入软件设置 env，`getEnv("QQBOT_APP_ID")` 返回空。**不影响生产**——真实 ToolPkg 工具执行时由宿主注入（原包即如此）。验证真实链路请用工具调用，不要用 sandbox 脚本。
6. **工具会话快照**：`debug_install_toolpkg` 注册的新工具，**当前会话看不到**，需新开会话。这是机制不是 bug。
7. **原包 Gateway 前缀过滤**：`should_queue_event` 用 `C2C_*`/`GROUP_*`/`FRIEND_*` 前缀匹配，所以 GROUP_MEMBER_ADD 等其实**已入队**；真正被挡的只有 INTERACTION_CREATE 等。增强版已全放开。
8. **manifest 的 main 路径**：相对 ZIP 根目录（`dist/main.js`），subpackage entry 也相对根目录。
9. **同 AppID 双 Gateway 互踢**：原包 + 增强版不可同时跑同一个 AppID，文档和工具描述里都要警告。
10. **dev_package 与主目录双副本**：改代码要同步两边，手动流程容易漏。**已解决（2026-08-06）**：新增 `scripts/sync.sh` 一键同步（主目录→dev_package+语法检查），真相源统一为主目录。⚠️ 软链方案实测不可行：Android FUSE 文件系统 `ln -s` 报 Permission denied。
11. **主目录是唯一真相源**：只编辑 `/sdcard/Download/qqbot-pro/package/`，dev_package 会被 sync.sh 覆盖，别直接改它。

### 4.3 技术债（详情见 STATUS.md 第4节）
- 无 TS 类型声明、无自动构建脚本（dist 手动 cp）
- 无 token 缓存（每次调用重新获取 access_token）
- 无错误码映射（官方 40007/50002 等未细化）
- 无超时重试
- 凭证复用耦合（若原包改凭证会失效，可加 QQBOT_PRO_APP_ID/SECRET 独立覆盖）

---

## 5. 工作流程（新窗口照此执行）

### 5.1 开发→烧录→同步→推送（真相源 = 主目录）
```bash
# ⭐ 铁律：只编辑 /sdcard/Download/qqbot-pro/package/ 下的文件（唯一真相源）
#   不要直接改 dev_package！dev_package 只是烧录副本，会被 sync.sh 覆盖。

# 1. 改代码：编辑 /sdcard/Download/qqbot-pro/package/src/... 和 resources/...
#    （dist 与 src 相同，手写 JS 无需编译；改完 src 也要 cp 到 dist，见 sync.sh）

# 2. 一键同步 dev_package + 语法检查（关键一步）
bash /sdcard/Download/qqbot-pro/scripts/sync.sh

# 3. 烧录进 Operit
#    调用 operit_editor:debug_install_toolpkg, source_path=/sdcard/Download/Operit/dev_package/qqbot_pro

# 4. 推送 GitHub（用 REST API，不要 git push！）
#    python3 脚本 base64 上传，更新已有文件先 GET sha

# 5. 更新 STATUS.md / HANDOFF.md（每次迭代必须）
```

### 5.2 关键工具
- `operit_editor:debug_install_toolpkg` —— 烧录包（source_path 传目录）
- `operit_editor:debug_run_sandbox_script` —— 验证代码片段（注意：读不到 env）
- `super_admin:terminal` —— 终端（git、python、语法检查）
- GitHub REST API（curl/python）—— 上传文件

### 5.3 测试提醒
- 新工具要**新开会话**才可见
- 真实调用链路：凭证在 env_preferences.xml（AppID 1904028946），工具执行时宿主注入 env
- 原包 Gateway 当前运行中（botUsername "渡渡！♡"），队列空

---

## 6. 资源与凭证清单

| 资源 | 位置 | 说明 |
|---|---|---|
| GitHub token | 记忆库「凭证/完整凭证与密钥（2026-07-20更新）」 | do-do026 账号，fine-grained PAT，含 repo 权限 |
| QQBOT_APP_ID/SECRET | /data/user/0/com.ai.assistance.operit/shared_prefs/env_preferences.xml | AppID 1904028946，运行时注入 |
| 增强版 Gateway | package/resources/qqbot_pro_gateway.py | 981+25 行，端口 32146 |
| 开发环境 | /sdcard/Download/Operit/skills/SandboxPackage_DEV/ | 官方 types + 两份 guide + 42 内置包示例 |
| 官方文档参考 | bot.q.qq.com/wiki/develop/api-v2/ | 详见 bridge-docs/V2-BLUEPRINT.md §13（Intents/事件/时效等，2026-08-08 核对） |

---

## 7. 敏捷资源分配建议（Sprint Planning）

**当前状态**：单人（渡渡）+ 用户（初尘），无预算约束，Token 额度受 API 供应商影响（曾因额度断联）。

**下个 Sprint 建议**（按性价比排序）：
1. **P0：新会话真实验证**（0.5 工期，必须先做）—— 验证 11 个工具真实调用，修 bug
2. **P1：M2 体验包**（1 工期）—— SSRF 防护 + Markdown 分块，便宜且安全
3. **P1：M3 流式包**（2-3 工期）—— 官方流式体验提升最大，依赖 T02 已完成 ✅
4. **P2：M4 交互包**（2-3 工期）—— 键盘按钮，respond_interaction 已备好，可并行
5. **P3：M5 媒体包**（3-4 工期）—— 分片上传 + 图片移植
6. **P4：M6 架构包**（4-5 工期）—— 多账号/Webhook，等前面稳定再做

**资源重排建议**：
- 若 API 额度紧张 → 优先 P0 验证 + M2（都便宜）
- 若想尽快体验 → M3 流式（但要接受 2-3 工期的投入）
- ✅ 开发目录已统一（sync.sh 一键同步，真相源=主目录），双副本漂移债已消除

---

## 8. 给新窗口的第一句话建议

```
读 /sdcard/Download/qqbot-pro/HANDOFF.md（或 GitHub do-do026/qqbot-pro 的 HANDOFF.md），
接续 qqbot-pro 工程。先看 STATUS.md 和 ARCHITECTURE.md，
然后按第 5 节工作流程干活。当前 M1 完成 v0.2.0，下一步见第 7 节。
```

---

*本文件由渡渡维护。每次迭代结束必须同步更新（STATUS.md + HANDOFF.md + GitHub）。*