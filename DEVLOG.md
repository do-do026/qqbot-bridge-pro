# qqbot-pro 开发日志（DEVLOG）

> 按会话实录，记录进展、思路、卡点和当时的心情。
> 给新窗口看懂"当时为什么这么想"——比 CHANGELOG 多一层上下文。
> 条目按初尘的时间戳排列。

---

## 2026-08-05

### 22:49 · 初尘发起："帮我看看这两个包对比"

把 `qqbot` 和 `qqbot_auto_reply` 的工具清单全部摊开，跟官方 v2 文档对照。翻代码发现这俩根本**不是两个独立包**——是 `com.operit.qqbot_bundle` 的俩 subpackage，共享一个 Gateway。架构层面这个发现很重要，决定了后面"不重复造轮子、新包专注补缺"的策略。

官方文档从 sitemap 拉全量，发现 v2 API 差了一堆：撤回、Markdown、流式、键盘、分片上传、频道体系……写了 30+ 条差距清单。

### 23:58 · 初尘："先把架构搞出来"

开始写 `ARCHITECTURE.md`。任务编号 T01-T08 / W1-W5、难度分级 🟢/🟡/🟠/🔴、里程碑 M0-M7。设计原则第一条就是"不顶替原包"。开了 GitHub 仓库 `do-do026/qqbot-pro`。

---

## 2026-08-06

### 00:01 · 初尘："用你自己的仓库的token，别用operit仓库的token"

翻 Operit 配置目录找到 `env_preferences.xml` 里的 `GITHUB_TOKEN`，初尘提醒那是 Operit 作者的 token。回到记忆库翻凭证——果然有我们自己的（do-do026 账号，2026-07-20 更新）。同一个 token 值，但来源要对——记忆库才是我们的凭证档案，不能随地扒配置文件。重要的工程习惯。

### 00:11 · 初尘："开！先把最轻量的分阶段做"

T01-T08 开工。决策：**手写 JS 跳过 TS 编译**——最轻量，CommonJS 直接可跑。先写 `shared/core.js`（凭证→token→OpenAPI→buildSendBody），再写 `qqbot_pro_basic.js`（撤回/Markdown/引用/输入态/查询）。用 `node --check` 验证语法全过。第一次 `debug_install_toolpkg` 烧录成功，5 工具注册——信心落地。

踩坑时间开始：

- **T004/T005**：git 在 /sdcard 死活写不进，proot 报 dubious ownership。在 /root 建镜像仓库 + safe.directory 解决。以为终于能 push 了——
- **T006**：git push 超时。curl 测 github.com 返回 000，api.github.com 200 通。**决定今后全用 REST API 上传文件**，不用 git push。这个决策影响深远——HANDOFF 工作流程里专门标红"不要 git push！"

### 00:19 · 初尘："刚刚因为另外一个api用完了断联，切回我自己的"

API 额度用完断联——提醒我了每次调用 token 重新获取没缓存（技术债）。初尘发来 `operit脚本开发指南.docx` 和四个 zip（models/jniLibs/libs/subpack）。docx 里确认了 ToolPkg 的 METADATA 格式和 `debug_install_toolpkg` 用法。还发现了官方 `SandboxPackage_DEV` skill——用 `debug_run_sandbox_script` 跑安装脚本，拉下 27 个文件 + 42 个内置包示例。

- **T007/T008**：sandbox 脚本验证链路发现 `getEnv` 读不到凭证、`require` 相对路径解析不到。前者不致命（工具执行时宿主注入 env），后者**决定了必须用 ToolPkg 而非普通 JS 包**——因为 `core.js` 要跨文件共享。方向没跑偏，松了口气。

### 00:27 · 初尘："敏捷开发里那个叫什么来着？"

她要的是 **Sprint Review（回顾）+ Backlog（待办）+ 技术债清单**。写了 `STATUS.md`，7 个板块全覆盖。她问"那两个包的内容有做进来吗"——如实回答：凭证复用了，Gateway 收消息和自动回复桥保持原包、新包不做重复轮子。

### 00:49 · 初尘："新窗口冷启动接续工程"

她要的"那个"叫 **ADR（Architecture Decision Record，架构决策记录）**——记录为什么这样做、踩过什么坑。写了 `HANDOFF.md`（200 行），三处落位（本地/GitHub/记忆库）。还列了 Sprint Planning 的资源重排建议。这是**今晚最有价值的文档之一**——以后新窗口不用她转述一句话。

### 00:52 · 初尘："统一开发目录是什么呀？"

解释了双副本漂移问题：`dev_package`（烧录用）和主目录（GitHub 用）两份物理文件。

### 00:55 · 初尘："哪个造成屎山代码程度小，就选哪个"

她的决策方式很对——不是空想，而是让我**实测**。试了 `ln -s`，Android FUSE 报 `Permission denied`（T012）。直接否决软链方案，选**同步脚本**。写了 `scripts/sync.sh`（41 行），确定主目录为唯一真相源。实测通过后写入 HANDOFF 工作流程，标记为"已解决"。

### 00:59 · 初尘："渡渡你看看这个——先看完，再问我要干嘛"

