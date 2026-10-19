#!/bin/sh
# 启动 Typora Studio。若普通 Electron 沙箱在受限环境中不可用，会尝试降级启动。
cd "$(dirname "$0")" || exit 1
if [ ! -x "node_modules/.bin/electron" ]; then
  echo "未找到 Electron，请先在本目录执行：npm install"
  exit 1
fi
echo "正在启动 Typora Studio…"
./node_modules/.bin/electron . "$@"
status=$?
if [ "$status" -ne 0 ]; then
  echo "普通启动失败，尝试无沙箱模式…"
  ./node_modules/.bin/electron . --no-sandbox --disable-gpu "$@"
fi
