/*
 * qqbot-bridge-pro 共享核心
 * 基于 qqbot-pro shared/core.js 扩展：
 *   + 原包 com.operit.qqbot_bundle 的 qqbot_common 工具函数（parseOptionalBoolean/parseMessageType/shellQuote 等）
 *   + 原包 qqbot_openapi 的 uploadMediaFile / buildSendMediaBody（图片发送）
 *   + AI 主动发送候选列表 readTargetCandidates（env: QQBOT_PRO_TARGET_OPENIDS / QQBOT_PRO_TARGET_GROUP_OPENIDS）
 * 不修改任何原包文件。凭证复用 QQBOT_APP_ID / QQBOT_APP_SECRET。
 */
"use strict";
const PACKAGE_VERSION = "1.0.0";
const TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";
const API_BASE_URL = "https://api.sgroup.qq.com";
const SANDBOX_API_BASE_URL = "https://sandbox.api.sgroup.qq.com";
const DEFAULT_TIMEOUT_MS = 20000;

function asText(value) {
    return value == null ? "" : String(value);
}
function hasOwn(value, key) {
    return !!value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key);
}
function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
function firstNonBlank() {
    for (let i = 0; i < arguments.length; i++) {
        const v = arguments[i];
        if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
}
function safeErrorMessage(error) {
    try {
        if (typeof error === "string") return error;
        if (error && typeof error.message === "string" && error.message.trim()) return error.message.trim();
        return error == null ? "" : String(error);
    } catch (_) {
        return "Unknown error";
    }
}
function parsePositiveInt(value, fieldName, fallback) {
    const raw = asText(value).trim();
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${fieldName}: expected positive integer`);
    return parsed;
}
function parseOptionalBoolean(value, fieldName) {
    if (value === undefined) return undefined;
    if (typeof value === "boolean") return value;
    const raw = asText(value).trim().toLowerCase();
    if (!raw) return undefined;
    if (raw === "true" || raw === "1" || raw === "yes") return true;
    if (raw === "false" || raw === "0" || raw === "no") return false;
    throw new Error(`Invalid ${fieldName}: expected boolean`);
}
function toBoolean(value, fallbackValue) {
    try {
        const parsed = parseOptionalBoolean(value, "boolean");
        return parsed === undefined ? !!fallbackValue : parsed;
    } catch (_) {
        return !!fallbackValue;
    }
}
function parseMessageType(value) {
    const raw = asText(value).trim();
    if (!raw) return 0;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) throw new Error("Invalid msg_type: expected non-negative integer");
    return parsed;
}
function parseMsgSeq(value) {
    const raw = asText(value).trim();
    if (!raw) return 1;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("Invalid msg_seq: expected positive integer");
    return parsed;
}
function parseJsonObject(content) {
    const trimmed = asText(content).trim();
    if (!trimmed) return {};
    const parsed = JSON.parse(trimmed);
    if (!isObject(parsed)) throw new Error("Expected JSON object");
    return parsed;
}
function parseJsonArray(content) {
    const trimmed = asText(content).trim();
    if (!trimmed) return [];
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error("Expected JSON array");
    return parsed.filter(isObject);
}
function toHttpTimeoutSeconds(timeoutMs) {
    return Math.max(1, Math.ceil(timeoutMs / 1000));
}
function maskSecret(secret) {
    const value = asText(secret).trim();
    if (!value) return "";
    if (value.length <= 6) return `${value.slice(0, 1)}***${value.slice(-1)}`;
    return `${value.slice(0, 3)}***${value.slice(-3)}`;
}
function shellQuote(value) {
    return `'${asText(value).replace(/'/g, `'\"'\"'`)}'`;
}
function createControlToken() {
    return `qqbot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}
function readEnv(key) {
    if (typeof getEnv !== "function") return "";
    const value = getEnv(key);
    return value == null ? "" : asText(value).trim();
}
function getSandbox() {
    const raw = readEnv("QQBOT_PRO_SANDBOX");
    if (raw) return raw === "true" || raw === "1" || raw === "yes";
    return false;
}
function requireConfiguredSnapshot() {
    const appId = readEnv("QQBOT_APP_ID");
    const appSecret = readEnv("QQBOT_APP_SECRET");
    if (!appId) throw new Error("Missing env: QQBOT_APP_ID");
    if (!appSecret) throw new Error("Missing env: QQBOT_APP_SECRET");
    return { appId, appSecret, useSandbox: getSandbox() };
}
async function requestJson(url, method, headers, body, timeoutMs) {
    const response = await Tools.Net.http({
        url,
        method,
        headers,
        body: body || undefined,
        connect_timeout: toHttpTimeoutSeconds(timeoutMs),
        read_timeout: toHttpTimeoutSeconds(timeoutMs),
        validateStatus: false
    });
    const statusCode = Number(response && response.statusCode == null ? 0 : response.statusCode);
    const content = asText(response && response.content);
    let json = {};
    try {
        const trimmed = content.trim();
        if (trimmed) {
            const parsed = JSON.parse(trimmed);
            if (isObject(parsed)) json = parsed;
        }
    } catch (_) {}
    return {
        success: statusCode >= 200 && statusCode < 300,
        statusCode,
        contentType: asText(response && response.contentType),
        body: content,
        json
    };
}
async function fetchAccessToken(snapshot, timeoutMs) {
    const result = await requestJson(
        TOKEN_URL,
        "POST",
        { Accept: "application/json", "Content-Type": "application/json; charset=utf-8" },
        { appId: snapshot.appId, clientSecret: snapshot.appSecret },
        timeoutMs
    );
    const accessToken = firstNonBlank(asText(result.json.access_token), asText(result.json.accessToken));
    const message = firstNonBlank(asText(result.json.message), result.success ? "" : `HTTP ${result.statusCode}`);
    if (!result.success || !accessToken) {
        throw new Error(firstNonBlank(message, "Failed to retrieve QQ Bot access token"));
    }
    return {
        accessToken,
        expiresIn: parsePositiveInt(
            firstNonBlank(asText(result.json.expires_in), asText(result.json.expiresIn)),
            "expires_in",
            0
        ),
        tokenType: "QQBot"
    };
}
async function openApiRequest(snapshot, path, method, body, timeoutMs) {
    const token = await fetchAccessToken(snapshot, timeoutMs);
    const baseUrl = snapshot.useSandbox ? SANDBOX_API_BASE_URL : API_BASE_URL;
    return await requestJson(
        `${baseUrl}${path}`,
        method,
        {
            Accept: "application/json",
            Authorization: `${token.tokenType} ${token.accessToken}`,
            "X-Union-Appid": snapshot.appId,
            ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {})
        },
        body,
        timeoutMs
    );
}
async function fetchGroupMemberProfile(snapshot, groupOpenId, memberOpenId, timeoutMs) {
    const gid = encodeURIComponent(asText(groupOpenId).trim());
    const mid = encodeURIComponent(asText(memberOpenId).trim());
    if (!gid || !mid) {
        throw new Error("Missing group_openid or member_openid for group member profile");
    }
    const result = await openApiRequest(snapshot, `/v2/groups/${gid}/members/${mid}`, "GET", null, timeoutMs);
    if (!result.success) {
        throw new Error(firstNonBlank(asText(result.json.message), `HTTP ${result.statusCode}`));
    }
    return result.json;
}
function resolveTimeoutMs(value) {
    return parsePositiveInt(value, "timeout_ms", DEFAULT_TIMEOUT_MS);
}
function buildSendBody(params) {
    const body = {
        msg_type: params.msg_type == null ? 0 : Number(params.msg_type),
        msg_seq: parseMsgSeq(params.msg_seq)
    };
    const content = asText(params.content).trim();
    if (content) body.content = content;
    const msgId = asText(params.msg_id).trim();
    if (msgId) body.msg_id = msgId;
    const eventId = asText(params.event_id).trim();
    if (eventId) body.event_id = eventId;
    if (params.message_reference && params.message_reference.message_id) {
        body.message_reference = { message_id: asText(params.message_reference.message_id).trim() };
    }
    if (params.markdown && asText(params.markdown).trim()) {
        body.markdown = { content: asText(params.markdown).trim() };
        if (params.msg_type == null || params.msg_type !== 2) {
            if (params.msg_type == null) body.msg_type = 2;
            delete body.content;
        }
    }
    if (params.input_notify !== undefined && params.input_notify !== null) {
        body.input_notify = params.input_notify;
        if (params.msg_type == null) body.msg_type = 6;
    }
    // 内嵌键盘（群聊 keyboard 支持）：{ "content": { "rows": [...] } } 或 { "id": "模板ID" }
    if (params.keyboard && isObject(params.keyboard)) {
        body.keyboard = params.keyboard;
    }
    // 富媒体（图片等，msg_type=7）
    if (params.file_info && asText(params.file_info).trim()) {
        body.media = { file_info: asText(params.file_info).trim() };
        if (params.msg_type == null || params.msg_type !== 7) {
            if (params.msg_type == null) body.msg_type = 7;
            delete body.content;
        }
    }
    return body;
}
function buildSendMediaBody(params) {
    const fileInfo = asText(params.file_info).trim();
    if (!fileInfo) throw new Error("Missing param: file_info");
    const body = {
        msg_type: 7,
        media: { file_info: fileInfo },
        msg_seq: parseMsgSeq(params.msg_seq)
    };
    const msgId = asText(params.msg_id).trim();
    if (msgId) body.msg_id = msgId;
    const eventId = asText(params.event_id).trim();
    if (eventId) body.event_id = eventId;
    return body;
}
async function uploadMediaFile(snapshot, scene, targetId, filePath, fileName, fileType, timeoutMs) {
    const token = await fetchAccessToken(snapshot, timeoutMs);
    const baseUrl = snapshot.useSandbox ? SANDBOX_API_BASE_URL : API_BASE_URL;
    const path = scene === "group"
        ? `/v2/groups/${encodeURIComponent(targetId)}/files`
        : `/v2/users/${encodeURIComponent(targetId)}/files`;
    const url = `${baseUrl}${path}`;
    const info = await Tools.Files.info(filePath, "android");
    const fileSize = Number(info && info.size ? info.size : 0);
    if (!fileSize) throw new Error(`File not found or empty: ${filePath}`);
    const safeName = asText(fileName || String(filePath).split("/").pop() || "image.jpg");
    const command = [
        `curl -s -X POST '${url}'`,
        `-H 'Authorization: ${token.tokenType} ${token.accessToken}'`,
        `-H 'X-Union-Appid: ${shellQuote(snapshot.appId)}'`,
        `-F 'file_type=${Number(fileType) || 1}'`,
        `-F 'file_size=${fileSize}'`,
        `-F 'file_name=${shellQuote(safeName)}'`,
        `-F 'file=@${shellQuote(filePath)}'`,
        "--connect-timeout 20 --max-time 90"
    ].join(" ");
    const result = await Tools.System.terminal.hiddenExec(command, {
        executorKey: "qqbot_bridge_upload",
        timeoutMs: Math.max(timeoutMs, 30000)
    });
    let text = asText(result && result.output).trim();
    let json = parseJsonObject(text);
    if (!json.file_info && !json.fileInfo) {
        const idx = text.lastIndexOf("{");
        if (idx >= 0) json = parseJsonObject(text.slice(idx));
    }
    const fileInfo = firstNonBlank(asText(json.file_info), asText(json.fileInfo));
    if (!fileInfo) {
        throw new Error(firstNonBlank(asText(json.message), text.slice(0, 200) || "Media upload failed"));
    }
    return { fileInfo, response: json };
}
/**
 * AI 主动发送候选列表：从环境变量读取。
 * QQBOT_PRO_TARGET_OPENIDS      逗号/换行/分号分隔的个人 openid 列表
 * QQBOT_PRO_TARGET_GROUP_OPENIDS 逗号/换行/分号分隔的群 group_openid 列表
 * 返回 { c2c: [...], group: [...] }，全部去重、忽略空项。
 */
function readTargetCandidates() {
    const split = (raw) => {
        const seen = new Set();
        const result = [];
        asText(raw).split(/[,\n;]/).forEach((item) => {
            const t = item.trim();
            if (t && !seen.has(t)) {
                seen.add(t);
                result.push(t);
            }
        });
        return result;
    };
    return {
        c2c: split(readEnv("QQBOT_PRO_TARGET_OPENIDS")),
        group: split(readEnv("QQBOT_PRO_TARGET_GROUP_OPENIDS"))
    };
}
/**
 * 解析发送目标：优先显式传入的 openid/group_openid；否则从候选列表取（target_index 指定，默认 0）。
 * scene: "c2c" | "group"
 */
function resolveSendTarget(scene, params) {
    const candidates = readTargetCandidates();
    if (scene === "group") {
        const explicit = asText(params.group_openid).trim();
        if (explicit) return { targetId: explicit, fromCandidate: false, candidateCount: candidates.group.length };
        if (candidates.group.length === 0) {
            throw new Error("No group_openid provided and QQBOT_PRO_TARGET_GROUP_OPENIDS is empty");
        }
        const idx = parsePositiveInt(params.target_index == null ? 0 : params.target_index, "target_index", 0);
        if (idx >= candidates.group.length) {
            throw new Error(`target_index ${idx} out of range (candidate groups: ${candidates.group.length})`);
        }
        return { targetId: candidates.group[idx], fromCandidate: true, candidateCount: candidates.group.length };
    }
    const explicit = asText(params.openid).trim();
    if (explicit) return { targetId: explicit, fromCandidate: false, candidateCount: candidates.c2c.length };
    if (candidates.c2c.length === 0) {
        throw new Error("No openid provided and QQBOT_PRO_TARGET_OPENIDS is empty");
    }
    const idx = parsePositiveInt(params.target_index == null ? 0 : params.target_index, "target_index", 0);
    if (idx >= candidates.c2c.length) {
        throw new Error(`target_index ${idx} out of range (candidate users: ${candidates.c2c.length})`);
    }
    return { targetId: candidates.c2c[idx], fromCandidate: true, candidateCount: candidates.c2c.length };
}

module.exports = {
    PACKAGE_VERSION,
    TOKEN_URL,
    API_BASE_URL,
    SANDBOX_API_BASE_URL,
    DEFAULT_TIMEOUT_MS,
    asText,
    hasOwn,
    isObject,
    firstNonBlank,
    safeErrorMessage,
    parsePositiveInt,
    parseOptionalBoolean,
    toBoolean,
    parseMessageType,
    parseMsgSeq,
    parseJsonObject,
    parseJsonArray,
    toHttpTimeoutSeconds,
    maskSecret,
    shellQuote,
    createControlToken,
    readEnv,
    getSandbox,
    requireConfiguredSnapshot,
    fetchAccessToken,
    openApiRequest,
    fetchGroupMemberProfile,
    requestJson,
    resolveTimeoutMs,
    buildSendBody,
    buildSendMediaBody,
    uploadMediaFile,
    readTargetCandidates,
    resolveSendTarget
};