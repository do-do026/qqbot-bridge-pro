const core = require("./core.js");
const state = require("./bridge_state.js");
const gateway = require("../packages/qqbot_pro_gateway.js");
"use strict";
module.exports = {
    ensureQQBotAutoReplyLoopStarted,
    qqbot_pro_bridge_configure: qqbot_auto_reply_configure,
    qqbot_pro_bridge_status: qqbot_auto_reply_status,
    qqbot_pro_bridge_start: qqbot_auto_reply_start,
    qqbot_pro_bridge_stop: qqbot_auto_reply_stop,
    qqbot_pro_bridge_run_once: qqbot_auto_reply_run_once,
    onQQBotAutoReplyApplicationCreate,
    onQQBotAutoReplyApplicationForeground,
    onQQBotAutoReplyApplicationTerminate
};
const WaifuMessageProcessor = Java.com.ai.assistance.operit.util.WaifuMessageProcessor;
const DEFAULT_ASSISTANT_INSTRUCTION = "";
const MAX_EVENT_PROCESS_FAIL_COUNT = 3;
const DEFAULT_AUTO_REPLY_CONFIG = {
    enabled: false,
    pollIntervalMs: 3000,
    aiTimeoutMs: 180000,
    c2cEnabled: true,
    groupEnabled: true,
    waifu: true,
    chatGroup: "QQ Bot",
    characterCardId: "",
    assistantInstruction: DEFAULT_ASSISTANT_INSTRUCTION,
    targetChatId: "",
    waifuFlushSentences: 3,
    groupAggregateWindowMs: 25000,
    groupAggregateMaxItems: 10,
    groupNicknameEnabled: true
};
let autoReplyTimerId = null;
let autoReplyTickActive = false;
const groupPendingBuckets = new Map();
const groupNicknameCache = new Map();
const GROUP_NICKNAME_TTL_MS = 3600000;
function normalizeAutoReplyConfig(raw) {
    const next = {
        ...DEFAULT_AUTO_REPLY_CONFIG
    };
    if ((0, core.hasOwn)(raw, "enabled")) {
        next.enabled = (0, core.toBoolean)(raw.enabled, DEFAULT_AUTO_REPLY_CONFIG.enabled);
    }
    if ((0, core.hasOwn)(raw, "pollIntervalMs")) {
        next.pollIntervalMs = (0, core.parsePositiveInt)(raw.pollIntervalMs, "pollIntervalMs", DEFAULT_AUTO_REPLY_CONFIG.pollIntervalMs);
    }
    if ((0, core.hasOwn)(raw, "aiTimeoutMs")) {
        next.aiTimeoutMs = (0, core.parsePositiveInt)(raw.aiTimeoutMs, "aiTimeoutMs", DEFAULT_AUTO_REPLY_CONFIG.aiTimeoutMs);
    }
    const c2cEnabled = (0, core.parseOptionalBoolean)(raw.c2cEnabled, "c2cEnabled");
    if (c2cEnabled !== undefined) {
        next.c2cEnabled = c2cEnabled;
    }
    const groupEnabled = (0, core.parseOptionalBoolean)(raw.groupEnabled, "groupEnabled");
    if (groupEnabled !== undefined) {
        next.groupEnabled = groupEnabled;
    }
    const waifu = (0, core.parseOptionalBoolean)(raw.waifu, "waifu");
    if (waifu !== undefined) {
        next.waifu = waifu;
    }
    if ((0, core.hasOwn)(raw, "chatGroup")) {
        next.chatGroup = (0, core.firstNonBlank)((0, core.asText)(raw.chatGroup), DEFAULT_AUTO_REPLY_CONFIG.chatGroup);
    }
    if ((0, core.hasOwn)(raw, "characterCardId")) {
        next.characterCardId = (0, core.asText)(raw.characterCardId).trim();
    }
    if ((0, core.hasOwn)(raw, "assistantInstruction")) {
        next.assistantInstruction = (0, core.asText)(raw.assistantInstruction).trim();
    }
    if ((0, core.hasOwn)(raw, "targetChatId")) {
        next.targetChatId = (0, core.asText)(raw.targetChatId).trim();
    }
    if (!next.targetChatId && typeof getEnv === "function") {
        const envTarget = (0, core.asText)(getEnv("QQBOT_TARGET_CHAT_ID") || "").trim();
        if (envTarget) {
            next.targetChatId = envTarget;
        }
    }
    if ((0, core.hasOwn)(raw, "waifuFlushSentences")) {
        next.waifuFlushSentences = (0, core.parsePositiveInt)(raw.waifuFlushSentences, "waifuFlushSentences", DEFAULT_AUTO_REPLY_CONFIG.waifuFlushSentences);
    }
    if ((0, core.hasOwn)(raw, "groupAggregateWindowMs")) {
        next.groupAggregateWindowMs = (0, core.parsePositiveInt)(raw.groupAggregateWindowMs, "groupAggregateWindowMs", DEFAULT_AUTO_REPLY_CONFIG.groupAggregateWindowMs);
    }
    if ((0, core.hasOwn)(raw, "groupAggregateMaxItems")) {
        next.groupAggregateMaxItems = (0, core.parsePositiveInt)(raw.groupAggregateMaxItems, "groupAggregateMaxItems", DEFAULT_AUTO_REPLY_CONFIG.groupAggregateMaxItems);
    }
    const groupNicknameEnabled = (0, core.parseOptionalBoolean)(raw.groupNicknameEnabled, "groupNicknameEnabled");
    if (groupNicknameEnabled !== undefined) {
        next.groupNicknameEnabled = groupNicknameEnabled;
    }
    return next;
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
        autoReply: {
            enabled: normalized.enabled,
            pollIntervalMs: normalized.pollIntervalMs,
            aiTimeoutMs: normalized.aiTimeoutMs,
            c2cEnabled: normalized.c2cEnabled,
            groupEnabled: normalized.groupEnabled,
            waifu: normalized.waifu,
            chatGroup: normalized.chatGroup,
            characterCardId: normalized.characterCardId,
            assistantInstruction: normalized.assistantInstruction,
            targetChatId: normalized.targetChatId,
            waifuFlushSentences: normalized.waifuFlushSentences,
            groupAggregateWindowMs: normalized.groupAggregateWindowMs,
            groupAggregateMaxItems: normalized.groupAggregateMaxItems,
            groupNicknameEnabled: normalized.groupNicknameEnabled
        }
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
        const updatedAt = Number(value?.updatedAt ?? 0);
        return { key, value, updatedAt };
    });
    items.sort((left, right) => right.updatedAt - left.updatedAt);
    const next = {};
    items.slice(0, 200).forEach((item) => {
        next[item.key] = item.value;
    });
    return next;
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
    const fixedTargetChatId = (0, core.firstNonBlank)((0, core.asText)(config.targetChatId).trim());
    if (fixedTargetChatId) {
        const findFixed = await Tools.Chat.findChat({
            query: fixedTargetChatId,
            match: "exact",
            index: 0
        });
        if ((findFixed.chat?.id ?? "") === fixedTargetChatId) {
            return fixedTargetChatId;
        }
        throw new Error(`QQ auto reply target chat not found: ${fixedTargetChatId}`);
    }
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
    const MAX_EMPTY_RETRIES = 3;
    let aiResponse = "";
    let sendResult = null;
    for (let attempt = 1; attempt <= MAX_EMPTY_RETRIES; attempt += 1) {
        sendResult = await Tools.Chat.sendMessageStreaming(userMessage, chatId, config.characterCardId || undefined, undefined, {
            waifu: config.waifu,
            persist_turn: true,
            notify_reply: false,
            hide_user_message: false,
            disable_warning: true,
            timeout_ms: config.aiTimeoutMs,
            onIntermediateResult
        });
        aiResponse = sanitizeAiReplyText((sendResult.aiResponse ?? "").trim());
        if (aiResponse) {
            break;
        }
        if (attempt < MAX_EMPTY_RETRIES) {
            await Tools.System.sleep(attempt * 5000);
        }
    }
    if (!aiResponse) {
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
        let label = "";
        if (config.groupNicknameEnabled && memberOpenId && (0, core.asText)(event.groupOpenId).trim()) {
            const nickname = await resolveGroupNicknameAsync(snapshot, (0, core.asText)(event.groupOpenId).trim(), memberOpenId);
            label = nickname || `QQ${shortOpenId(memberOpenId)}`;
        }
        else {
            label = `QQ${shortOpenId(memberOpenId)}`;
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
    const content = contentLines.join("\n");
    const attachmentId = `GROUP_AGGREGATE:${(0, core.asText)(aggregateEvent.groupOpenId).trim()}`;
    return `<attachment id="${escapeXml(attachmentId)}" filename="qq_group_aggregate_context.txt" type="text/plain" size="${content.length}">${escapeXml(content)}</attachment>`;
}
async function flushGroupBucketAsync(config, groupOpenId, bucket) {
    const events = bucket.events;
    const snapshot = await (0, state.requireConfiguredSnapshotAsync)();
    const aggregateText = await buildGroupAggregateMessageAsync(config, snapshot, events);
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
    const userMessage = [aggregateText, buildGroupAggregateContextAttachment(config, aggregateEvent, events.length)].join(" ");
    const generated = await generateAiReplyAsync(config, aggregateEvent, aggregateEventKey, undefined, { userMessage });
    const aiResponse = (0, core.asText)(generated.aiResponse).trim();
    await sendReplyToQQAsync(lastEvent, aiResponse, 1);
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
    const maxItems = Math.max(Number(config.groupAggregateMaxItems) || 1, 1);
    const entries = Array.from(groupPendingBuckets.entries());
    for (let index = 0; index < entries.length; index += 1) {
        const [gid, bucket] = entries[index];
        const due = bucket.events.length >= maxItems || (windowMs > 0 && now - bucket.firstAt >= windowMs);
        if (!due || bucket.events.length === 0) {
            continue;
        }
        groupPendingBuckets.delete(gid);
        try {
            const flushResult = await flushGroupBucketAsync(config, gid, bucket);
            return { flushed: true, result: flushResult };
        }
        catch (error) {
            const errorText = (0, core.safeErrorMessage)(error);
            const removedKeys = [];
            for (let eventIndex = 0; eventIndex < bucket.events.length; eventIndex += 1) {
                const eventKey = buildEventKey(bucket.events[eventIndex]);
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
            return { flushed: false, error: errorText };
        }
    }
    return { flushed: false };
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
    let pendingBuffer = "";
    let pendingSentenceCount = 0;
    const SENTENCE_END_REGEX = /[。！？!?…\n]/g;
    const flushPendingBuffer = (eventRef, isFinal) => {
        const text = pendingBuffer.trim();
        pendingBuffer = "";
        pendingSentenceCount = 0;
        if (!text) {
            return;
        }
        const currentMsgSeq = nextMsgSeq;
        nextMsgSeq += 1;
        streamedChunkCount += 1;
        streamSendQueue = streamSendQueue.then(async () => {
            lastSendResult = await sendReplyToQQAsync(eventRef, text, currentMsgSeq);
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
            pendingBuffer += chunkText;
            const matches = chunkText.match(SENTENCE_END_REGEX);
            if (matches) {
                pendingSentenceCount += matches.length;
            }
            if (pendingSentenceCount >= flushSentences || pendingBuffer.length >= MAX_BUFFER_LENGTH) {
                flushPendingBuffer(event, false);
            }
        }
        : undefined);
    if (shouldStreamReplyToQQ && pendingBuffer.trim()) {
        flushPendingBuffer(event, true);
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
        const flushItems = flushOutcome.flushed ? [flushOutcome.result] : [];
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
    for (let index = 0; index < queue.length && processedCount < 1; index += 1) {
        const latestContext = await readActiveAutoReplyContextAsync();
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
        const eventScene = (0, core.asText)(event.scene).trim().toLowerCase();
        const aggregateWindowMs = (0, core.parsePositiveInt)(latestContext.config.groupAggregateWindowMs, "groupAggregateWindowMs", 0);
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
        processedCount += 1;
        processedItems.push(flushOutcome.result);
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
        return;
    }
    autoReplyTickActive = true;
    try {
        await processAutoReplyQueueOnceAsync(source);
    }
    catch (error) {
        const message = (0, core.safeErrorMessage)(error);
        console.error(`[qqbot_auto_reply] ${message}`);
        await recordAutoReplyTickErrorAsync(message);
    }
    finally {
        autoReplyTickActive = false;
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
        if ((0, core.hasOwn)(params, "group_aggregate_max_items")) {
            patch.groupAggregateMaxItems = (0, core.parsePositiveInt)(params.group_aggregate_max_items, "group_aggregate_max_items", before.groupAggregateMaxItems);
        }
        if ((0, core.hasOwn)(params, "group_nickname_enabled")) {
            patch.groupNicknameEnabled = (0, core.parseOptionalBoolean)(params.group_nickname_enabled, "group_nickname_enabled") === true;
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