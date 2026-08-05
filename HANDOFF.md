# qqbot-bridge-pro 冷启动接续文档（HANDOFF）

> 用途：新窗口 AI 接续本工程的唯一入口。读完本文件 + 两份配套文档即可独立工作。
> 更新时间：2026-08-06 02:00｜状态：M0 ✅ 完成（v1.0.0 已烧录），M1 代码完成待真实验证

---

## 0. 三十秒速览

**项目**：`qqbot-bridge-pro` —— Operit 的 QQ Bot 桥接增强包（独立 ToolPkg，**不修改原包** `com.operit.qqbot_bundle`）。把原包全部能力 + qqbot-pro 增强能力合并成一个包，可顶替原包。

**仓库**：`https://github.com/do-do026/qqbot-bridge-pro`（公开，REST API 上传，勿用 git push——smart HTTP 被墙）

**进度**：`com.operit.qqbot_bridge_pro` v1.0.0 已烧录，18 工具注册 ✅（basic 7 + gateway 6 + bridge 5）。**M1 真实验证未做**（需新会话）。

**必须读**：
1. `V2-BLUEPRINT.md` —— 架构、ADR、里程碑、任务拆分、环境变量、**第 10 节=新会话接续指引**
2. `STATUS.md` —— 已完成/待验证/已知问题/技术债/Backlog/复用状态/下次行动

---

## 1. 核心链路

```
QQ 发消息 → 增强 Gateway(32146) 收 → 事件队列
         → 自动回复桥 → Tools.Chat 唤醒 Operit AI（绑定指定对话 target_chat_id）
         → AI 回复 → waifu 三句号切分（waifu_flush_sentences=3）→ 发回 QQ
工作流/AI 主动 → list_targets 查候选 → send/send_image 主动发 QQ
流式预留（未实现）→ /v2/users/{openid}/stream_messages 三态（M3）
```

## 2. 踩坑记录（新窗口必看）

1. **新工具当前会话不可见**：`debug_install_toolpkg` 烧录后必须**新开会话**才能看到 `qqbot_bridge_pro_*` 工具。
2. **git push 被墙**：用 Python + REST API（base64 → PUT /contents/{path}），更新已有文件先 GET 拿 sha。
3. **同 AppID 双 Gateway 互踢**：原包已停 ✅；新包 Gateway 端口 32146。
4. **群聊无官方流式**：文档明示"群消息不支持流式参数"→ W2 已砍；群聊用 waifu 切分（普通群消息接口）。
5. **原包 src/dist 漂移**：只从 dist 移植（dist 含 target_chat_id 等新版逻辑），不反向同步 src。
6. **状态目录隔离**：新包用 `getPluginConfigDir(com.operit.qqbot_bridge_pro)`，与原包物理隔离。
7. **真相源**：`/sdcard/Download/qqbot-bridge-pro/package/`，dev_package 由 `scripts/sync.sh` 覆盖，别直接改 dev_package。

## 3. 下一步（新会话照此执行）

见 `V2-BLUEPRINT.md` 第 10 节，摘要：
1. `qqbot_bridge_pro_bridge:qqbot_pro_bridge_configure` 迁移原包配置（target_chat_id=166abbb7-…、角色卡 b89f6656-…、渡渡指令、waifu=3、start_now=true）
2. Gateway 未自动起则 `qqbot_pro_gateway_start`
3. 初尘给 QQ bot 发消息 → 验证 QQ→AI→QQ 全链路 + waifu 切分
4. `bridge_status` / `gateway_status` 检查
5. AI 主动发送：env `QQBOT_PRO_TARGET_OPENIDS` / `QQBOT_PRO_TARGET_GROUP_OPENIDS` → `list_targets` → `send`
6. 验证通过 → 更新 STATUS/BLUEPRINT → REST API 推送 GitHub

## 4. 文件地图

```
/sdcard/Download/qqbot-bridge-pro/
├── README.md          ← 仓库门面
├── V2-BLUEPRINT.md    ← 架构/任务/接续指引（主文档）
├── STATUS.md          ← 状态快照（7 板块）
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