/*
 * qqbot-pro 增强版 Gateway 子包（T05 事件放开）
 * 复制自原包 qqbot_gateway_service.py 并增强：
 * - 事件白名单全放开（含 INTERACTION_CREATE / GROUP_MEMBER_ADD 等）
 * - INTERACTION_CREATE 的 scene 识别（c2c/group）
 * - 独立控制端口 32146（与原包 32145 隔离）
 * 注意：同 AppID 下不能与原包 Gateway 同时运行（会被挤下线）。
 */
"use strict";
/* METADATA
{
    "name": "qqbot_bridge_pro_gateway",
    "display_name": { "zh": "QQ Bot Pro 增强版 Gateway", "en": "QQ Bot Pro Enhanced Gateway" },
    "description": {
        "zh": "增强版 QQ Bot Gateway：事件全放开（含按钮回调 INTERACTION_CREATE、成员进出群等）。独立端口 32146。⚠️ 同 AppID 下与原包 Gateway 二选一运行。",
        "en": "Enhanced QQ Bot Gateway with all events enabled (INTERACTION_CREATE, member events). Port 32146. Mutually exclusive with the original Gateway on the same AppID."
    },
    "category": "Communication",
    "env": [
        { "name": "QQBOT_APP_ID", "description": { "zh": "QQ Bot AppID", "en": "QQ Bot AppID" }, "required": false },
        { "name": "QQBOT_APP_SECRET", "description": { "zh": "QQ Bot AppSecret", "en": "QQ Bot AppSecret" }, "required": false }
    ],
    "tools": [
        {
            "name": "qqbot_pro_gateway_start",
            "description": {
                "zh": "启动增强版 Gateway（事件全放开）。⚠️ 若原包 Gateway 正在运行同 AppID，需先停用原包，否则会被挤下线。",
                "en": "Start the enhanced Gateway (all events). Stop the original Gateway on the same AppID first."
            },
            "parameters": [
                { "name": "restart", "description": { "zh": "是否强制重启", "en": "Force restart" }, "type": "boolean", "required": false },
                { "name": "timeout_ms", "description": { "zh": "等待启动超时毫秒数，默认 8000", "en": "Startup wait timeout" }, "type": "number", "required": false }
            ]
        },
        {
            "name": "qqbot_pro_gateway_stop",
            "description": { "zh": "停止增强版 Gateway。", "en": "Stop the enhanced Gateway." },
            "parameters": [
                { "name": "timeout_ms", "description": { "zh": "等待停止超时毫秒数，默认 8000", "en": "Stop wait timeout" }, "type": "number", "required": false }
            ]
        },
        {
            "name": "qqbot_pro_gateway_status",
            "description": { "zh": "查看增强版 Gateway 状态、事件队列积压、连接信息。", "en": "Enhanced Gateway status." },
            "parameters": []
        },
        {
            "name": "qqbot_pro_receive_events",
            "description": {
                "zh": "从增强版 Gateway 事件队列读取事件（含消息与互动/生命周期事件）。可过滤 scene（c2c/group/guild）与 event_type。",
                "en": "Read events from the enhanced Gateway queue, including messages and interactions."
            },
            "parameters": [
                { "name": "limit", "description": { "zh": "最多取多少条，默认 20", "en": "Max events" }, "type": "number", "required": false },
                { "name": "consume", "description": { "zh": "读取后是否移除，默认 true", "en": "Consume after read" }, "type": "boolean", "required": false },
                { "name": "scene", "description": { "zh": "过滤：c2c / group / guild", "en": "Scene filter" }, "type": "string", "required": false },
                { "name": "event_type", "description": { "zh": "过滤：事件类型", "en": "Event type filter" }, "type": "string", "required": false },
                { "name": "include_raw", "description": { "zh": "返回原始 payload，默认 false", "en": "Include raw payload" }, "type": "boolean", "required": false }
            ]
        },
        {
            "name": "qqbot_pro_clear_events",
            "description": { "zh": "清空增强版 Gateway 事件队列。", "en": "Clear the enhanced Gateway event queue." },
            "parameters": []
        },
        {
            "name": "qqbot_pro_respond_interaction",
            "description": {
                "zh": "回应互动事件（PUT /interactions/{id}）。收到 INTERACTION_CREATE（按钮点击等）后必须调用，否则客户端一直 loading。仅 type=11（消息按钮）和 type=12（快捷菜单）需要回应。",
                "en": "Respond to an interaction event (PUT /interactions/{id}). Required for type 11/12 to stop client loading."
            },
            "parameters": [
                { "name": "interaction_id", "description": { "zh": "互动事件 ID", "en": "Interaction ID" }, "type": "string", "required": true },
                { "name": "code", "description": { "zh": "响应码，默认 0（成功）", "en": "Response code" }, "type": "number", "required": false },
                { "name": "timeout_ms", "description": { "zh": "请求超时毫秒数，默认 20000", "en": "Timeout in ms" }, "type": "number", "required": false }
            ]
        }
    ]
}
*/

