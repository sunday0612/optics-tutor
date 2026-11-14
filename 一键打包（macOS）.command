#!/bin/bash
cd "$(dirname "$0")"
python3 build.py
read -p "按回车键关闭窗口……"
