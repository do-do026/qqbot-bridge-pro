#!/usr/bin/env node
"use strict";
/**
 * G4 冒烟测试：统一 Waifu chunker
 * 纯 JS，无需 mock Java/Tools，node scripts/test_g4_waifu_chunker.js 直接跑。
 * 覆盖：基本切分 / 句末符集（。！？\n）/ 连续换行归一化 / 跨 chunk 换行连续 /
 *       emoji / 无标点 400 兜底 / 流式累积 / 空输入 / 与旧群聊切分语义一致性。
 */
const { WaifuChunker, splitText, normalizeNewlines } = require("../package/src/shared/waifu_chunker.js");

let passed = 0;
let failed = 0;
function assert(condition, name, detail) {
    if (condition) {
        passed += 1;
        console.log(`  ✅ ${name}`);
    } else {
        failed += 1;
        console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
    }
}

console.log("## G4 waifu chunker 冒烟测试\n");

// ── 1. 批处理基本切分 ──────────────────────────────────────────────
console.log("## 1. 批处理基本切分（群聊语义）");
{
    const chunks = splitText("第一句。第二句！第三句？第四句。第五句。", 3);
    assert(chunks.length === 2, "5 句 limit3 → 2 段", JSON.stringify(chunks));
    assert(chunks[0] === "第一句。第二句！第三句？", "第 1 段 = 前 3 句", chunks[0]);
    assert(chunks[1] === "第四句。第五句。", "第 2 段 = 后 2 句", chunks[1]);
}

// ── 2. 句末符集：\n 也计数 ─────────────────────────────────────────
console.log("\n## 2. 句末符 \\n 计数");
{
    const chunks = splitText("第一行\n第二行\n第三行\n", 3);
    assert(chunks.length === 1, "3 个换行 = 3 句 → 1 段（limit3）", JSON.stringify(chunks));
    const chunks2 = splitText("一\n二\n三\n四\n", 3);
    assert(chunks2.length === 2, "4 个换行 limit3 → 2 段", JSON.stringify(chunks2));
}

// ── 3. 连续换行只计 1 句 + 输出归一化 ──────────────────────────────
console.log("\n## 3. 连续换行归一化");
{
    const chunks = splitText("第一行\n\n\n第二行\n\n第三行\n", 3);
    assert(chunks.length === 1, "连续换行只计 1 句（3 个有效句末 → 1 段）", JSON.stringify(chunks));
    assert(!chunks[0].includes("\n\n"), "输出无连续换行（已归一化）", JSON.stringify(chunks[0]));
    assert(chunks[0] === "第一行\n第二行\n第三行", "归一化结果精确", JSON.stringify(chunks[0]));
}

// ── 4. 跨 chunk 换行连续（流式） ───────────────────────────────────
console.log("\n## 4. 跨 chunk 换行连续");
{
    const c = new WaifuChunker({ flushSentences: 3 });
    c.push("第一句。第二句。"); // 2 句
    const out = c.push("\n\n\n第四句。"); // 第 1 个 \\n 计第 3 句 → 切出；后 2 个 \\n 不计
    assert(out.length === 1 && out[0] === "第一句。第二句。", "跨 chunk 首个 \\n 计第 3 句 → 立即切出", JSON.stringify(out));
    const tail = c.finish();
    assert(tail.length === 1 && tail[0] === "第四句。", "后续连续换行不计句，剩余段精确", JSON.stringify(tail));
}

// ── 5. emoji 不破坏切分 ────────────────────────────────────────────
console.log("\n## 5. emoji");
{
    const chunks = splitText("好耶🎉！🐾🐾 太棒了。再来一个🚀？最后一发💥。", 2);
    assert(chunks.length === 2, "emoji 混排 4 句 limit2 → 2 段", JSON.stringify(chunks));
    assert(chunks[0].includes("🎉"), "emoji 保留在片段内", chunks[0]);
    assert(!chunks[0].includes("💥"), "第 1 段不含后续 emoji", chunks[0]);
}

// ── 6. 无标点长文本 → 400 兜底 ─────────────────────────────────────
console.log("\n## 6. 无标点 400 兜底");
{
    const longNoPunct = "啊".repeat(900);
    const chunks = splitText(longNoPunct, 3);
    assert(chunks.length === 3, "900 字无标点 limit3 → 400/400/100 三段", String(chunks.length));
    assert(chunks[0].length === 400 && chunks[1].length === 400 && chunks[2].length === 100,
        "每段长度 400/400/100", chunks.map((s) => s.length).join("/"));
}

// ── 7. 流式小 chunk 累积切分 ───────────────────────────────────────
console.log("\n## 7. 流式小 chunk 累积");
{
    const c = new WaifuChunker({ flushSentences: 3 });
    const out1 = c.push("你");
    const out2 = c.push("好");
    const out3 = c.push("呀。");
    const out4 = c.push("今天");
    const out5 = c.push("好热！");
    assert(out1.length + out2.length + out3.length + out4.length + out5.length === 0,
        "不足 3 句前不输出");
    const out6 = c.push("记得喝水？");
    const got = out6;
    assert(got.length === 1, "凑满 3 句（。！？）输出 1 段", JSON.stringify(got));
    assert(got[0] === "你好呀。今天好热！记得喝水？", "片段内容精确", got[0]);
    assert(c.finish().length === 0, "无剩余", JSON.stringify(c.finish()));
}

// ── 8. 空输入 ──────────────────────────────────────────────────────
console.log("\n## 8. 空输入");
{
    assert(splitText("", 3).length === 0, "空串 → 0 段");
    assert(splitText(null, 3).length === 0, "null → 0 段");
    const c = new WaifuChunker({ flushSentences: 3 });
    c.push("");
    c.push(null);
    assert(c.finish().length === 0, "流式全空 → 0 段");
}

// ── 9. 流式 400 兜底（无句号流式） ─────────────────────────────────
console.log("\n## 9. 流式 400 兜底");
{
    const c = new WaifuChunker({ flushSentences: 3 });
    const out = c.push("字".repeat(410));
    assert(out.length === 1 && out[0].length === 400, "410 字无句号 → 400 段 + 10 字剩余", `${out.length}/${out[0] && out[0].length}`);
    const tail = c.finish();
    assert(tail.length === 1 && tail[0] === "字".repeat(10), "剩余 10 字", JSON.stringify(tail));
}

// ── 10. 与旧群聊语义一致性（原 splitReplyBySentenceCount 关键用例） ─
console.log("\n## 10. 与旧群聊语义一致性");
{
    const text = "第一句。第二句。第三句。第四句。第五句。第六句。";
    const oldStyle = splitText(text, 5); // 群聊 5 句一分
    assert(oldStyle.length === 2 && oldStyle[0] === "第一句。第二句。第三句。第四句。第五句。",
        "群聊 5 句一分语义保持", JSON.stringify(oldStyle));
    const c2c = splitText("一。二。三。", 3);
    assert(c2c.length === 1 && c2c[0] === "一。二。三。", "单聊 3 句一分语义保持", JSON.stringify(c2c));
}

// ── 11. normalizeNewlines 独立函数 ─────────────────────────────────
console.log("\n## 11. normalizeNewlines");
{
    assert(normalizeNewlines("a\n\n\nb") === "a\nb", "3 连换行 → 1");
    assert(normalizeNewlines("a\nb") === "a\nb", "单换行不动");
    assert(normalizeNewlines("") === "", "空串不动");
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);