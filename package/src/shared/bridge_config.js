/*
 * qqbot-bridge-pro 唯一配置模型（Epic G0）
 * ---------------------------------------------------------------
 * 目标：建立唯一配置 schema 与字段表，消灭散落在 bridge_auto.js
 *       里的 God Object 配置堆，统一 持久化config > env回退 > defaults 的优先级。
 *
 * 铁律（V2-BLUEPRINT §12.6 Epic G0）：
 *   1. UI 与 Agent 工具都必须通过本模块（或桥接入口）读写配置，
 *      禁止直接写 config.json。
 *   2. 所有数值字段做范围校验 + clamp，不静默接受越界值。
 *   3. 旧字段 groupAggregateMaxItems（桶满提前 flush）语义废弃，
 *      迁移为 groupMaxItems（单群安全保留上限），并提供迁移记录。
 *
 * 配置存储位置（由 bridge_state.js 管理）：
 *   {configDir}/config.json  →  { useSandbox, listenerEnabled, autoReply: {...} }
 *   本模块只负责 autoReply 子树的字段定义与归一化。
 */
"use strict";
const core = require("./core.js");

const BRIDGE_SCHEMA_VERSION = 2;

/**
 * 字段定义表：唯一 schema。
 * type: boolean | int | string | enum | array
 * env:  环境变量名（config 未显式提供时作为初始化/回退来源）
 * min/max: int 与 enum 的边界；int 越界 clamp，enum 非法值报错。
 */
