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
                { "name": "target_chat_id", "description": { "zh": "可选：固定桥接到指定 Operit 对话 ID。留空则自动为每个 QQ 会话创建专属对话；也可用环境变量 QQBOT_TARGET_CHAT_ID 设置。", "en": "Pin to a specific Operit chat ID; fallback to env QQBOT_TARGET_CHAT_ID" }, "type": "string", "required": false },
                { "name": "waifu_flush_sentences", "description": { "zh": "流式回复的切分粒度：攒够 N 个句子结束符（。！？…换行）才发一条消息，默认 3。避免逐句刷屏，同时防止大段被截断。", "en": "Flush after N sentence-ending chars, default 3" }, "type": "number", "required": false },
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