# qqbot-bridge-pro 冷启动接续文档（HANDOFF）

> 用途：新窗口 AI 接续本工程的唯一入口。读完本文件 + 两份配套文档即可独立工作。
> 更新时间：2026-08-06 04:05｜状态：M0 ✅，M1 ✅ 已验证，M2 主动发送 ✅，M4 生命周期 ✅ 部分，**2026-08-06 04:05 三连修复完成（nohup/探活/ws）**

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
9. **软链接不可行**（实测）：Android /sdcard（FUSE）不允许 `ln -s`（Permission denied），不要试图用软链统一 dev_package 与主目录；双副本漂移靠 sync.sh 单向同步解决（qqbot-pro 已验证此方案）。

## 3. 下一步（新会话照此执行）

> ✅ **2026-08-06 04:05 状态快照（三连修复完成）**：
> - **修复① 缺 nohup**（移植回归）：gateway 启动命令补上 `nohup`（src+dist 的 qqbot_pro_gateway_start / ensureGatewayStarted 两处）。实测进程 PPID=1，已脱离 Operit 进程树，Operit 重启杀不掉，与原包 gateway 同等存活能力。
> - **修复② 探活抛异常**（httpToControl 未捕获 Tools.Net.http 连接失败）：导致 isServiceRunning() 直接抛异常 → ensureGatewayStarted 永远中断在"判断是否运行"，进程永远起不来 + gateway/bridge start 全部 Step error。已加 try-catch，连接失败返回"未运行"→正常走启动分支。
> - **修复③ ws 握手超时 + 缺 Accept 头**（qqbot_pro_gateway.py SimpleWebSocketClient）：默认 1s socket 超时导致握手阶段 read timeout；握手头缺 `Accept: application/json`。已改为握手阶段宽超时（10s）+ 补 Accept 头 + 握手完成后切回轮询超时。
> - **当前实况（04:05 实测）**：Gateway running=true connected=true，botUsername=渡渡！♡，pid 29543，PPID=1；Bridge running=true status=idle（3s 轮询中），target_chat_id=166abbb7… 绑定保留。
> - **2026-08-06 04:18 加固（B1 去重 + 空回复重试）**：① gateway.py append_event 增加 eventKey 去重（同一条消息 ws 重推不再重复入队，实测"走走"此前被处理 3 次）；② bridge_auto.js generateAiReplyAsync 增加空回复自动重试（最多 3 次，5s/10s 间隔），AI 偶发空回复自愈，不再落盘空条目干等。两者已烧录并重启验证（Gateway connected + Bridge idle）。
> - **待办验证**：① 重启 Operit 验证 gateway 存活（预期存活）② QQ 发消息验证全链路 ③ 群聊/图片/主动发送补测。
> - **注意**：部署脚本位于 `/sdcard/Download/Operit/plugins/com.operit.qqbot_bridge_pro/qqbot_pro_gateway.py`，改 resource 后需手动覆盖（start 只在脚本不存在时复制）；`readResource` 在当前会话曾失败，已用 cp 解决。

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
│   ├── src/main.js / shared/ / packages/ / ui/
│   └── dist/          ← 与 src 手动同步（手写 JS 无编译）
└── scripts/sync.sh    ← 同步 dev_package + 语法检查
```

## 5. 手动打包 .toolpkg SOP（手机全流程，无需电脑）

> 背景：`debug_install_toolpkg`（热烧录）对含 compose_dsl UI 的包会报 `container did not appear`（宿主 bug，2026-08-06 04:20 二次复现）。
> 替代路径：手动打包 `.toolpkg` 放入外部 packages 目录，走**正常导入扫描链路**（phase=external），可能绕过热烧录的 container 检查。待验证。

```bash
# ① 准备：打开 main.js（src+dist）的 UI 注册注释 → bash scripts/sync.sh
# ② 让 dist/ui 用真正的设置页（src 616 行版），清掉测试屏和嵌套残留
cd /sdcard/Download/Operit/dev_package/qqbot_bridge_pro
cp src/ui/qqbot_settings/index.ui.js dist/ui/qqbot_settings/index.ui.js
rm -rf dist/ui/ui
# ③ 打成 zip → .toolpkg
rm -f /sdcard/Download/qqbot_bridge_pro_ui.toolpkg
zip -r /sdcard/Download/qqbot_bridge_pro_ui.toolpkg manifest.json src dist resources
# ④ 导入：放入 Operit 外部 packages 目录（同名覆盖 = 升级/回滚）
cp /sdcard/Download/qqbot_bridge_pro_ui.toolpkg /sdcard/Android/data/com.ai.assistance.operit/files/packages/
# ⑤ 验证：包管理界面看包是否在、工具是否可见、工具箱是否有设置页
#    回滚：把 packages 目录里的 .toolpkg 换回无 UI 版（重新 debug_install_toolpkg 即可）
```

**注意事项**：
- `.toolpkg` = zip，根目录直接是 manifest.json / src / dist / resources（无外层文件夹）
- 打包前必须确认 main.js 的 UI 注册是打开状态，否则打了也白打
- 导入路径走的是 Operit 外部包扫描（scan candidate phase=external），与热烧录不同链路
- 若导入后工具消失 → 立即用 `debug_install_toolpkg`（无 UI 版）回滚恢复

---

*本文件由渡渡维护。每次迭代结束必须同步更新（STATUS.md + V2-BLUEPRINT.md + GitHub）。*