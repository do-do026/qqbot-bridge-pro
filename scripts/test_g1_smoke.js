/*
 * qqbot-bridge-pro Epic G1 冒烟测试（纯逻辑层，不依赖真实 QQ/Operit）
 * 覆盖：配置新字段、classifyEvent 分流、上下文缓存容量、持久化/恢复、查询工具
 * 运行：node scripts/test_g1_smoke.js
 */
"use strict";

// ---- 模拟 Operit 宿主全局（仅冒烟测试用）----
global.Java = {
    com: {
        ai: {
            assistance: {
                operit: {
                    util: {
                        WaifuMessageProcessor: {
                            cleanContentForWaifu: (text) => text
                        }
                    }
                }
            }
        }
    }
};
const noopAsync = async () => ({});
global.Tools = {
    Files: {
        exists: async () => ({ exists: false }),
        read: async () => ({ content: "" }),
        write: noopAsync,
        deleteFile: noopAsync,
        mkdir: noopAsync,
        download: noopAsync,
        info: async () => ({ size: 0 })
    },
    Chat: {},
    System: { sleep: noopAsync },
    SoftwareSettings: { writeEnvironmentVariable: noopAsync }
};
global.getPluginConfigDir = () => "/tmp/qqbot_bridge_pro_test";

const bridgeConfig = require("../package/src/shared/bridge_config.js");
const bridgeAuto = require("../package/src/shared/bridge_auto.js");

let passed = 0;
let failed = 0;
function assert(cond, name) {
    if (cond) {
        passed += 1;
        console.log(`✅ ${name}`);
    }
    else {
        failed += 1;
        console.error(`❌ ${name}`);
    }
}

