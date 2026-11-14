"""
光影助教 · 桌面版入口
双击打包好的软件时运行的就是这个文件：
在后台启动内置服务器，然后用系统自带的浏览器内核（Windows 的 WebView2 / macOS 的 WebKit）
打开一个独立的软件窗口。
开发时运行：python main.py   （需要先 pip install pywebview）
"""
import sys
import threading

import server


def main():
    httpd = server.make_server(0)                      # 自动选择空闲端口，只对本机开放
    url = "http://127.0.0.1:%d/" % httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    try:
        import webview
    except ImportError:
        msg = "缺少 pywebview。请先运行：pip install pywebview\n或直接双击“打包成软件”脚本生成可执行程序。"
        try:
            import tkinter
            from tkinter import messagebox
            tkinter.Tk().withdraw()
            messagebox.showerror("光影助教", msg)
        except Exception:  # noqa: BLE001
            print(msg)
        sys.exit(1)

    webview.create_window(
        "光影助教", url,
        width=1440, height=920, min_size=(1100, 720), maximized=True,
        background_color="#ECEEEB", text_select=True,
    )
    webview.start()
    httpd.shutdown()


if __name__ == "__main__":
    main()
