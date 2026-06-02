#!/bin/bash
# 库存管理系统 - macOS 开机自启动设置脚本
# 用法: bash setup-startup.sh [tauri|server|remove]

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TAURI_APP="$APP_DIR/src-tauri/target/release/bundle/macos/InventoryApp.app"
PLIST_DST="$HOME/Library/LaunchAgents/com.inventory.app.plist"

echo "===================================="
echo " 库存管理系统 - 开机自启动设置"
echo "===================================="
echo ""

if [ "$1" = "remove" ]; then
    echo "正在移除开机自启动..."
    launchctl unload "$PLIST_DST" 2>/dev/null
    rm -f "$PLIST_DST"
    echo "✓ 已移除开机自启动"
    exit 0
fi

MODE="${1:-tauri}"

if [ "$MODE" = "server" ]; then
    echo "设置开机自启动（终端服务器模式）..."
    cat > "$PLIST_DST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.inventory.app</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>${APP_DIR}/server.cjs</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${APP_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${APP_DIR}/server.log</string>
    <key>StandardErrorPath</key>
    <string>${APP_DIR}/server.log</string>
</dict>
</plist>
EOF
else
    echo "设置开机自启动（桌面客户端模式）..."
    if [ ! -d "$TAURI_APP" ]; then
        echo "警告: 未找到 Tauri 应用包，请先运行 npm run tauri:build"
        echo "将使用终端服务器模式"
        exec "$0" server "$2"
        exit 0
    fi
    cat > "$PLIST_DST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.inventory.app</string>
    <key>ProgramArguments</key>
    <array>
        <string>open</string>
        <string>-a</string>
        <string>${TAURI_APP}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>
EOF
fi

launchctl load "$PLIST_DST" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✓ 开机自启动设置成功！"
    if [ "$MODE" = "server" ]; then
        echo "   模式: 终端服务器模式"
        echo "   开机自动启动 Node.js 服务器"
    else
        echo "   模式: 桌面客户端模式"
        echo "   开机自动启动 InventoryApp"
    fi
else
    echo "✗ 设置失败"
    exit 1
fi
