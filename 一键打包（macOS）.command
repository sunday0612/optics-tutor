#!/bin/bash
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  echo "[!] 没有找到 python3。请先从 https://www.python.org 安装 Python 3.12，再双击运行本文件。"
  read -p "按回车键关闭窗口……"
  exit 1
fi
python3 build.py
read -p "按回车键关闭窗口……"
