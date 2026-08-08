"use strict";
/**
 * G4：统一 Waifu chunker（2026-08-09 渡渡实现）
 *
 * 单聊流式分段与群聊完整文本分段共用同一状态机，禁止再维护两套正则。
 * 规则（V2-BLUEPRINT §12.4 / Epic G4）：
 *  - 句末计数：`。！？\n`（连续换行只计 1 句；跨 chunk 边界也连续跟踪）
 *  - 输出时连续换行归一化为单个换行；空白行不重复累计
 *  - maxLength（默认 400）为独立安全兜底，避免无句末符时无限增长
 *  - 纯 JS 实现，无 Java/Tools 依赖，node 可直接测试
 *
 * 使用：
 *  - 流式（单聊 waifu）：new WaifuChunker({flushSentences, maxLength}) → push(chunk) 收集片段 → finish()
 *  - 批处理（群聊完整回复）：splitText(text, flushSentences, maxLength)
 */

const SENTENCE_END_CHARS = new Set(["。", "！", "？", "\n"]);

/** 输出归一化：连续换行压成单个换行（切分后片段统一使用） */
function normalizeNewlines(text) {
    return String(text == null ? "" : text).replace(/\n{2,}/g, "\n");
}

/**
 * 从 buffer 开头切出最长可达片段：
 *  - 累计句末符（。！？\n；连续换行只计 1 句）达到 flushSentences，或
 *  - 累计字符数达到 maxLength
 * 即切出 [0, i)；剩余留在 buffer 中。
 * 整段不足一个片段时返回 null（继续累积）。
 */
function takeReadySegment(buffer, flushSentences, maxLength) {
    let count = 0;
    let lastWasNewline = false;
    let i = 0;
    let hit = false;
    while (i < buffer.length) {
        const ch = buffer[i];
        if (ch === "\n") {
            if (!lastWasNewline) count += 1;
            lastWasNewline = true;
        } else {
            if (SENTENCE_END_CHARS.has(ch)) count += 1;
            lastWasNewline = false;
        }
        i += 1;
        if (count >= flushSentences || i >= maxLength) {
            hit = true;
            break;
        }
    }
    if (!hit) return null;
    const segment = buffer.slice(0, i);
    const rest = buffer.slice(i);
    return { segment, rest };
}

class WaifuChunker {
    /**
     * @param {Object} [options]
     * @param {number} [options.flushSentences=3] 句末符计数阈值（clamp >= 1）
     * @param {number} [options.maxLength=400] 字符安全兜底（clamp >= 1）
     */
    constructor(options = {}) {
        this.flushSentences = Math.max(Math.floor(Number(options.flushSentences) || 3), 1);
        this.maxLength = Math.max(Math.floor(Number(options.maxLength) || 400), 1);
        this.buffer = "";
    }

    /**
     * 追加一段流式文本，返回本次可发送的完整片段数组（可能为 []）。
     * 片段已归一化换行并 trim。
     */
    push(chunk) {
        const text = String(chunk == null ? "" : chunk);
        const output = [];
        if (!text) return output;
        this.buffer += text;
        let ready = takeReadySegment(this.buffer, this.flushSentences, this.maxLength);
        while (ready) {
            const normalized = normalizeNewlines(ready.segment).trim();
            if (normalized) output.push(normalized);
            this.buffer = ready.rest;
            ready = takeReadySegment(this.buffer, this.flushSentences, this.maxLength);
        }
        return output;
    }

    /**
     * 流式结束，返回剩余片段数组（可能为 []）。
     */
    finish() {
        if (!this.buffer.trim()) {
            this.buffer = "";
            return [];
        }
        const segment = normalizeNewlines(this.buffer).trim();
        this.buffer = "";
        return segment ? [segment] : [];
    }
}

/**
 * 批处理：完整文本一次切成若干片段（群聊完整回复使用）。
 * 等价于 new WaifuChunker(...) 一次性 push 全部文本 + finish。
 */
function splitText(text, flushSentences = 3, maxLength = 400) {
    const chunker = new WaifuChunker({ flushSentences, maxLength });
    const output = chunker.push(String(text == null ? "" : text));
    output.push(...chunker.finish());
    return output;
}

module.exports = {
    WaifuChunker,
    splitText,
    normalizeNewlines,
    _internal: {
        takeReadySegment,
        SENTENCE_END_CHARS
    }
};
