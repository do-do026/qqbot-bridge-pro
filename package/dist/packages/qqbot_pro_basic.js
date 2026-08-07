/*
 * qqbot-pro 基础增强子包
 * 覆盖 T01 撤回 / T02 Markdown / T03 群信息 / T04 机器人群状态 / T06 引用 / T07 输入态 / T08 机器人资料
 * 纯发送/查询增强，不依赖 Gateway。
 */
"use strict";
/* METADATA
{
    "name": "qqbot_pro_basic",
    "display_name": { "zh": "QQ Bot Pro 基础增强", "en": "QQ Bot Pro Basic" },
    "description": {
        "zh": "在 Operit 原 QQ Bot 工具包基础上补齐官方 v2 API：撤回消息、Markdown/引用/输入态发送、群信息/机器人群状态/机器人资料查询。独立于原包，不修改原包。",
        "en": "Extends Operit's QQ Bot bundle with official v2 APIs: recall, markdown/reference/input-notify sending, group info / bot state / bot profile queries. Independent of the original bundle."
    },
    "category": "Communication",
    "env": [
        { "name": "QQBOT_APP_ID", "description": { "zh": "QQ Bot AppID（复用原包环境变量）", "en": "QQ Bot AppID" }, "required": false },
        { "name": "QQBOT_APP_SECRET", "description": { "zh": "QQ Bot AppSecret（复用原包环境变量）", "en": "QQ Bot AppSecret" }, "required": false },
        { "name": "QQBOT_PRO_SANDBOX", "description": { "zh": "是否使用沙箱 OpenAPI（true/false）", "en": "Use sandbox OpenAPI" }, "required": false }
    ],
    "tools": [
        {
            "name": "qqbot_pro_recall",
            "description": {
                "zh": "撤回机器人自己发送的消息（单聊或群聊）。发送超过 2 分钟不可撤回。用撤回群消息时传 group_openid，撤回单聊时传 openid。",
                "en": "Recall a message sent by the bot (C2C or group). Messages older than 2 minutes cannot be recalled."
            },
            "parameters": [
                { "name": "openid", "description": { "zh": "单聊目标用户 openid（撤回单聊必填）", "en": "Target user openid" }, "type": "string", "required": false },
                { "name": "group_openid", "description": { "zh": "目标群 openid（撤回群消息必填）", "en": "Target group openid" }, "type": "string", "required": false },
                { "name": "message_id", "description": { "zh": "要撤回的消息 ID", "en": "Message ID to recall" }, "type": "string", "required": true },
                { "name": "timeout_ms", "description": { "zh": "请求超时毫秒数（默认 20000）", "en": "Timeout in ms" }, "type": "number", "required": false }
            ]
        },
        {
            "name": "qqbot_pro_send",
            "description": {
                "zh": "发送单聊或群聊消息，支持 Markdown、引用回复、输入中状态。传 openid 发单聊，传 group_openid 发群聊。msg_type 可选：0=文本, 2=Markdown, 6=输入中, 7=富媒体。传 markdown 会自动设为 msg_type=2。",
                "en": "Send a C2C or group message with markdown, reference reply, or input-notify support."
            },
            "parameters": [
                { "name": "openid", "description": { "zh": "单聊目标用户 openid", "en": "Target user openid" }, "type": "string", "required": false },
                { "name": "group_openid", "description": { "zh": "目标群 openid", "en": "Target group openid" }, "type": "string", "required": false },
                { "name": "content", "description": { "zh": "文本内容（msg_type=0 时必填）", "en": "Text content" }, "type": "string", "required": false },
                { "name": "markdown", "description": { "zh": "Markdown 内容（传此字段自动 msg_type=2，与 content 互斥）", "en": "Markdown content" }, "type": "string", "required": false },
                { "name": "msg_type", "description": { "zh": "消息类型：0/2/6/7", "en": "Message type" }, "type": "number", "required": false },
                { "name": "msg_id", "description": { "zh": "被动回复的消息 ID", "en": "Source message ID" }, "type": "string", "required": false },
                { "name": "event_id", "description": { "zh": "被动回复的事件 ID", "en": "Source event ID" }, "type": "string", "required": false },
                { "name": "msg_seq", "description": { "zh": "回复序号，默认 1", "en": "Reply sequence" }, "type": "number", "required": false },
                { "name": "message_reference", "description": { "zh": "引用回复对象的 message_id，如 {\"message_id\":\"xxx\"}", "en": "Reference reply message_id" }, "type": "object", "required": false },
                { "name": "input_notify", "description": { "zh": "输入中状态对象，如 {\"input_type\":1,\"input_second\":60}（msg_type=6）", "en": "Input notify object" }, "type": "object", "required": false },
                { "name": "timeout_ms", "description": { "zh": "请求超时毫秒数（默认 20000）", "en": "Timeout in ms" }, "type": "number", "required": false }
            ]
        },
        {
            "name": "qqbot_pro_group_info",
            "description": {
                "zh": "查询群详细信息（群名、简介、成员数等）。传群 openid。",
                "en": "Query group info by group openid."
            },
            "parameters": [
                { "name": "group_openid", "description": { "zh": "目标群 openid", "en": "Target group openid" }, "type": "string", "required": true },
                { "name": "timeout_ms", "description": { "zh": "请求超时毫秒数（默认 20000）", "en": "Timeout in ms" }, "type": "number", "required": false }
            ]
        },
        {
            "name": "qqbot_pro_bot_state",
            "description": {
                "zh": "查询机器人在群内的状态（在线状态、推送开关等）。传群 openid。",
                "en": "Query bot state in a group."
            },
            "parameters": [
                { "name": "group_openid", "description": { "zh": "目标群 openid", "en": "Target group openid" }, "type": "string", "required": true },
                { "name": "timeout_ms", "description": { "zh": "请求超时毫秒数（默认 20000）", "en": "Timeout in ms" }, "type": "number", "required": false }
            ]
        },
        {
            "name": "qqbot_pro_me",
            "description": {
                "zh": "查询机器人自身资料（昵称、头像、ID）。",
                "en": "Query the bot's own profile."
            },
            "parameters": [
                { "name": "timeout_ms", "description": { "zh": "请求超时毫秒数（默认 20000）", "en": "Timeout in ms" }, "type": "number", "required": false }
            ]
        }
    ]
}
*/

