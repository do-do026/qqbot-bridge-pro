const core = require("./core.js");
const state = require("./bridge_state.js");
const bridgeConfig = require("./bridge_config.js");
const gateway = require("../packages/qqbot_pro_gateway.js");
const waifuChunker = require("./waifu_chunker.js"); // G4：统一 Waifu chunker（单聊流式 + 群聊完整文本共用）
"use strict";
module.exports = {
    ensureQQBotAutoReplyLoopStarted,
    qqbot_pro_bridge_configure: qqbot_auto_reply_configure,
    qqbot_pro_bridge_status: qqbot_auto_reply_status,
    qqbot_pro_bridge_start: qqbot_auto_reply_start,
    qqbot_pro_bridge_stop: qqbot_auto_reply_stop,
    qqbot_pro_bridge_run_once: qqbot_auto_reply_run_once,
    qqbot_pro_bridge_contacts,
    qqbot_pro_bridge_bind_c2c,
    qqbot_pro_bridge_set_proactive_target,
    qqbot_pro_bridge_list_image_folders,
    qqbot_pro_group_context,
    // 测试专用内部钩子（仅供冒烟测试读取内存缓存/调用纯逻辑函数，运行时不使用）
    _internal: {
        classifyEvent,
        pushToGroupContextCache,
        trimGroupContextCacheGlobal,
        isGroupAtEventType,
        extractAtTargetIds,
        resolveMemberLabel,
        buildEventKey,
        buildGroupNeighborContextAttachment,
        serializeCachedEvent,
        restoreGroupRuntimeStateAsync,
        persistGroupRuntimeStateAsync,
        clearGroupRuntimeState,
        // getter：避免 module.exports 在顶部求值时触碰尚未初始化的 const Map（TDZ）
        get groupContextCache() {
            return groupContextCache;
        },
        get groupPendingBuckets() {
            return groupPendingBuckets;
        },
        readAutoReplyConfigAsync
    },
    onQQBotAutoReplyApplicationCreate,
    onQQBotAutoReplyApplicationForeground,
    onQQBotAutoReplyApplicationTerminate
};
const WaifuMessageProcessor = Java.com.ai.assistance.operit.util.WaifuMessageProcessor;
const DEFAULT_ASSISTANT_INSTRUCTION = "";
const MAX_EVENT_PROCESS_FAIL_COUNT = 3;
let autoReplyTimerId = null;
let autoReplyTickActive = false;
// T046（2026-08-10）：tick 卡死 watchdog。宿主调用（sendMessageStreaming 等）的 timeout_ms 万一不生效，
// tick 会永久挂起（autoReplyTickActive 卡 true，后续 tick 全部跳过，表现为"循环死了但 running=true"）。
// 超过 TICK_STUCK_MS 判定卡死：强制重置 active 并作废旧代际，让循环自动恢复；
// 重复处理风险由 records chat_done 去重兜底（同 eventKey 已 chat_done 直接复用缓存）。
const TICK_STUCK_MS = 300000; // 5 分钟
let lastTickStartedAt = 0;
let tickGeneration = 0;
const groupPendingBuckets = new Map();
const groupContextCache = new Map(); // Epic G1：群上下文环形缓存 key=groupOpenId → { events: [], lastAt }
const groupCacheStateDirty = { dirty: false }; // 内存缓存有变更但未落盘
const groupNicknameCache = new Map();
const GROUP_NICKNAME_TTL_MS = 3600000;
/**
 * 桥接配置归一化（Epic G0 统一入口）。
 * 字段表/默认值/env回退/clamp/旧字段迁移全部收敛到 bridge_config.js。
 */
function normalizeAutoReplyConfig(raw) {
    return bridgeConfig.normalizeBridgeConfig(raw).config;
}
async function readAutoReplyConfigAsync() {
    const storedConfig = await (0, state.readPersistedConfigAsync)();
    return normalizeAutoReplyConfig((0, core.hasOwn)(storedConfig, "autoReply") && typeof storedConfig.autoReply === "object" && storedConfig.autoReply
        ? storedConfig.autoReply
        : {});
}
async function writeAutoReplyConfigAsync(config) {
    const normalized = normalizeAutoReplyConfig(config);
    await (0, state.updatePersistedConfigAsync)({
        autoReply: normalized
    });
    return normalized;
}
async function updateAutoReplyConfigAsync(patch) {
    const current = await readAutoReplyConfigAsync();
    return await writeAutoReplyConfigAsync({
        ...current,
        ...patch
    });
}
async function readAutoReplyStateStoreAsync() {
    return await (0, state.readPersistedAutoReplyStateAsync)();
}
async function writeAutoReplyStateStoreAsync(store) {
    return await (0, state.writePersistedAutoReplyStateAsync)(store);
}
async function flushAutoReplyStateStoreAsync() {
    await (0, state.flushPersistedAutoReplyStateAsync)();
}
async function readAutoReplyRuntimeAsync() {
    return (await readAutoReplyStateStoreAsync()).runtime;
}
async function updateAutoReplyRuntimeAsync(patch) {
    const store = await readAutoReplyStateStoreAsync();
    const current = store.runtime;
    const next = {
        ...current,
        ...patch
    };
    await writeAutoReplyStateStoreAsync({
        ...store,
        runtime: next
    });
    return next;
}
async function readAutoReplyBindingsAsync() {
    return (await readAutoReplyStateStoreAsync()).bindings;
}
async function writeAutoReplyBindingsAsync(bindings) {
    const store = await readAutoReplyStateStoreAsync();
    await writeAutoReplyStateStoreAsync({
        ...store,
        bindings
    });
    await flushAutoReplyStateStoreAsync();
}
async function readAutoReplyRecordsAsync() {
    return (await readAutoReplyStateStoreAsync()).records;
}
async function writeAutoReplyRecordsAsync(records) {
    const trimmed = trimRecordMap(records);
    const store = await readAutoReplyStateStoreAsync();
    await writeAutoReplyStateStoreAsync({
        ...store,
        records: trimmed
    });
    await flushAutoReplyStateStoreAsync();
}
function trimRecordMap(records) {
    const items = Object.keys(records).map((key) => {
        const value = records[key];
        const updatedAt = Date.parse(value?.updatedAt ?? "") || 0;
        return { key, value, updatedAt };
    });
    items.sort((left, right) => right.updatedAt - left.updatedAt);
    const next = {};
    items.slice(0, 200).forEach((item) => {
        next[item.key] = item.value;
    });
    return next;
}

// ---- Epic G1：群上下文缓存 / 聚合桶持久化与恢复 ----

