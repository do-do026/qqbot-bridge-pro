/*
 * qqbot-bridge-pro 主入口
 * 基于 qqbot-pro main.js 扩展：注册生命周期 hooks（自动启停增强 Gateway + 自动回复桥）
 * 工具由 manifest 的 subpackages 机制自动加载（dist/packages/*.js 的 METADATA 块）。
 */
"use strict";
const bridgeAuto = require("./shared/bridge_auto.js");

function logStartup(message) {
    console.log(`[qqbot-bridge-pro] ${message}`);
}

function registerToolPkg() {
    logStartup("registerToolPkg start");

    // NOTE(T16→T036→G6): 外部 ToolPkg 的设置页 UI 用 registerUiRoute + registerNavigationEntry
    // （参考 com.operit.mood_panel / examples/qqbot）。screen 必须传「模块函数」（require 进来的
    // ComposeDslScreen），不能传字符串路径（宿主无法加载 Screen）。保留 try-catch，UI 失败不拖垮工具/hooks。
    try {
        const qqbotSettingsScreen = require("./ui/qqbot_settings/index.ui.js");
        const UI_ROUTE = "toolpkg:com.operit.qqbot_pro:ui:qqbot_pro_settings";
        ToolPkg.registerUiRoute({
            id: "qqbot_pro_settings",
            route: UI_ROUTE,
            runtime: "compose_dsl",
            screen: qqbotSettingsScreen,
            params: {},
            keepAlive: false,
            title: { zh: "QQ Bot Pro 设置", en: "QQ Bot Pro Settings" }
        });
        ToolPkg.registerNavigationEntry({
            id: "qqbot_pro_sidebar_entry",
            route: UI_ROUTE,
            surface: "main_sidebar_plugins",
            title: { zh: "QQ Bot Pro", en: "QQ Bot Pro" },
            icon: "settings",
            order: 90
        });
        logStartup("UI route registered");
    }
    catch (error) {
        console.warn(`[qqbot-bridge-pro] UI route registration skipped: ${error && error.message ? error.message : error}`);
    }

    // 自动回复桥生命周期：app 创建/前台 → 自动拉起 Gateway + 桥；终止 → 停桥
    ToolPkg.registerAppLifecycleHook({
        id: "qqbot_bridge_auto_app_create",
        event: "application_on_create",
        function: bridgeAuto.onQQBotAutoReplyApplicationCreate
    });
    ToolPkg.registerAppLifecycleHook({
        id: "qqbot_bridge_auto_app_foreground",
        event: "application_on_foreground",
        function: bridgeAuto.onQQBotAutoReplyApplicationForeground
    });
    ToolPkg.registerAppLifecycleHook({
        id: "qqbot_bridge_auto_app_terminate",
        event: "application_on_terminate",
        function: bridgeAuto.onQQBotAutoReplyApplicationTerminate
    });

    logStartup("registerToolPkg done");
    return true;
}

module.exports = {
    registerToolPkg
};