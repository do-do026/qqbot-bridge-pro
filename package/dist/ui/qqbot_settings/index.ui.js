"use strict";
/*
 * qqbot-bridge-pro 设置页（compose_dsl）
 * 基于原包 qqbot_settings 移植，扩展：
 *  - 绑定 Operit 对话 ID（target_chat_id）
 *  - 群聊增强预留区（G1 群聚合窗口 / G3 群独立绑定 / 群候选 OPENIDS）
 * 依赖：shared/bridge_state.js（配置持久化）、shared/bridge_auto.js（桥工具）、packages/qqbot_pro_gateway.js（Gateway 工具）
 * 注意：注册入口在 main.js 中被注释（T16 热烧录 container 加载失败，待冷启动验证）
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
            title: "QQ Bot Bridge Pro Settings",
            subtitle: "Credentials, Gateway listener, auto reply bridge and group enhancement from one place.",
            statusTitle: "Current Status",
            statusConfigured: "Configured",
            statusNotConfigured: "Not configured",
            statusServiceRunning: "Gateway running",
            statusServiceStopped: "Gateway stopped",
            statusLoopRunning: "Auto reply running",
            statusLoopStopped: "Auto reply stopped",
            statusQueue: "Queued messages",
            statusBot: "Bot account",
            statusError: "Last error",
            credentialsTitle: "Credentials",
            appIdLabel: "App ID",
            appSecretLabel: "App Secret",
            appSecretHint: "Leave App Secret blank to keep the current value.",
            sandboxTitle: "Use sandbox",
            sandboxDesc: "Enable Tencent QQ Bot sandbox OpenAPI and Gateway endpoints.",
            saveCredentials: "Save Credentials",
            saveAndTest: "Save and Test",
            automationTitle: "Automation",
            c2cTitle: "Reply to private chats",
            c2cDesc: "Handle inbound C2C messages.",
            groupTitle: "Reply to group chats",
            groupDesc: "Handle inbound group messages.",
            waifuTitle: "Waifu mode",
            waifuDesc: "Flush replies by sentence count. Enabled by default.",
            pollLabel: "Poll interval (ms)",
            pollHint: "How often the auto reply loop checks the local QQ message queue.",
            aiTimeoutLabel: "AI timeout (ms)",
            aiTimeoutHint: "Maximum wait time for Operit AI to generate a reply.",
            chatGroupLabel: "Operit chat group",
            targetChatLabel: "Bound Operit Chat ID",
            targetChatHint: "Fixed Operit chat for all bridged QQ messages. Leave blank to auto-create per contact.",
            cardIdLabel: "Character Card (Optional)",
            cardDropdownNoCharacterCard: "No character card binding",
            cardDropdownBoundCard: "Character card bound",
            cardDropdownUnbound: "Current chat uses no character card",
            cardDropdownLoading: "Loading...",
            cardDropdownNoCards: "No character cards available",
            cardDropdownHint: "After selecting a card, QQ Bot auto reply will use that character card.",
            instructionLabel: "Bridge instruction",
            saveAutomation: "Save Automation",
            groupTitleSection: "Group Enhancement (G1/G3 reserved)",
            groupAggregateLabel: "Group aggregate window (ms)",
            groupAggregateHint: "Collect group @ messages within this window into one AI reply. G1 - reserved.",
            groupAggregateMaxLabel: "Group aggregate max items",
            groupAutoCreateLabel: "Auto-create chat per group",
            groupAutoCreateDesc: "Create a dedicated Operit chat per group. G3 - reserved.",
            groupTargetChatLabel: "Group bound chat ID (G3)",
            groupTargetChatHint: "Fixed chat for group messages. Leave blank to follow global binding.",
            groupOpenIdsLabel: "Group candidates (QQBOT_PRO_TARGET_GROUP_OPENIDS)",
            groupOpenIdsHint: "Comma/newline separated group_openid list for AI proactive send.",
            c2cOpenIdsLabel: "C2C candidates (QQBOT_PRO_TARGET_OPENIDS)",
            c2cOpenIdsHint: "Comma/newline separated openid list for AI proactive send.",
            controlsTitle: "Controls",
            listenerSwitchTitle: "Listener",
            listenerSwitchDesc: "Keep the QQ Gateway listener running.",
            autoReplySwitchTitle: "Auto reply",
            autoReplySwitchDesc: "Requires listener to be enabled.",
            refreshStatus: "Refresh Status",
            runOnce: "Run Once",
            loading: "Working...",
            savingDone: "Settings saved.",
            testingDone: "Saved and connection tested.",
            actionDone: "Action completed.",
            saveErrorPrefix: "Failed: ",
            invalidNumber: "Please enter a valid positive number.",
            leaveBlankToKeep: "Leave blank to keep current value."
        };
    }
    return {
        title: "QQ Bot Bridge Pro 设置",
        subtitle: "把凭证、Gateway 监听、自动回复桥和群聊增强放到一个页面里管理。",
        statusTitle: "当前状态",
        statusConfigured: "已配置",
        statusNotConfigured: "未配置",
        statusServiceRunning: "Gateway 运行中",
        statusServiceStopped: "Gateway 未运行",
        statusLoopRunning: "自动回复运行中",
        statusLoopStopped: "自动回复未运行",
        statusQueue: "消息队列",
        statusBot: "机器人账号",
        statusError: "最近错误",
        credentialsTitle: "凭证配置",
        appIdLabel: "App ID",
        appSecretLabel: "App Secret",
        appSecretHint: "App Secret 留空就表示保持当前值不变。",
        sandboxTitle: "使用沙箱",
        sandboxDesc: "启用腾讯 QQ Bot 的沙箱 OpenAPI 和 Gateway 地址。",
        saveCredentials: "保存凭证",
        saveAndTest: "保存并测试",
        automationTitle: "自动化",
        c2cTitle: "处理私聊消息",
        c2cDesc: "自动回复收到的 C2C 私聊消息。",
        groupTitle: "处理群消息",
        groupDesc: "自动回复收到的群消息。",
        waifuTitle: "Waifu 模式",
        waifuDesc: "按句数切分回复防刷屏，默认开启。",
        pollLabel: "轮询间隔（毫秒）",
        pollHint: "自动回复循环检查本地 QQ 消息队列的频率。",
        aiTimeoutLabel: "AI 超时（毫秒）",
        aiTimeoutHint: "等待 Operit AI 生成回复的最长时间。",
        chatGroupLabel: "Operit 会话分组",
        targetChatLabel: "绑定 Operit 对话 ID",
        targetChatHint: "所有桥接的 QQ 消息固定落到这个对话。留空则按联系人自动创建对话。",
        cardIdLabel: "绑定角色卡（可选）",
        cardDropdownNoCharacterCard: "不绑定角色卡",
        cardDropdownBoundCard: "已绑定角色卡",
        cardDropdownUnbound: "当前不使用角色卡",
        cardDropdownLoading: "加载中...",
        cardDropdownNoCards: "没有可用角色卡",
        cardDropdownHint: "选择角色卡后，QQ Bot 自动回复在创建会话和发送消息时会使用该角色卡。",
        instructionLabel: "桥接指令",
        saveAutomation: "保存自动化设置",
        groupTitleSection: "群聊增强（G1/G3 预留）",
        groupAggregateLabel: "群聚合窗口（毫秒）",
        groupAggregateHint: "窗口内同一群的多条 @ 消息合并成一次 AI 回复（G1，预留）。",
        groupAggregateMaxLabel: "群聚合最大条数",
        groupAutoCreateLabel: "每个群自动创建独立对话",
        groupAutoCreateDesc: "按群自动创建 Operit 专属对话（G3，预留）。",
        groupTargetChatLabel: "群绑定对话 ID（G3）",
        groupTargetChatHint: "群消息固定落盘的对话。留空沿用全局绑定。",
        groupOpenIdsLabel: "群候选（QQBOT_PRO_TARGET_GROUP_OPENIDS）",
        groupOpenIdsHint: "逗号/换行分隔的 group_openid 列表，供 AI 主动发送。",
        c2cOpenIdsLabel: "私聊候选（QQBOT_PRO_TARGET_OPENIDS）",
        c2cOpenIdsHint: "逗号/换行分隔的 openid 列表，供 AI 主动发送。",
        controlsTitle: "运行控制",
        listenerSwitchTitle: "监听开关",
        listenerSwitchDesc: "保持 QQ Gateway 监听运行。",
        autoReplySwitchTitle: "自动回复开关",
        autoReplySwitchDesc: "依赖监听开启。关闭监听时，这个开关会自动关闭。",
        refreshStatus: "刷新状态",
        runOnce: "手动跑一次",
        loading: "处理中...",
        savingDone: "设置已保存。",
        testingDone: "设置已保存，并完成连接测试。",
        actionDone: "操作已完成。",
        saveErrorPrefix: "失败：",
        invalidNumber: "请输入有效的正整数。",
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

function asPositiveNumber(raw) {
    const value = Number(String(raw).trim());
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.floor(value);
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
    const envC2cOpenIds = readEnvValue(ctx, "QQBOT_PRO_TARGET_OPENIDS");
    const envGroupOpenIds = readEnvValue(ctx, "QQBOT_PRO_TARGET_GROUP_OPENIDS");

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
    const targetChatIdState = useStateValue(ctx, "targetChatId", "");
    const characterCardIdState = useStateValue(ctx, "characterCardId", "");
    const instructionState = useStateValue(ctx, "instruction", "");
    const groupAggregateWindowState = useStateValue(ctx, "groupAggregateWindow", "25000");
    const groupAggregateMaxState = useStateValue(ctx, "groupAggregateMax", "10");
    const groupAutoCreateState = useStateValue(ctx, "groupAutoCreate", true);
    const groupTargetChatIdState = useStateValue(ctx, "groupTargetChatId", "");
    const c2cOpenIdsState = useStateValue(ctx, "c2cOpenIds", envC2cOpenIds);
    const groupOpenIdsState = useStateValue(ctx, "groupOpenIds", envGroupOpenIds);
    const statusState = useStateValue(ctx, "status", {
        configured: false,
        gatewayRunning: false,
        autoReplyRunning: false,
        queuePending: 0,
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
                queuePending: 0,
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
            targetChatIdState.set(String(autoCfg.targetChatId || ""));
            characterCardIdState.set(String(autoCfg.characterCardId || ""));
            instructionState.set(String(autoCfg.assistantInstruction || ""));
            groupAggregateWindowState.set(String(autoCfg.groupAggregateWindowMs || 25000));
            groupAggregateMaxState.set(String(autoCfg.groupAggregateMaxItems || 10));
            groupAutoCreateState.set(autoCfg.groupAutoCreateChat !== false);
            groupTargetChatIdState.set(String(autoCfg.groupTargetChatId || ""));
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
        }, testConnection ? text.testingDone : text.savingDone);
    };

    const saveAutomation = async () => {
        const pollIntervalMs = asPositiveNumber(pollIntervalInputState.value);
        const aiTimeoutMs = asPositiveNumber(aiTimeoutInputState.value);
        if (pollIntervalMs == null || aiTimeoutMs == null) {
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
            start_now: autoReplyEnabledState.value
        };
        if (targetChatIdState.value.trim()) {
            params.target_chat_id = targetChatIdState.value.trim();
        }
        await runAction("save_automation", async () => await bridgeAuto.qqbot_pro_bridge_configure(params), text.savingDone);
    };

    const saveGroupReserved = async () => {
        const current = await state.readPersistedConfigAsync();
        const autoCfg = { ...((current && current.autoReply) || {}) };
        const windowMs = asPositiveNumber(groupAggregateWindowState.value);
        const maxItems = asPositiveNumber(groupAggregateMaxState.value);
        if (windowMs == null || maxItems == null) {
            errorMessageState.set(text.invalidNumber);
            return;
        }
        autoCfg.groupAggregateWindowMs = windowMs;
        autoCfg.groupAggregateMaxItems = maxItems;
        autoCfg.groupAutoCreateChat = groupAutoCreateState.value;
        autoCfg.groupTargetChatId = groupTargetChatIdState.value.trim();
        await state.updatePersistedConfigAsync({ autoReply: autoCfg });
        if (c2cOpenIdsState.value.trim()) await state.writeEnv("QQBOT_PRO_TARGET_OPENIDS", c2cOpenIdsState.value.trim());
        else await state.writeEnv("QQBOT_PRO_TARGET_OPENIDS", "");
        if (groupOpenIdsState.value.trim()) await state.writeEnv("QQBOT_PRO_TARGET_GROUP_OPENIDS", groupOpenIdsState.value.trim());
        else await state.writeEnv("QQBOT_PRO_TARGET_GROUP_OPENIDS", "");
        await runAction("save_group", async () => ({ success: true }), text.savingDone);
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
        `${statusState.value.autoReplyRunning ? text.statusLoopRunning : text.statusLoopStopped}`,
        `${text.statusQueue}: ${statusState.value.queuePending}`
    ];
    if (statusState.value.botLabel) {
        statusLines.push(`${text.statusBot}: ${statusState.value.botLabel}`);
    }
    if (statusState.value.lastError) {
        statusLines.push(`${text.statusError}: ${statusState.value.lastError}`);
    }

    return ctx.UI.Column({ padding: 16, spacing: 16 }, [
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
                createToggleRow(ctx, text.sandboxTitle, text.sandboxDesc, useSandboxState.value, useSandboxState.set, !isAnyBusy),
                ctx.UI.Button({
                    text: isBusy("save_credentials") ? text.loading : text.saveCredentials,
                    enabled: !isAnyBusy,
                    fillMaxWidth: true,
                    onClick: async () => await saveCredentials(false)
                }),
                ctx.UI.Button({
                    text: isBusy("save_and_test") ? text.loading : text.saveAndTest,
                    enabled: !isAnyBusy,
                    fillMaxWidth: true,
                    onClick: async () => await saveCredentials(true)
                })
            ])
        ]),

        createSectionTitle(ctx, "settings", text.automationTitle),
        ctx.UI.Card({ fillMaxWidth: true }, [
            ctx.UI.Column({ padding: 16, spacing: 12 }, [
                createToggleRow(ctx, text.c2cTitle, text.c2cDesc, c2cEnabledState.value, c2cEnabledState.set, !isAnyBusy),
                createToggleRow(ctx, text.groupTitle, text.groupDesc, groupEnabledState.value, groupEnabledState.set, !isAnyBusy),
                createToggleRow(ctx, text.waifuTitle, text.waifuDesc, waifuState.value, waifuState.set, !isAnyBusy),
                ctx.UI.TextField({
                    label: text.pollLabel,
                    value: pollIntervalInputState.value,
                    onValueChange: pollIntervalInputState.set,
                    singleLine: true
                }),
                ctx.UI.Text({ text: text.pollHint, style: "bodySmall", color: "onSurfaceVariant" }),
                ctx.UI.TextField({
                    label: text.aiTimeoutLabel,
                    value: aiTimeoutInputState.value,
                    onValueChange: aiTimeoutInputState.set,
                    singleLine: true
                }),
                ctx.UI.Text({ text: text.aiTimeoutHint, style: "bodySmall", color: "onSurfaceVariant" }),
                ctx.UI.TextField({
                    label: text.chatGroupLabel,
                    value: chatGroupState.value,
                    onValueChange: chatGroupState.set,
                    singleLine: true
                }),
                ctx.UI.TextField({
                    label: text.targetChatLabel,
                    value: targetChatIdState.value,
                    onValueChange: targetChatIdState.set,
                    singleLine: true
                }),
                ctx.UI.Text({ text: text.targetChatHint, style: "bodySmall", color: "onSurfaceVariant" }),
                ctx.UI.TextField({
                    label: text.instructionLabel,
                    value: instructionState.value,
                    onValueChange: instructionState.set,
                    singleLine: false
                }),
                ctx.UI.TextField({
                    label: text.cardIdLabel,
                    value: characterCardIdState.value,
                    onValueChange: characterCardIdState.set,
                    singleLine: true
                }),
                ctx.UI.Text({ text: text.cardDropdownHint, style: "bodySmall", color: "onSurfaceVariant" }),
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
                    label: text.groupAggregateLabel,
                    value: groupAggregateWindowState.value,
                    onValueChange: groupAggregateWindowState.set,
                    singleLine: true
                }),
                ctx.UI.Text({ text: text.groupAggregateHint, style: "bodySmall", color: "onSurfaceVariant" }),
                ctx.UI.TextField({
                    label: text.groupAggregateMaxLabel,
                    value: groupAggregateMaxState.value,
                    onValueChange: groupAggregateMaxState.set,
                    singleLine: true
                }),
                createToggleRow(ctx, text.groupAutoCreateLabel, text.groupAutoCreateDesc, groupAutoCreateState.value, groupAutoCreateState.set, !isAnyBusy),
                ctx.UI.TextField({
                    label: text.groupTargetChatLabel,
                    value: groupTargetChatIdState.value,
                    onValueChange: groupTargetChatIdState.set,
                    singleLine: true
                }),
                ctx.UI.Text({ text: text.groupTargetChatHint, style: "bodySmall", color: "onSurfaceVariant" }),
                ctx.UI.TextField({
                    label: text.c2cOpenIdsLabel,
                    value: c2cOpenIdsState.value,
                    onValueChange: c2cOpenIdsState.set,
                    singleLine: false
                }),
                ctx.UI.Text({ text: text.c2cOpenIdsHint, style: "bodySmall", color: "onSurfaceVariant" }),
                ctx.UI.TextField({
                    label: text.groupOpenIdsLabel,
                    value: groupOpenIdsState.value,
                    onValueChange: groupOpenIdsState.set,
                    singleLine: false
                }),
                ctx.UI.Text({ text: text.groupOpenIdsHint, style: "bodySmall", color: "onSurfaceVariant" }),
                ctx.UI.Button({
                    text: isBusy("save_group") ? text.loading : text.saveAutomation,
                    enabled: !isAnyBusy,
                    fillMaxWidth: true,
                    onClick: async () => await saveGroupReserved()
                })
            ])
        ]),

        createSectionTitle(ctx, "power", text.controlsTitle),
        ctx.UI.Card({ fillMaxWidth: true }, [
            ctx.UI.Column({ padding: 16, spacing: 12 }, [
                createToggleRow(ctx, text.listenerSwitchTitle, text.listenerSwitchDesc, listenerEnabledState.value, async (checked) => await toggleListenerEnabled(checked), !isAnyBusy),
                createToggleRow(ctx, text.autoReplySwitchTitle, text.autoReplySwitchDesc, autoReplyEnabledState.value, async (checked) => await toggleAutoReplyEnabled(checked), !isAnyBusy),
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
    ]);
}