const core = require("../shared/core.js");

function buildResult(extra) {
    return { success: true, packageVersion: core.PACKAGE_VERSION, ...extra };
}

function buildError(error) {
    return { success: false, packageVersion: core.PACKAGE_VERSION, error: core.safeErrorMessage(error) };
}

async function qqbot_pro_recall(params) {
    try {
        const openid = core.asText(params.openid).trim();
        const groupOpenid = core.asText(params.group_openid).trim();
        const messageId = core.asText(params.message_id).trim();
        if (!messageId) throw new Error("Missing param: message_id");
        if (!openid && !groupOpenid) throw new Error("Need openid (C2C) or group_openid (group) to recall");
        const snapshot = core.requireConfiguredSnapshot();
        const timeoutMs = core.resolveTimeoutMs(params.timeout_ms);
        let path;
        let scene;
        if (groupOpenid) {
            path = `/v2/groups/${encodeURIComponent(groupOpenid)}/messages/${encodeURIComponent(messageId)}`;
            scene = "group";
        } else {
            path = `/v2/users/${encodeURIComponent(openid)}/messages/${encodeURIComponent(messageId)}`;
            scene = "c2c";
        }
        const response = await core.openApiRequest(snapshot, path, "DELETE", null, timeoutMs);
        if (!response.success) {
            throw new Error(core.firstNonBlank(core.asText(response.json.message), `HTTP ${response.statusCode}`));
        }
        return buildResult({ scene, openid, groupOpenid, messageId, httpStatus: response.statusCode, response: response.json });
    } catch (error) {
        return buildError(error);
    }
}

