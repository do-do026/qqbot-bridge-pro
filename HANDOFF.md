# qqbot-bridge-pro 冷启动接续文档

> 更新时间：2026-08-06 14:47。新窗口先读 `V2-BLUEPRINT.md` §12，再读 `STATUS.md`；从 Epic G0 开始实施。

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

## 5. 14:32 新架构决定

以下均已进入规划，**尚未写入运行代码**：

- 每群第一条有效 @Bot 消息起算独立窗口，默认 60000ms；UI/API/env 可改。
- Gateway 照常接收普通群消息，桥接默认只让 @Bot 触发 AI。
- 普通群消息可作为邻近上下文：off/automatic/agent_on_demand 三态，默认 off；前5/后5，单次最多20。
- 单群超过可配置安全上限后只保留最新项，默认30；全局缓存默认建议100；到期群并发默认3。
- @ 消息编号，AI 返回 `replyTo`；过期后根据 `fallbackPreference` 主动群发或放弃并记录。
- Waifu 增加归一化后的非空换行计数。
- `com.operit.message_insert_bundle` 已确认用 `before_process` 与 `before_send_to_model` 双阶段 Hook 实现可选落盘；QQ 后台 Chat 调用是否触发 Finalize Hook 待探针验证。
- C2C/group 开关只控制是否送 AI，Gateway 不动态取消订阅。

字段、默认值、迁移、Epic 和技术债以 `V2-BLUEPRINT.md §12` 为准。

## 6. 下一步实施顺序

1. **G0 配置 schema/迁移**：先统一 config/env/UI/API 优先级，废弃旧满桶提前 flush 语义。
2. **G1 事件分流/缓存**：@ 触发、普通群消息仅缓存、每群 firstAt、单群/全局容量、重启恢复。
3. **G4 统一 chunker**：`。！？\n`、连续换行归一化、400字符兜底。
4. **G2 上下文工具**：三态、前后5、最大20。
5. **G3 replyTo/引用/过期降级**。
6. **G5 Prompt Finalize Hook 探针**，验证成功后再实现不落盘桥接 Prompt。
7. 可靠性 Sprint：事务幂等、token缓存、错误码/Trace ID、故障注入。
8. **最后做 G6 UI**，禁止在旧 UI 上继续补丁堆叠。
9. 每个 Epic 完成后更新 STATUS 的代码/部署/验证三态；全部实测后再发布。

## 7. 实施约束

- 现在的 src/dist 保持上一轮已安装代码；14:32 新需求只写入文档，没有暴露未实现工具参数。
- 不要从 README 摘要直接编码；先读 BLUEPRINT §12 的边界和迁移要求。
- UI 与 Agent 必须调用统一配置服务，不能直接写 config.json。
- “后5条”在窗口结束时取；不能在 @ 到达瞬间假装已经存在。
- Prompt Hook 必须用 chatId/turn token 白名单隔离，防止注入普通 Operit 对话。
- 真正 QQ 原生 @、引用样式和主动群消息降级必须实机验证，未验证不写成已支持。
- sync.sh 的 optional test 目录问题已经修复；每次改源码后同步 src/dist 并跑语法检查。

## 8. 已知技术坑

- ToolPkg 新工具烧录后旧会话通常不可见，要新开会话。
- `readResource` 偶发失败；部署 Gateway 脚本时应校验资源版本/哈希。
- `/sdcard` 不支持软链接，主目录→dev_package 只能单向同步。
- Gateway 使用 nohup；探活 HTTP 必须捕获连接失败；腾讯 WS/HTTP 需正确 Accept 头。
- QQ 相同 msg_id 可能重复推送，Gateway eventKey 去重已存在，但发送成功后移除队列失败仍需事务级幂等。
- GitHub smart HTTP 被墙，使用 REST contents API。

## 9. 文件地图

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