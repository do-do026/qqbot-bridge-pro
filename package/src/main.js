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