async function qqbot_pro_send(params) {
    try {
        const openid = core.asText(params.openid).trim();
        const groupOpenid = core.asText(params.group_openid).trim();
        if (!openid && !groupOpenid) throw new Error("Need openid (C2C) or group_openid (group)");
        const snapshot = core.requireConfiguredSnapshot();
        const timeoutMs = core.resolveTimeoutMs(params.timeout_ms);
        const body = core.buildSendBody(params);
        if (!body.content && !body.markdown && !body.input_notify && body.msg_type !== 7) {
            throw new Error("Nothing to send: provide content, markdown, input_notify, or media");
        }
        let path;
        let scene;
        if (groupOpenid) {
            path = `/v2/groups/${encodeURIComponent(groupOpenid)}/messages`;
            scene = "group";
        } else {
            path = `/v2/users/${encodeURIComponent(openid)}/messages`;
            scene = "c2c";
        }
        const response = await core.openApiRequest(snapshot, path, "POST", body, timeoutMs);
        if (!response.success) {
            throw new Error(core.firstNonBlank(core.asText(response.json.message), `HTTP ${response.statusCode}`));
        }
        return buildResult({ scene, openid, groupOpenid, requestBody: body, httpStatus: response.statusCode, response: response.json });
    } catch (error) {
        return buildError(error);
    }
}

async function qqbot_pro_group_info(params) {
    try {
        const groupOpenid = core.asText(params.group_openid).trim();
        if (!groupOpenid) throw new Error("Missing param: group_openid");
        const snapshot = core.requireConfiguredSnapshot();
        const timeoutMs = core.resolveTimeoutMs(params.timeout_ms);
        const path = `/v2/groups/${encodeURIComponent(groupOpenid)}/info`;
        const response = await core.openApiRequest(snapshot, path, "GET", null, timeoutMs);
        if (!response.success) {
            throw new Error(core.firstNonBlank(core.asText(response.json.message), `HTTP ${response.statusCode}`));
        }
        return buildResult({ groupOpenid, httpStatus: response.statusCode, info: response.json });
    } catch (error) {
        return buildError(error);
    }
}

async function qqbot_pro_bot_state(params) {
    try {
        const groupOpenid = core.asText(params.group_openid).trim();
        if (!groupOpenid) throw new Error("Missing param: group_openid");
        const snapshot = core.requireConfiguredSnapshot();
        const timeoutMs = core.resolveTimeoutMs(params.timeout_ms);
        const path = `/v2/groups/${encodeURIComponent(groupOpenid)}/bot_state`;
        const response = await core.openApiRequest(snapshot, path, "GET", null, timeoutMs);
        if (!response.success) {
            throw new Error(core.firstNonBlank(core.asText(response.json.message), `HTTP ${response.statusCode}`));
        }
        return buildResult({ groupOpenid, httpStatus: response.statusCode, botState: response.json });
    } catch (error) {
        return buildError(error);
    }
}

async function qqbot_pro_me(params) {
    try {
        const snapshot = core.requireConfiguredSnapshot();
        const timeoutMs = core.resolveTimeoutMs(params.timeout_ms);
        const response = await core.openApiRequest(snapshot, "/users/@me", "GET", null, timeoutMs);
        if (!response.success) {
            throw new Error(core.firstNonBlank(core.asText(response.json.message), `HTTP ${response.statusCode}`));
        }
        return buildResult({ httpStatus: response.statusCode, profile: response.json });
    } catch (error) {
        return buildError(error);
    }
}

module.exports = {
    qqbot_pro_recall,
    qqbot_pro_send,
    qqbot_pro_group_info,
    qqbot_pro_bot_state,
    qqbot_pro_me
};