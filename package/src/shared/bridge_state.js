/*
 * qqbot-pro 状态持久化（合并自 qqbot-bridge-pro）
 * 依赖：shared/core.js（工具函数）
 * 状态目录：getPluginConfigDir(com.operit.qqbot_pro)，与原包物理隔离
 */
"use strict";
const core = require("./core.js");

const TOOLPKG_ID = "com.operit.qqbot_pro";
const CONFIG_FILE_NAME = "config.json";
const LOG_FILE_NAME = "gateway_service.log";
const AUTO_REPLY_STATE_FILE_NAME = "auto_reply_state.json";

let stateDirectoryPathCache = "";
const cachedJsonStores = Object.create(null);

function cloneJsonObject(value) {
    return JSON.parse(JSON.stringify(value));
}
function normalizeStorePath(path) {
    return core.asText(path).trim().replace(/\\/g, "/");
}
function getCachedJsonStoreEntry(path) {
    const normalizedPath = normalizeStorePath(path);
    if (!normalizedPath) throw new Error("State store path is empty");
    if (!cachedJsonStores[normalizedPath]) {
        cachedJsonStores[normalizedPath] = { loaded: false, dirty: false, value: {} };
    }
    return cachedJsonStores[normalizedPath];
}
async function readCachedJsonStoreAsync(path, sanitize) {
    const entry = getCachedJsonStoreEntry(path);
    if (!entry.loaded) {
        const raw = await readJsonObjectFileAsync(path);
        const nextValue = sanitize ? sanitize(raw) : raw;
        entry.value = cloneJsonObject(nextValue);
        entry.loaded = true;
        entry.dirty = false;
    }
    return cloneJsonObject(entry.value);
}
async function writeCachedJsonStoreAsync(path, value, sanitize) {
    const entry = getCachedJsonStoreEntry(path);
    const nextValue = sanitize ? sanitize(value) : value;
    entry.value = cloneJsonObject(nextValue);
    entry.loaded = true;
    entry.dirty = true;
    return cloneJsonObject(entry.value);
}
async function flushCachedJsonStoreAsync(path) {
    const entry = getCachedJsonStoreEntry(path);
    if (!entry.loaded || !entry.dirty) return;
    await writeJsonObjectFileAsync(path, entry.value);
    entry.dirty = false;
}
function getStateDirectoryPath() {
    if (stateDirectoryPathCache) return stateDirectoryPathCache;
    if (typeof getPluginConfigDir !== "function") {
        throw new Error("getPluginConfigDir is unavailable");
    }
    const path = core.asText(getPluginConfigDir(TOOLPKG_ID)).trim();
    if (!path) throw new Error(`Failed to resolve plugin config dir for ${TOOLPKG_ID}`);
    stateDirectoryPathCache = path;
    return stateDirectoryPathCache;
}
function getStateFilePath(name) {
    return `${getStateDirectoryPath()}/${name}`;
}
function getConfigFilePath() {
    return getStateFilePath(CONFIG_FILE_NAME);
}
function getServiceLogPath() {
    return getStateFilePath(LOG_FILE_NAME);
}
function getAutoReplyStateFilePath() {
    return getStateFilePath(AUTO_REPLY_STATE_FILE_NAME);
}
function readEnv(key) {
    return core.readEnv(key);
}
async function writeEnv(key, value) {
    await Tools.SoftwareSettings.writeEnvironmentVariable(key, value);
}
async function readTextFileWithTools(path) {
    const exists = await Tools.Files.exists(path, "android");
    if (!exists || !exists.exists) return "";
    const result = await Tools.Files.read({ path, environment: "android" });
    return core.asText(result && result.content);
}
async function writeTextFileWithTools(path, content) {
    await Tools.Files.write(path, content, false, "android");
}
async function deleteFileIfExistsAsync(path) {
    const exists = await Tools.Files.exists(path, "android");
    if (exists && exists.exists) {
        await Tools.Files.deleteFile(path, false, "android");
    }
}
async function readJsonObjectFileAsync(path) {
    const raw = (await readTextFileWithTools(path)).trim();
    if (!raw) return {};
    return core.parseJsonObject(raw);
}
async function writeJsonObjectFileAsync(path, value) {
    await writeTextFileWithTools(path, JSON.stringify(value));
}
function sanitizePersistedConfig(value) {
    const useSandbox = core.hasOwn(value, "useSandbox") ? core.toBoolean(value.useSandbox, false) : false;
    const listenerEnabled = core.hasOwn(value, "listenerEnabled") ? core.toBoolean(value.listenerEnabled, false) : false;
    const autoReply = core.hasOwn(value, "autoReply") && core.isObject(value.autoReply)
        ? { ...value.autoReply }
        : {};
    return { useSandbox, listenerEnabled, autoReply };
}
function sanitizeAutoReplyStateStore(value) {
    return {
        runtime: core.hasOwn(value, "runtime") && core.isObject(value.runtime) ? cloneJsonObject(value.runtime) : {},
        bindings: core.hasOwn(value, "bindings") && core.isObject(value.bindings) ? cloneJsonObject(value.bindings) : {},
        records: core.hasOwn(value, "records") && core.isObject(value.records) ? cloneJsonObject(value.records) : {},
        // Epic G1：群聚合桶与上下文缓存的持久化镜像（恢复窗口过滤在 bridge_auto 侧做）
        buckets: core.hasOwn(value, "buckets") && core.isObject(value.buckets) ? cloneJsonObject(value.buckets) : {},
        context: core.hasOwn(value, "context") && core.isObject(value.context) ? cloneJsonObject(value.context) : {}
    };
}
async function readPersistedConfigAsync() {
    return await readCachedJsonStoreAsync(getConfigFilePath(), sanitizePersistedConfig);
}
async function writePersistedConfigAsync(value) {
    const nextValue = await writeCachedJsonStoreAsync(getConfigFilePath(), value, sanitizePersistedConfig);
    await flushCachedJsonStoreAsync(getConfigFilePath());
    return nextValue;
}
async function updatePersistedConfigAsync(patch) {
    const current = await readPersistedConfigAsync();
    return await writePersistedConfigAsync({ ...current, ...patch });
}
async function readPersistedAutoReplyStateAsync() {
    return await readCachedJsonStoreAsync(getAutoReplyStateFilePath(), sanitizeAutoReplyStateStore);
}
async function writePersistedAutoReplyStateAsync(value) {
    return await writeCachedJsonStoreAsync(getAutoReplyStateFilePath(), value, sanitizeAutoReplyStateStore);
}
async function flushPersistedAutoReplyStateAsync() {
    await flushCachedJsonStoreAsync(getAutoReplyStateFilePath());
}
function readConfigSnapshotFrom(storedConfig, overrides) {
    const appId = overrides && core.hasOwn(overrides, "appId")
        ? core.asText(overrides.appId).trim()
        : readEnv("QQBOT_APP_ID");
    const appSecret = overrides && core.hasOwn(overrides, "appSecret")
        ? core.asText(overrides.appSecret).trim()
        : readEnv("QQBOT_APP_SECRET");
    const useSandboxRaw = overrides && core.hasOwn(overrides, "useSandbox")
        ? overrides.useSandbox
        : storedConfig.useSandbox;
    const parsedUseSandbox = core.parseOptionalBoolean(useSandboxRaw, "use_sandbox");
    return {
        appId,
        appSecret,
        useSandbox: parsedUseSandbox === true,
        listenerEnabled: core.toBoolean(storedConfig.listenerEnabled, false)
    };
}
async function readConfigSnapshotAsync(overrides) {
    return readConfigSnapshotFrom(await readPersistedConfigAsync(), overrides);
}
async function requireConfiguredSnapshotAsync(overrides) {
    const snapshot = await readConfigSnapshotAsync(overrides);
    if (!snapshot.appId) throw new Error("Missing env: QQBOT_APP_ID");
    if (!snapshot.appSecret) throw new Error("Missing env: QQBOT_APP_SECRET");
    return snapshot;
}
function buildStatus(snapshot) {
    return {
        packageVersion: core.PACKAGE_VERSION,
        configured: !!snapshot.appId && !!snapshot.appSecret,
        mode: "websocket_gateway",
        appId: snapshot.appId,
        appSecretMasked: core.maskSecret(snapshot.appSecret),
        useSandbox: snapshot.useSandbox,
        listenerEnabled: snapshot.listenerEnabled,
        openApiBaseUrl: snapshot.useSandbox ? core.SANDBOX_API_BASE_URL : core.API_BASE_URL,
        gatewayApiPath: "/gateway"
    };
}

module.exports = {
    getStateDirectoryPath,
    getStateFilePath,
    getConfigFilePath,
    getServiceLogPath,
    getAutoReplyStateFilePath,
    readEnv,
    writeEnv,
    readTextFileWithTools,
    writeTextFileWithTools,
    deleteFileIfExistsAsync,
    readJsonObjectFileAsync,
    writeJsonObjectFileAsync,
    readPersistedConfigAsync,
    writePersistedConfigAsync,
    updatePersistedConfigAsync,
    readPersistedAutoReplyStateAsync,
    writePersistedAutoReplyStateAsync,
    flushPersistedAutoReplyStateAsync,
    readConfigSnapshotFrom,
    readConfigSnapshotAsync,
    requireConfiguredSnapshotAsync,
    buildStatus
};