const FIELD_DEFS = {
    // ---- 基础开关 ----
    enabled: {
        type: "boolean",
        default: true,
        env: "QQBOT_PRO_AUTO_REPLY",
        desc: "自动回复桥总开关"
    },
    c2cEnabled: {
        type: "boolean",
        default: true,
        desc: "C2C 消息是否送给 AI（只影响送 AI，Gateway 照常接收）"
    },
    groupEnabled: {
        type: "boolean",
        default: true,
        desc: "群消息是否送给 AI（只影响送 AI，Gateway 照常接收）"
    },
    waifu: {
        type: "boolean",
        default: true,
        desc: "Waifu 流式切分开关"
    },
    groupNicknameEnabled: {
        type: "boolean",
        default: false,
        desc: "群昵称查询（默认关闭；关闭或失败时使用 QQ+openid 后四位）"
    },

    // ---- 数值 ----
    pollIntervalMs: {
        type: "int",
        default: 3000,
        min: 500,
        max: 60000,
        desc: "轮询 QQ 消息队列间隔（毫秒）"
    },
    aiTimeoutMs: {
        type: "int",
        default: 180000,
        min: 1000,
        max: 600000,
        desc: "等待 Operit AI 回复超时（毫秒）"
    },
    waifuFlushSentences: {
        type: "int",
        default: 3,
        min: 1,
        max: 20,
        env: "QQBOT_PRO_WAIFU_FLUSH",
        desc: "单聊 Waifu 切分数（句末符 `。！？\\n` 计数）"
    },
    groupWaifuFlushSentences: {
        type: "int",
        default: 5,
        min: 1,
        max: 20,
        desc: "群聊 Waifu 切分数"
    },

    // ---- 文本 ----
    chatGroup: {
        type: "string",
        default: "QQ Bot",
        desc: "新建 Operit 对话的分组名"
    },
    characterCardId: {
        type: "string",
        default: "",
        env: "QQBOT_PRO_CHARACTER_CARD",
        desc: "桥接会话角色卡 ID"
    },
    assistantInstruction: {
        type: "string",
        default: "",
        desc: "注入给 AI 的额外指令"
    },
    targetChatId: {
        type: "string",
        default: "",
        env: "QQBOT_TARGET_CHAT_ID",
        desc: "已废弃（2026-08-07）：群聊固定目标语义移除，群消息一律按 group_openid 新建/复用对话；字段仅保留兼容读取旧配置"
    },
    proactiveC2cOpenId: {
        type: "string",
        default: "",
        env: "QQBOT_PRO_TARGET_OPENIDS",
        desc: "唯一 C2C 主动发送目标 openid"
    },

    // ---- 数组 ----
    c2cFixedBindings: {
        type: "array",
        default: [],
        desc: "C2C openid → 指定 Operit 对话的固定绑定"
    },

    // ---- 14:32 群窗口 / 上下文 / 容量（新增） ----
    groupAiTimeoutMs: {
        type: "int",
        default: 120000,
        min: 1000,
        max: 3600000,
        env: "QQBOT_PRO_GROUP_AI_TIMEOUT_MS",
        desc: "群聚合调用 AI 的生成超时（毫秒），默认 120000。超时后进入降级决策：AI 已有可发送内容且原消息仍在被动回复时效内 → 按 replyTo 被动回复；锚点过期 → 按 fallbackPreference 主动群消息点名发送，或放弃发送并本地记录原因。"
    },
    groupAggregateWindowMs: {
        type: "int",
        default: 60000,
        min: 0,
        max: 3600000,
        env: "QQBOT_PRO_GROUP_AGGREGATE_WINDOW_MS",
        desc: "每群首条有效 @ 起算的聚合窗口（毫秒）；0 = 不聚合、事件直接处理"
    },
    groupMessageMode: {
        type: "enum",
        default: "at_only",
        values: ["at_only", "keyword_or_at", "all"],
        env: "QQBOT_PRO_GROUP_MESSAGE_MODE",
        desc: "群消息桥接模式：at_only = 只让 @Bot 消息触发 AI；keyword_or_at = @Bot 或命中 groupKeywords 关键词触发；all = 全部群消息触发"
    },
    groupKeywords: {
        type: "array",
        default: [],
        env: "QQBOT_PRO_GROUP_KEYWORDS",
        desc: "群关键词列表：keyword_or_at 模式下普通群消息命中任一关键词即视为触发（匹配 content 子串，不区分大小写）"
    },
    groupMemberBindings: {
        type: "array",
        default: [],
        env: "QQBOT_PRO_GROUP_MEMBER_BINDINGS",
        desc: "群成员身份绑定（G7）：[{memberOpenid, groupOpenid?, title}]；聚合/查询上下文中该成员的标签显示为 title，未绑定显示 QQ+后四位"
    },
    groupContextMode: {
        type: "enum",
        default: "off",
        values: ["off", "automatic", "agent_on_demand"],
        env: "QQBOT_PRO_GROUP_CONTEXT_MODE",
        desc: "邻近上下文三态：off 关闭；automatic 自动附带；agent_on_demand 仅 AI 调用查询工具时返回"
    },
    groupContextEnabled: {
        type: "boolean",
        default: false,
        env: "QQBOT_PRO_GROUP_CONTEXT_ENABLED",
        desc: "上下文快捷总开关（与 groupContextMode 联动：false 强制 off，true 且 off 时提升 automatic）"
    },
    groupContextBefore: {
        type: "int",
        default: 5,
        min: 0,
        max: 20,
        env: "QQBOT_PRO_GROUP_CONTEXT_LIMIT",
        desc: "每条 @ 消息向前取几条普通群消息（统一 env 可同时作用于 before/after）"
    },
    groupContextAfter: {
        type: "int",
        default: 5,
        min: 0,
        max: 20,
        env: "QQBOT_PRO_GROUP_CONTEXT_LIMIT",
        desc: "每条 @ 消息向后取几条（窗口结束时取，不能伪造后文）"
    },
    groupContextLimit: {
        type: "int",
        default: 20,
        min: 0,
        max: 20,
        desc: "单次交给 AI 的邻近上下文最大条数（任何输入都 clamp 到 0～20）"
    },
    groupMaxItems: {
        type: "int",
        default: 30,
        min: 1,
        max: 200,
        env: "QQBOT_PRO_GROUP_MAX_ITEMS",
        desc: "单群聚合安全保留上限；超过后不提前 flush，只保留最新 N 条并记录 overflow"
    },
    groupGlobalCacheMaxItems: {
        type: "int",
        default: 100,
        min: 1,
        max: 1000,
        env: "QQBOT_PRO_GROUP_GLOBAL_CACHE_MAX_ITEMS",
        desc: "全局群上下文缓存最新保留上限；跨群按时间淘汰最旧项"
    },
    groupFlushConcurrency: {
        type: "int",
        default: 3,
        min: 1,
        max: 8,
        env: "QQBOT_PRO_GROUP_FLUSH_CONCURRENCY",
        desc: "同时 flush 到期群的最大并发数（clamp 到 1～8）"
    },
    groupCacheRecoveryMaxAgeMs: {
        type: "int",
        default: 86400000,
        min: 0,
        max: 604800000,
        env: "QQBOT_PRO_GROUP_CACHE_RECOVERY_MAX_AGE_MS",
        desc: "上下文缓存/聚合桶持久化恢复窗口（毫秒），默认 86400000 = 24h；超过该时间的旧缓存恢复时直接丢弃；0 = 不恢复任何旧缓存"
    }
};

/** 旧字段迁移规则表：legacyKey → { targetKey, describe(value) } */
const LEGACY_MIGRATIONS = [
    {
        legacyKey: "groupAggregateMaxItems",
        targetKey: "groupMaxItems",
        describe: (value) => `groupAggregateMaxItems=${value} → groupMaxItems=${value}（语义变更：桶满提前 flush → 单群安全保留上限）`
    }
];
/**
 * 归一化群关键词：支持数组、JSON 字符串、逗号/顿号分隔字符串 → string[]。
 */
