"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Screen;
function Screen(ctx) {
    return ctx.UI.Column({ padding: 16, spacing: 16 }, [
        ctx.UI.Text({ text: "QQ Bot Bridge Pro Settings - test screen", style: "headlineSmall" })
    ]);
}