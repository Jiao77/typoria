#!/bin/sh
# 双击启动打包好的 Typora Studio，并移除可能阻止本地应用的 quarantine 标记。
cd "$(dirname "$0")" || exit 1
APP="dist-package/Typora Studio.app"
if [ ! -d "$APP" ]; then
  echo "未找到应用：$APP"
  echo "请先运行：npm run package:mac"
  read -r -p "按回车退出…" _
  exit 1
fi
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
open "$APP" || "$APP/Contents/MacOS/Typora Studio" --no-sandbox --disable-gpu
