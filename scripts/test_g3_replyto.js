/*
 * qqbot-pro Epic G3 replyTo 冒烟测试（纯逻辑层，不依赖真实 QQ/Operit）
 * 覆盖：聚合编号、协议解析（replyTo/fallbackPreference）、稳定批次键幂等
 * 运行：node scripts/test_g3_replyto.js
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
global.getPluginConfigDir = () => "/tmp/qqbot_pro_g3_test";

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
        userOpenId: "u_openid_1234",
        replyHint: { group_openid: "groupA", msg_id: "msg_hint" },
        ...overrides
    };
}

(async () => {
    // ===== 1) parseGroupReplyDirective：协议头解析 =====
    const G3 = bridgeAuto._internal;
    const p1 = G3.parseGroupReplyDirective('{"replyTo": 2, "content": "你好呀", "fallbackPreference": "active_send"}');
    assert(p1.replyTo === 2, "协议头 replyTo=2 解析");
    assert(p1.content === "你好呀", "协议头 content 提取");
    assert(p1.fallbackPreference === "active_send", "协议头 active_send 识别");

        const p2 = G3.parseGroupReplyDirective('```json\n{"replyTo":1,"content":"引用第一条","fallbackPreference":"drop"}\n```');
    assert(p2.replyTo === 1 && p2.content === "引用第一条", "```json 包裹容错解析");

    const p3 = G3.parseGroupReplyDirective("纯文本回复，没有协议头");
    assert(p3.replyTo === null, "无协议头 → replyTo=null");
    assert(p3.content === "纯文本回复，没有协议头", "无协议头 → content 为整段");
    assert(p3.fallbackPreference === "drop", "无协议头 → fallback 默认 drop");

    const p4 = G3.parseGroupReplyDirective('{"replyTo": 0, "content": "x"}');
    assert(p4.replyTo === null, "replyTo=0 非法 → null");

    const p5 = G3.parseGroupReplyDirective('{"replyTo": -3, "content": "x"}');
    assert(p5.replyTo === null, "replyTo 负数非法 → null");

    const p6 = G3.parseGroupReplyDirective('{"replyTo": "abc", "content": "x"}');
    assert(p6.replyTo === null, "replyTo 非数字非法 → null");

    const p7 = G3.parseGroupReplyDirective('{"replyTo": 2, "content": "x", "fallbackPreference": "weird"}');
    assert(p7.fallbackPreference === "drop", "fallbackPreference 非法值 → drop");

    const p8 = G3.parseGroupReplyDirective('{"replyTo": 3} 后面是正文');
    assert(p8.replyTo === 3 && p8.content === "后面是正文", "content 缺省回退控制头后正文");

    const p9 = G3.parseGroupReplyDirective('先说话再{"replyTo":1,"content":"y"}');
    assert(p9.replyTo === 1 && p9.content === "y", "控制头在开头即可，容忍前缀文字");

    const p10 = G3.parseGroupReplyDirective("   ");
    assert(p10.replyTo === null && p10.content === "", "空白输入不崩溃");

    // ===== 2) buildStableAggregateKey：稳定批次键 =====
    const ev1 = makeEvent({ eventId: "evt_A", content: "1" });
    const ev2 = makeEvent({ eventId: "evt_B", content: "2" });
    const key1 = G3.buildStableAggregateKey("groupA", ["evt_A", "evt_B"]);
    const key2 = G3.buildStableAggregateKey("groupA", ["evt_B", "evt_A"]);
    assert(key1 === key2, "稳定批次键与事件顺序无关（排序哈希）");
    assert(key1.startsWith("GROUP_AGGREGATE:groupA:"), "稳定批次键前缀正确");
    const key3 = G3.buildStableAggregateKey("groupA", ["evt_A", "evt_C"]);
    assert(key1 !== key3, "不同事件集合 → 不同批次键");
    const key4 = G3.buildStableAggregateKey("groupB", ["evt_A", "evt_B"]);
    assert(key1 !== key4, "不同群 → 不同批次键");

    // ===== 3) buildGroupAggregateMessageAsync：编号 =====
    const cfg = { groupMemberBindings: [{ memberOpenid: "u_openid_1234", title: "初尘" }], groupNicknameEnabled: false };
    const snapshot = { appId: "test" };
    const evA = makeEvent({ eventId: "evt_1", content: "第一条" });
    const evB = makeEvent({ eventId: "evt_2", content: "第二条", userOpenId: "u_other_99" });
    const aggregateText = await G3.buildGroupAggregateMessageAsync(cfg, snapshot, [evA, evB]);
    assert(aggregateText.includes("[#1][初尘] 第一条"), "第1条编号[#1]且绑定名生效");
    assert(aggregateText.includes("[#2][QQr_99] 第二条"), "第2条编号[#2]且未绑定回退后四位");

    console.log(`\n结果: ${passed} 通过 / ${failed} 失败`);
    process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
    console.error("测试崩溃:", error);
    process.exit(2);
});