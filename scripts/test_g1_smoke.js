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

    // 2.5) T039：全量模式下 @ 标记在 mentions（GROUP_MESSAGE_CREATE + mentions 含机器人 → 视为 @ 触发）
    const svcWithBot = { botUserId: "BOT123" };
    const mentionEvent = makeEvent({ eventType: "GROUP_MESSAGE_CREATE", content: "渡渡渡渡——", mentions: [{ id: "USER1" }, { id: "BOT123" }] });
    assert(bridgeAuto._internal.classifyEvent(cfg, mentionEvent, svcWithBot).action === "process", "GROUP_MESSAGE_CREATE + mentions 含机器人（at_only）→ process（T039）");
    const mentionEvent2 = makeEvent({ eventType: "GROUP_MESSAGE_CREATE", content: "渡渡渡渡——", mentions: [{ id: "USER1", member_openid: "BOT123" }] });
    assert(bridgeAuto._internal.classifyEvent(cfg, mentionEvent2, svcWithBot).action === "process", "GROUP_MESSAGE_CREATE + mentions.member_openid 含机器人 → process（T039）");
    const noMentionEvent = makeEvent({ eventType: "GROUP_MESSAGE_CREATE", content: "渡渡渡渡——", mentions: [{ id: "USER1" }] });
    assert(bridgeAuto._internal.classifyEvent(cfg, noMentionEvent, svcWithBot).action === "context_only", "GROUP_MESSAGE_CREATE + mentions 不含机器人 → context_only");

    // 2.7) T042：全量模式下机器人 member_openid ≠ botUserId，content <@xxx> + mentions 交叉验证
    const atContentEvent = makeEvent({ eventType: "GROUP_MESSAGE_CREATE", content: "<@D02B97AF5873726C3C793F3EC1ECF7B5> 两点也困困舔舔他", authorId: "USER_CC9F", mentions: [{ id: "USER_CC9F" }, { id: "D02B97AF5873726C3C793F3EC1ECF7B5" }] });
    assert(bridgeAuto._internal.classifyEvent(cfg, atContentEvent, svcWithBot).action === "process", "T042：content <@xxx> 且 @目标在 mentions、非自己 → process");
    const selfAtEvent = makeEvent({ eventType: "GROUP_MESSAGE_CREATE", content: "<@USER_CC9F> 自己@自己", authorId: "USER_CC9F", mentions: [{ id: "USER_CC9F" }] });
    assert(bridgeAuto._internal.classifyEvent(cfg, selfAtEvent, svcWithBot).action === "context_only", "T042：自己@自己 → context_only");
    const atOtherEvent = makeEvent({ eventType: "GROUP_MESSAGE_CREATE", content: "<@OTHER_USER> 晚上好", authorId: "USER_CC9F", mentions: [{ id: "OTHER_USER" }] });
    assert(bridgeAuto._internal.classifyEvent(cfg, atOtherEvent, svcWithBot).action === "process", "T042：@目标在 mentions（含群友）→ process（宽松识别，测试场景够用）");
    assert(JSON.stringify(bridgeAuto._internal.extractAtTargetIds('<@AABB1122> 你好 <@CCDD3344>')) === '["AABB1122","CCDD3344"]', "extractAtTargetIds 提取多个 @目标");

    // 2.6) keyword_or_at 模式：关键词触发
    const kwCfg = { ...cfg, groupMessageMode: "keyword_or_at", groupKeywords: ["渡渡", "dodo"] };
    assert(bridgeAuto._internal.classifyEvent(kwCfg, makeEvent({ eventType: "GROUP_MESSAGE_CREATE", content: "渡渡在吗" }), svcWithBot).action === "process", "keyword_or_at：命中关键词 → process");
    assert(bridgeAuto._internal.classifyEvent(kwCfg, makeEvent({ eventType: "GROUP_MESSAGE_CREATE", content: "晚上好呀" }), svcWithBot).action === "context_only", "keyword_or_at：未命中关键词 → context_only");
    assert(bridgeAuto._internal.classifyEvent(kwCfg, mentionEvent, svcWithBot).action === "process", "keyword_or_at：mentions @ → process");
    // groupKeywords 归一化（数组 / JSON / 逗号分隔）
    assert(JSON.stringify(bridgeConfig.normalizeGroupKeywords(["渡渡", "dodo"])) === '["渡渡","dodo"]', "normalizeGroupKeywords 数组");
    assert(JSON.stringify(bridgeConfig.normalizeGroupKeywords('["渡渡","dodo"]')) === '["渡渡","dodo"]', "normalizeGroupKeywords JSON 字符串");
    assert(JSON.stringify(bridgeConfig.normalizeGroupKeywords("渡渡,dodo，测试")) === '["渡渡","dodo","测试"]', "normalizeGroupKeywords 逗号/顿号分隔");

    // 2.8) G7 群成员身份绑定
    const g7Cfg = { ...cfg, groupMemberBindings: [{ memberOpenid: "CC9F59", title: "初尘" }, { memberOpenid: "OTHER1", groupOpenid: "groupA", title: "群友甲" }] };
    assert(bridgeAuto._internal.resolveMemberLabel(g7Cfg, "CC9F59", "groupA") === "初尘", "G7：全局绑定命中 → 初尘");
    assert(bridgeAuto._internal.resolveMemberLabel(g7Cfg, "OTHER1", "groupA") === "群友甲", "G7：群限定绑定命中 → 群友甲");
    assert(bridgeAuto._internal.resolveMemberLabel(g7Cfg, "OTHER1", "groupB") === "QQHER1", "G7：群限定不匹配 → QQ+后四位");
    assert(bridgeAuto._internal.resolveMemberLabel(g7Cfg, "UNKNOWN", "groupA") === "QQNOWN", "G7：未绑定 → QQ+后四位");
    assert(JSON.stringify(bridgeConfig.normalizeGroupMemberBindings('[{"memberOpenid":"CC9F59","title":"初尘"},{"memberOpenid":"OTHER1","groupOpenid":"groupA","title":"群友甲"}]')) === '[{"memberOpenid":"CC9F59","groupOpenid":"","title":"初尘"},{"memberOpenid":"OTHER1","groupOpenid":"groupA","title":"群友甲"}]', "normalizeGroupMemberBindings JSON");

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

    // 7) Epic G2 automatic：邻近上下文附件（自动附带模式）
    bridgeAuto._internal.clearGroupRuntimeState();
    const g2Config = {
        ...cfg,
        groupContextMode: "automatic",
        groupContextBefore: 5,
        groupContextAfter: 5,
        groupContextLimit: 20,
        groupMemberBindings: [{ memberOpenid: "CC9F593975D8C8F1E1EC72DD91305C63", groupOpenid: "", title: "初尘" }]
    };
    for (let i = 0; i < 8; i += 1) {
        bridgeAuto._internal.pushToGroupContextCache(g2Config, makeEvent({
            groupOpenId: "groupA",
            content: `ctx${i}`,
            eventId: `a${i}`,
            messageId: `a${i}`,
            userOpenId: i === 6 ? "CC9F593975D8C8F1E1EC72DD91305C63" : `OTHER_${i}`
        }));
    }
    const lastEvt = { eventId: "a7", messageId: "a7", groupOpenId: "groupA", scene: "group", timestamp: String(Date.now()), userOpenId: "OTHER_7" };
    const neighborAttach = bridgeAuto._internal.buildGroupNeighborContextAttachment(g2Config, "groupA", bridgeAuto._internal.buildEventKey(lastEvt));
    assert(neighborAttach && neighborAttach.startsWith("<attachment"), "automatic 有缓存 → 返回上下文附件");
    assert(neighborAttach.includes("GROUP_NEIGHBOR_CONTEXT:groupA"), "附件 id 含群标识");
    assert(neighborAttach.includes("[初尘]"), "G7 绑定标签生效（[初尘]）");
    assert(neighborAttach.includes("[QQ"), "未绑定成员显示 QQ+后四位");
    assert(neighborAttach.includes("ctx2"), "包含上下文最早一条（before=5 范围内）");
    assert(!neighborAttach.includes("ctx0"), "before=5 范围外的不包含");
    assert(neighborAttach.includes("ctx7"), "包含锚点消息");
    const noneAttach = bridgeAuto._internal.buildGroupNeighborContextAttachment(g2Config, "groupZZZ", "");
    assert(noneAttach === null, "无缓存群 → null（不附加）");
    const offAttach = bridgeAuto._internal.buildGroupNeighborContextAttachment({ ...g2Config, groupContextMode: "off" }, "groupA", bridgeAuto._internal.buildEventKey(lastEvt));
    assert(offAttach !== null, "函数本身与模式无关（off 由调用方控制，此处仅验证数据可读）");

    console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
    process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
    console.error("测试异常：", error);
    process.exit(2);
});