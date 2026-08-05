# qqbot-bridge-pro 冷启动接续文档（HANDOFF）

> 用途：新窗口 AI 接续本工程的唯一入口。读完本文件 + 两份配套文档即可独立工作。
> 更新时间：2026-08-06 02:45｜状态：M0 ✅，M1 ✅ 已验证（T09 全链路通），M2 主动发送 ✅ 实测，M4 生命周期 ✅ 部分（T13 通过）

---

## 0. 三十秒速览

**项目**：`qqbot-bridge-pro` —— Operit 的 QQ Bot 桥接增强包（独立 ToolPkg，**不修改原包** `com.operit.qqbot_bundle`）。把原包全部能力 + qqbot-pro 增强能力合并成一个包，可顶替原包。

**仓库**：`https://github.com/do-do026/qqbot-bridge-pro`（公开，REST API 上传，勿用 git push——smart HTTP 被墙）。GitHub Token 见记忆库「凭证/完整凭证与密钥」条目（2026-07-20 更新），勿写入仓库文件（secret scanning 会拦截）。

**进度**：`com.operit.qqbot_bridge_pro` v1.0.0 已烧录并激活（18 工具）。**全链路已跑通**（2026-08-06 02:16 起）：QQ → Gateway(32146) → 绑定对话 166abbb7… → AI 回复 → 回 QQ；回复同时落盘 Operit 对话。AI 主动发送已实测（直接 OpenAPI POST 送达）。

**必须读**：
1. `V2-BLUEPRINT.md` —— 架构、ADR、里程碑、任务拆分、环境变量、**§10 接续指引**、**§11 群聊增强新需求（G1-G3）**
2. `STATUS.md` —— 已完成/待验证/已知问题（6 项，含 B1 消息去重）/技术债/Backlog/下次行动

---

## 1. 核心链路（已验证 ✅）

```
QQ 发消息 → 增强 Gateway(32146) 收 → 事件队列
         → 自动回复桥 → Tools.Chat 唤醒 Operit AI（绑定指定对话 target_chat_id）
         → AI 回复 → waifu 三句号切分（waifu_flush_sentences=3）→ 发回 QQ
工作流/AI 主动 → list_targets 查候选 → send/send_image 主动发 QQ   ✅ 实测通过
流式预留（未实现）→ /v2/users/{openid}/stream_messages 三态（M3）
```

## 2. 踩坑记录（新窗口必看）

1. **新工具当前会话不可见**：`debug_install_toolpkg` 烧录后必须**新开会话**才能看到 `qqbot_bridge_pro_*` 工具。且注意 `reset_subpackage_states=true` 会重置子包启用状态（工具数 0），需用 `activate_subpackages` 显式激活。
2. **git push 被墙**：用 Python + REST API（base64 → PUT /contents/{path}），更新已有文件先 GET 拿 sha。
3. **同 AppID 双 Gateway 互踢**：原包已停 ✅；新包 Gateway 端口 32146。
4. **腾讯网关必须带 `Accept: application/json` 头**：不带返回 `{"code":100007,"message":"appid invalid"}`，误导性极强。
5. **`listenerEnabled` 无代码置 true**：gateway.js 不写，bridge 只在 false 时把 enabled 打回 false——首次配置必须手工写 config.json。
6. **消息重复到达**（P1 已知问题）：同一 messageId 多次处理（对话出现重复条目 + 偶发 AI 空回复）。修复方向：Gateway 入队按 eventKey 去重 + 桥处理幂等（B1）。
7. **状态目录隔离**：新包用 `getPluginConfigDir(com.operit.qqbot_bridge_pro)`（=/sdcard/Download/Operit/plugins/com.operit.qqbot_bridge_pro），与原包物理隔离。
8. **真相源**：`/sdcard/Download/qqbot-bridge-pro/package/`，dev_package 由 `scripts/sync.sh` 覆盖，别直接改 dev_package。

## 3. 下一步（新会话照此执行）

> ⚠️ **2026-08-06 03:25 紧急状态快照（第十节收尾）**：
> - **原包已停**（config listenerEnabled=false + Gateway 进程已杀）✅ 不会互踢
> - **新包已烧录**（主包 enabled:true，18 工具注册）✅
> - **Gateway 当前未运行**（手动起的进程会被 Operit 重启杀掉，非持久方案）
> - **桥未运行**（hooks 当前不触发——宿主 ToolPkg UI/hook 加载存在 bug，moodlet 等带 UI 包同样报 `toolpkg registration session is not active`）
> - **接管动作（新会话做）**：
>   1. `qqbot_pro_gateway_start`（宿主管理进程，重启后可恢复）
>   2. `qqbot_pro_bridge_start`（启动自动回复桥，轮询 32146）
>   3. 初尘给 QQ bot 发消息 → 验证纯新包链路（原包已停，不会再重复）
> - **B1 真相**：此前"消息重复"= 原包+新包同时运行各自处理（02:15 初尘按原包 UI 激活了原包桥），不是 Gateway 去重 bug。原包停止后此问题自愈。
> - **T16 UI**：代码完成（612 行，含群增强 G1/G3 预留），但宿主对 ToolPkg UI 模块热/冷加载均有 bug（registration session not active），注册暂时注释保留，待宿主修复或走市场导入路径。

1. 新会话验证工具可见 → `qqbot_pro_bridge_status` / `qqbot_pro_gateway_status`
2. **接管**：`qqbot_pro_gateway_start` → `qqbot_pro_bridge_start` → 全链路验证
3. **B1 收尾**：原包保持停用（防双包），"入队去重"降级为防御性改进
4. **G1 群消息聚合窗口**（P0，初尘需求，见 BLUEPRINT §11）
5. G2 选择性回复 / G3 群独立绑定（P1/P2）
6. M3 流式 W1.1-W1.6（P1）
7. **T16 UI**：待宿主修复后启用注册，或验证市场导入路径

## 4. 文件地图

```
/sdcard/Download/qqbot-bridge-pro/
├── README.md          ← 仓库门面
├── V2-BLUEPRINT.md    ← 架构/任务/接续指引/群聊增强设计（主文档）
├── STATUS.md          ← 状态快照（Sprint Review + Backlog + 技术债）
├── HANDOFF.md         ← 本文件
├── package/           ← 包源码（真相源）
│   ├── manifest.json  ← toolpkg_id: com.operit.qqbot_bridge_pro
│   ├── resources/qqbot_pro_gateway.py  ← 增强版 Gateway（端口 32146）
│   ├── src/main.js / shared/ / packages/
│   └── dist/          ← 与 src 手动同步（手写 JS 无编译）
└── scripts/sync.sh    ← 同步 dev_package + 语法检查
```

---

*本文件由渡渡维护。每次迭代结束必须同步更新（STATUS.md + V2-BLUEPRINT.md + GitHub）。*