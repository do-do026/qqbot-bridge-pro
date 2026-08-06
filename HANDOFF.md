# qqbot-bridge-pro 冷启动接续文档

> 更新时间：2026-08-06 11:55。新窗口先读 `V2-BLUEPRINT.md`，再读 `STATUS.md`。

## 1. 项目

- 仓库：`https://github.com/do-do026/qqbot-bridge-pro`
- ToolPkg：`com.operit.qqbot_bridge_pro`
- 真相源：`/sdcard/Download/qqbot-bridge-pro/package/`
- dev_package：`/sdcard/Download/Operit/dev_package/qqbot_bridge_pro/`
- Gateway：增强版 Python，端口 32146；同 AppID 下原包必须停用。
- 推送：GitHub REST API；不要 git push。凭证见记忆库精确标题「凭证/完整凭证与密钥（2026-07-20更新）」。

## 2. 当前真实状态

核心 QQ→Gateway→Operit Chat→AI→QQ 已验证。2026-08-06 11:30 后按新产品要求重构：

- C2C 固定绑定 API、按需联系人查询 API、唯一主动目标 API 已加入源码。
- 未绑定 C2C 按 openid 分对话；`target_chat_id` 仅群聊固定目标。
- 群昵称默认关闭，使用 openid 后四位。
- 单聊 3 句、群 5 句，只统计 `。！？`。
- 普通文本 send 已接候选目标兜底。
- 角色卡/Waifu/自动回复 env 已补实际读取。
- ISO 时间排序、停止后群桶残留、manifest 流式误述已修。
- src/dist 已同步且 JS/Python 语法检查通过。

尚未完成/验证：

- 完整 UI；旧 UI 源码内容过时且注册仍被注释。
- 图片目录专用浏览工具。
- 新版本安装烧录和真实场景验收。
- token 缓存、事务级幂等、错误码映射。

## 3. 产品铁律

1. 联系人 openid 只在其实际发消息后记录；不自动把全部联系人注入 AI。
2. C2C 固定绑定用 `c2c_fixed_bindings` / `qqbot_pro_bridge_bind_c2c`。
3. C2C 不追求 QQ 昵称；默认后四位。用户称呼由对话/记忆决定。
4. 群聊按 group_openid 复用并聚合；不做群友独立对话。
5. 主动发送主路径只绑定一个 C2C openid。
6. 自动回复默认开启，但 Gateway 与自动回复可分开控制；关闭监听需停两者。
7. 官方 stream_messages 产品上放弃，只留架构位置。
8. 插件描述只写已实现和可实现未完成，不把预留写成已支持。

## 4. 官方查证摘要

QQ 官方：

- C2C/群收发、主动/被动消息、富媒体上传、官方 C2C 流式均存在。
- openid 是 AppID/关系维度身份，不是 QQ 号。
- 主动消息受用户开关、权限、频控约束。
- C2C 无适合本需求的稳定通用昵称接口。

Operit 指南：

- 支持 METADATA tools/env、环境变量写入、HTTP、Files、Java Bridge、生命周期 Hook、Chat 和 ToolPkg UI。
- 因而绑定、配置、主动发送和图片目录均可实现。
- 当前 compose_dsl ToolPkg UI 加载问题属于宿主限制，插件不能自行修复。

## 5. 下一步

1. 审核本轮源码差异，尤其 `bridge_auto.js` 新 API 和群 5 句分段。
2. 重构 `src/ui/qqbot_settings/index.ui.js`，删除 G3 和旧 `target_chat_id` 文案；若宿主仍阻塞，保持不注册并如实记录。
3. 补图片目录浏览/筛选工具。
4. 运行 `bash scripts/sync.sh`；注意脚本当前假设 `package/test` 存在，若不存在需先修 sync.sh。
5. 安装/烧录后新开会话确认新增工具可见。
6. 做 STATUS 所列 C2C/群/主动发送/图片/Gateway 验收。
7. 验证后才更新“已部署/已验证”状态并推 GitHub。

## 6. 已知技术坑

- ToolPkg 新工具烧录后旧会话通常不可见，要新开会话。
- `readResource` 偶发失败；部署 Gateway 脚本时应校验资源版本/哈希。
- `/sdcard` 不支持软链接，主目录→dev_package 只能单向同步。
- Gateway 使用 nohup；探活 HTTP 必须捕获连接失败；腾讯 WS/HTTP 需正确 Accept 头。
- QQ 相同 msg_id 可能重复推送，Gateway eventKey 去重已存在，但发送成功后移除队列失败仍需事务级幂等。
- GitHub smart HTTP 被墙，使用 REST contents API。

## 7. 文件地图

```text
/sdcard/Download/qqbot-bridge-pro/
├── README.md
├── V2-BLUEPRINT.md
├── STATUS.md
├── HANDOFF.md
├── package/
│   ├── manifest.json
│   ├── resources/qqbot_pro_gateway.py
│   ├── src/
│   └── dist/
└── scripts/sync.sh
```

每次迭代必须同步 README、BLUEPRINT、STATUS、HANDOFF、manifest、METADATA、src 和 dist。