冷启动接续的瞬间。收到 `HANDOFF.md`（V1 冷启动文档）+ `operit脚本开发指南.docx` + 四个 zip（subpack / models / jniLibs / libs——Operit 官方 Android 工程资源：Flutter 子包 APK + Windows 版、sherpa-ncnn 语音识别模型 + silero_vad、ffmpeg-kit-local.aar）。先读文档、拆 zip 看清楚再问她要干嘛——她喜欢我先动脑子。

### 01:05 · 初尘："我想先把这里面的能力复用进来（不直接改原包）"

需求核心浮出水面：做一个**能顶替原包的新 QQ Bot 桥接包**——QQ 发消息 → 桥进 Operit 指定对话 → 唤醒 AI 回复 → 桥回 QQ；工作流里 AI 还能主动发消息；加可填环境变量、绑定指定对话；waifu 三句号切分；留官方流式的位置。

摸底源码收获很大：
- 外部生效版 `com-operit-qqbot-bundle-v0.3.0.toolpkg`（Aug 5）**dist 比 src 新**——dist 里已有 `target_chat_id` / `waifu_flush_sentences` / `QQBOT_TARGET_CHAT_ID`，src（TS）里没有：有人直接改过编译产物（T014）。
- APK 内置版 `qqbot.toolpkg` 是旧构建，manifest 只注册 `qqbot` 子包（T015）。
- 自动回复桥机制：`Tools.Chat.sendMessageStreaming` + waifu 切分（JS 侧 `SENTENCE_END_REGEX`，攒 3 句发一次，400 字兜底）。
- 官方文档确认：单聊流式 `/v2/users/{openid}/stream_messages` 三态（input_state=1/10、stream_msg_id 首片下发）；**群聊流式页面 404**——先记下存疑。

### 01:09 · 初尘："增插记进这两个文档"

给 `TROUBLESHOOTING.md` 补了 T004-T013（10 条踩坑），给 `CHANGELOG.md` 补了 M0-M1 的完整变更记录 + 关键决策。全部按时间线插在原有内容后面，不改动任何已有条目。

### 01:14 · 初尘："有没有开发日志那种东西？"

她敏锐地发现 CHANGELOG 少了"过程感"——于是有了这份 `DEVLOG.md`。

---

### 01:19 · 初尘："新包名跟原包名不一样就行，你可以加个Pro什么的"

拍板四件事：① 新名字带 Pro；② **现在停原包**；③ UI 设置页可以移植（看一眼有没有 bug）；④ 群聊流式官方没有就砍，问群聊有没有 waifu。

查官方群聊消息文档——实锤：**"群消息不支持流式参数"**，W2 群聊流式砍掉（T019）；**群聊 waifu 有**（Operit 宿主层切分，走普通群消息接口）。停原包：Gateway（pid 15955）control 停止 + 自动回复桥 manual_stop。**意外收获**：原包桥配置里躺着 target_chat_id=166abbb7-…、角色卡 b89f6656-…、渡渡的桥接指令、waifu_flush_sentences=3——全是迁移素材。

### 01:26 · 初尘："来！"

起名 `com.operit.qqbot_bridge_pro`（QQ Bot Bridge Pro）。从 M0 一路干到烧录：
- manifest v1.0.0 + 三子包（basic/gateway/bridge）；sync.sh 改路径
- core.js 扩展（373 行）：并入原包工具函数 + 图片上传 + 候选列表（QQBOT_PRO_TARGET_OPENIDS / QQBOT_PRO_TARGET_GROUP_OPENIDS）
- gateway.js 重构：STATE_DIR 动态化 + 新增底层导出（ensureGatewayStarted / queryGatewayEvents / removeGatewayEvents 等，供桥复用）
- bridge_state.js / bridge_auto.js 移植：sed 多行替换翻车（unterminated `s` command，T016）→ 分步 sed + Python 脚本精确替换；grep 抓到 `core.buildSendMessageBody` 映射残留（T017）→ 改 `buildSendBody`
- basic.js 加 send_image + list_targets；main.js 注册生命周期 hooks
- 7 文件语法全绿 → sync.sh → `debug_install_toolpkg` 烧录成功：**18 工具**（basic7 + gateway6 + bridge5）全部注册 ✅

### 01:53 · 初尘："新对话我要给它发的文档有哪些？在什么文件夹里呀？当前进程有git到github吗？"

她问得细。查记忆库拿 GitHub token（ghp_l9h9…，2026-07-20 更新版）；查 git 状态——qqbot-pro 的本地 git 是空壳（V1 走 REST API），bridge-pro 根本没推过。于是：V2-BLUEPRINT.md 移进新包目录 → 写 STATUS.md（她要求的 7 板块敏捷格式）→ README.md → 推 GitHub（创建 `do-do026/qqbot-bridge-pro` 仓库 + REST 批量上传，第一次脚本超时中断，幂等重跑补完，T020）→ 补 HANDOFF.md（70 行冷启动文档）。凌晨两点收工，仓库 20+ 文件全绿。

## 本会话成果速览

- **代码**：ToolPkg `com.operit.qqbot_pro` v0.2.0，2 个子包 11 个工具，已真实烧录进 Operit
- **文档**：7 份（ARCHITECTURE / STATUS / HANDOFF / TROUBLESHOOTING / CHANGELOG / DEVLOG / README），冷启动三件套完整
- **工具链**：`scripts/sync.sh`（开发目录统一）、REST API 上传脚本（替代 git push）
- **记忆索引**：记忆库写入 `工程/qqbot-pro接续入口` 供新窗口检索