function makeEvent(overrides) {
    return {
        scene: "group",
        eventType: "GROUP_MESSAGE_CREATE",
        content: "test",
        groupOpenId: "groupA",
        eventId: `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        messageId: `msg_${Math.random().toString(16).slice(2)}`,
        timestamp: String(Date.now()),
        receivedAt: new Date().toISOString(),
        rawPayload: {},
        ...overrides
    };
}

(async () => {
    const norm = bridgeConfig.normalizeBridgeConfig({});
    const cfg = norm.config;

    // 1) 配置新字段
    assert(cfg.groupCacheRecoveryMaxAgeMs === 86400000, "groupCacheRecoveryMaxAgeMs 默认 86400000（24h）");
    assert(cfg.groupFlushConcurrency === 3, "groupFlushConcurrency 默认 3");
    assert(cfg.groupMessageMode === "at_only", "groupMessageMode 默认 at_only");
    assert(cfg.groupContextLimit === 20, "groupContextLimit 默认 20");
    assert(cfg.groupMaxItems === 30, "groupMaxItems 默认 30");
    assert(cfg.groupGlobalCacheMaxItems === 100, "groupGlobalCacheMaxItems 默认 100");

    // 2) classifyEvent 分流
    const svc = { botUserId: "" };
    const atEvent = makeEvent({ eventType: "GROUP_AT_MESSAGE_CREATE", content: "@bot hi" });
    const plainEvent = makeEvent({ eventType: "GROUP_MESSAGE_CREATE", content: "普通消息" });
    assert(bridgeAuto._internal.classifyEvent(cfg, atEvent, svc).action === "process", "GROUP_AT_MESSAGE_CREATE → process");
    assert(bridgeAuto._internal.classifyEvent(cfg, plainEvent, svc).action === "context_only", "GROUP_MESSAGE_CREATE（at_only）→ context_only");
    const allMode = { ...cfg, groupMessageMode: "all" };
    assert(bridgeAuto._internal.classifyEvent(allMode, plainEvent, svc).action === "process", "GROUP_MESSAGE_CREATE（all 模式）→ process");
    const c2cEvent = { scene: "c2c", eventType: "C2C_MESSAGE_CREATE", content: "hi", rawPayload: {} };
    assert(bridgeAuto._internal.classifyEvent(cfg, c2cEvent, svc).action === "process", "C2C 消息 → process");

    // 3) 上下文缓存容量：单群 30 / 全局 100
    bridgeAuto._internal.clearGroupRuntimeState();
    for (let i = 0; i < 35; i += 1) {
        bridgeAuto._internal.pushToGroupContextCache(cfg, makeEvent({ groupOpenId: "groupA", content: `a${i}`, eventId: `ea${i}`, messageId: `ma${i}` }));
    }
    const entryA = bridgeAuto._internal.groupContextCache.get("groupA");
    assert(entryA && entryA.events.length === 30, `单群容量截断到 30（实际 ${entryA ? entryA.events.length : 0}）`);
    for (let i = 0; i < 20; i += 1) {
        bridgeAuto._internal.pushToGroupContextCache(cfg, makeEvent({ groupOpenId: "groupB", content: `b${i}`, eventId: `eb${i}`, messageId: `mb${i}` }));
    }
    let total = 0;
    for (const entry of bridgeAuto._internal.groupContextCache.values()) {
        total += entry.events.length;
    }
    assert(total === 50, `全局总数 50（未超 100 不淘汰，实际 ${total}）`);

    // 4) 持久化 → 清内存 → 恢复（当天窗口内）
    const bucketEvent = makeEvent({ eventType: "GROUP_AT_MESSAGE_CREATE", content: "@bot 聚合测试", groupOpenId: "groupA", eventId: "bucket_at_1", messageId: "bucket_at_1" });
    bridgeAuto._internal.groupPendingBuckets.set("groupA", { events: [bucketEvent], firstAt: Date.now(), lastAt: Date.now(), overflowCount: 0 });
    await bridgeAuto._internal.persistGroupRuntimeStateAsync();
    bridgeAuto._internal.clearGroupRuntimeState();
    assert(bridgeAuto._internal.groupPendingBuckets.size === 0, "清内存后桶为空");
    const restoreResult = await bridgeAuto._internal.restoreGroupRuntimeStateAsync(cfg);
    assert(restoreResult.restored === true, "恢复执行成功");
    assert(bridgeAuto._internal.groupPendingBuckets.get("groupA")?.events?.length === 1, "聚合桶恢复成功（1 条事件）");
    assert(bridgeAuto._internal.groupContextCache.get("groupA")?.events?.length > 0, "上下文缓存恢复成功");

    // 5) 恢复窗口过滤：超过 24h 的桶不恢复
    bridgeAuto._internal.clearGroupRuntimeState();
    const staleBucket = { events: [makeEvent({ eventId: "old_1", messageId: "old_1" })], firstAt: Date.now() - 2 * 86400000, lastAt: Date.now() - 2 * 86400000, overflowCount: 0 };
    bridgeAuto._internal.groupPendingBuckets.set("groupC", staleBucket);
    await bridgeAuto._internal.persistGroupRuntimeStateAsync();
    bridgeAuto._internal.clearGroupRuntimeState();
    const restore2 = await bridgeAuto._internal.restoreGroupRuntimeStateAsync(cfg);
    assert(bridgeAuto._internal.groupPendingBuckets.has("groupC") === false, "超过 24h 的旧桶恢复时被丢弃");
    assert(restore2.recoveredBucketCount === 0, "恢复计数为 0（旧桶被过滤）");

    // 6) 查询工具
    bridgeAuto._internal.clearGroupRuntimeState();
    for (let i = 0; i < 12; i += 1) {
        bridgeAuto._internal.pushToGroupContextCache(cfg, makeEvent({ groupOpenId: "groupA", content: `msg${i}`, eventId: `q${i}`, messageId: `q${i}` }));
    }
    const ctxResult = await bridgeAuto.qqbot_pro_group_context({ group_openid: "groupA", before: 3, after: 3 });
    assert(ctxResult.success === true, "qqbot_pro_group_context 成功");
    assert(ctxResult.events.length <= 7, `before3+after3+anchor 最多 7 条（实际 ${ctxResult.events.length}）`);
    assert(ctxResult.events.every((e) => e.content && e.eventKey && e.sentAt !== undefined), "查询条目含 content/eventKey/sentAt");
    const noCache = await bridgeAuto.qqbot_pro_group_context({ group_openid: "groupZZZ" });
    assert(noCache.note === "no_cached_context", "无缓存群返回 no_cached_context");

    console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
    process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
    console.error("测试异常：", error);
    process.exit(2);
});
