#!/bin/bash
# qqbot-bridge-pro 开发目录同步脚本
# 用途：统一开发目录（dev_package）与 GitHub 镜像目录，消除双副本漂移
# 用法：从项目根目录执行 ./scripts/sync.sh（或用 bash scripts/sync.sh）
# 原理：主目录 /sdcard/Download/qqbot-bridge-pro/package 是唯一真相源（真相源）
#       dev_package/qqbot_bridge_pro 是官方烧录目录（副本），每次开发后跑本脚本同步
set -u

MAIN_DIR="/sdcard/Download/qqbot-bridge-pro/package"
DEV_DIR="/sdcard/Download/Operit/dev_package/qqbot_bridge_pro"

echo "=== qqbot-bridge-pro sync ==="

# 0. 前置检查：主目录必须存在
if [ ! -f "$MAIN_DIR/manifest.json" ]; then
    echo "ERROR: 主目录 manifest.json 不存在: $MAIN_DIR"
    exit 1
fi

# 1. 同步 dev_package <- 主目录（官方烧录需要）
mkdir -p "$DEV_DIR"
rm -rf "$DEV_DIR/manifest.json" "$DEV_DIR/src" "$DEV_DIR/dist" "$DEV_DIR/resources" "$DEV_DIR/test"
cp -r "$MAIN_DIR/manifest.json" "$MAIN_DIR/src" "$MAIN_DIR/dist" "$MAIN_DIR/resources" "$DEV_DIR/"
if [ -d "$MAIN_DIR/test" ]; then
    cp -r "$MAIN_DIR/test" "$DEV_DIR/"
fi
echo "OK  dev_package 已同步 (manifest/src/dist/resources + optional test)"

# 2. 清理 pycache
rm -rf "$DEV_DIR/resources/__pycache__" "$MAIN_DIR/resources/__pycache__"

# 3. 语法检查
echo "=== 语法检查 ==="
for f in "$DEV_DIR"/dist/main.js "$DEV_DIR"/dist/shared/*.js "$DEV_DIR"/dist/packages/*.js; do
    node --check "$f" 2>/dev/null && echo "OK  $(basename $f)" || echo "FAIL $f"
done
if [ -f "$DEV_DIR/resources/qqbot_pro_gateway.py" ]; then
    python3 -m py_compile "$DEV_DIR/resources/qqbot_pro_gateway.py" && echo "OK  qqbot_pro_gateway.py" || echo "FAIL qqbot_pro_gateway.py"
fi

echo "=== 完成 ==="
echo "开发目录: $DEV_DIR"
echo "主目录:   $MAIN_DIR"
echo "下一步：operit_editor:debug_install_toolpkg(source_path=$DEV_DIR)"