const core = require("../shared/core.js");
const TOOLPKG_ID = "com.operit.qqbot_bridge_pro";
const SERVICE_SESSION = "qqbot_bridge_pro_gateway";
const SERVICE_PORT = 32146;
const RESOURCE_KEY = "qqbot_pro_gateway_py";
const SERVICE_FILE = "qqbot_pro_gateway.py";
let stateDirCache = "";
function getStateDir() {
    if (stateDirCache) return stateDirCache;
    if (typeof getPluginConfigDir === "function") {
        const resolved = core.asText(getPluginConfigDir(TOOLPKG_ID)).trim();
        if (resolved) {
            stateDirCache = resolved;
            return stateDirCache;
        }
    }
    stateDirCache = "/sdcard/Download/Operit/plugins/" + TOOLPKG_ID;
    return stateDirCache;
}
const STATE_DIR = getStateDir();

function buildResult(extra) {
    return { success: true, packageVersion: core.PACKAGE_VERSION, ...extra };
}

function buildError(error) {
    return { success: false, packageVersion: core.PACKAGE_VERSION, error: core.safeErrorMessage(error) };
}

function getServiceLogPath() {
    return `${STATE_DIR}/gateway_service.log`;
}

async function readServiceLogTail(maxChars) {
    try {
        const exists = await Tools.Files.exists(getServiceLogPath(), "android");
        if (!exists || !exists.exists) return "";
        const result = await Tools.Files.read({ path: getServiceLogPath(), environment: "android" });
        const content = core.asText(result && result.content);
        return content.slice(-(maxChars || 2000));
    } catch (_) {
        return "";
    }
}

async function httpToControl(path, body, timeoutMs) {
    let response;
    try {
        response = await Tools.Net.http({
            url: `http://127.0.0.1:${SERVICE_PORT}${path}`,
            method: body ? "POST" : "GET",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: body || undefined,
            connect_timeout: Math.max(2, Math.ceil((timeoutMs || 5000) / 1000)),
            read_timeout: Math.max(2, Math.ceil((timeoutMs || 5000) / 1000)),
            validateStatus: false
        });
    } catch (error) {
        // 连接被拒/超时 = 服务未运行，返回失败而非抛异常，让调用方走"未运行→启动"分支
        return { success: false, statusCode: 0, json: {}, error: core.safeErrorMessage(error) };
    }
    let json = {};
    try {
        const trimmed = core.asText(response && response.content).trim();
        if (trimmed) json = JSON.parse(trimmed);
    } catch (_) {}
    return {
        success: Number(response && response.statusCode == null ? 0 : response.statusCode) >= 200 &&
                 Number(response && response.statusCode == null ? 0 : response.statusCode) < 300,
        statusCode: Number(response && response.statusCode == null ? 0 : response.statusCode),
        json
    };
}

async function isServiceRunning() {
    const status = await httpToControl("/status", null, 3000);
    return status.success && status.json.running === true;
}

