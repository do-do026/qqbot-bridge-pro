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

    // NOTE(T16): 宿主对含 compose_dsl UI 模块的 ToolPkg 热烧录仍有 bug（container did not appear）。
    // 2026-08-06 04:20 二次实测复现 → 保持注释，待宿主修复或走正常导入路径（.toolpkg 导入）。
    // const qqbotSettingsScreen = require("./ui/qqbot_settings/index.ui.js").default;
    // ToolPkg.registerToolboxUiModule({
    //     id: "qqbot_bridge_pro_settings",
    //     runtime: "compose_dsl",
    //     screen: qqbotSettingsScreen,
    //     params: {},
    //     title: { zh: "QQ Bot Bridge Pro 设置", en: "QQ Bot Bridge Pro Settings" }
    // });

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