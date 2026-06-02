#!/bin/bash
# 库存管理系统 - 独立部署安装脚本
# server.cjs 已实现零外部依赖，无需 npm install

set -e

APP_DIR="$HOME/.inventory-app"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "===================================="
echo " 库存管理系统 - 独立部署安装"
echo "===================================="
echo ""

# 创建目标目录
mkdir -p "$APP_DIR"

# 复制服务器文件（零依赖）
echo "复制服务器文件..."
cp "$PROJECT_DIR/server.cjs" "$APP_DIR/"

echo ""
echo "✓ 安装完成！"
echo ""
echo "终端模式: node $APP_DIR/server.cjs"
echo "桌面模式: open /Applications/InventoryApp.app"
echo "局域网访问: http://$(ifconfig en0 2>/dev/null | grep 'inet ' | awk '{print $2}'):8888"
echo ""
