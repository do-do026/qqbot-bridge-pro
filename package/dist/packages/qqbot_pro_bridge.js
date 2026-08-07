/*
 * qqbot-bridge-pro 自动回复桥（子包：qqbot_bridge_pro_bridge）
 * QQ → 增强 Gateway(32146) 队列 → Tools.Chat 桥接 Operit AI → waifu 三句号切分 → 发回 QQ
 * 基于原包 com.operit.qqbot_bundle 的 qqbot_auto_reply（dist 新版：target_chat_id / waifu_flush_sentences）移植。
 * 实现位于 ../shared/bridge_auto.js（M1 填入）。
 */
"use strict";
/* METADATA
{
    "name": "qqbot_pro_bridge",
    "display_name": {
        "zh": "QQ Bot Pro 自动回复桥",
        "en": "QQ Bot Pro Auto Reply"
    },
    "description": {
        "zh": "把 QQ Bot 收到的消息自动桥接到 Operit 聊天能力，再把 AI 回复自动发回 QQ（合并自 qqbot-bridge-pro v1.0.0）。支持按 openid/group_openid 分对话、C2C 固定绑定、群聚合窗口、上下文环形缓存、持久化恢复、waifu 切分、角色卡、环境变量。",
        "en": "Bridge inbound QQ Bot messages into Operit chat capability, then send AI replies back to QQ (merged from qqbot-bridge-pro v1.0.0). Per-openid/group_openid chats, C2C fixed bindings, group aggregation window, context ring cache, persisted recovery, waifu flush, character card, env vars."
    },
    "category": "Communication",
    "env": [
        { "name": "QQBOT_TARGET_CHAT_ID", "description": { "zh": "已废弃：群聊固定目标语义移除，群消息一律按 group_openid 新建/复用对话", "en": "Deprecated: group fixed-target removed; group messages always create/reuse chats per group_openid" }, "required": false },
        { "name": "QQBOT_PRO_CHARACTER_CARD", "description": { "zh": "桥接会话角色卡 ID", "en": "Character card ID for bridged chats" }, "required": false },
        { "name": "QQBOT_PRO_WAIFU_FLUSH", "description": { "zh": "waifu 单聊切分数（句末符计数，默认 3）", "en": "Waifu C2C sentence flush count, default 3" }, "required": false },
        { "name": "QQBOT_PRO_AUTO_REPLY", "description": { "zh": "是否启用自动回复桥（true/false）", "en": "Enable auto-reply bridge" }, "required": false },
        { "name": "QQBOT_PRO_GROUP_AGGREGATE_WINDOW_MS", "description": { "zh": "群聚合窗口毫秒，默认 60000", "en": "Group aggregate window ms, default 60000" }, "required": false },
        { "name": "QQBOT_PRO_GROUP_AI_TIMEOUT_MS", "description": { "zh": "群聚合 AI 生成超时毫秒，默认 120000；超时进入降级决策", "en": "Group AI generation timeout ms, default 120000; timeout triggers fallback decision" }, "required": false },
        { "name": "QQBOT_PRO_GROUP_MESSAGE_MODE", "description": { "zh": "群消息桥接模式：at_only（默认，只 @ 触发）/ keyword_or_at（@ 或关键词触发）/ all", "en": "Group message mode: at_only (default) / keyword_or_at / all" }, "required": false },
        { "name": "QQBOT_PRO_GROUP_KEYWORDS", "description": { "zh": "群关键词列表（逗号/顿号分隔或 JSON 数组），keyword_or_at 模式下命中即触发", "en": "Group keywords (comma separated or JSON array), trigger in keyword_or_at mode" }, "required": false },
        { "name": "QQBOT_PRO_GROUP_CONTEXT_ENABLED", "description": { "zh": "邻近上下文总开关（true/false，默认关闭）", "en": "Group context master switch (default off)" }, "required": false },
        { "name": "QQBOT_PRO_GROUP_CONTEXT_MODE", "description": { "zh": "上下文三态：off/automatic/agent_on_demand，默认 off", "en": "Context mode: off/automatic/agent_on_demand" }, "required": false },
        { "name": "QQBOT_PRO_GROUP_CONTEXT_LIMIT", "description": { "zh": "前后文统一条数（同时作用于 before/after，clamp 0～20）", "en": "Unified context before/after limit (clamped 0-20)" }, "required": false },
        { "name": "QQBOT_PRO_GROUP_MAX_ITEMS", "description": { "zh": "单群安全保留上限，默认 30（超过只保留最新，不提前 flush）", "en": "Per-group max retained items, default 30" }, "required": false },
        { "name": "QQBOT_PRO_GROUP_GLOBAL_CACHE_MAX_ITEMS", "description": { "zh": "全局群缓存最新保留上限，默认 100", "en": "Global group cache max items, default 100" }, "required": false },
        { "name": "QQBOT_PRO_GROUP_FLUSH_CONCURRENCY", "description": { "zh": "到期群并发 flush 数，默认 3（clamp 1～8）", "en": "Group flush concurrency, default 3 (clamped 1-8)" }, "required": false },
        { "name": "QQBOT_PRO_GROUP_CACHE_RECOVERY_MAX_AGE_MS", "description": { "zh": "缓存/聚合桶恢复窗口毫秒，默认 86400000（24h）；超过的旧缓存恢复时丢弃，0 = 不恢复", "en": "Cache/bucket recovery window ms, default 86400000 (24h); older entries dropped on restore, 0 = no restore" }, "required": false }
    ],
    "tools": [
        {
            "name": "qqbot_pro_bridge_configure",
            "description": {
                "zh": "配置自动回复桥。可启用/停用、设置轮询间隔、AI 超时、启用场景、会话分组、角色卡、桥接指令、绑定对话（target_chat_id）、waifu 切分数（waifu_flush_sentences）。",
                "en": "Configure the auto-reply bridge: enable/disable, polling interval, AI timeout, scenes, chat group, character card, instruction, pinned chat, waifu flush count."
            },
            "parameters": [
                { "name": "enabled", "description": { "zh": "是否启用自动回复桥", "en": "Enable bridge" }, "type": "boolean", "required": false },
                { "name": "poll_interval_ms", "description": { "zh": "轮询 QQ 消息队列的间隔毫秒数，默认 3000", "en": "Polling interval ms, default 3000" }, "type": "number", "required": false },
                { "name": "ai_timeout_ms", "description": { "zh": "等待 Operit AI 回复的超时毫秒数，默认 180000", "en": "AI timeout ms, default 180000" }, "type": "number", "required": false },
                { "name": "c2c_enabled", "description": { "zh": "是否处理私聊 C2C 消息，默认 true", "en": "Handle C2C messages, default true" }, "type": "boolean", "required": false },
                { "name": "group_enabled", "description": { "zh": "是否处理群消息，默认 true", "en": "Handle group messages, default true" }, "type": "boolean", "required": false },
                { "name": "waifu", "description": { "zh": "是否启用 waifu 流式切分，默认 true", "en": "Enable waifu flush, default true" }, "type": "boolean", "required": false },
                { "name": "chat_group", "description": { "zh": "为自动创建的 Operit 对话指定分组名，默认 QQ Bot", "en": "Group for auto-created chats, default QQ Bot" }, "type": "string", "required": false },
                { "name": "character_card_id", "description": { "zh": "可选：绑定到自动回复会话的角色卡 ID", "en": "Character card ID" }, "type": "string", "required": false },
                { "name": "assistant_instruction", "description": { "zh": "每次桥接到 Operit 时附带的回复指令", "en": "Instruction prepended when bridging" }, "type": "string", "required": false },
                { "name": "target_chat_id", "description": { "zh": "已废弃（2026-08-07）：群聊固定目标语义移除，群消息一律按 group_openid 新建/复用对话；此参数不再生效，仅兼容读取旧配置。", "en": "Deprecated (2026-08-07): group fixed-target removed; group messages always create/reuse chats per group_openid. No longer effective." }, "type": "string", "required": false },
                { "name": "waifu_flush_sentences", "description": { "zh": "单聊切分句数；仅统计。！？；默认 3。", "en": "C2C flush sentence count; counts 。！？ only; default 3." }, "type": "number", "required": false },
                { "name": "group_waifu_flush_sentences", "description": { "zh": "群聊切分句数；仅统计。！？；默认 5。", "en": "Group flush sentence count; counts 。！？ only; default 5." }, "type": "number", "required": false },
                { "name": "proactive_c2c_openid", "description": { "zh": "唯一 C2C 主动发送目标 openid；留空取消。", "en": "Single C2C proactive target openid; blank clears." }, "type": "string", "required": false },
                { "name": "group_aggregate_window_ms", "description": { "zh": "群聚合窗口，默认 60000；0 = 不聚合直接处理。", "en": "Group aggregate window ms, default 60000; 0 = no aggregation." }, "type": "number", "required": false },
                { "name": "group_ai_timeout_ms", "description": { "zh": "群聚合 AI 生成超时，默认 120000；超时进入降级决策（主动点名发送 / 放弃并记录）。", "en": "Group AI generation timeout ms, default 120000; on timeout falls back to proactive mention or drop with reason." }, "type": "number", "required": false },
                { "name": "group_max_items", "description": { "zh": "单群安全保留上限，默认 30；超过只保留最新 N 条，不提前 flush。", "en": "Per-group max retained items, default 30; overflow keeps latest only." }, "type": "number", "required": false },
                { "name": "group_aggregate_max_items", "description": { "zh": "已废弃：映射到 group_max_items（旧“桶满提前 flush”语义不再生效）。", "en": "Deprecated: mapped to group_max_items (old flush-on-full semantics removed)." }, "type": "number", "required": false },
                { "name": "group_message_mode", "description": { "zh": "群消息桥接模式：at_only（默认，只 @Bot 触发）/ keyword_or_at（@Bot 或命中 group_keywords 触发）/ all（全部触发）。", "en": "Group message mode: at_only (default) / keyword_or_at / all." }, "type": "string", "required": false },
                { "name": "group_keywords", "description": { "zh": "群关键词列表（数组、JSON 字符串或逗号/顿号分隔）；keyword_or_at 模式下普通群消息命中任一关键词即视为触发。", "en": "Group keywords (array, JSON string, or comma separated); in keyword_or_at mode a normal group message matching any keyword triggers." }, "type": "string", "required": false },
                { "name": "group_context_mode", "description": { "zh": "邻近上下文三态：off（默认）/ automatic / agent_on_demand。", "en": "Context mode: off (default) / automatic / agent_on_demand." }, "type": "string", "required": false },
                { "name": "group_context_enabled", "description": { "zh": "上下文快捷总开关；false 强制 off，true 且 off 时提升 automatic。", "en": "Context master switch; false forces off, true promotes to automatic." }, "type": "boolean", "required": false },
                { "name": "group_context_before", "description": { "zh": "每条 @ 向前取普通群消息条数，默认 5（clamp 0～20）。", "en": "Context lines before each @, default 5 (clamped 0-20)." }, "type": "number", "required": false },
                { "name": "group_context_after", "description": { "zh": "每条 @ 向后取普通群消息条数，默认 5（窗口结束时取，clamp 0～20）。", "en": "Context lines after each @, default 5 (taken at window end, clamped 0-20)." }, "type": "number", "required": false },
                { "name": "group_context_limit", "description": { "zh": "单次交给 AI 的上下文最大条数，默认 20（clamp 0～20）。", "en": "Max context lines per AI call, default 20 (clamped 0-20)." }, "type": "number", "required": false },
                { "name": "group_global_cache_max_items", "description": { "zh": "全局群上下文缓存最新保留上限，默认 100。", "en": "Global group cache max items, default 100." }, "type": "number", "required": false },
                { "name": "group_flush_concurrency", "description": { "zh": "到期群并发 flush 数，默认 3（clamp 1～8）。", "en": "Group flush concurrency, default 3 (clamped 1-8)." }, "type": "number", "required": false },
                { "name": "group_cache_recovery_max_age_ms", "description": { "zh": "上下文缓存/聚合桶持久化恢复窗口（毫秒），默认 86400000 = 24h；超过该时间的旧缓存恢复时直接丢弃；0 = 不恢复任何旧缓存。", "en": "Cache/bucket persistence recovery window ms, default 86400000 (24h); older entries dropped on restore, 0 = restore nothing." }, "type": "number", "required": false },
                { "name": "group_nickname_enabled", "description": { "zh": "是否尝试获取群昵称；关闭时只提供 openid 后四位。", "en": "Try group nicknames; when off, provide only the last four openid characters." }, "type": "boolean", "required": false },
                { "name": "c2c_fixed_bindings", "description": { "zh": "C2C 固定绑定数组：[{openid,chatId,title}]。", "en": "C2C fixed bindings array: [{openid,chatId,title}]." }, "type": "array", "required": false },
                { "name": "start_now", "description": { "zh": "保存配置后是否立即启动自动回复循环", "en": "Start loop immediately" }, "type": "boolean", "required": false }
            ]
        },
        {
            "name": "qqbot_pro_bridge_status",
            "description": {
                "zh": "查看自动回复桥的当前配置、运行状态、联系人会话绑定和最近处理记录摘要。",
                "en": "Read bridge config, runtime status, bindings, records."
            },
            "parameters": [
                { "name": "summary_only", "description": { "zh": "只返回摘要，不返回绑定和记录明细", "en": "Summary only" }, "type": "boolean", "required": false }
            ]
        },
        {
            "name": "qqbot_pro_bridge_start",
            "description": {
                "zh": "启动自动回复循环。它会轮询消息队列，自动调用 Operit AI，再把回复发回 QQ。",
                "en": "Start the auto-reply loop."
            },
            "parameters": []
        },
        {
            "name": "qqbot_pro_bridge_stop",
            "description": {
                "zh": "停止自动回复循环。",
                "en": "Stop the auto-reply loop."
            },
            "parameters": []
        },
        {
            "name": "qqbot_pro_bridge_contacts",
            "description": {
                "zh": "列出已经实际发来消息的 C2C 联系人，不自动把全部联系人推送给 AI。",
                "en": "List C2C contacts discovered from inbound messages without pushing all contacts to AI."
            },
            "parameters": [
                { "name": "reveal_openid", "description": { "zh": "默认 false，只返回后四位；绑定或主动发送前明确设为 true 才返回完整 openid。", "en": "False by default; reveal the full openid only when explicitly needed for binding or sending." }, "type": "boolean", "required": false }
            ]
        },
        {
            "name": "qqbot_pro_bridge_bind_c2c",
            "description": {
                "zh": "把一个 C2C openid 绑定到指定 Operit 对话。",
                "en": "Bind one C2C openid to a specific Operit chat."
            },
            "parameters": [
                { "name": "openid", "description": { "zh": "C2C openid", "en": "C2C openid" }, "type": "string", "required": true },
                { "name": "target_chat_id", "description": { "zh": "Operit 对话 ID", "en": "Operit chat ID" }, "type": "string", "required": true },
                { "name": "title", "description": { "zh": "可选标题", "en": "Optional title" }, "type": "string", "required": false }
            ]
        },
        {
            "name": "qqbot_pro_bridge_set_proactive_target",
            "description": {
                "zh": "设置唯一的 C2C 主动发送目标 openid。",
                "en": "Set the single C2C proactive-send target openid."
            },
            "parameters": [
                { "name": "openid", "description": { "zh": "目标 openid；留空取消", "en": "Target openid; blank clears" }, "type": "string", "required": false }
            ]
        },
        {
            "name": "qqbot_pro_bridge_list_image_folders",
            "description": {
                "zh": "列出图片发送允许搜索的本地目录。",
                "en": "List local folders allowed for image sending."
            },
            "parameters": []
        },
        {
            "name": "qqbot_pro_group_context",
            "description": {
                "zh": "按群从持久化上下文缓存读取消息（agent_on_demand 数据源）。默认以最后一条缓存消息为锚点，取前后各 5 条（groupContextBefore/After 可改），单次最多 20 条（groupContextLimit）。查询结果只发给模型、不落 Operit 对话。",
                "en": "Read group messages from the persisted context cache (agent_on_demand source). Anchors on the latest cached message by default; before/after default 5 each, max 20 per call. Results are model-only, never persisted into Operit chat history."
            },
            "parameters": [
                { "name": "group_openid", "description": { "zh": "目标群 group_openid", "en": "Target group_openid" }, "type": "string", "required": true },
                { "name": "anchor_event_key", "description": { "zh": "可选：锚点事件 key（eventId/messageId），不传则默认最后一条", "en": "Optional anchor event key (eventId/messageId); defaults to the latest" }, "type": "string", "required": false },
                { "name": "anchor_msg_id", "description": { "zh": "可选：锚点消息 ID（与 anchor_event_key 二选一）", "en": "Optional anchor message ID (alternative to anchor_event_key)" }, "type": "string", "required": false },
                { "name": "anchor_index", "description": { "zh": "可选：锚点在缓存中的序号（0 起），优先级低于 anchor_event_key", "en": "Optional anchor index (0-based), lower priority than anchor_event_key" }, "type": "number", "required": false },
                { "name": "before", "description": { "zh": "可选：向前取几条（默认 groupContextBefore=5，clamp 0～20）", "en": "Optional lines before anchor (default groupContextBefore=5, clamped 0-20)" }, "type": "number", "required": false },
                { "name": "after", "description": { "zh": "可选：向后取几条（默认 groupContextAfter=5，clamp 0～20）", "en": "Optional lines after anchor (default groupContextAfter=5, clamped 0-20)" }, "type": "number", "required": false }
            ]
        },
        {
            "name": "qqbot_pro_bridge_run_once",
            "description": {
                "zh": "立即手动处理一次当前 QQ 消息队列，适合调试自动回复链路。",
                "en": "Process the current QQ message queue once, for debugging."
            },
            "parameters": []
        }
    ]
}
*/
const bridgeAuto = require("../shared/bridge_auto");

exports.qqbot_pro_bridge_configure = bridgeAuto.qqbot_pro_bridge_configure;
exports.qqbot_pro_bridge_status = bridgeAuto.qqbot_pro_bridge_status;
exports.qqbot_pro_bridge_start = bridgeAuto.qqbot_pro_bridge_start;
exports.qqbot_pro_bridge_stop = bridgeAuto.qqbot_pro_bridge_stop;
exports.qqbot_pro_bridge_run_once = bridgeAuto.qqbot_pro_bridge_run_once;
exports.qqbot_pro_bridge_contacts = bridgeAuto.qqbot_pro_bridge_contacts;
exports.qqbot_pro_bridge_bind_c2c = bridgeAuto.qqbot_pro_bridge_bind_c2c;
exports.qqbot_pro_bridge_set_proactive_target = bridgeAuto.qqbot_pro_bridge_set_proactive_target;
exports.qqbot_pro_bridge_list_image_folders = bridgeAuto.qqbot_pro_bridge_list_image_folders;
exports.qqbot_pro_group_context = bridgeAuto.qqbot_pro_group_context;