function serializeCachedEvent(event) {
    return {
        eventId: (0, core.asText)(event.eventId).trim(),
        messageId: (0, core.asText)(event.messageId).trim(),
        eventType: (0, core.asText)(event.eventType).trim(),
        scene: (0, core.asText)(event.scene).trim(),
        content: (0, core.asText)(event.content).trim(),
        userOpenId: (0, core.asText)(event.userOpenId).trim(),
        groupOpenId: (0, core.asText)(event.groupOpenId).trim(),
        authorId: (0, core.asText)(event.authorId).trim(),
        timestamp: (0, core.asText)(event.timestamp).trim(),
        receivedAt: (0, core.asText)(event.receivedAt).trim(),
        replyHint: (0, core.isObject)(event.replyHint) ? JSON.parse(JSON.stringify(event.replyHint)) : undefined
    };
}
function extractAtTargetIds(content) {
    const text = (0, core.asText)(content);
    const matches = text.match(/<@([0-9A-Za-z_-]+)>/g) || [];
    const result = [];
    for (let index = 0; index < matches.length; index += 1) {
        const id = matches[index].replace(/^<@/, "").replace(/>$/, "").trim();
        if (id) {
            result.push(id);
        }
    }
    return result;
}
function isGroupAtEventType(eventType, event, botUserId) {
    const text = (0, core.asText)(eventType).trim().toUpperCase();
    if (text === "GROUP_AT_MESSAGE_CREATE" || text.includes("AT_MESSAGE")) {
        return true;
    }
    // T039（2026-08-08）：QQ「接收所有消息」全量模式下，@ 消息以 GROUP_MESSAGE_CREATE 推送，
    // @ 标记藏在 payload.mentions 字段里。Gateway 已透传 mentions，这里做兜底识别：
    // 只要 mentions 含机器人 id（id / user_openid / member_openid 任一匹配），即视为 @ 触发。
    const mentions = Array.isArray(event && event.mentions) ? event.mentions : [];
    const botId = (0, core.asText)(botUserId).trim();
    if (mentions.length > 0 && botId) {
        const mentionMatchesBot = mentions.some((user) => {
            if (!core.isObject(user)) {
                return false;
            }
            const candidateIds = [
                (0, core.asText)(user.id).trim(),
                (0, core.asText)(user.user_openid).trim(),
                (0, core.asText)(user.member_openid).trim()
            ];
            return candidateIds.some((candidate) => candidate && candidate === botId);
        });
        if (mentionMatchesBot) {
            return true;
        }
    }
    // T042（2026-08-08）：全量模式下机器人在群里的 member_openid ≠ botUserId（全局 user id），
    // mentions 直接比对会漏判。兜底：提取 content 里的 <@xxx> 目标，
    // 若 @ 目标出现在 mentions（官方“消息中@的用户列表”）且不是发送者自己 → 视为 @ 触发。
    const atTargets = extractAtTargetIds(event && event.content);
    const authorId = (0, core.asText)(event && event.authorId).trim();
    if (atTargets.length > 0 && mentions.length > 0) {
        const mentionIds = [];
        for (let index = 0; index < mentions.length; index += 1) {
            const user = mentions[index];
            if (!core.isObject(user)) {
                continue;
            }
            const ids = [
                (0, core.asText)(user.id).trim(),
                (0, core.asText)(user.user_openid).trim(),
                (0, core.asText)(user.member_openid).trim()
            ];
            for (let j = 0; j < ids.length; j += 1) {
                if (ids[j]) {
                    mentionIds.push(ids[j]);
                }
            }
        }
        const atMentioned = atTargets.some((target) => mentionIds.includes(target));
        const selfAt = atTargets.some((target) => target === authorId);
        if (atMentioned && !selfAt) {
            return true;
        }
    }
    return false;
}
function matchGroupKeyword(keywords, content) {
    if (!Array.isArray(keywords) || keywords.length === 0) {
        return false;
    }
    const text = (0, core.asText)(content).trim().toLowerCase();
    if (!text) {
        return false;
    }
    for (let index = 0; index < keywords.length; index += 1) {
        const keyword = (0, core.asText)(keywords[index]).trim().toLowerCase();
        if (keyword && text.includes(keyword)) {
            return true;
        }
    }
    return false;
}
function pushToGroupContextCache(config, event) {
    const groupOpenId = (0, core.asText)(event.groupOpenId).trim();
    if (!groupOpenId) {
        return;
    }
    let entry = groupContextCache.get(groupOpenId);
    if (!entry) {
        entry = { events: [], lastAt: Date.now() };
        groupContextCache.set(groupOpenId, entry);
    }
    const eventKey = buildEventKey(event);
    const alreadyInCache = entry.events.some((existing) => buildEventKey(existing) === eventKey);
    if (!alreadyInCache) {
        entry.events.push(serializeCachedEvent(event));
        entry.lastAt = Date.now();
    }
    // 单群容量：只保留最新 groupMaxItems 条（默认 30）
    const maxPerGroup = Math.max(Number(config.groupMaxItems) || 30, 1);
    if (entry.events.length > maxPerGroup) {
        entry.events = entry.events.slice(-maxPerGroup);
    }
    // 全局容量：跨群按事件时间保留最新 groupGlobalCacheMaxItems 条（默认 100）
    trimGroupContextCacheGlobal(Math.max(Number(config.groupGlobalCacheMaxItems) || 100, 1));
}
function trimGroupContextCacheGlobal(globalMax) {
    const all = [];
    for (const [gid, entry] of groupContextCache.entries()) {
        for (let index = 0; index < entry.events.length; index += 1) {
            const ev = entry.events[index];
            const ts = Number(ev.timestamp) || Number(ev.receivedAt) || 0;
            all.push({ gid, ev, ts });
        }
    }
    if (all.length <= globalMax) {
        return;
    }
    all.sort((left, right) => right.ts - left.ts);
    const keep = new Set();
    for (let index = 0; index < globalMax; index += 1) {
        keep.add(`${all[index].gid}|${buildEventKey(all[index].ev)}`);
    }
    for (const [gid, entry] of groupContextCache.entries()) {
        entry.events = entry.events.filter((ev) => keep.has(`${gid}|${buildEventKey(ev)}`));
        if (entry.events.length === 0) {
            groupContextCache.delete(gid);
        }
    }
}
async function persistGroupRuntimeStateAsync() {
    if (!groupCacheStateDirty.dirty) {
        return false;
    }
    const store = await readAutoReplyStateStoreAsync();
    const buckets = {};
    for (const [gid, bucket] of groupPendingBuckets.entries()) {
        buckets[gid] = {
            events: bucket.events.map((ev) => serializeCachedEvent(ev)),
            firstAt: bucket.firstAt,
            lastAt: bucket.lastAt,
            overflowCount: bucket.overflowCount || 0
        };
    }
    const context = {};
    for (const [gid, entry] of groupContextCache.entries()) {
        context[gid] = {
            events: entry.events,
            lastAt: entry.lastAt
        };
    }
    await writeAutoReplyStateStoreAsync({
        ...store,
        buckets,
        context
    });
    await flushAutoReplyStateStoreAsync();
    groupCacheStateDirty.dirty = false;
    return true;
}
async function restoreGroupRuntimeStateAsync(config) {
    // 幂等：内存已有状态时不重复恢复
    if (groupPendingBuckets.size > 0 || groupContextCache.size > 0) {
        return { restored: false, reason: "already_in_memory" };
    }
    const recoveryMaxAgeMs = Math.max(Number(config.groupCacheRecoveryMaxAgeMs) || 0, 0);
    const store = await readAutoReplyStateStoreAsync();
    const now = Date.now();
    let recoveredBucketCount = 0;
    let recoveredContextCount = 0;
    // 聚合桶恢复：只恢复 lastAt 在恢复窗口内的；窗口外直接丢弃（初尘 2026-08-07 确认"关一两天再开该丢就丢"）
    if ((0, core.isObject)(store.buckets)) {
        for (const [gid, data] of Object.entries(store.buckets)) {
            if (!(0, core.isObject)(data) || !Array.isArray(data.events) || data.events.length === 0) {
                continue;
            }
            const lastAt = Number(data.lastAt) || Number(data.firstAt) || 0;
            const age = lastAt > 0 ? now - lastAt : 0;
            if (recoveryMaxAgeMs === 0 || (recoveryMaxAgeMs > 0 && age > recoveryMaxAgeMs)) {
                continue;
            }
            const firstAt = Number(data.firstAt) || now;
            groupPendingBuckets.set(gid, {
                events: data.events,
                firstAt,
                lastAt: lastAt || now,
                overflowCount: Number(data.overflowCount) || 0
            });
            recoveredBucketCount += 1;
        }
    }
    // 上下文缓存恢复：同样按恢复窗口过滤
    if ((0, core.isObject)(store.context)) {
        for (const [gid, data] of Object.entries(store.context)) {
            if (!(0, core.isObject)(data) || !Array.isArray(data.events) || data.events.length === 0) {
                continue;
            }
            const lastAt = Number(data.lastAt) || 0;
            const age = lastAt > 0 ? now - lastAt : 0;
            if (recoveryMaxAgeMs === 0 || (recoveryMaxAgeMs > 0 && age > recoveryMaxAgeMs)) {
                continue;
            }
            groupContextCache.set(gid, {
                events: data.events,
                lastAt: lastAt || now
            });
            recoveredContextCount += 1;
        }
    }
    if (recoveredBucketCount > 0 || recoveredContextCount > 0) {
        // 把恢复后的状态写回（清掉被过滤的旧数据），避免文件无限膨胀
        groupCacheStateDirty.dirty = true;
        await persistGroupRuntimeStateAsync();
    }
    return { restored: true, recoveredBucketCount, recoveredContextCount, recoveryMaxAgeMs };
}
function clearGroupRuntimeState() {
    groupPendingBuckets.clear();
    groupContextCache.clear();
    groupCacheStateDirty.dirty = true;
}
async function incrementEventProcessFailCountAsync(eventKey, errorText) {
    const records = await readAutoReplyRecordsAsync();
    const existing = records[eventKey] ?? {};
    const failCount = (Number(existing.failCount ?? 0) || 0) + 1;
    records[eventKey] = {
        ...existing,
        status: "processing_failed",
        failCount,
        lastError: (0, core.asText)(errorText),
        updatedAt: new Date().toISOString()
    };
    await writeAutoReplyRecordsAsync(records);
    return failCount;
}
async function markEventProcessFailedAsync(eventKey, errorText) {
    const records = await readAutoReplyRecordsAsync();
    const existing = records[eventKey] ?? {};
    records[eventKey] = {
        ...existing,
        status: "failed",
        failCount: Number(existing.failCount ?? 0) || 0,
        lastError: (0, core.asText)(errorText),
        updatedAt: new Date().toISOString()
    };
    await writeAutoReplyRecordsAsync(records);
}
async function clearEventProcessFailCountAsync(eventKey) {
    const records = await readAutoReplyRecordsAsync();
    const existing = records[eventKey];
    if (!existing || (existing.failCount === undefined && existing.lastError === undefined)) {
        return;
    }
    records[eventKey] = {
        ...existing,
        failCount: 0,
        lastError: ""
    };
    await writeAutoReplyRecordsAsync(records);
}
async function readActiveAutoReplyContextAsync() {
    const storedConfig = await (0, state.readPersistedConfigAsync)();
    const snapshot = (0, state.readConfigSnapshotFrom)(storedConfig);
    const config = normalizeAutoReplyConfig((0, core.hasOwn)(storedConfig, "autoReply") && typeof storedConfig.autoReply === "object" && storedConfig.autoReply
        ? storedConfig.autoReply
        : {});
    return {
        snapshot,
        config,
        disabledReason: !snapshot.listenerEnabled
            ? "listener_disabled"
            : (!config.enabled ? "disabled" : "")
    };
}
function buildEventKey(event) {
    const direct = (0, core.firstNonBlank)((0, core.asText)(event.eventId), (0, core.asText)(event.messageId));
    if (direct) {
        return direct;
    }
    return [
        (0, core.asText)(event.scene).trim(),
        (0, core.asText)(event.timestamp).trim(),
        (0, core.asText)(event.userOpenId).trim(),
        (0, core.asText)(event.groupOpenId).trim(),
        (0, core.asText)(event.content).trim()
    ].join("|");
}
function buildConversationKey(event) {
    const scene = (0, core.asText)(event.scene).trim().toLowerCase();
    if (scene === "group") {
        return `group:${(0, core.asText)(event.groupOpenId).trim()}`;
    }
    if (scene === "c2c") {
        return `c2c:${(0, core.asText)(event.userOpenId).trim()}`;
    }
    return "";
}
function buildChatTitle(event) {
    const scene = (0, core.asText)(event.scene).trim().toLowerCase();
    if (scene === "group") {
        return `[QQ][群] ${(0, core.firstNonBlank)((0, core.asText)(event.groupOpenId), "unknown")}`;
    }
    return `[QQ][私聊] ${(0, core.firstNonBlank)((0, core.asText)(event.userOpenId), "unknown")}`;
}
function escapeXml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
function sanitizePathSegment(value, fallback) {
    const normalized = value
        .replace(/[\\/:*?"<>|\u0000-\u001F]+/g, "_")
        .replace(/\s+/g, "_")
        .trim()
        .replace(/^_+|_+$/g, "");
    return normalized || fallback;
}
function hashText(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash).toString(16);
}
function buildFileNameFromUrl(url) {
    const normalized = url.trim();
    if (!normalized) {
        return "";
    }
    try {
        const withoutQuery = normalized.split("?")[0];
        const lastSegment = withoutQuery.split("/").pop() || "";
        return decodeURIComponent(lastSegment).trim();
    }
    catch (_error) {
        return "";
    }
}
function normalizeAttachmentUrl(url) {
    const trimmed = url.trim();
    if (trimmed.startsWith("//")) {
        return `https:${trimmed}`;
    }
    return trimmed;
}
function normalizeQQInboundAttachment(raw, index) {
    const url = normalizeAttachmentUrl((0, core.firstNonBlank)((0, core.asText)(raw.url), (0, core.asText)(raw.download_url), (0, core.asText)(raw.file_url)));
    if (!url) {
        return null;
    }
    const mimeType = (0, core.firstNonBlank)((0, core.asText)(raw.content_type), (0, core.asText)(raw.contentType), (0, core.asText)(raw.mime_type), (0, core.asText)(raw.mimeType), "application/octet-stream");
    const providedName = (0, core.firstNonBlank)((0, core.asText)(raw.filename), (0, core.asText)(raw.file_name), (0, core.asText)(raw.name), buildFileNameFromUrl(url));
    const fileName = sanitizePathSegment(providedName, `attachment_${index + 1}`);
    return {
        id: (0, core.firstNonBlank)((0, core.asText)(raw.id), (0, core.asText)(raw.file_id), (0, core.asText)(raw.uuid), `attachment_${index + 1}`),
        url,
        fileName,
        mimeType,
        size: Number(raw.size ?? raw.file_size ?? 0) || 0
    };
}
function extractQQInboundAttachments(event) {
    const rawPayload = (0, core.isObject)(event.rawPayload) ? event.rawPayload : {};
    const payloadData = (0, core.isObject)(rawPayload.d) ? rawPayload.d : {};
    const candidates = [];
    const pushArrayItems = (value) => {
        if (!Array.isArray(value)) {
            return;
        }
        for (let index = 0; index < value.length; index += 1) {
            const item = value[index];
            if ((0, core.isObject)(item)) {
                candidates.push(item);
            }
        }
    };
    pushArrayItems(payloadData.attachments);
    pushArrayItems(payloadData.files);
    if ((0, core.isObject)(payloadData.file_info)) {
        candidates.push(payloadData.file_info);
    }
    const normalized = [];
    const seen = new Set();
    for (let index = 0; index < candidates.length; index += 1) {
        const item = normalizeQQInboundAttachment(candidates[index], index);
        if (!item) {
            continue;
        }
        const key = `${item.url}|${item.fileName}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        normalized.push(item);
    }
    return normalized;
}
async function ensureQQBotAttachmentDirAsync(event) {
    const eventDirName = sanitizePathSegment((0, core.firstNonBlank)((0, core.asText)(event.eventId).trim(), (0, core.asText)(event.messageId).trim(), hashText((0, core.asText)(event.timestamp))), "event");
    const baseDir = `${OPERIT_CLEAN_ON_EXIT_DIR}/qqbot/${eventDirName}`;
    await Tools.Files.mkdir(baseDir, true, "android");
    await Tools.Files.write(`${baseDir}/.nomedia`, "", false, "android");
    return baseDir;
}
async function buildQQAttachmentDownloadHeadersAsync() {
    const snapshot = await (0, state.requireConfiguredSnapshotAsync)();
    const token = await (0, core.fetchAccessToken)(snapshot, 20000);
    return {
        Accept: "*/*",
        Authorization: `${token.tokenType} ${token.accessToken}`,
        "X-Union-Appid": snapshot.appId
    };
}
async function materializeQQInboundAttachmentsAsync(event) {
    const attachments = extractQQInboundAttachments(event);
    if (attachments.length === 0) {
        return [];
    }
    const baseDir = await ensureQQBotAttachmentDirAsync(event);
    const headers = await buildQQAttachmentDownloadHeadersAsync();
    const tags = [];
    for (let index = 0; index < attachments.length; index += 1) {
        const attachment = attachments[index];
        const safeFileName = sanitizePathSegment(attachment.fileName, `attachment_${index + 1}`);
        const localPath = `${baseDir}/${safeFileName}`;
        await Tools.Files.download(attachment.url, localPath, "android", headers);
        const fileInfo = await Tools.Files.info(localPath, "android");
        const resolvedSize = Number(fileInfo.size ?? attachment.size ?? 0) || 0;
        tags.push(`<attachment id="${escapeXml(localPath)}" filename="${escapeXml(safeFileName)}" type="${escapeXml(attachment.mimeType)}" size="${resolvedSize}">${escapeXml(localPath)}</attachment>`);
    }
    return tags;
}
function buildInboundChatContextAttachment(config, event) {
    const scene = (0, core.asText)(event.scene).trim().toLowerCase();
    const sceneLabel = scene === "group" ? "QQ群消息" : scene === "c2c" ? "QQ私聊消息" : "QQ消息";
    const contentLines = [
        `scene: ${scene || "unknown"}`,
        `sceneLabel: ${sceneLabel}`,
        `eventType: ${(0, core.asText)(event.eventType).trim()}`,
        `messageId: ${(0, core.asText)(event.messageId).trim()}`
    ];
    const userOpenId = (0, core.asText)(event.userOpenId).trim();
    if (userOpenId) {
        contentLines.push(`userOpenId: ${userOpenId}`);
    }
    const groupOpenId = (0, core.asText)(event.groupOpenId).trim();
    if (groupOpenId) {
        contentLines.push(`groupOpenId: ${groupOpenId}`);
    }
    const authorId = (0, core.asText)(event.authorId).trim();
    if (authorId) {
        contentLines.push(`authorId: ${authorId}`);
    }
    // 时间戳（Gateway 事件自带 timestamp / receivedAt，之前被漏传，导致 AI 误判消息为"刚刚发的"）
    const timestamp = (0, core.asText)(event.timestamp).trim();
    if (timestamp) {
        contentLines.push(`sentAt: ${timestamp}`);
    }
    const receivedAt = (0, core.asText)(event.receivedAt).trim();
    if (receivedAt) {
        contentLines.push(`receivedAt: ${receivedAt}`);
    }
    // 积压检测：消息实际发送时间距今超过阈值 → 顶部插入醒目标记，防止 AI 当实时消息回复
    const STALE_THRESHOLD_MS = 10 * 60 * 1000;
    const eventTs = Number(event.timestamp) || 0;
    const ageMs = eventTs > 0 ? Date.now() - eventTs : 0;
    if (ageMs > STALE_THRESHOLD_MS) {
        contentLines.unshift(`[stale: 延迟 ${Math.round(ageMs / 1000 / 60)} 分钟到达的历史消息，实际发送时间见下方 sentAt]`, "");
    }
    const extraInstruction = (0, core.asText)(config.assistantInstruction).trim();
    if (extraInstruction) {
        contentLines.push("");
        contentLines.push("instruction:");
        contentLines.push(extraInstruction);
    }
    const attachmentContent = contentLines.join("\n");
    const attachmentId = (0, core.firstNonBlank)((0, core.asText)(event.eventId).trim(), (0, core.asText)(event.messageId).trim(), `${scene || "qq"}_context`);
    const filename = scene === "group" ? "qq_group_message_context.txt" : "qq_private_message_context.txt";
    return `<attachment id="${escapeXml(attachmentId)}" filename="${escapeXml(filename)}" type="text/plain" size="${attachmentContent.length}">${escapeXml(attachmentContent)}</attachment>`;
}
async function buildInboundChatMessage(config, event) {
    const userMessage = (0, core.asText)(event.content).trim();
    const attachmentTags = [
        buildInboundChatContextAttachment(config, event),
        ...(await materializeQQInboundAttachmentsAsync(event))
    ];
    if (!userMessage) {
        return attachmentTags.join(" ");
    }
    return [userMessage, ...attachmentTags].join(" ");
}
function sanitizeAiReplyText(raw) {
    return (0, core.asText)(WaifuMessageProcessor.cleanContentForWaifu(raw)).trim();
}
function summarizeBindings(bindings) {
    const items = Object.keys(bindings).map((key) => {
        const entry = bindings[key];
        return {
            key,
            chatId: entry?.chatId ?? "",
            title: entry?.title ?? "",
            lastMessageId: entry?.lastMessageId ?? "",
            lastProcessedAt: entry?.lastProcessedAt ?? ""
        };
    });
    items.sort((left, right) => String(right.lastProcessedAt).localeCompare(String(left.lastProcessedAt)));
    return {
        totalCount: items.length,
        items: items.slice(0, 10)
    };
}
function summarizeRecords(records) {
    const items = Object.keys(records).map((key) => {
        const entry = records[key];
        return {
            key,
            status: entry?.status ?? "",
            chatId: entry?.chatId ?? "",
            failCount: Number(entry?.failCount ?? 0) || 0,
            lastError: entry?.lastError ?? "",
            updatedAt: entry?.updatedAt ?? ""
        };
    });
    items.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    return {
        totalCount: items.length,
        items: items.slice(0, 10)
    };
}
async function buildAutoReplyStatusAsync(options = {}) {
    const includeBindings = options.includeBindings !== false;
    const includeRecords = options.includeRecords !== false;
    const storedConfig = await (0, state.readPersistedConfigAsync)();
    const config = normalizeAutoReplyConfig((0, core.hasOwn)(storedConfig, "autoReply") && typeof storedConfig.autoReply === "object" && storedConfig.autoReply
        ? storedConfig.autoReply
        : {});
    const snapshot = (0, state.readConfigSnapshotFrom)(storedConfig);
    const runtime = await readAutoReplyRuntimeAsync();
    const isActiveByConfig = snapshot.listenerEnabled && config.enabled;
    return {
        success: true,
        packageVersion: core.PACKAGE_VERSION,
        config,
        runtime: {
            ...runtime,
            running: isActiveByConfig && ((0, core.toBoolean)(runtime.running, false) || autoReplyTimerId != null)
        },
        ...(includeBindings ? {
            bindings: summarizeBindings(await readAutoReplyBindingsAsync())
        } : {}),
        ...(includeRecords ? {
            records: summarizeRecords(await readAutoReplyRecordsAsync())
        } : {})
    };
}
function findC2cFixedBinding(config, userOpenId) {
    const openid = (0, core.asText)(userOpenId).trim();
    if (!openid || !Array.isArray(config.c2cFixedBindings)) {
        return null;
    }
    for (let index = 0; index < config.c2cFixedBindings.length; index += 1) {
        const item = config.c2cFixedBindings[index];
        if (item && (0, core.asText)(item.openid).trim() === openid) {
            return item;
        }
    }
    return null;
}
async function ensureChatServiceReadyAsync() {
    await Tools.Chat.startService({
        initial_mode: "BALL",
        keep_if_exists: true,
        timeout_ms: 20000
    });
}
async function resolveBoundChatIdAsync(config, event) {
    await ensureChatServiceReadyAsync();
    const conversationKey = buildConversationKey(event);
    if (!conversationKey) {
        throw new Error("Unable to resolve conversation key for QQ event");
    }
    const scene = (0, core.asText)(event.scene).trim().toLowerCase();
    if (scene === "c2c") {
        const c2cBinding = findC2cFixedBinding(config, (0, core.asText)(event.userOpenId));
        if (c2cBinding) {
            const findFixed = await Tools.Chat.findChat({
                query: c2cBinding.chatId,
                match: "exact",
                index: 0
            });
            if ((findFixed.chat?.id ?? "") === c2cBinding.chatId) {
                return c2cBinding.chatId;
            }
            throw new Error(`QQ c2c fixed binding chat not found: ${c2cBinding.chatId}`);
        }
    }
    // 2026-08-07 初尘实测确认：群聊固定目标 target_chat_id 语义废弃。
    // 群消息（含 @Bot）一律按 group:{group_openid} 新建/复用独立 Operit 对话，
    // 不再绑定到任何指定对话框；target_chat_id 字段仅保留用于兼容读取旧配置，不再参与路由。
    // （V2-BLUEPRINT §3.2 已同步）
    const store = await readAutoReplyStateStoreAsync();
    const bindings = {
        ...store.bindings
    };
    const existing = bindings[conversationKey];
    const existingChatId = (0, core.firstNonBlank)(existing?.chatId ?? "");
    if (existingChatId) {
        try {
            const findResult = await Tools.Chat.findChat({
                query: existingChatId,
                match: "exact",
                index: 0
            });
            if ((findResult.chat?.id ?? "") === existingChatId) {
                return existingChatId;
            }
        }
        catch (error) {
            const message = (0, core.safeErrorMessage)(error);
            if (!message.includes("Chat not found by query")) {
                throw error;
            }
        }
        delete bindings[conversationKey];
        const records = {
            ...store.records
        };
        let changed = false;
        Object.keys(records).forEach((key) => {
            if ((records[key]?.chatId ?? "").trim() === existingChatId) {
                delete records[key];
                changed = true;
            }
        });
        await writeAutoReplyStateStoreAsync({
            ...store,
            bindings,
            records: changed ? trimRecordMap(records) : store.records
        });
        await flushAutoReplyStateStoreAsync();
    }
    const nextBindings = {
        ...bindings
    };
    const creation = await Tools.Chat.createNew(config.chatGroup, false, config.characterCardId || undefined);
    const chatId = creation.chatId.trim();
    if (!chatId) {
        throw new Error("Failed to create a chat for QQ auto reply");
    }
    const title = buildChatTitle(event);
    try {
        await Tools.Chat.updateTitle(chatId, title);
    }
    catch (_error) { }
    nextBindings[conversationKey] = {
        chatId,
        title,
        scene: (0, core.asText)(event.scene).trim(),
        userOpenId: (0, core.asText)(event.userOpenId).trim(),
        groupOpenId: (0, core.asText)(event.groupOpenId).trim(),
        lastMessageId: (0, core.asText)(event.messageId).trim(),
        lastProcessedAt: new Date().toISOString()
    };
    await writeAutoReplyStateStoreAsync({
        ...store,
        bindings: nextBindings,
        records: store.records
    });
    await flushAutoReplyStateStoreAsync();
    return chatId;
}
async function generateAiReplyAsync(config, event, eventKey, onIntermediateResult, options = {}) {
    const records = await readAutoReplyRecordsAsync();
    const existing = records[eventKey];
    const existingReply = (0, core.firstNonBlank)(existing?.aiResponse ?? "");
    if (existing?.status === "chat_done" && existingReply) {
        return {
            chatId: existing.chatId.trim(),
            aiResponse: existingReply
        };
    }
    const chatId = await resolveBoundChatIdAsync(config, event);
    const userMessage = (0, core.asText)(options.userMessage).trim() || await buildInboundChatMessage(config, event);
    // 群聚合场景（Epic G0）：AI 生成超时用 groupAiTimeoutMs（默认120s），只试一次，
    // 超时/空回复立即失败并标记 group_ai_timeout，不进多次重试拖过期效窗口。
    const maxEmptyRetries = Number(options.maxEmptyRetries) >= 0 ? Number(options.maxEmptyRetries) : 3;
    const aiTimeoutMs = Number(options.aiTimeoutMs) > 0 ? Number(options.aiTimeoutMs) : config.aiTimeoutMs;
    const isGroupScene = options.scene === "group";
    let aiResponse = "";
    let sendResult = null;
    for (let attempt = 1; attempt <= maxEmptyRetries; attempt += 1) {
        try {
            // T046：宿主 timeout_ms 万一不生效时，JS 侧 Promise.race 兜底强制超时，
            // 防止 tick 永久挂起（旧 promise 若后续 resolve，onIntermediateResult 仍会发流式段，但主流程已超时放弃）
            const streamPromise = Tools.Chat.sendMessageStreaming(userMessage, chatId, config.characterCardId || undefined, undefined, {
                waifu: (0, core.hasOwn)(options, "waifu") ? options.waifu : config.waifu,
                persist_turn: true,
                notify_reply: false,
                hide_user_message: false,
                disable_warning: true,
                timeout_ms: aiTimeoutMs,
                onIntermediateResult
            });
            const hardTimeoutMs = Math.max(Number(aiTimeoutMs) || 180000, 1000) + 30000;
            const hardTimeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(isGroupScene
                    ? "group_ai_timeout: sendMessageStreaming hung beyond hard timeout"
                    : "AI streaming hung beyond hard timeout")), hardTimeoutMs);
            });
            sendResult = await Promise.race([streamPromise, hardTimeoutPromise]);
        }
        catch (error) {
            const errorText = (0, core.safeErrorMessage)(error);
            if (isGroupScene) {
                throw new Error(`group_ai_timeout: ${errorText}`);
            }
            throw error;
        }
        aiResponse = sanitizeAiReplyText((sendResult.aiResponse ?? "").trim());
        if (aiResponse) {
            break;
        }
        if (attempt < maxEmptyRetries) {
            await Tools.System.sleep(attempt * 5000);
        }
    }
    if (!aiResponse) {
        if (isGroupScene) {
            throw new Error("group_ai_timeout: empty response");
        }
        throw new Error("AI returned an empty response for QQ auto reply");
    }
    records[eventKey] = {
        status: "chat_done",
        chatId,
        aiResponse,
        updatedAt: new Date().toISOString(),
        scene: (0, core.asText)(event.scene).trim(),
        messageId: (0, core.asText)(event.messageId).trim()
    };
    await writeAutoReplyRecordsAsync(records);
    const bindings = await readAutoReplyBindingsAsync();
    const conversationKey = buildConversationKey(event);
    const binding = bindings[conversationKey];
    bindings[conversationKey] = {
        chatId,
        title: (0, core.firstNonBlank)(binding?.title ?? "", buildChatTitle(event)),
        scene: (0, core.asText)(event.scene).trim(),
        userOpenId: (0, core.asText)(event.userOpenId).trim(),
        groupOpenId: (0, core.asText)(event.groupOpenId).trim(),
        lastMessageId: (0, core.asText)(event.messageId).trim(),
        lastProcessedAt: new Date().toISOString()
    };
    await writeAutoReplyBindingsAsync(bindings);
    return {
        chatId,
        aiResponse
    };
}
async function sendReplyToQQAsync(event, replyText, msgSeq = 1) {
    const snapshot = await (0, state.requireConfiguredSnapshotAsync)();
    const scene = (0, core.asText)(event.scene).trim().toLowerCase();
    const replyHint = event.replyHint;
    const body = (0, core.buildSendBody)({
        content: replyText,
        msg_id: replyHint?.msg_id ?? "",
        event_id: replyHint?.event_id ?? "",
        msg_seq: msgSeq
    });
    if (scene === "group") {
        const groupOpenId = (0, core.firstNonBlank)(replyHint?.group_openid ?? "", (0, core.asText)(event.groupOpenId));
        if (!groupOpenId) {
            throw new Error("Missing group_openid for QQ group auto reply");
        }
        const response = await (0, core.openApiRequest)(snapshot, `/v2/groups/${encodeURIComponent(groupOpenId)}/messages`, "POST", body, 20000);
        if (!response.success) {
            throw new Error((0, core.firstNonBlank)((0, core.asText)(response.json.message), `HTTP ${response.statusCode}`));
        }
        return {
            scene: "group",
            groupOpenId,
            response: response.json
        };
    }
    const openid = (0, core.firstNonBlank)(replyHint?.openid ?? "", (0, core.asText)(event.userOpenId));
    if (!openid) {
        throw new Error("Missing openid for QQ C2C auto reply");
    }
    const response = await (0, core.openApiRequest)(snapshot, `/v2/users/${encodeURIComponent(openid)}/messages`, "POST", body, 20000);
    if (!response.success) {
        throw new Error((0, core.firstNonBlank)((0, core.asText)(response.json.message), `HTTP ${response.statusCode}`));
    }
    return {
        scene: "c2c",
        openid,
        response: response.json
    };
}
function shortOpenId(openid) {
    const text = (0, core.asText)(openid).trim();
    if (!text) {
        return "?";
    }
    return text.length <= 4 ? text : text.slice(-4);
}
/**
 * G7 群成员身份绑定：返回成员在上下文中的显示标签。
 * 匹配规则：memberOpenid 相等；若绑定带 groupOpenid，需群也匹配（留空=全局生效）。
 * 未命中 → QQ+后四位。
 */
function resolveMemberLabel(config, memberOpenId, groupOpenId) {
    const bindings = Array.isArray(config && config.groupMemberBindings) ? config.groupMemberBindings : [];
    const targetMember = (0, core.asText)(memberOpenId).trim();
    const targetGroup = (0, core.asText)(groupOpenId).trim();
    if (bindings.length > 0 && targetMember) {
        for (let index = 0; index < bindings.length; index += 1) {
            const binding = bindings[index];
            if (!core.isObject(binding)) {
                continue;
            }
            if ((0, core.asText)(binding.memberOpenid).trim() !== targetMember) {
                continue;
            }
            const bindingGroup = (0, core.asText)(binding.groupOpenid).trim();
            if (bindingGroup && bindingGroup !== targetGroup) {
                continue;
            }
            const title = (0, core.asText)(binding.title).trim();
            if (title) {
                return title;
            }
        }
    }
    return `QQ${shortOpenId(targetMember)}`;
}
async function resolveGroupNicknameAsync(snapshot, groupOpenId, memberOpenId) {
    const cacheKey = `${groupOpenId}|${memberOpenId}`;
    const cached = groupNicknameCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < GROUP_NICKNAME_TTL_MS) {
        return cached.nickname;
    }
    try {
        const profile = await (0, core.fetchGroupMemberProfile)(snapshot, groupOpenId, memberOpenId, 8000);
        const nickname = (0, core.asText)(profile.username).trim();
        if (nickname) {
            groupNicknameCache.set(cacheKey, { nickname, fetchedAt: Date.now() });
            return nickname;
        }
    }
    catch (_error) { }
    return "";
}
async function buildGroupAggregateMessageAsync(config, snapshot, events) {
    const lines = [];
    for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        const memberOpenId = (0, core.firstNonBlank)((0, core.asText)(event.userOpenId).trim(), (0, core.asText)(event.authorId).trim());
        // G7：绑定名优先；未绑定回退 QQ+后四位；群昵称开启时再尝试昵称覆盖
        let label = resolveMemberLabel(config, memberOpenId, (0, core.asText)(event.groupOpenId).trim());
        if (config.groupNicknameEnabled && memberOpenId && (0, core.asText)(event.groupOpenId).trim()) {
            const nickname = await resolveGroupNicknameAsync(snapshot, (0, core.asText)(event.groupOpenId).trim(), memberOpenId);
            if (nickname) {
                label = nickname;
            }
        }
        const content = (0, core.asText)(event.content).trim();
        const attachmentTags = await materializeQQInboundAttachmentsAsync(event);
        const suffix = attachmentTags.length > 0 ? ` ${attachmentTags.join(" ")}` : "";
        lines.push(`[${label}] ${content}${suffix}`);
    }
    return lines.join("\n");
}
function buildGroupAggregateContextAttachment(config, aggregateEvent, aggregatedCount) {
    const contentLines = [
        "scene: group",
        "sceneLabel: QQ群消息聚合",
        `aggregatedCount: ${aggregatedCount}`,
        `messageId: ${(0, core.asText)(aggregateEvent.messageId).trim()}`,
        `groupOpenId: ${(0, core.asText)(aggregateEvent.groupOpenId).trim()}`,
        "",
        "instruction: 这是群内多条消息聚合后的结果（已标注发言者）。请从中选择值得回应的内容回复，可点名回应某位群友，也可以整体回应；不要逐条回复，不要刷屏。"
    ];
    const timestamp = (0, core.asText)(aggregateEvent.timestamp).trim();
    if (timestamp) {
        contentLines.push(`batchLastSentAt: ${timestamp}`);
    }
    const receivedAt = (0, core.asText)(aggregateEvent.receivedAt).trim();
    if (receivedAt) {
        contentLines.push(`receivedAt: ${receivedAt}`);
    }
    const content = contentLines.join("\n");
    const attachmentId = `GROUP_AGGREGATE:${(0, core.asText)(aggregateEvent.groupOpenId).trim()}`;
    return `<attachment id="${escapeXml(attachmentId)}" filename="qq_group_aggregate_context.txt" type="text/plain" size="${content.length}">${escapeXml(content)}</attachment>`;
}
function splitReplyBySentenceCount(text, sentenceCount, maxLength = 400) {
    // G4：统一 Waifu chunker 批处理（`。！？\n` 计数、连续换行归一化、400 字符兜底）
    return waifuChunker.splitText(text, sentenceCount, maxLength);
}
async function sendReplyChunksToQQAsync(event, text, sentenceCount) {
    const chunks = splitReplyBySentenceCount(text, sentenceCount);
    let last = null;
    for (let index = 0; index < chunks.length; index += 1) {
        last = await sendReplyToQQAsync(event, chunks[index], index + 1);
    }
    return { last, chunkCount: chunks.length };
}
async function flushGroupBucketAsync(config, groupOpenId, bucket) {
    const events = bucket.events;
    const snapshot = await (0, state.requireConfiguredSnapshotAsync)();
    const aggregateText = await buildGroupAggregateMessageAsync(config, snapshot, events);
    // 群聚合积压检测：遍历 batch 找最旧 timestamp，超过阈值 → 标注历史消息
    const STALE_THRESHOLD_MS = 10 * 60 * 1000;
    let oldestBatchTs = 0;
    for (let index = 0; index < events.length; index += 1) {
        const ts = Number(events[index].timestamp) || 0;
        if (ts > 0 && (oldestBatchTs === 0 || ts < oldestBatchTs)) {
            oldestBatchTs = ts;
        }
    }
    const staleMark = oldestBatchTs > 0 && (Date.now() - oldestBatchTs) > STALE_THRESHOLD_MS
        ? `[stale: 本批消息最早发送于 ${Math.round((Date.now() - oldestBatchTs) / 1000 / 60)} 分钟前的历史消息，详见各条标柱的 sentAt]\n\n`
        : "";
    const lastEvent = events[events.length - 1];
    const aggregateEventKey = `GROUP_AGGREGATE:${groupOpenId}:${Date.now()}`;
    const aggregateEvent = {
        ...lastEvent,
        content: aggregateText,
        eventId: aggregateEventKey,
        messageId: (0, core.asText)(lastEvent.messageId).trim(),
        scene: "group",
        groupOpenId,
        userOpenId: "",
        authorId: ""
    };
    let userMessage = [staleMark + aggregateText, buildGroupAggregateContextAttachment(config, aggregateEvent, events.length)].join(" ");
    // Epic G2 automatic：自动附带邻近上下文（锚点=本批最后一条事件，前后各 groupContextBefore/After，最多 groupContextLimit）
    if ((0, core.asText)(config.groupContextMode).trim() === "automatic") {
        const neighborContext = buildGroupNeighborContextAttachment(config, groupOpenId, buildEventKey(lastEvent));
        if (neighborContext) {
            userMessage += " " + neighborContext;
        }
    }
    // 群聚合场景（Epic G0）：AI 生成超时用 groupAiTimeoutMs、单次尝试；超时抛 group_ai_timeout。
    // waifu:false —— 群聚合有自己的群聊 5 句切分（sendReplyChunksToQQAsync），
    // 且 waifu 流式需要 onIntermediateResult 收集器，群聚合未传收集器会导致 aiResponse 为空（T041）。
    const generated = await generateAiReplyAsync(config, aggregateEvent, aggregateEventKey, undefined, {
        userMessage,
        scene: "group",
        aiTimeoutMs: config.groupAiTimeoutMs,
        maxEmptyRetries: 1,
        waifu: false
    });
    const aiResponse = (0, core.asText)(generated.aiResponse).trim();
    // 锚点时效安全阀（Epic G0 提前量）：QQ 群被动回复约 5 分钟时效，预留 60s 安全边界。
    // 窗口最后一条消息到达至今超过 4 分钟 → 不硬发过期被动回复，放弃并记录原因。
    // （完整的 active_send 主动点名降级依赖 G3 replyTo 协议，届时启用。）
    const anchorAgeMs = Date.now() - (bucket.lastAt || Date.now());
    const GROUP_PASSIVE_REPLY_WINDOW_MS = 4 * 60 * 1000;
    if (anchorAgeMs > GROUP_PASSIVE_REPLY_WINDOW_MS) {
        const records = await readAutoReplyRecordsAsync();
        const nowIso = new Date().toISOString();
        for (let index = 0; index < events.length; index += 1) {
            const eventKey = buildEventKey(events[index]);
            if (!eventKey) {
                continue;
            }
            records[eventKey] = {
                status: "anchor_expired_dropped",
                chatId: (0, core.asText)(generated.chatId).trim(),
                aiResponse,
                failCount: 0,
                lastError: `anchor_expired: age=${Math.round(anchorAgeMs / 1000)}s (over ${GROUP_PASSIVE_REPLY_WINDOW_MS / 1000}s safe window)`,
                updatedAt: nowIso,
                scene: "group",
                messageId: (0, core.asText)(events[index].messageId).trim(),
                aggregateKey: aggregateEventKey
            };
        }
        await writeAutoReplyRecordsAsync(records);
        const eventKeys = [];
        for (let index = 0; index < events.length; index += 1) {
            const eventKey = buildEventKey(events[index]);
            if (eventKey) {
                eventKeys.push(eventKey);
            }
        }
        if (eventKeys.length > 0) {
            await gateway.removeGatewayEvents(eventKeys, 8000);
        }
        return {
            eventKey: aggregateEventKey,
            chatId: (0, core.asText)(generated.chatId).trim(),
            replyPreview: aiResponse.slice(0, 200),
            aggregatedCount: events.length,
            dropped: true,
            dropReason: "anchor_expired",
            sendResult: {
                scene: "group",
                groupOpenId,
                aggregated: true,
                dropped: true
            }
        };
    }
    await sendReplyChunksToQQAsync(lastEvent, aiResponse, config.groupWaifuFlushSentences || 5);
    const eventKeys = [];
    for (let index = 0; index < events.length; index += 1) {
        const eventKey = buildEventKey(events[index]);
        if (eventKey) {
            eventKeys.push(eventKey);
        }
    }
    if (eventKeys.length > 0) {
        await gateway.removeGatewayEvents(eventKeys, 8000);
    }
    const records = await readAutoReplyRecordsAsync();
    const nowIso = new Date().toISOString();
    for (let index = 0; index < events.length; index += 1) {
        const eventKey = buildEventKey(events[index]);
        if (!eventKey) {
            continue;
        }
        records[eventKey] = {
            status: "aggregated_replied",
            chatId: (0, core.asText)(generated.chatId).trim(),
            aiResponse,
            failCount: 0,
            lastError: "",
            updatedAt: nowIso,
            scene: "group",
            messageId: (0, core.asText)(events[index].messageId).trim(),
            aggregateKey: aggregateEventKey
        };
    }
    await writeAutoReplyRecordsAsync(records);
    return {
        eventKey: aggregateEventKey,
        chatId: (0, core.asText)(generated.chatId).trim(),
        replyPreview: aiResponse.slice(0, 200),
        aggregatedCount: events.length,
        sendResult: {
            scene: "group",
            groupOpenId,
            aggregated: true
        }
    };
}
async function flushDueGroupBucketsAsync(config) {
    const now = Date.now();
    const windowMs = Math.max(Number(config.groupAggregateWindowMs) || 0, 0);
    const maxItems = Math.max(Number(config.groupMaxItems) || 1, 1);
    const concurrency = Math.min(Math.max(Number(config.groupFlushConcurrency) || 3, 1), 8);
    const due = [];
    const entries = Array.from(groupPendingBuckets.entries());
    for (let index = 0; index < entries.length; index += 1) {
        const [gid, bucket] = entries[index];
        // 单群安全保留上限（Epic G0：废弃"桶满提前 flush"旧语义）：
        // 超过上限不提前发送，只保留最新 maxItems 条并累计 overflow/dropCount。
        if (bucket.events.length > maxItems) {
            const droppedCount = bucket.events.length - maxItems;
            bucket.events = bucket.events.slice(-maxItems);
            bucket.overflowCount = (bucket.overflowCount || 0) + droppedCount;
        }
        const dueWindow = windowMs > 0 && now - bucket.firstAt >= windowMs;
        if (!dueWindow || bucket.events.length === 0) {
            continue;
        }
        groupPendingBuckets.delete(gid);
        due.push({ gid, bucket });
    }
    if (due.length === 0) {
        return { flushed: false, results: [], error: "" };
    }
    // Epic G1：到期群有限并发 flush（groupFlushConcurrency，默认 3，clamp 1～8）；
    // 不同群对应不同 chatId，可跨群并发；同一群内事件串行处理。
    const results = [];
    let nextIndex = 0;
    const flushWorkerAsync = async () => {
        while (nextIndex < due.length) {
            const current = due[nextIndex];
            nextIndex += 1;
            try {
                const flushResult = await flushGroupBucketAsync(config, current.gid, current.bucket);
                results.push({ flushed: true, result: flushResult });
            }
            catch (error) {
                const errorText = (0, core.safeErrorMessage)(error);
                const removedKeys = [];
                for (let eventIndex = 0; eventIndex < current.bucket.events.length; eventIndex += 1) {
                    const eventKey = buildEventKey(current.bucket.events[eventIndex]);
                    if (!eventKey) {
                        continue;
                    }
                    const failCount = await incrementEventProcessFailCountAsync(eventKey, errorText);
                    if (failCount >= MAX_EVENT_PROCESS_FAIL_COUNT) {
                        await markEventProcessFailedAsync(eventKey, errorText);
                        removedKeys.push(eventKey);
                    }
                }
                if (removedKeys.length > 0) {
                    await gateway.removeGatewayEvents(removedKeys, 8000);
                }
                results.push({ flushed: false, error: errorText });
            }
        }
    };
    const workers = [];
    for (let index = 0; index < concurrency; index += 1) {
        workers.push(flushWorkerAsync());
    }
    await Promise.all(workers);
    const firstError = "";
    for (let index = 0; index < results.length; index += 1) {
        if (!results[index].flushed && results[index].error) {
            firstError = results[index].error;
        }
    }
    return { flushed: results.some((item) => item.flushed), results, error: firstError };
}
function classifyEvent(config, event, serviceState) {
    const scene = (0, core.asText)(event.scene).trim().toLowerCase();
    const eventType = (0, core.asText)(event.eventType).trim();
    const content = (0, core.asText)(event.content).trim();
    const hasAttachments = extractQQInboundAttachments(event).length > 0;
    if (!content && !hasAttachments) {
        return { action: "skip", reason: "empty_content" };
    }
    if (scene === "c2c" && !config.c2cEnabled) {
        return { action: "skip", reason: "c2c_disabled" };
    }
    if (scene === "group" && !config.groupEnabled) {
        return { action: "skip", reason: "group_disabled" };
    }
    // Epic G1：群消息分流——at_only 模式下普通群消息只进上下文缓存，不唤醒 AI
    // T039：全量模式下 @ 标记在 mentions 里，isGroupAtEventType 做兜底识别；
    //       keyword_or_at 模式下命中 groupKeywords 也视为触发。
    if (scene === "group") {
        const messageMode = (0, core.asText)(config.groupMessageMode).trim().toLowerCase() || "at_only";
        const botId = (0, core.asText)(serviceState && serviceState.botUserId).trim();
        if (messageMode === "at_only" && !isGroupAtEventType(eventType, event, botId)) {
            return { action: "context_only", reason: "group_message_not_at" };
        }
        if (messageMode === "keyword_or_at") {
            const isAt = isGroupAtEventType(eventType, event, botId);
            const hitKeyword = matchGroupKeyword(config.groupKeywords, content);
            if (!isAt && !hitKeyword) {
                return { action: "context_only", reason: "group_message_not_at_nor_keyword" };
            }
        }
    }
    if (scene !== "c2c" && scene !== "group") {
        return { action: "skip", reason: "unsupported_scene" };
    }
    const botUserId = (0, core.asText)(serviceState.botUserId).trim();
    const authorId = (0, core.asText)(event.authorId).trim();
    if (botUserId && authorId && botUserId === authorId) {
        return { action: "skip", reason: "bot_echo" };
    }
    if (!eventType) {
        return { action: "skip", reason: "missing_event_type" };
    }
    return { action: "process" };
}
async function processSingleEventAsync(config, event) {
    const eventKey = buildEventKey(event);
    if (!eventKey) {
        throw new Error("Unable to build event key for QQ auto reply");
    }
    const shouldStreamReplyToQQ = config.waifu === true;
    const flushSentences = Number(config.waifuFlushSentences) > 0 ? Number(config.waifuFlushSentences) : 3;
    const MAX_BUFFER_LENGTH = 400;
    let nextMsgSeq = 1;
    let streamedChunkCount = 0;
    let lastSendResult = null;
    let streamSendQueue = Promise.resolve();
    // T045 调试：记录每条分段的发送响应（含业务 code/message），定位静默丢失段
    const segmentSendResults = [];
    // G4：统一 Waifu chunker（与群聊完整文本分段共用同一状态机；`。！？\n` 计数、连续换行归一化、400 字符兜底）
    const chunker = new waifuChunker.WaifuChunker({
        flushSentences,
        maxLength: MAX_BUFFER_LENGTH
    });
    const enqueueSegment = (eventRef, text) => {
        const currentMsgSeq = nextMsgSeq;
        nextMsgSeq += 1;
        streamedChunkCount += 1;
        streamSendQueue = streamSendQueue.then(async () => {
            const segmentResult = await sendReplyToQQAsync(eventRef, text, currentMsgSeq);
            segmentSendResults.push({
                msgSeq: currentMsgSeq,
                scene: (0, core.asText)(segmentResult.scene),
                code: segmentResult.response ? segmentResult.response.code : null,
                message: (0, core.asText)(segmentResult.response && segmentResult.response.message),
                ok: Boolean(segmentResult.response && (segmentResult.response.id || segmentResult.response.msg_id)),
                responseId: (0, core.asText)(segmentResult.response && segmentResult.response.id)
            });
            lastSendResult = segmentResult;
        });
    };
    const generated = await generateAiReplyAsync(config, event, eventKey, shouldStreamReplyToQQ
        ? (streamEvent) => {
            if (!streamEvent || streamEvent.type !== "chunk") {
                return;
            }
            const chunkText = sanitizeAiReplyText((0, core.asText)(streamEvent.chunk));
            if (!chunkText) {
                return;
            }
            const segments = chunker.push(chunkText);
            for (let segIndex = 0; segIndex < segments.length; segIndex += 1) {
                enqueueSegment(event, segments[segIndex]);
            }
        }
        : undefined);
    if (shouldStreamReplyToQQ) {
        const remaining = chunker.finish();
        for (let segIndex = 0; segIndex < remaining.length; segIndex += 1) {
            enqueueSegment(event, remaining[segIndex]);
        }
    }
    await streamSendQueue;
    const aiResponse = typeof generated.aiResponse === "string" ? generated.aiResponse : "";
    const chatId = typeof generated.chatId === "string" ? generated.chatId : "";
    const sendResult = shouldStreamReplyToQQ && streamedChunkCount > 0
        ? (lastSendResult || {
            scene: (0, core.asText)(event.scene).trim().toLowerCase(),
            streamed: true,
            chunkCount: streamedChunkCount
        })
        : await sendReplyToQQAsync(event, aiResponse.trim(), nextMsgSeq);
    if (shouldStreamReplyToQQ && segmentSendResults.length > 0) {
        // T045 调试：暴露每条分段的发送结果（含业务 code），便于定位静默丢失段
        sendResult.segmentResults = segmentSendResults;
    }
    const records = await readAutoReplyRecordsAsync();
    records[eventKey] = {
        status: "replied",
        chatId,
        aiResponse,
        updatedAt: new Date().toISOString(),
        scene: (0, core.asText)(event.scene).trim(),
        messageId: (0, core.asText)(event.messageId).trim(),
        sentScene: (0, core.asText)(sendResult.scene)
    };
    await writeAutoReplyRecordsAsync(records);
    return {
        eventKey,
        chatId: chatId.trim(),
        replyPreview: aiResponse.trim().slice(0, 200),
        streamedChunkCount,
        sendResult
    };
}
async function processAutoReplyQueueOnceAsync(source) {
    const initialContext = await readActiveAutoReplyContextAsync();
    if (initialContext.disabledReason) {
        await stopAutoReplyLoopInternal("manual_stop");
        return {
            success: true,
            skipped: true,
            reason: initialContext.disabledReason,
            packageVersion: core.PACKAGE_VERSION
        };
    }
    await gateway.ensureGatewayStarted({ timeout_ms: 8000 });
    const activeContext = await readActiveAutoReplyContextAsync();
    if (activeContext.disabledReason) {
        await stopAutoReplyLoopInternal("manual_stop");
        return {
            success: true,
            skipped: true,
            reason: activeContext.disabledReason,
            packageVersion: core.PACKAGE_VERSION
        };
    }
    const serviceStatus = await gateway.getGatewayStatusInternal();
    const runtimeState = serviceStatus.runtime || serviceStatus;
    const queueResult = await gateway.queryGatewayEvents({
        limit: 100,
        consume: false,
        include_raw: true
    });
    const queue = Array.isArray(queueResult.events) ? queueResult.events : [];
    if (queue.length === 0) {
        const flushOutcome = await flushDueGroupBucketsAsync(activeContext.config);
        const flushItems = flushOutcome.flushed ? flushOutcome.results.map((item) => item.result) : [];
        await updateAutoReplyRuntimeAsync({
            running: autoReplyTimerId != null,
            status: "idle",
            lastPollAt: new Date().toISOString(),
            lastError: flushOutcome.flushed ? "" : (0, core.asText)(flushOutcome.error)
        });
        return {
            success: true,
            packageVersion: core.PACKAGE_VERSION,
            processedCount: flushItems.length,
            skippedCount: 0,
            processedItems: flushItems,
            skippedItems: [],
            queueRemainingCount: 0
        };
    }
    let processedCount = 0;
    let skippedCount = 0;
    const processedItems = [];
    const skippedItems = [];
    let queueRemainingCount = queue.length;
    const latestContext = await readActiveAutoReplyContextAsync();
    for (let index = 0; index < queue.length && processedCount < 1; index += 1) {
        if (latestContext.disabledReason) {
            await stopAutoReplyLoopInternal("manual_stop");
            return {
                success: true,
                skipped: true,
                reason: latestContext.disabledReason,
                packageVersion: core.PACKAGE_VERSION,
                processedCount,
                skippedCount,
                processedItems,
                skippedItems,
                queueRemainingCount
            };
        }
        const event = queue[index];
        const eventKey = buildEventKey(event);
        const decision = classifyEvent(latestContext.config, event, runtimeState);
        if (decision.action === "skip") {
            skippedCount += 1;
            skippedItems.push({
                eventKey,
                reason: decision.reason ?? ""
            });
            if (eventKey) {
                await gateway.removeGatewayEvents([eventKey], 8000);
            }
            queueRemainingCount -= 1;
            continue;
        }
        // Epic G1：普通群消息（at_only 模式下非 @ 消息）→ 只进上下文环形缓存，不唤醒 AI；
        // 已缓存则从 Gateway 队列移除，避免队列膨胀；缓存供 agent 按需查询（G2）。
        if (decision.action === "context_only") {
            pushToGroupContextCache(latestContext.config, event);
            groupCacheStateDirty.dirty = true;
            skippedCount += 1;
            skippedItems.push({
                eventKey,
                reason: decision.reason ?? "context_only"
            });
            if (eventKey) {
                await gateway.removeGatewayEvents([eventKey], 8000);
            }
            queueRemainingCount -= 1;
            continue;
        }
        const eventScene = (0, core.asText)(event.scene).trim().toLowerCase();
        // 所有被处理的群消息都进上下文缓存（@ 消息作为 anchor，普通消息作为前后文），落盘边界见 V2-BLUEPRINT §12.1
        if (eventScene === "group") {
            pushToGroupContextCache(latestContext.config, event);
            groupCacheStateDirty.dirty = true;
        }
        const aggregateWindowMs = Number(latestContext.config.groupAggregateWindowMs) || 0;
        if (eventScene === "group" && aggregateWindowMs > 0) {
            const groupOpenId = (0, core.asText)(event.groupOpenId).trim();
            if (groupOpenId) {
                let bucket = groupPendingBuckets.get(groupOpenId);
                if (!bucket) {
                    bucket = { events: [], firstAt: Date.now(), lastAt: Date.now() };
                    groupPendingBuckets.set(groupOpenId, bucket);
                }
                const alreadyInBucket = bucket.events.some((existing) => buildEventKey(existing) === eventKey);
                if (!alreadyInBucket) {
                    bucket.events.push(event);
                    bucket.lastAt = Date.now();
                }
                queueRemainingCount -= 1;
                continue;
            }
        }
        let result = null;
        let processErrorText = "";
        try {
            result = await processSingleEventAsync(latestContext.config, event);
        }
        catch (error) {
            processErrorText = (0, core.safeErrorMessage)(error);
        }
        if (result) {
            processedCount += 1;
            processedItems.push(result);
            if (eventKey) {
                await gateway.removeGatewayEvents([eventKey], 8000);
            }
            await clearEventProcessFailCountAsync(eventKey);
            queueRemainingCount -= 1;
        }
        else {
            const failCount = await incrementEventProcessFailCountAsync(eventKey, processErrorText);
            if (failCount >= MAX_EVENT_PROCESS_FAIL_COUNT) {
                if (eventKey) {
                    await gateway.removeGatewayEvents([eventKey], 8000);
                }
                await markEventProcessFailedAsync(eventKey, processErrorText);
                skippedCount += 1;
                skippedItems.push({
                    eventKey,
                    reason: `failed_after_${failCount}_tries: ${processErrorText}`
                });
                queueRemainingCount -= 1;
            }
            else {
                skippedCount += 1;
                skippedItems.push({
                    eventKey,
                    reason: `retry_pending_${failCount}/${MAX_EVENT_PROCESS_FAIL_COUNT}: ${processErrorText}`
                });
            }
        }
    }
    const flushOutcome = await flushDueGroupBucketsAsync(latestContext.config);
    if (flushOutcome.flushed) {
        for (let index = 0; index < flushOutcome.results.length; index += 1) {
            const flushItem = flushOutcome.results[index];
            if (flushItem.flushed) {
                processedCount += 1;
                processedItems.push(flushItem.result);
            }
        }
    }
    const currentRuntime = await readAutoReplyRuntimeAsync();
    await updateAutoReplyRuntimeAsync({
        running: autoReplyTimerId != null,
        status: queueRemainingCount > 0 ? "running" : "idle",
        lastPollAt: new Date().toISOString(),
        lastError: "",
        processedCountTotal: Number(currentRuntime.processedCountTotal ?? 0) + processedCount,
        skippedCountTotal: Number(currentRuntime.skippedCountTotal ?? 0) + skippedCount,
        lastProcessedItems: processedItems,
        lastSkippedItems: skippedItems
    });
    return {
        success: true,
        packageVersion: core.PACKAGE_VERSION,
        processedCount,
        skippedCount,
        processedItems,
        skippedItems,
        queueRemainingCount
    };
}
async function stopAutoReplyLoopInternal(reason, errorText = "") {
    if (autoReplyTimerId != null) {
        clearInterval(autoReplyTimerId);
        autoReplyTimerId = null;
    }
    // Epic G1：停止前先把内存缓存落盘（保留"当天"数据供下次启动按恢复窗口过滤后恢复），再清内存
    try {
        await persistGroupRuntimeStateAsync();
    }
    catch (error) {
        console.warn(`[qqbot_auto_reply] persist before stop failed: ${(0, core.safeErrorMessage)(error)}`);
    }
    groupPendingBuckets.clear();
    groupContextCache.clear();
    groupCacheStateDirty.dirty = false;
    return await updateAutoReplyRuntimeAsync({
        running: false,
        status: reason === "manual_stop" ? "stopped" : "error",
        stoppedAt: new Date().toISOString(),
        stopReason: reason,
        lastError: errorText
    });
}
async function recordAutoReplyTickErrorAsync(errorText) {
    await updateAutoReplyRuntimeAsync({
        running: autoReplyTimerId != null,
        status: "error",
        lastPollAt: new Date().toISOString(),
        lastError: errorText
    });
}
async function tickAutoReplyLoopAsync(source) {
    if (autoReplyTickActive) {
        // T046：检测上一 tick 是否卡死（宿主调用 timeout 未生效等），卡死则强制恢复循环
        const stuckMs = lastTickStartedAt > 0 ? Date.now() - lastTickStartedAt : 0;
        if (stuckMs > TICK_STUCK_MS) {
            const message = `tick_stuck: previous tick hung ${Math.round(stuckMs / 1000)}s, forcibly reset`;
            console.warn(`[qqbot_auto_reply] ${message}`);
            tickGeneration += 1; // 作废旧 tick 代际：其 finally 不再清 active，避免与新 tick 并发
            autoReplyTickActive = false;
            await recordAutoReplyTickErrorAsync(message);
        } else {
            return;
        }
    }
    autoReplyTickActive = true;
    const myGeneration = tickGeneration;
    lastTickStartedAt = Date.now();
    try {
        await processAutoReplyQueueOnceAsync(source);
    }
    catch (error) {
        const message = (0, core.safeErrorMessage)(error);
        console.error(`[qqbot_auto_reply] ${message}`);
        await recordAutoReplyTickErrorAsync(message);
    }
    finally {
        // Epic G1：每轮结束把内存缓存/桶的变更落盘（dirty 时才写），保证重启可恢复"当天"数据
        try {
            await persistGroupRuntimeStateAsync();
        }
        catch (error) {
            console.warn(`[qqbot_auto_reply] persist after tick failed: ${(0, core.safeErrorMessage)(error)}`);
        }
        if (tickGeneration === myGeneration) {
            autoReplyTickActive = false;
        }
    }
}
async function ensureQQBotAutoReplyLoopStarted(source = "manual_start") {
    const context = await readActiveAutoReplyContextAsync();
    if (context.disabledReason === "listener_disabled") {
        await updateAutoReplyConfigAsync({
            enabled: false
        });
        await stopAutoReplyLoopInternal("manual_stop");
        return {
            success: true,
            skipped: true,
            reason: "listener_disabled",
            packageVersion: core.PACKAGE_VERSION,
            status: await buildAutoReplyStatusAsync()
        };
    }
    if (context.disabledReason === "disabled") {
        await stopAutoReplyLoopInternal("manual_stop");
        return {
            success: true,
            skipped: true,
            reason: "disabled",
            packageVersion: core.PACKAGE_VERSION,
            status: await buildAutoReplyStatusAsync()
        };
    }
    const config = context.config;
    if (autoReplyTimerId != null) {
        return {
            success: true,
            alreadyRunning: true,
            packageVersion: core.PACKAGE_VERSION,
            status: await buildAutoReplyStatusAsync()
        };
    }
    await gateway.ensureGatewayStarted({ timeout_ms: 8000 });
    // Epic G1：启动时从持久化状态恢复"当天"缓存/聚合桶（恢复窗口过滤，默认 24h）
    try {
        const restoreResult = await restoreGroupRuntimeStateAsync(config);
        if (restoreResult.restored) {
            console.log(`[qqbot_auto_reply] restored ${restoreResult.recoveredBucketCount} bucket(s), ${restoreResult.recoveredContextCount} context group(s), window=${restoreResult.recoveryMaxAgeMs}ms`);
        }
    }
    catch (error) {
        console.warn(`[qqbot_auto_reply] restore failed: ${(0, core.safeErrorMessage)(error)}`);
    }
    autoReplyTimerId = setInterval(() => {
        void tickAutoReplyLoopAsync("interval");
    }, config.pollIntervalMs);
    await updateAutoReplyRuntimeAsync({
        running: true,
        status: "running",
        startSource: source,
        startedAt: new Date().toISOString(),
        stoppedAt: "",
        stopReason: "",
        lastError: "",
        pollIntervalMs: config.pollIntervalMs
    });
    await tickAutoReplyLoopAsync(source);
    return {
        success: true,
        started: true,
        packageVersion: core.PACKAGE_VERSION,
        status: await buildAutoReplyStatusAsync()
    };
}
async function qqbot_auto_reply_configure(params = {}) {
    try {
        const before = await readAutoReplyConfigAsync();
        const patch = {};
        const configChanges = [];
        if ((0, core.hasOwn)(params, "enabled")) {
            patch.enabled = (0, core.parseOptionalBoolean)(params.enabled, "enabled") === true;
        }
        if ((0, core.hasOwn)(params, "poll_interval_ms")) {
            patch.pollIntervalMs = (0, core.parsePositiveInt)(params.poll_interval_ms, "poll_interval_ms", before.pollIntervalMs);
        }
        if ((0, core.hasOwn)(params, "ai_timeout_ms")) {
            patch.aiTimeoutMs = (0, core.parsePositiveInt)(params.ai_timeout_ms, "ai_timeout_ms", before.aiTimeoutMs);
        }
        if ((0, core.hasOwn)(params, "c2c_enabled")) {
            patch.c2cEnabled = (0, core.parseOptionalBoolean)(params.c2c_enabled, "c2c_enabled") === true;
        }
        if ((0, core.hasOwn)(params, "group_enabled")) {
            patch.groupEnabled = (0, core.parseOptionalBoolean)(params.group_enabled, "group_enabled") === true;
        }
        if ((0, core.hasOwn)(params, "waifu")) {
            patch.waifu = (0, core.parseOptionalBoolean)(params.waifu, "waifu") === true;
        }
        if ((0, core.hasOwn)(params, "chat_group")) {
            patch.chatGroup = (0, core.asText)(params.chat_group).trim();
        }
        if ((0, core.hasOwn)(params, "character_card_id")) {
            patch.characterCardId = (0, core.asText)(params.character_card_id).trim();
        }
        if ((0, core.hasOwn)(params, "assistant_instruction")) {
            patch.assistantInstruction = (0, core.asText)(params.assistant_instruction).trim();
        }
        if ((0, core.hasOwn)(params, "target_chat_id")) {
            patch.targetChatId = (0, core.asText)(params.target_chat_id).trim();
        }
        if ((0, core.hasOwn)(params, "waifu_flush_sentences")) {
            patch.waifuFlushSentences = (0, core.parsePositiveInt)(params.waifu_flush_sentences, "waifu_flush_sentences", before.waifuFlushSentences);
        }
        if ((0, core.hasOwn)(params, "group_aggregate_window_ms")) {
            patch.groupAggregateWindowMs = (0, core.parsePositiveInt)(params.group_aggregate_window_ms, "group_aggregate_window_ms", before.groupAggregateWindowMs);
        }
        if ((0, core.hasOwn)(params, "group_ai_timeout_ms")) {
            patch.groupAiTimeoutMs = (0, core.parsePositiveInt)(params.group_ai_timeout_ms, "group_ai_timeout_ms", before.groupAiTimeoutMs);
        }
        if ((0, core.hasOwn)(params, "group_waifu_flush_sentences")) {
            patch.groupWaifuFlushSentences = (0, core.parsePositiveInt)(params.group_waifu_flush_sentences, "group_waifu_flush_sentences", before.groupWaifuFlushSentences);
        }
        if ((0, core.hasOwn)(params, "proactive_c2c_openid")) {
            patch.proactiveC2cOpenId = (0, core.asText)(params.proactive_c2c_openid).trim();
        }
        if ((0, core.hasOwn)(params, "group_aggregate_max_items") && !(0, core.hasOwn)(params, "group_max_items")) {
            patch.groupMaxItems = (0, core.parsePositiveInt)(params.group_aggregate_max_items, "group_aggregate_max_items", before.groupMaxItems);
            configChanges.push("group_aggregate_max_items → groupMaxItems（旧语义“桶满提前 flush”已废弃）");
        }
        if ((0, core.hasOwn)(params, "group_max_items")) {
            patch.groupMaxItems = (0, core.parsePositiveInt)(params.group_max_items, "group_max_items", before.groupMaxItems);
        }
        if ((0, core.hasOwn)(params, "group_nickname_enabled")) {
            patch.groupNicknameEnabled = (0, core.parseOptionalBoolean)(params.group_nickname_enabled, "group_nickname_enabled") === true;
        }
        if ((0, core.hasOwn)(params, "c2c_fixed_bindings")) {
            patch.c2cFixedBindings = bridgeConfig.normalizeC2cFixedBindings(params.c2c_fixed_bindings);
        }
        // ---- 14:32 群窗口 / 上下文 / 容量新增参数 ----
        if ((0, core.hasOwn)(params, "group_message_mode")) {
            patch.groupMessageMode = (0, core.asText)(params.group_message_mode).trim().toLowerCase();
        }
        if ((0, core.hasOwn)(params, "group_keywords")) {
            patch.groupKeywords = bridgeConfig.normalizeGroupKeywords(params.group_keywords);
        }
        if ((0, core.hasOwn)(params, "group_member_bindings")) {
            patch.groupMemberBindings = bridgeConfig.normalizeGroupMemberBindings(params.group_member_bindings);
        }
        if ((0, core.hasOwn)(params, "group_context_mode")) {
            patch.groupContextMode = (0, core.asText)(params.group_context_mode).trim().toLowerCase();
        }
        if ((0, core.hasOwn)(params, "group_context_enabled")) {
            patch.groupContextEnabled = (0, core.parseOptionalBoolean)(params.group_context_enabled, "group_context_enabled") === true;
        }
        if ((0, core.hasOwn)(params, "group_context_before")) {
            patch.groupContextBefore = (0, core.parsePositiveInt)(params.group_context_before, "group_context_before", before.groupContextBefore);
        }
        if ((0, core.hasOwn)(params, "group_context_after")) {
            patch.groupContextAfter = (0, core.parsePositiveInt)(params.group_context_after, "group_context_after", before.groupContextAfter);
        }
        if ((0, core.hasOwn)(params, "group_context_limit")) {
            patch.groupContextLimit = (0, core.parsePositiveInt)(params.group_context_limit, "group_context_limit", before.groupContextLimit);
        }
        if ((0, core.hasOwn)(params, "group_global_cache_max_items")) {
            patch.groupGlobalCacheMaxItems = (0, core.parsePositiveInt)(params.group_global_cache_max_items, "group_global_cache_max_items", before.groupGlobalCacheMaxItems);
        }
        if ((0, core.hasOwn)(params, "group_flush_concurrency")) {
            patch.groupFlushConcurrency = (0, core.parsePositiveInt)(params.group_flush_concurrency, "group_flush_concurrency", before.groupFlushConcurrency);
        }
        if ((0, core.hasOwn)(params, "group_cache_recovery_max_age_ms")) {
            patch.groupCacheRecoveryMaxAgeMs = (0, core.parsePositiveInt)(params.group_cache_recovery_max_age_ms, "group_cache_recovery_max_age_ms", before.groupCacheRecoveryMaxAgeMs);
        }
        // Epic G1：显式关闭群聊开关时，清理群侧待处理状态（聚合桶 + 上下文缓存），Gateway 保持运行
        if ((0, core.hasOwn)(params, "group_enabled") && !(0, core.parseOptionalBoolean)(params.group_enabled, "group_enabled")) {
            clearGroupRuntimeState();
            await persistGroupRuntimeStateAsync();
        }
        let config = await updateAutoReplyConfigAsync(patch);
        const snapshot = await (0, state.readConfigSnapshotAsync)();
        const startNow = (0, core.parseOptionalBoolean)(params.start_now, "start_now") === true;
        if (!snapshot.listenerEnabled && config.enabled) {
            config = await updateAutoReplyConfigAsync({
                enabled: false
            });
        }
        if (!config.enabled) {
            await stopAutoReplyLoopInternal("manual_stop");
            await flushAutoReplyStateStoreAsync();
        }
        else if (autoReplyTimerId != null && config.pollIntervalMs !== before.pollIntervalMs) {
            await stopAutoReplyLoopInternal("restart");
            await flushAutoReplyStateStoreAsync();
            await ensureQQBotAutoReplyLoopStarted("qqbot_auto_reply_configure");
        }
        else if (startNow || autoReplyTimerId != null) {
            if (autoReplyTimerId == null) {
                await ensureQQBotAutoReplyLoopStarted("qqbot_auto_reply_configure");
            }
        }
        return {
            success: true,
            packageVersion: core.PACKAGE_VERSION,
            config,
            changes: configChanges,
            status: await buildAutoReplyStatusAsync()
        };
    }
    catch (error) {
        return {
            success: false,
            packageVersion: core.PACKAGE_VERSION,
            error: (0, core.safeErrorMessage)(error)
        };
    }
}
async function qqbot_auto_reply_status(params = {}) {
    try {
        const summaryOnly = (0, core.parseOptionalBoolean)(params.summary_only, "summary_only") === true;
        return await buildAutoReplyStatusAsync({
            includeBindings: !summaryOnly,
            includeRecords: !summaryOnly
        });
    }
    catch (error) {
        return {
            success: false,
            packageVersion: core.PACKAGE_VERSION,
            error: (0, core.safeErrorMessage)(error)
        };
    }
}
async function qqbot_auto_reply_start() {
    try {
        return await ensureQQBotAutoReplyLoopStarted("qqbot_auto_reply_start");
    }
    catch (error) {
        return {
            success: false,
            packageVersion: core.PACKAGE_VERSION,
            error: (0, core.safeErrorMessage)(error)
        };
    }
}
async function qqbot_auto_reply_stop() {
    try {
        await stopAutoReplyLoopInternal("manual_stop");
        await flushAutoReplyStateStoreAsync();
        return {
            success: true,
            packageVersion: core.PACKAGE_VERSION,
            status: await buildAutoReplyStatusAsync()
        };
    }
    catch (error) {
        return {
            success: false,
            packageVersion: core.PACKAGE_VERSION,
            error: (0, core.safeErrorMessage)(error)
        };
    }
}
async function qqbot_auto_reply_run_once() {
    try {
        return await processAutoReplyQueueOnceAsync("qqbot_auto_reply_run_once");
    }
    catch (error) {
        return {
            success: false,
            packageVersion: core.PACKAGE_VERSION,
            error: (0, core.safeErrorMessage)(error)
        };
    }
}

async function qqbot_pro_bridge_contacts(params = {}) {
    const revealOpenId = (0, core.parseOptionalBoolean)(params.reveal_openid, "reveal_openid") === true;
    const bindings = await readAutoReplyBindingsAsync();
    const items = Object.keys(bindings)
        .filter((key) => key.startsWith("c2c:"))
        .map((key) => {
            const openid = key.slice(4);
            return {
                ...(revealOpenId ? { openid } : { openidSuffix: openid.slice(-4) }),
                chatId: bindings[key]?.chatId ?? "",
                title: bindings[key]?.title ?? "",
                lastProcessedAt: bindings[key]?.lastProcessedAt ?? ""
            };
        });
    return { success: true, revealOpenId, contacts: items };
}

async function qqbot_pro_bridge_bind_c2c(params = {}) {
    const openid = (0, core.asText)(params.openid).trim();
    const chatId = (0, core.asText)(params.target_chat_id ?? params.chat_id).trim();
    if (!openid || !chatId) {
        throw new Error("openid and target_chat_id are required");
    }
    const config = await readAutoReplyConfigAsync();
    const fixed = bridgeConfig.normalizeC2cFixedBindings(config.c2cFixedBindings)
        .filter((item) => item.openid !== openid);
    const binding = {
        openid,
        chatId,
        title: (0, core.asText)(params.title).trim()
    };
    fixed.push(binding);
    await writeAutoReplyConfigAsync({ ...config, c2cFixedBindings: fixed });
    return { success: true, binding };
}

async function qqbot_pro_bridge_set_proactive_target(params = {}) {
    const openid = (0, core.asText)(params.openid).trim();
    const config = await updateAutoReplyConfigAsync({ proactiveC2cOpenId: openid });
    await (0, state.writeEnv)("QQBOT_PRO_TARGET_OPENIDS", openid);
    return { success: true, proactiveC2cOpenId: config.proactiveC2cOpenId };
}

async function qqbot_pro_bridge_list_image_folders() {
    return {
        success: true,
        folders: (0, core.readImageFolders)(),
        env: "QQBOT_PRO_IMAGE_FOLDERS"
    };
}

/**
 * Epic G2（核心）：按群查询持久化上下文缓存（agent_on_demand 数据源）。
 * 默认以最后一条缓存消息为 anchor，取前后各 groupContextBefore/After 条（默认各5），
 * 单次最多 groupContextLimit（默认20）；查询结果只发给模型、不落 Operit 对话（落盘边界见蓝图 §12.1）。
 */
/**
 * Epic G2 automatic：自动附带邻近上下文（群聚合时从持久化上下文缓存取锚点前后文，附加到用户消息）。
 * 数据源与 qqbot_pro_group_context 相同（groupContextCache），复用 G7 成员标签；
 * 只发给模型（随聚合 userMessage），不额外落盘；无缓存/无锚点 → 返回 null。
 */
function buildGroupNeighborContextAttachment(config, groupOpenId, anchorEventKey) {
    const gid = (0, core.asText)(groupOpenId).trim();
    if (!gid) {
        return null;
    }
    const entry = groupContextCache.get(gid);
    if (!entry || entry.events.length === 0) {
        return null;
    }
    const events = entry.events;
    let anchorIndex = events.length - 1;
    const anchorKey = (0, core.asText)(anchorEventKey).trim();
    if (anchorKey) {
        for (let index = 0; index < events.length; index += 1) {
            if (buildEventKey(events[index]) === anchorKey) {
                anchorIndex = index;
                break;
            }
        }
    }
    const limit = Math.min(Math.max(Number(config.groupContextLimit) || 20, 0), 20);
    const defaultBefore = Math.min(Math.max(Number(config.groupContextBefore) || 5, 0), limit);
    const defaultAfter = Math.min(Math.max(Number(config.groupContextAfter) || 5, 0), limit);
    const start = Math.max(0, anchorIndex - defaultBefore);
    const end = Math.min(events.length - 1, anchorIndex + defaultAfter);
    let selected = events.slice(start, end + 1);
    if (selected.length > limit) {
        selected = selected.slice(-limit);
    }
    if (selected.length === 0) {
        return null;
    }
    const lines = [
        `groupOpenId: ${gid}`,
        `anchorIndex: ${anchorIndex}`,
        `totalCached: ${events.length}`,
        "",
        "instruction: 以下为本批消息的邻近群聊上下文（自动附带，automatic 模式）。请参考发言风格与话题，但只回应最新触发的消息，不要重复回答旧内容。"
    ];
    for (let index = 0; index < selected.length; index += 1) {
        const ev = selected[index];
        const label = resolveMemberLabel(config, (0, core.firstNonBlank)((0, core.asText)(ev.userOpenId).trim(), (0, core.asText)(ev.authorId).trim()), gid);
        const content = (0, core.asText)(ev.content).trim();
        const isAt = isGroupAtEventType((0, core.asText)(ev.eventType));
        lines.push(`${index + 1}. [${label}]${isAt ? " (@)" : ""} ${content}`);
    }
    const body = lines.join("\n");
    return `<attachment id="GROUP_NEIGHBOR_CONTEXT:${gid}" filename="qq_group_neighbor_context.txt" type="text/plain" size="${body.length}">${escapeXml(body)}</attachment>`;
}

async function qqbot_pro_group_context(params = {}) {
    const groupOpenId = (0, core.asText)(params.group_openid).trim();
    if (!groupOpenId) {
        throw new Error("group_openid is required");
    }
    const config = await readAutoReplyConfigAsync();
    const entry = groupContextCache.get(groupOpenId);
    if (!entry || entry.events.length === 0) {
        return { success: true, groupOpenId, events: [], note: "no_cached_context" };
    }
    const events = entry.events;
    let anchorIndex = -1;
    const anchorKey = (0, core.firstNonBlank)((0, core.asText)(params.anchor_event_key).trim(), (0, core.asText)(params.anchor_msg_id).trim());
    if (anchorKey) {
        for (let index = 0; index < events.length; index += 1) {
            if (buildEventKey(events[index]) === anchorKey) {
                anchorIndex = index;
                break;
            }
        }
    }
    else if (params.anchor_index !== undefined && params.anchor_index !== null && params.anchor_index !== "") {
        anchorIndex = Number(params.anchor_index);
    }
    else {
        anchorIndex = events.length - 1;
    }
    if (!(anchorIndex >= 0 && anchorIndex < events.length)) {
        anchorIndex = events.length - 1;
    }
    const limit = Math.min(Math.max(Number(config.groupContextLimit) || 20, 0), 20);
    const defaultBefore = Math.min(Math.max(Number(config.groupContextBefore) || 5, 0), limit);
    const defaultAfter = Math.min(Math.max(Number(config.groupContextAfter) || 5, 0), limit);
    const before = params.before !== undefined && params.before !== null && params.before !== "" ? Math.min(Math.max(Number(params.before), 0), limit) : defaultBefore;
    const after = params.after !== undefined && params.after !== null && params.after !== "" ? Math.min(Math.max(Number(params.after), 0), limit) : defaultAfter;
    const start = Math.max(0, anchorIndex - before);
    const end = Math.min(events.length - 1, anchorIndex + after);
    let selected = events.slice(start, end + 1);
    if (selected.length > limit) {
        selected = selected.slice(-limit);
    }
    const items = selected.map((ev) => ({
        eventKey: buildEventKey(ev),
        eventType: (0, core.asText)(ev.eventType).trim(),
        isAtEvent: isGroupAtEventType((0, core.asText)(ev.eventType)),
        member: resolveMemberLabel(config, (0, core.firstNonBlank)((0, core.asText)(ev.userOpenId).trim(), (0, core.asText)(ev.authorId).trim()), (0, core.asText)(ev.groupOpenId).trim()),
        sentAt: (0, core.asText)(ev.timestamp).trim(),
        receivedAt: (0, core.asText)(ev.receivedAt).trim(),
        content: (0, core.asText)(ev.content).trim()
    }));
    return {
        success: true,
        groupOpenId,
        anchorIndex,
        before,
        after,
        limit,
        totalCached: events.length,
        events: items
    };
}

async function onQQBotAutoReplyApplicationCreate() {
    try {
        const snapshot = await (0, state.readConfigSnapshotAsync)();
        const config = await readAutoReplyConfigAsync();
        if (!snapshot.listenerEnabled) {
            if (config.enabled) {
                await updateAutoReplyConfigAsync({
                    enabled: false
                });
            }
            await stopAutoReplyLoopInternal("manual_stop");
            await gateway.stopGateway({ timeout_ms: 8000 });
        }
        else {
            try {
                await gateway.ensureGatewayStarted({ timeout_ms: 8000 });
            } catch (error) {
                console.warn(`[bridge_auto] gateway start skipped (allow_missing_config): ${core.safeErrorMessage(error)}`);
            }
        }
        if (snapshot.listenerEnabled && config.enabled) {
            await ensureQQBotAutoReplyLoopStarted("application_on_create");
        }
        return {
            ok: true,
            listenerEnabled: snapshot.listenerEnabled,
            enabled: snapshot.listenerEnabled && config.enabled
        };
    }
    catch (error) {
        return {
            ok: false,
            error: (0, core.safeErrorMessage)(error)
        };
    }
}
async function onQQBotAutoReplyApplicationForeground() {
    return await onQQBotAutoReplyApplicationCreate();
}
async function onQQBotAutoReplyApplicationTerminate() {
    try {
        await stopAutoReplyLoopInternal("application_terminate");
        await flushAutoReplyStateStoreAsync();
        return { ok: true };
    }
    catch (error) {
        return {
            ok: false,
            error: (0, core.safeErrorMessage)(error)
        };
    }
}
exports.qqbot_pro_bridge_contacts = qqbot_pro_bridge_contacts;
exports.qqbot_pro_bridge_bind_c2c = qqbot_pro_bridge_bind_c2c;
exports.qqbot_pro_bridge_set_proactive_target = qqbot_pro_bridge_set_proactive_target;
exports.qqbot_pro_bridge_list_image_folders = qqbot_pro_bridge_list_image_folders;
exports.qqbot_pro_group_context = qqbot_pro_group_context;