function normalizeGroupKeywords(raw) {
    let items = [];
    if (Array.isArray(raw)) {
        items = raw;
    }
    else if (typeof raw === "string" && core.asText(raw).trim()) {
        const text = core.asText(raw).trim();
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
                items = parsed;
            }
        }
        catch (_error) {
            // 非 JSON：按逗号/顿号/换行分隔
            items = text.split(/[,，、\n]+/);
        }
    }
    const result = [];
    const seen = new Set();
    for (let index = 0; index < items.length; index += 1) {
        const keyword = core.asText(items[index]).trim();
        if (keyword && !seen.has(keyword)) {
            seen.add(keyword);
            result.push(keyword);
        }
    }
    return result;
}

/**
 * 归一化群成员绑定（G7）：支持数组、JSON 字符串 → [{memberOpenid, groupOpenid?, title}]。
 * memberOpenid 唯一（同 openid 重复保留最后一条）。
 */
function normalizeGroupMemberBindings(raw) {
    let items = [];
    if (Array.isArray(raw)) {
        items = raw;
    }
    else if (typeof raw === "string" && core.asText(raw).trim()) {
        try {
            const parsed = JSON.parse(core.asText(raw));
            if (Array.isArray(parsed)) {
                items = parsed;
            }
        }
        catch (_error) { }
    }
    const result = [];
    const seen = new Set();
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (!core.isObject(item)) {
            continue;
        }
        const memberOpenid = core.asText(item.memberOpenid || item.member_openid).trim();
        const title = core.asText(item.title).trim();
        if (!memberOpenid || !title || seen.has(memberOpenid)) {
            continue;
        }
        seen.add(memberOpenid);
        result.push({
            memberOpenid,
            groupOpenid: core.asText(item.groupOpenid || item.group_openid).trim(),
            title
        });
    }
    return result;
}

function normalizeC2cFixedBindings(raw) {
    let items = [];
    if (Array.isArray(raw)) {
        items = raw;
    }
    else if (typeof raw === "string" && core.asText(raw).trim()) {
        try {
            const parsed = JSON.parse(core.asText(raw));
            if (Array.isArray(parsed)) {
                items = parsed;
            }
        }
        catch (_error) { }
    }
    const result = [];
    const seen = new Set();
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (!core.isObject(item)) {
            continue;
        }
        const openid = core.asText(item.openid).trim();
        const chatId = core.asText(item.chatId).trim();
        if (!openid || !chatId || seen.has(openid)) {
            continue;
        }
        seen.add(openid);
        result.push({
            openid,
            chatId,
            title: core.asText(item.title).trim()
        });
    }
    return result;
}

function parseFieldValue(fieldName, rawValue, fieldDef) {
    const type = fieldDef.type;
    if (type === "boolean") {
        return core.parseOptionalBoolean(rawValue, fieldName) === true;
    }
    if (type === "int") {
        const parsed = Number(core.asText(rawValue).trim());
        if (!Number.isInteger(parsed)) {
            throw new Error(`Invalid ${fieldName}: expected integer`);
        }
        return Math.min(fieldDef.max, Math.max(fieldDef.min, parsed));
    }
    if (type === "enum") {
        const text = core.asText(rawValue).trim().toLowerCase();
        if (!fieldDef.values.includes(text)) {
            throw new Error(`Invalid ${fieldName}: expected one of ${fieldDef.values.join("|")}`);
        }
        return text;
    }
    if (type === "string") {
        return core.asText(rawValue).trim();
    }
    if (type === "array") {
        if (fieldName === "groupKeywords") {
            return normalizeGroupKeywords(rawValue);
        }
        if (fieldName === "groupMemberBindings") {
            return normalizeGroupMemberBindings(rawValue);
        }
        return rawValue;
    }
    return rawValue;
}

function applyEnvFallback(fieldName, fieldDef) {
    if (!fieldDef.env) {
        return undefined;
    }
    const envValue = core.readEnv(fieldDef.env);
    if (!envValue) {
        return undefined;
    }
    if (fieldDef.type === "int") {
        return Math.min(fieldDef.max, Math.max(fieldDef.min, Number(envValue)));
    }
    if (fieldDef.type === "enum") {
        const text = envValue.trim().toLowerCase();
        return fieldDef.values.includes(text) ? text : undefined;
    }
    if (fieldDef.type === "boolean") {
        return core.toBoolean(envValue, false);
    }
    if (fieldDef.type === "array" && fieldName === "groupKeywords") {
        return normalizeGroupKeywords(envValue);
    }
    if (fieldDef.type === "array" && fieldName === "groupMemberBindings") {
        return normalizeGroupMemberBindings(envValue);
    }
    return envValue.trim();
}

