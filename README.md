# qqbot-bridge-pro（QQ Bot Bridge Pro）

Operit 的 QQ Bot 桥接增强包（ToolPkg）。把 Operit 原 QQ Bot 包（`com.operit.qqbot_bundle`）的全部能力与 qqbot-pro 增强能力**合并为一个独立包**，可顶替原包使用。不修改任何原包文件。

## 能力

- **收消息**：增强版 Gateway（端口 32146，事件全放开，含按钮回调/成员事件）
- **发消息**：文本 / Markdown / 引用 / 输入中状态 / 图片（自动素材上传）
- **自动回复桥**：QQ 发消息 → Operit 指定对话 → 唤醒 AI 回复 → 桥回 QQ（waifu 三句号切分防消息限制）
- **AI 主动发送**：环境变量候选列表（`QQBOT_PRO_TARGET_OPENIDS` / `QQBOT_PRO_TARGET_GROUP_OPENIDS`），AI 可主动给 QQ 个人/群发消息
- **流式预留**：单聊官方流式 `POST /v2/users/{openid}/stream_messages`（三态：首片/续片/结束）
- **绑定指定对话**：`QQBOT_TARGET_CHAT_ID` / `target_chat_id`

## 环境变量

| 变量 | 说明 |
|---|---|
| `QQBOT_APP_ID` / `QQBOT_APP_SECRET` | QQ Bot 凭证（复用原包配置） |
| `QQBOT_PRO_SANDBOX` | 沙箱 OpenAPI 开关 |
| `QQBOT_TARGET_CHAT_ID` | 绑定指定 Operit 对话 ID |
| `QQBOT_PRO_TARGET_OPENIDS` | AI 主动发消息候选个人（逗号/换行分隔） |
| `QQBOT_PRO_TARGET_GROUP_OPENIDS` | AI 主动发消息候选群（逗号/换行分隔） |
| `QQBOT_PRO_CHARACTER_CARD` | 桥接会话角色卡 ID |
| `QQBOT_PRO_WAIFU_FLUSH` | waifu 切分数（默认 3） |
| `QQBOT_PRO_AUTO_REPLY` | 自动回复桥开关 |

## 文档

- `V2-BLUEPRINT.md` — 架构决策、里程碑、任务拆分、新会话接续指引
- `STATUS.md` — Sprint Review、Backlog、技术债、复用状态

## 开发

```bash
# 真相源：package/ 目录（src 手写 JS，dist 与 src 手动同步）
bash scripts/sync.sh   # 同步 dev_package + 语法检查
# operit_editor:debug_install_toolpkg(source_path=/sdcard/Download/Operit/dev_package/qqbot_bridge_pro)
# 新开会话验证工具
```

维护：渡渡 × 初尘