async function qqbot_pro_gateway_start(params) {
    try {
        const snapshot = core.requireConfiguredSnapshot();
        const timeoutMs = core.parsePositiveInt(params.timeout_ms, "timeout_ms", 8000);
        const restart = params.restart === true;

        // 若已在运行且不强制重启，直接返回
        if (!restart && (await isServiceRunning())) {
            return buildResult({ running: true, note: "Enhanced Gateway already running" });
        }

        // 准备资源文件
        await Tools.Files.mkdir(STATE_DIR, true, "android");
        const resourceExists = await Tools.Files.exists(`${STATE_DIR}/${SERVICE_FILE}`, "android");
        if (!resourceExists || !resourceExists.exists) {
            await ToolPkg.readResource(RESOURCE_KEY, `${STATE_DIR}/${SERVICE_FILE}`);
        }

        // 构造启动命令（复用原包思路：python3 后台运行）
        const scriptPath = `${STATE_DIR}/${SERVICE_FILE}`;
        const controlToken = `qqbot_pro_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
        const intents = String((1 << 30) | (1 << 12) | (1 << 25) | (1 << 26)); // 含 INTERACTION
        const command = [
            "nohup", "python3", `'${scriptPath}'`,
            "--state-dir", `'${STATE_DIR}'`,
            "--app-id", `'${snapshot.appId}'`,
            "--app-secret", `'${snapshot.appSecret}'`,
            "--use-sandbox", snapshot.useSandbox ? "'true'" : "'false'",
            "--source", "'qqbot_pro_manual'",
            "--package-version", `'${core.PACKAGE_VERSION}'`,
            "--intents", `'${intents}'`,
            "--control-token", `'${controlToken}'`,
            "--control-port", `'${SERVICE_PORT}'`,
            `> '${getServiceLogPath()}' 2>&1 & echo $!`
        ].join(" ");

        await Tools.System.terminal.hiddenExec(command, {
            executorKey: "qqbot_pro_gateway",
            timeoutMs: Math.max(timeoutMs, 10000)
        });

        // 等待健康
        const deadline = Date.now() + timeoutMs;
        let healthy = false;
        let statusJson = {};
        while (Date.now() < deadline) {
            const status = await httpToControl("/status", null, 3000);
            if (status.success && status.json.running === true && status.json.connected === true) {
                healthy = true;
                statusJson = status.json;
                break;
            }
            await Tools.System.sleep(300);
        }

        if (!healthy) {
            const logTail = await readServiceLogTail(1500);
            throw new Error(`Enhanced Gateway failed to become healthy. Log tail: ${logTail.slice(-800)}`);
        }
        return buildResult({ running: true, connected: true, status: statusJson });
    } catch (error) {
        return buildError(error);
    }
}

async function qqbot_pro_gateway_stop(params) {
    try {
        const timeoutMs = core.parsePositiveInt(params.timeout_ms, "timeout_ms", 8000);
        await httpToControl("/control", { action: "stop" }, 5000);
        const deadline = Date.now() + timeoutMs;
        let stopped = false;
        while (Date.now() < deadline) {
            const status = await httpToControl("/status", null, 3000);
            if (!status.success || status.json.running !== true) {
                stopped = true;
                break;
            }
            await Tools.System.sleep(300);
        }
        return buildResult({ stopped, note: stopped ? "Enhanced Gateway stopped" : "Stop timed out, process may still be running" });
    } catch (error) {
        return buildError(error);
    }
}

async function qqbot_pro_gateway_status(params) {
    try {
        const status = await httpToControl("/status", null, 5000);
        if (!status.success) {
            return buildResult({ running: false, note: "Enhanced Gateway not running" });
        }
        return buildResult({ running: true, ...status.json });
    } catch (error) {
        return buildError(error);
    }
}

async function qqbot_pro_receive_events(params) {
    try {
        const body = {
            limit: core.parsePositiveInt(params.limit, "limit", 20),
            consume: params.consume !== false,
            scene: core.asText(params.scene).trim(),
            eventType: core.asText(params.event_type).trim(),
            includeRaw: params.include_raw === true
        };
        const result = await httpToControl("/events/query", body, 8000);
        if (!result.success) {
            throw new Error(`Control API error: HTTP ${result.statusCode}`);
        }
        return buildResult({ ...result.json });
    } catch (error) {
        return buildError(error);
    }
}

async function qqbot_pro_clear_events(params) {
    try {
        const result = await httpToControl("/events/clear", {}, 5000);
        if (!result.success) {
            throw new Error(`Control API error: HTTP ${result.statusCode}`);
        }
        return buildResult({ ...result.json });
    } catch (error) {
        return buildError(error);
    }
}

async function qqbot_pro_respond_interaction(params) {
    try {
        const interactionId = core.asText(params.interaction_id).trim();
        if (!interactionId) throw new Error("Missing param: interaction_id");
        const snapshot = core.requireConfiguredSnapshot();
        const timeoutMs = core.resolveTimeoutMs(params.timeout_ms);
        const code = params.code == null ? 0 : Number(params.code);
        const response = await core.openApiRequest(
            snapshot,
            `/interactions/${encodeURIComponent(interactionId)}`,
            "PUT",
            { code },
            timeoutMs
        );
        if (!response.success) {
            throw new Error(core.firstNonBlank(core.asText(response.json.message), `HTTP ${response.statusCode}`));
        }
        return buildResult({ interactionId, code, httpStatus: response.statusCode, response: response.json });
    } catch (error) {
        return buildError(error);
    }
}

/* ========== 底层函数（供 bridge_auto / 其他模块复用，抛异常而非返回结果包装） ========== */

async function ensureGatewayStarted(options) {
    const opts = options || {};
    const snapshot = core.requireConfiguredSnapshot();
    const timeoutMs = core.parsePositiveInt(opts.timeout_ms, "timeout_ms", 8000);
    const restart = opts.restart === true;
    if (!restart && (await isServiceRunning())) {
        return await getGatewayStatusInternal();
    }
    await Tools.Files.mkdir(STATE_DIR, true, "android");
    const resourceExists = await Tools.Files.exists(`${STATE_DIR}/${SERVICE_FILE}`, "android");
    if (!resourceExists || !resourceExists.exists) {
        await ToolPkg.readResource(RESOURCE_KEY, `${STATE_DIR}/${SERVICE_FILE}`);
    }
    const scriptPath = `${STATE_DIR}/${SERVICE_FILE}`;
    const controlToken = `qqbot_pro_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const intents = String((1 << 30) | (1 << 12) | (1 << 25) | (1 << 26));
    const command = [
        "nohup", "python3", `'${scriptPath}'`,
        "--state-dir", `'${STATE_DIR}'`,
        "--app-id", `'${snapshot.appId}'`,
        "--app-secret", `'${snapshot.appSecret}'`,
        "--use-sandbox", snapshot.useSandbox ? "'true'" : "'false'",
        "--source", "'qqbot_bridge_pro'",
        "--package-version", `'${core.PACKAGE_VERSION}'`,
        "--intents", `'${intents}'`,
        "--control-token", `'${controlToken}'`,
        "--control-port", `'${SERVICE_PORT}'`,
        `> '${getServiceLogPath()}' 2>&1 & echo $!`
    ].join(" ");
    await Tools.System.terminal.hiddenExec(command, {
        executorKey: "qqbot_bridge_pro_gateway",
        timeoutMs: Math.max(timeoutMs, 10000)
    });
    const deadline = Date.now() + timeoutMs;
    let healthy = false;
    let statusJson = {};
    while (Date.now() < deadline) {
        const status = await httpToControl("/status", null, 3000);
        if (status.success && status.json.running === true && status.json.connected === true) {
            healthy = true;
            statusJson = status.json;
            break;
        }
        await Tools.System.sleep(300);
    }
    if (!healthy) {
        const logTail = await readServiceLogTail(1500);
        throw new Error(`Enhanced Gateway failed to become healthy. Log tail: ${logTail.slice(-800)}`);
    }
    return statusJson;
}

async function stopGateway(options) {
    const opts = options || {};
    const timeoutMs = core.parsePositiveInt(opts.timeout_ms, "timeout_ms", 8000);
    await httpToControl("/control", { action: "stop" }, 5000);
    const deadline = Date.now() + timeoutMs;
    let stopped = false;
    while (Date.now() < deadline) {
        const status = await httpToControl("/status", null, 3000);
        if (!status.success || status.json.running !== true) {
            stopped = true;
            break;
        }
        await Tools.System.sleep(300);
    }
    return stopped;
}

async function getGatewayStatusInternal() {
    const status = await httpToControl("/status", null, 5000);
    if (!status.success || !status.json) return {};
    return status.json;
}

async function queryGatewayEvents(params) {
    const body = {
        limit: core.parsePositiveInt(params.limit, "limit", 20),
        consume: params.consume !== false,
        scene: core.asText(params.scene).trim(),
        eventType: core.asText(params.event_type).trim(),
        includeRaw: params.include_raw === true
    };
    const result = await httpToControl("/events/query", body, 8000);
    if (!result.success) {
        throw new Error(`Control API error: HTTP ${result.statusCode}`);
    }
    return result.json || {};
}

async function removeGatewayEvents(eventKeys, timeoutMs) {
    const result = await httpToControl("/events/remove", { eventKeys: eventKeys || [] }, timeoutMs || 8000);
    if (!result.success) {
        throw new Error(`Control API error: HTTP ${result.statusCode}`);
    }
    return result.json || {};
}

async function clearGatewayEvents() {
    const result = await httpToControl("/events/clear", {}, 5000);
    if (!result.success) {
        throw new Error(`Control API error: HTTP ${result.statusCode}`);
    }
    return result.json || {};
}

module.exports = {
    qqbot_pro_gateway_start,
    qqbot_pro_gateway_stop,
    qqbot_pro_gateway_status,
    qqbot_pro_receive_events,
    qqbot_pro_clear_events,
    qqbot_pro_respond_interaction,
    /* 底层复用 */
    ensureGatewayStarted,
    stopGateway,
    getGatewayStatusInternal,
    queryGatewayEvents,
    removeGatewayEvents,
    clearGatewayEvents,
    getStateDir,
    SERVICE_PORT
};