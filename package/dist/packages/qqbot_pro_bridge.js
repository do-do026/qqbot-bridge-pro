/*
 * qqbot-bridge-pro 自动回复桥（子包：qqbot_bridge_pro_bridge）
 * QQ → 增强 Gateway(32146) 队列 → Tools.Chat 桥接 Operit AI → waifu 三句号切分 → 发回 QQ
 * 基于原包 com.operit.qqbot_bundle 的 qqbot_auto_reply（dist 新版：target_chat_id / waifu_flush_sentences）移植。
 * 实现位于 ../shared/bridge_auto.js（M1 填入）。
 */
"use strict";
/* METADATA
{
    "name": "qqbot_bridge_pro_bridge",
    "display_name": {
        "zh": "Bridge Pro 自动回复桥",
        "en": "Bridge Pro Auto Reply"
    },
    "description": {
        "zh": "把 QQ Bot 收到的消息自动桥接到 Operit 聊天能力，再把 AI 回复自动发回 QQ。支持绑定指定对话（target_chat_id / QQBOT_TARGET_CHAT_ID）、waifu 三句号切分（waifu_flush_sentences，默认3）、角色卡、环境变量。",
        "en": "Bridge inbound QQ Bot messages into Operit chat capability, then send AI replies back to QQ. Supports pinned chat (target_chat_id / QQBOT_TARGET_CHAT_ID), waifu sentence flush (default 3), character card, env vars."
    },
    "category": "Communication",
    "env": [
        { "name": "QQBOT_TARGET_CHAT_ID", "description": { "zh": "绑定指定 Operit 对话 ID（桥接固定会话）", "en": "Pin auto-reply to a specific Operit chat ID" }, "required": false },
        { "name": "QQBOT_PRO_CHARACTER_CARD", "description": { "zh": "桥接会话角色卡 ID", "en": "Character card ID for bridged chats" }, "required": false },
        { "name": "QQBOT_PRO_WAIFU_FLUSH", "description": { "zh": "waifu 切分数（句子结束符个数，默认 3）", "en": "Waifu sentence flush count, default 3" }, "required": false },
        { "name": "QQBOT_PRO_AUTO_REPLY", "description": { "zh": "是否启用自动回复桥（true/false）", "en": "Enable auto-reply bridge" }, "required": false }
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
                { "name": "target_chat_id", "description": { "zh": "仅用于群聊：固定桥接到指定 Operit 对话 ID。C2C 按 openid 分离，固定私聊使用 c2c_fixed_bindings。", "en": "Pin to a specific Operit chat ID; fallback to env QQBOT_TARGET_CHAT_ID" }, "type": "string", "required": false },
                { "name": "waifu_flush_sentences", "description": { "zh": "单聊切分句数；仅统计。！？；默认 3。", "en": "C2C flush sentence count; counts 。！？ only; default 3." }, "type": "number", "required": false },
                { "name": "group_waifu_flush_sentences", "description": { "zh": "群聊切分句数；仅统计。！？；默认 5。", "en": "Group flush sentence count; counts 。！？ only; default 5." }, "type": "number", "required": false },
                { "name": "proactive_c2c_openid", "description": { "zh": "唯一 C2C 主动发送目标 openid；留空取消。", "en": "Single C2C proactive target openid; blank clears." }, "type": "string", "required": false },
                { "name": "group_aggregate_window_ms", "description": { "zh": "群消息聚合窗口，默认 25000。", "en": "Group aggregation window, default 25000." }, "type": "number", "required": false },
                { "name": "group_aggregate_max_items", "description": { "zh": "群聚合最大条数，默认 10。", "en": "Maximum group aggregation items, default 10." }, "type": "number", "required": false },
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