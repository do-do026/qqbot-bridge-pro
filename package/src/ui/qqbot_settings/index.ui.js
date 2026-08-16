"use strict";
/*
 * qqbot-pro 设置页（compose_dsl）
 * G6（2026-08-16）：对齐当前 bridge_config.js schema 重写。
 *  - 去掉废弃字段：target_chat_id、groupAutoCreateChat、groupTargetChatId、groupAggregateMaxItems
 *  - 补齐：groupMessageMode、groupKeywords、groupContextMode/Before/After/Limit、groupMemberBindings、
 *           groupAiTimeoutMs、groupFlushConcurrency、groupCacheRecoveryMaxAgeMs、proactiveC2cOpenId
 * 依赖：shared/bridge_state.js（配置持久化）、shared/bridge_auto.js（桥工具）、packages/qqbot_pro_gateway.js
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Screen;
const state = require("../../shared/bridge_state.js");
const bridgeAuto = require("../../shared/bridge_auto.js");
const gateway = require("../../packages/qqbot_pro_gateway.js");

function resolveText() {
    const locale = typeof getLang === "function" ? String(getLang() || "").trim().toLowerCase() : "";
    if (locale.startsWith("en")) {
        return {
            title: "QQ Bot Pro Settings",
            subtitle: "Gateway, auto-reply bridge and group enhancement in one page.",
            statusTitle: "Status",
            statusConfigured: "Configured",
            statusNotConfigured: "Not configured",
            statusServiceRunning: "Gateway running",
            statusServiceStopped: "Gateway stopped",
            statusLoopRunning: "Auto reply running",
            statusLoopStopped: "Auto reply stopped",
            statusBot: "Bot",
            statusError: "Last error",
            credentialsTitle: "Credentials",
            appIdLabel: "App ID",
            appSecretLabel: "App Secret",
            appSecretHint: "Leave blank to keep current value.",
            sandboxTitle: "Use sandbox",
            saveCredentials: "Save Credentials",
            automationTitle: "Automation",
            c2cTitle: "Reply private chats",
            groupTitle: "Reply group chats",
            waifuTitle: "Waifu mode",
            pollLabel: "Poll interval (ms)",
            aiTimeoutLabel: "AI timeout (ms)",
            chatGroupLabel: "Chat group",
            cardIdLabel: "Character card ID",
            instructionLabel: "Bridge instruction",
            saveAutomation: "Save Automation",
            groupTitleSection: "Group",
            groupWindowLabel: "Aggregate window (ms)",
            groupAiTimeoutLabel: "Group AI timeout (ms)",
            groupModeLabel: "Trigger mode",
            groupModeAtOnly: "at_only",
            groupModeKeyword: "keyword_or_at",
            groupModeAll: "all",
            groupKeywordsLabel: "Trigger keywords",
            contextModeLabel: "Context mode",
            ctxModeOff: "off",
            ctxModeAuto: "automatic",
            ctxModeAgent: "agent_on_demand",
            ctxBeforeLabel: "Context before",
            ctxAfterLabel: "Context after",
            ctxLimitLabel: "Context limit",
            memberBindingsLabel: "Member bindings",
            proactiveLabel: "Proactive C2C openid",
            maxItemsLabel: "Per-group max items",
            flushConcurrencyLabel: "Flush concurrency",
            recoveryAgeLabel: "Cache recovery age (ms)",
            saveGroup: "Save Group",
            controlsTitle: "Controls",
            listenerSwitchTitle: "Listener",
            autoReplySwitchTitle: "Auto reply",
            refreshStatus: "Refresh Status",
            runOnce: "Run Once",
            loading: "Working...",
            savingDone: "Settings saved.",
            actionDone: "Action completed.",
            saveErrorPrefix: "Failed: ",
            invalidNumber: "Please enter a valid number.",
            leaveBlankToKeep: "Leave blank to keep current value."
        };
    }
    return {
        title: "QQ Bot Pro 设置",
        subtitle: "凭证、Gateway、自动回复桥和群聊增强，一页管完。",
        statusTitle: "当前状态",
        statusConfigured: "已配置",
        statusNotConfigured: "未配置",
        statusServiceRunning: "Gateway 运行中",
        statusServiceStopped: "Gateway 未运行",
        statusLoopRunning: "自动回复运行中",
        statusLoopStopped: "自动回复未运行",
        statusBot: "机器人账号",
        statusError: "最近错误",
        credentialsTitle: "凭证配置",
        appIdLabel: "App ID",
        appSecretLabel: "App Secret",
        appSecretHint: "App Secret 留空保持当前值。",
        sandboxTitle: "使用沙箱",
        saveCredentials: "保存凭证",
        automationTitle: "自动化",
        c2cTitle: "处理私聊消息",
        groupTitle: "处理群消息",
        waifuTitle: "Waifu 切分",
        pollLabel: "轮询间隔（毫秒）",
        aiTimeoutLabel: "AI 超时（毫秒）",
        chatGroupLabel: "对话分组",
        cardIdLabel: "角色卡 ID",
        instructionLabel: "桥接指令",
        saveAutomation: "保存自动化",
        groupTitleSection: "群聊增强",
        groupWindowLabel: "聚合窗口（毫秒）",
        groupAiTimeoutLabel: "群 AI 超时（毫秒）",
        groupModeLabel: "触发模式",
        groupModeAtOnly: "仅 @",
        groupModeKeyword: "@或关键词",
        groupModeAll: "全部",
        groupKeywordsLabel: "触发关键词",
        contextModeLabel: "上下文模式",
        ctxModeOff: "关闭",
        ctxModeAuto: "自动附带",
        ctxModeAgent: "按需查询",
        ctxBeforeLabel: "向前取上下文",
        ctxAfterLabel: "向后取上下文",
        ctxLimitLabel: "单次上限",
        memberBindingsLabel: "成员绑定",
        proactiveLabel: "C2C 主动目标",
        maxItemsLabel: "单群保留上限",
        flushConcurrencyLabel: "并发 flush",
        recoveryAgeLabel: "缓存恢复时长（毫秒）",
        saveGroup: "保存群聊设置",
        controlsTitle: "控制",
        listenerSwitchTitle: "Gateway 监听",
        autoReplySwitchTitle: "自动回复",
        refreshStatus: "刷新状态",
        runOnce: "手动跑一次",
        loading: "处理中...",
        savingDone: "设置已保存。",
        actionDone: "操作已完成。",
        saveErrorPrefix: "失败：",
        invalidNumber: "请输入有效数字。",
        leaveBlankToKeep: "留空表示保持当前值。"
    };
}

function useStateValue(ctx, key, initialValue) {
    const pair = ctx.useState(key, initialValue);
    return { value: pair[0], set: pair[1] };
}

function firstNonBlank(...values) {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }
    return "";
}

function asBoolean(value, fallback = false) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true") return true;
        if (normalized === "false") return false;
    }
    return fallback;
}

function asNumber(raw, fallback = 0) {
    const value = Number(String(raw).trim());
    return Number.isFinite(value) ? value : fallback;
}

function toErrorText(error) {
    if (error instanceof Error) return error.message || "unknown";
    return String(error || "unknown");
}

function readEnvValue(ctx, key) {
    return String(ctx.getEnv(key) || "").trim();
}

function createSectionTitle(ctx, icon, title) {
    return ctx.UI.Row({ verticalAlignment: "center" }, [
        ctx.UI.Icon({ name: icon, tint: "primary", size: 20 }),
        ctx.UI.Spacer({ width: 8 }),
        ctx.UI.Text({ text: title, style: "titleMedium", fontWeight: "bold", color: "primary" })
    ]);
}

function createToggleRow(ctx, title, subtitle, checked, onCheckedChange, enabled = true) {
    return ctx.UI.Row({
        fillMaxWidth: true,
        verticalAlignment: "center",
        horizontalArrangement: "spaceBetween"
    }, [
        ctx.UI.Column({ weight: 1, spacing: 4 }, [
            ctx.UI.Text({ text: title, style: "bodyMedium", fontWeight: "medium" }),
            ctx.UI.Text({ text: subtitle, style: "bodySmall", color: "onSurfaceVariant" })
        ]),
        ctx.UI.Spacer({ width: 12 }),
        ctx.UI.Switch({ checked, enabled, onCheckedChange })
    ]);
}

function Screen(ctx) {
    const text = resolveText();
    const envAppId = readEnvValue(ctx, "QQBOT_APP_ID");
    const envAppSecret = readEnvValue(ctx, "QQBOT_APP_SECRET");
    const envProactive = readEnvValue(ctx, "QQBOT_PRO_TARGET_OPENIDS");

    const appIdState = useStateValue(ctx, "appId", envAppId);
    const appSecretState = useStateValue(ctx, "appSecret", envAppSecret);
    const useSandboxState = useStateValue(ctx, "useSandbox", false);
    const listenerEnabledState = useStateValue(ctx, "listenerEnabled", false);
    const autoReplyEnabledState = useStateValue(ctx, "autoReplyEnabled", false);
    const c2cEnabledState = useStateValue(ctx, "c2cEnabled", true);
    const groupEnabledState = useStateValue(ctx, "groupEnabled", true);
    const waifuState = useStateValue(ctx, "waifu", true);
    const pollIntervalInputState = useStateValue(ctx, "pollIntervalInput", "3000");
    const aiTimeoutInputState = useStateValue(ctx, "aiTimeoutInput", "180000");
    const chatGroupState = useStateValue(ctx, "chatGroup", "QQ Bot");
    const characterCardIdState = useStateValue(ctx, "characterCardId", "");
    const instructionState = useStateValue(ctx, "instruction", "");
    const proactiveState = useStateValue(ctx, "proactive", envProactive);
    // 群聊
    const groupWindowState = useStateValue(ctx, "groupWindow", "60000");
    const groupAiTimeoutState = useStateValue(ctx, "groupAiTimeout", "120000");
    const groupModeState = useStateValue(ctx, "groupMode", "at_only");
    const groupKeywordsState = useStateValue(ctx, "groupKeywords", "");
    const ctxModeState = useStateValue(ctx, "ctxMode", "off");
    const ctxBeforeState = useStateValue(ctx, "ctxBefore", "5");
    const ctxAfterState = useStateValue(ctx, "ctxAfter", "5");
    const ctxLimitState = useStateValue(ctx, "ctxLimit", "20");
    const memberBindingsState = useStateValue(ctx, "memberBindings", "");
    const maxItemsState = useStateValue(ctx, "maxItems", "30");
    const flushConcurrencyState = useStateValue(ctx, "flushConcurrency", "3");
    const recoveryAgeState = useStateValue(ctx, "recoveryAge", "86400000");
    const statusState = useStateValue(ctx, "status", {
        configured: false,
        gatewayRunning: false,
        autoReplyRunning: false,
        botLabel: "",
        lastError: ""
    });
    const busyActionState = useStateValue(ctx, "busyAction", "");
    const successMessageState = useStateValue(ctx, "successMessage", "");
    const errorMessageState = useStateValue(ctx, "errorMessage", "");
    const isBusy = (action) => busyActionState.value === action;
    const isAnyBusy = busyActionState.value !== "";
    const clearMessages = () => {
        successMessageState.set("");
        errorMessageState.set("");
    };
    const refreshAll = async (clearStateMessages = true, markBusy = true) => {
        if (markBusy) busyActionState.set("refresh");
        if (clearStateMessages) clearMessages();
        try {
            const bridgeStatus = await bridgeAuto.qqbot_pro_bridge_status({ summary_only: true });
            const gatewayStatus = await gateway.qqbot_pro_gateway_status({});
            const storedConfig = await state.readPersistedConfigAsync();
            const autoCfg = (storedConfig && storedConfig.autoReply) || {};
            const running = asBoolean(bridgeStatus && bridgeStatus.runtime && bridgeStatus.runtime.running);
            const gwRunning = asBoolean(gatewayStatus && gatewayStatus.running);
            statusState.set({
                configured: !!appIdState.value.trim() || !!envAppId,
                gatewayRunning: gwRunning,
                autoReplyRunning: running,
                botLabel: firstNonBlank(String(gatewayStatus && gatewayStatus.botUsername || ""), String(gatewayStatus && gatewayStatus.botUserId || "")),
                lastError: firstNonBlank(String(bridgeStatus && bridgeStatus.runtime && bridgeStatus.runtime.lastError || ""))
            });
            listenerEnabledState.set(asBoolean(storedConfig && storedConfig.listenerEnabled, false));
            autoReplyEnabledState.set(asBoolean(autoCfg.enabled, false));
            c2cEnabledState.set(asBoolean(autoCfg.c2cEnabled, true));
            groupEnabledState.set(asBoolean(autoCfg.groupEnabled, true));
            waifuState.set(asBoolean(autoCfg.waifu, true));
            pollIntervalInputState.set(String(autoCfg.pollIntervalMs || 3000));
            aiTimeoutInputState.set(String(autoCfg.aiTimeoutMs || 180000));
            chatGroupState.set(String(autoCfg.chatGroup || "QQ Bot"));
            characterCardIdState.set(String(autoCfg.characterCardId || ""));
            instructionState.set(String(autoCfg.assistantInstruction || ""));
            proactiveState.set(String(autoCfg.proactiveC2cOpenId || envProactive || ""));
            groupWindowState.set(String(autoCfg.groupAggregateWindowMs != null ? autoCfg.groupAggregateWindowMs : 60000));
            groupAiTimeoutState.set(String(autoCfg.groupAiTimeoutMs || 120000));
            groupModeState.set(String(autoCfg.groupMessageMode || "at_only"));
            groupKeywordsState.set(Array.isArray(autoCfg.groupKeywords) ? autoCfg.groupKeywords.join(",") : String(autoCfg.groupKeywords || ""));
            ctxModeState.set(String(autoCfg.groupContextMode || "off"));
            ctxBeforeState.set(String(autoCfg.groupContextBefore != null ? autoCfg.groupContextBefore : 5));
            ctxAfterState.set(String(autoCfg.groupContextAfter != null ? autoCfg.groupContextAfter : 5));
            ctxLimitState.set(String(autoCfg.groupContextLimit != null ? autoCfg.groupContextLimit : 20));
            memberBindingsState.set(Array.isArray(autoCfg.groupMemberBindings) ? JSON.stringify(autoCfg.groupMemberBindings) : String(autoCfg.groupMemberBindings || ""));
            maxItemsState.set(String(autoCfg.groupMaxItems || 30));
            flushConcurrencyState.set(String(autoCfg.groupFlushConcurrency || 3));
            recoveryAgeState.set(String(autoCfg.groupCacheRecoveryMaxAgeMs || 86400000));
        }
        catch (error) {
            errorMessageState.set(`${text.saveErrorPrefix}${toErrorText(error)}`);
        }
        finally {
            if (markBusy) busyActionState.set("");
        }
    };

    const runAction = async (action, runner, successMessage) => {
        busyActionState.set(action);
        clearMessages();
        try {
            const result = await runner();
            if (result && result.success === false) throw new Error(String(result.error || "unknown"));
            await refreshAll(false, false);
            successMessageState.set(successMessage);
        }
        catch (error) {
            errorMessageState.set(`${text.saveErrorPrefix}${toErrorText(error)}`);
        }
        finally {
            busyActionState.set("");
        }
    };

    const saveCredentials = async (testConnection) => {
        const params = {
            app_id: appIdState.value.trim(),
            use_sandbox: useSandboxState.value,
            test_connection: testConnection
        };
        if (appSecretState.value.trim()) {
            params.app_secret = appSecretState.value.trim();
        }
        await runAction(testConnection ? "save_and_test" : "save_credentials", async () => {
            if (params.app_id) await state.writeEnv("QQBOT_APP_ID", params.app_id);
            if (params.app_secret) await state.writeEnv("QQBOT_APP_SECRET", params.app_secret);
            return { success: true };
        }, testConnection ? text.savingDone : text.savingDone);
    };

    const saveAutomation = async () => {
        const pollIntervalMs = asNumber(pollIntervalInputState.value);
        const aiTimeoutMs = asNumber(aiTimeoutInputState.value);
        if (!pollIntervalMs || !aiTimeoutMs) {
            errorMessageState.set(text.invalidNumber);
            return;
        }
        const params = {
            enabled: autoReplyEnabledState.value,
            c2c_enabled: c2cEnabledState.value,
            group_enabled: groupEnabledState.value,
            waifu: waifuState.value,
            poll_interval_ms: pollIntervalMs,
            ai_timeout_ms: aiTimeoutMs,
            chat_group: chatGroupState.value.trim(),
            character_card_id: characterCardIdState.value.trim(),
            assistant_instruction: instructionState.value.trim(),
            proactive_c2c_openid: proactiveState.value.trim(),
            start_now: autoReplyEnabledState.value
        };
        await runAction("save_automation", async () => await bridgeAuto.qqbot_pro_bridge_configure(params), text.savingDone);
    };

    const saveGroup = async () => {
        const windowMs = asNumber(groupWindowState.value);
        const groupAiTimeoutMs = asNumber(groupAiTimeoutState.value);
        const before = asNumber(ctxBeforeState.value);
        const after = asNumber(ctxAfterState.value);
        const limit = asNumber(ctxLimitState.value);
        const maxItems = asNumber(maxItemsState.value);
        const concurrency = asNumber(flushConcurrencyState.value);
        const recoveryAge = asNumber(recoveryAgeState.value);
        if (!windowMs || !groupAiTimeoutMs || !maxItems || !concurrency || !recoveryAge) {
            errorMessageState.set(text.invalidNumber);
            return;
        }
        const keywords = groupKeywordsState.value.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean);
        const bindingsRaw = memberBindingsState.value.trim();
        let memberBindings = [];
        if (bindingsRaw) {
            try {
                const parsed = JSON.parse(bindingsRaw);
                memberBindings = Array.isArray(parsed) ? parsed : [];
            }
            catch (_e) {
                errorMessageState.set(`${text.memberBindingsLabel}: JSON 格式错误`);
                return;
            }
        }
        const params = {
            group_aggregate_window_ms: windowMs,
            group_ai_timeout_ms: groupAiTimeoutMs,
            group_message_mode: groupModeState.value || "at_only",
            group_keywords: keywords,
            group_context_mode: ctxModeState.value || "off",
            group_context_before: before,
            group_context_after: after,
            group_context_limit: limit,
            group_member_bindings: memberBindings,
            group_max_items: maxItems,
            group_flush_concurrency: concurrency,
            group_cache_recovery_max_age_ms: recoveryAge,
            start_now: autoReplyEnabledState.value
        };
        await runAction("save_group", async () => await bridgeAuto.qqbot_pro_bridge_configure(params), text.savingDone);
    };

    const toggleAutoReplyEnabled = async (checked) => {
        if (!listenerEnabledState.value) {
            autoReplyEnabledState.set(false);
            return;
        }
        autoReplyEnabledState.set(checked);
        if (isAnyBusy) return;
        await runAction("save_automation", async () => await bridgeAuto.qqbot_pro_bridge_configure({
            enabled: checked,
            start_now: checked
        }), text.savingDone);
    };

    const toggleListenerEnabled = async (checked) => {
        listenerEnabledState.set(checked);
        if (!checked) autoReplyEnabledState.set(false);
        if (isAnyBusy) return;
        await runAction(checked ? "start_service" : "stop_service", async () => {
            const current = await state.readPersistedConfigAsync();
            await state.updatePersistedConfigAsync({ listenerEnabled: checked });
            if (checked) {
                return await gateway.qqbot_pro_gateway_start({});
            }
            return await gateway.qqbot_pro_gateway_stop({});
        }, text.actionDone);
    };

    const statusLines = [
        `${statusState.value.configured ? text.statusConfigured : text.statusNotConfigured}`,
        `${statusState.value.gatewayRunning ? text.statusServiceRunning : text.statusServiceStopped}`,
        `${statusState.value.autoReplyRunning ? text.statusLoopRunning : text.statusLoopStopped}`
    ];
    if (statusState.value.botLabel) {
        statusLines.push(`${text.statusBot}: ${statusState.value.botLabel}`);
    }
    if (statusState.value.lastError) {
        statusLines.push(`${text.statusError}: ${statusState.value.lastError}`);
    }

    const modeOptions = [
        { label: text.groupModeAtOnly, value: "at_only" },
        { label: text.groupModeKeyword, value: "keyword_or_at" },
        { label: text.groupModeAll, value: "all" }
    ];
    const ctxModeOptions = [
        { label: text.ctxModeOff, value: "off" },
        { label: text.ctxModeAuto, value: "automatic" },
        { label: text.ctxModeAgent, value: "agent_on_demand" }
    ];
    function renderOptions(ctx, options, selected, onSelect, enabled) {
        return ctx.UI.Column({ spacing: 8 }, options.map((opt) => ctx.UI.Button({
            key: opt.value,
            text: (selected.value === opt.value ? "● " : "○ ") + opt.label,
            enabled,
            fillMaxWidth: true,
            onClick: () => onSelect(opt.value)
        })));
    }
return ctx.UI.LazyColumn({ padding: 16, spacing: 16, content: [
        ctx.UI.Row({ verticalAlignment: "center" }, [
            ctx.UI.Icon({ name: "chat", tint: "primary", size: 24 }),
            ctx.UI.Spacer({ width: 8 }),
            ctx.UI.Text({ text: text.title, style: "headlineSmall", fontWeight: "bold" })
        ]),
        ctx.UI.Text({ text: text.subtitle, style: "bodyMedium", color: "onSurfaceVariant" }),

        createSectionTitle(ctx, "info", text.statusTitle),
        ctx.UI.Card({ fillMaxWidth: true }, [
            ctx.UI.Column({ padding: 16, spacing: 8 }, statusLines.map((line, index) => ctx.UI.Text({
                key: `status-${index}`,
                text: line,
                style: "bodyMedium",
                color: "onSurface"
            })))
        ]),

        createSectionTitle(ctx, "key", text.credentialsTitle),
        ctx.UI.Card({ fillMaxWidth: true }, [
            ctx.UI.Column({ padding: 16, spacing: 12 }, [
                ctx.UI.TextField({
                    label: text.appIdLabel,
                    value: appIdState.value,
                    onValueChange: appIdState.set,
                    singleLine: true
                }),
                ctx.UI.TextField({
                    label: text.appSecretLabel,
                    value: appSecretState.value,
                    onValueChange: appSecretState.set,
                    singleLine: true,
                    isPassword: true
                }),
                ctx.UI.Text({
                    text: `${text.appSecretHint} ${text.leaveBlankToKeep}`,
                    style: "bodySmall",
                    color: "onSurfaceVariant"
                }),
                createToggleRow(ctx, text.sandboxTitle, "", useSandboxState.value, useSandboxState.set, !isAnyBusy),
                ctx.UI.Button({
                    text: isBusy("save_credentials") ? text.loading : text.saveCredentials,
                    enabled: !isAnyBusy,
                    fillMaxWidth: true,
                    onClick: async () => await saveCredentials(false)
                })
            ])
        ]),

        createSectionTitle(ctx, "settings", text.automationTitle),
        ctx.UI.Card({ fillMaxWidth: true }, [
            ctx.UI.Column({ padding: 16, spacing: 12 }, [
                createToggleRow(ctx, text.c2cTitle, "", c2cEnabledState.value, c2cEnabledState.set, !isAnyBusy),
                createToggleRow(ctx, text.groupTitle, "", groupEnabledState.value, groupEnabledState.set, !isAnyBusy),
                createToggleRow(ctx, text.waifuTitle, "", waifuState.value, waifuState.set, !isAnyBusy),
                ctx.UI.TextField({
                    label: text.pollLabel,
                    value: pollIntervalInputState.value,
                    onValueChange: pollIntervalInputState.set,
                    singleLine: true
                }),
                ctx.UI.TextField({
                    label: text.aiTimeoutLabel,
                    value: aiTimeoutInputState.value,
                    onValueChange: aiTimeoutInputState.set,
                    singleLine: true
                }),
                ctx.UI.TextField({
                    label: text.chatGroupLabel,
                    value: chatGroupState.value,
                    onValueChange: chatGroupState.set,
                    singleLine: true
                }),
                ctx.UI.TextField({
                    label: text.cardIdLabel,
                    value: characterCardIdState.value,
                    onValueChange: characterCardIdState.set,
                    singleLine: true
                }),
                ctx.UI.TextField({
                    label: text.proactiveLabel,
                    value: proactiveState.value,
                    onValueChange: proactiveState.set,
                    singleLine: true
                }),
                ctx.UI.TextField({
                    label: text.instructionLabel,
                    value: instructionState.value,
                    onValueChange: instructionState.set,
                    singleLine: false
                }),
                ctx.UI.Button({
                    text: isBusy("save_automation") ? text.loading : text.saveAutomation,
                    enabled: !isAnyBusy,
                    fillMaxWidth: true,
                    onClick: async () => await saveAutomation()
                })
            ])
        ]),

        createSectionTitle(ctx, "groups", text.groupTitleSection),
        ctx.UI.Card({ fillMaxWidth: true }, [
            ctx.UI.Column({ padding: 16, spacing: 12 }, [
                ctx.UI.TextField({
                    label: text.groupWindowLabel,
                    value: groupWindowState.value,
                    onValueChange: groupWindowState.set,
                    singleLine: true
                }),
                ctx.UI.TextField({
                    label: text.groupAiTimeoutLabel,
                    value: groupAiTimeoutState.value,
                    onValueChange: groupAiTimeoutState.set,
                    singleLine: true
                }),
                ctx.UI.Text({ text: text.groupModeLabel, style: "bodySmall", color: "onSurfaceVariant" }),
                renderOptions(ctx, modeOptions, groupModeState, groupModeState.set, !isAnyBusy),
                ctx.UI.TextField({
                    label: text.groupKeywordsLabel,
                    value: groupKeywordsState.value,
                    onValueChange: groupKeywordsState.set,
                    singleLine: false
                }),
                ctx.UI.Text({ text: text.contextModeLabel, style: "bodySmall", color: "onSurfaceVariant" }),
                renderOptions(ctx, ctxModeOptions, ctxModeState, ctxModeState.set, !isAnyBusy),
                ctx.UI.TextField({
                    label: text.ctxBeforeLabel,
                    value: ctxBeforeState.value,
                    onValueChange: ctxBeforeState.set,
                    singleLine: true
                }),
                ctx.UI.TextField({
                    label: text.ctxAfterLabel,
                    value: ctxAfterState.value,
                    onValueChange: ctxAfterState.set,
                    singleLine: true
                }),
                ctx.UI.TextField({
                    label: text.ctxLimitLabel,
                    value: ctxLimitState.value,
                    onValueChange: ctxLimitState.set,
                    singleLine: true
                }),
                ctx.UI.TextField({
                    label: text.memberBindingsLabel,
                    value: memberBindingsState.value,
                    onValueChange: memberBindingsState.set,
                    singleLine: false
                }),
                ctx.UI.TextField({
                    label: text.maxItemsLabel,
                    value: maxItemsState.value,
                    onValueChange: maxItemsState.set,
                    singleLine: true
                }),
                ctx.UI.TextField({
                    label: text.flushConcurrencyLabel,
                    value: flushConcurrencyState.value,
                    onValueChange: flushConcurrencyState.set,
                    singleLine: true
                }),
                ctx.UI.TextField({
                    label: text.recoveryAgeLabel,
                    value: recoveryAgeState.value,
                    onValueChange: recoveryAgeState.set,
                    singleLine: true
                }),
                ctx.UI.Button({
                    text: isBusy("save_group") ? text.loading : text.saveGroup,
                    enabled: !isAnyBusy,
                    fillMaxWidth: true,
                    onClick: async () => await saveGroup()
                })
            ])
        ]),

        createSectionTitle(ctx, "power", text.controlsTitle),
        ctx.UI.Card({ fillMaxWidth: true }, [
            ctx.UI.Column({ padding: 16, spacing: 12 }, [
                createToggleRow(ctx, text.listenerSwitchTitle, "", listenerEnabledState.value, async (checked) => await toggleListenerEnabled(checked), !isAnyBusy),
                createToggleRow(ctx, text.autoReplySwitchTitle, "", autoReplyEnabledState.value, async (checked) => await toggleAutoReplyEnabled(checked), !isAnyBusy),
                ctx.UI.Button({
                    text: isBusy("refresh") ? text.loading : text.refreshStatus,
                    enabled: !isAnyBusy,
                    fillMaxWidth: true,
                    onClick: async () => await refreshAll()
                }),
                ctx.UI.Button({
                    text: isBusy("run_once") ? text.loading : text.runOnce,
                    enabled: !isAnyBusy,
                    fillMaxWidth: true,
                    onClick: async () => await runAction("run_once", async () => await bridgeAuto.qqbot_pro_bridge_run_once({}), text.actionDone)
                })
            ])
        ]),

        successMessageState.value ? ctx.UI.Text({ text: successMessageState.value, style: "bodyMedium", color: "primary" }) : ctx.UI.Spacer({ width: 1 }),
        errorMessageState.value ? ctx.UI.Text({ text: errorMessageState.value, style: "bodyMedium", color: "error" }) : ctx.UI.Spacer({ width: 1 })
    ]});
}