/**
 * 归一化桥接配置：持久化 config > env 回退 > defaults。
 * @param {object} raw 持久化 config.json 的 autoReply 子树（或 {}）
 * @param {object} [options] { skipEnv: boolean } 调试用，跳过 env 回退
 * @returns {{ config: object, changes: string[] }} changes 含迁移/联动说明
 */
function normalizeBridgeConfig(raw, options = {}) {
    const source = core.isObject(raw) ? raw : {};
    const changes = [];

    // 1) 旧字段迁移
    let migratedSource = source;
    for (let index = 0; index < LEGACY_MIGRATIONS.length; index += 1) {
        const rule = LEGACY_MIGRATIONS[index];
        if (core.hasOwn(source, rule.legacyKey) && !core.hasOwn(source, rule.targetKey)) {
            const legacyValue = Number(core.asText(source[rule.legacyKey]).trim());
            if (Number.isInteger(legacyValue) && legacyValue > 0) {
                migratedSource = {
                    ...migratedSource,
                    [rule.targetKey]: legacyValue
                };
                changes.push(rule.describe(legacyValue));
            }
        }
    }

    // 2) 逐字段归一化
    const next = {};
    const fieldNames = Object.keys(FIELD_DEFS);
    for (let index = 0; index < fieldNames.length; index += 1) {
        const fieldName = fieldNames[index];
        const fieldDef = FIELD_DEFS[fieldName];
        if (core.hasOwn(migratedSource, fieldName)) {
            if (fieldName === "c2cFixedBindings") {
                next[fieldName] = normalizeC2cFixedBindings(migratedSource[fieldName]);
            }
            else {
                next[fieldName] = parseFieldValue(fieldName, migratedSource[fieldName], fieldDef);
            }
        }
        else if (!options.skipEnv) {
            const envValue = applyEnvFallback(fieldName, fieldDef);
            if (envValue !== undefined) {
                next[fieldName] = envValue;
            }
            else {
                next[fieldName] = fieldDef.default;
            }
        }
        else {
            next[fieldName] = fieldDef.default;
        }
    }

    // 3) 联动规则
    //    groupContextEnabled 与 groupContextMode 保持一致：
    //    enabled=false 强制 off；enabled=true 且 mode=off 时提升 automatic；mode 显式非 off 时 enabled=true。
    const modeWasExplicit = core.hasOwn(migratedSource, "groupContextMode");
    const enabledWasExplicit = core.hasOwn(migratedSource, "groupContextEnabled");
    if (enabledWasExplicit && !next.groupContextEnabled) {
        next.groupContextMode = "off";
    }
    else if (enabledWasExplicit && next.groupContextEnabled && next.groupContextMode === "off") {
        next.groupContextMode = "automatic";
        changes.push("groupContextEnabled=true 且 mode=off → 提升为 automatic");
    }
    if (modeWasExplicit && next.groupContextMode !== "off") {
        next.groupContextEnabled = true;
    }
    else if (modeWasExplicit && next.groupContextMode === "off") {
        next.groupContextEnabled = false;
    }

    // 4) groupContextBefore/After 统一 env（QQBOT_PRO_GROUP_CONTEXT_LIMIT）只在两者都未显式设置时生效
    if (!core.hasOwn(migratedSource, "groupContextBefore")
        && !core.hasOwn(migratedSource, "groupContextAfter")
        && !options.skipEnv) {
        const envLimit = core.readEnv("QQBOT_PRO_GROUP_CONTEXT_LIMIT");
        if (envLimit) {
            const parsed = Number(envLimit.trim());
            if (Number.isInteger(parsed)) {
                const clamped = Math.min(20, Math.max(0, parsed));
                next.groupContextBefore = clamped;
                next.groupContextAfter = clamped;
                changes.push(`QQBOT_PRO_GROUP_CONTEXT_LIMIT=${envLimit} → before/after=${clamped}`);
            }
        }
    }

    return { config: next, changes };
}

function buildDefaultBridgeConfig() {
    const next = {};
    const fieldNames = Object.keys(FIELD_DEFS);
    for (let index = 0; index < fieldNames.length; index += 1) {
        next[fieldNames[index]] = FIELD_DEFS[fieldNames[index]].default;
    }
    return next;
}

/** 返回字段名数组（用于 configure 白名单校验） */
function listFieldNames() {
    return Object.keys(FIELD_DEFS);
}

/** 返回字段定义表副本（供 UI/文档生成） */
function getFieldDefs() {
    return JSON.parse(JSON.stringify(FIELD_DEFS));
}

module.exports = {
    BRIDGE_SCHEMA_VERSION,
    FIELD_DEFS,
    LEGACY_MIGRATIONS,
    normalizeC2cFixedBindings,
    normalizeGroupKeywords,
    normalizeGroupMemberBindings,
    normalizeBridgeConfig,
    buildDefaultBridgeConfig,
    listFieldNames,
    getFieldDefs
};