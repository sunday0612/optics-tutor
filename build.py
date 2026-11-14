"""
一键打包成桌面软件：python build.py
  Windows → dist/光影助教.exe（单个文件，双击即用，可以直接发给同学）
  macOS   → dist/光影助教.app
打包需要联网安装 pywebview 和 PyInstaller（只在第一次需要）。
"""
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
NAME = "光影助教"
MIRROR = "https://pypi.tuna.tsinghua.edu.cn/simple"
IS_WIN, IS_MAC = sys.platform == "win32", sys.platform == "darwin"


def fail(msg):
    print("\n[失败] " + msg)
    sys.exit(1)


def pip_install():
    cmd = [sys.executable, "-m", "pip", "install", "--upgrade", "pywebview>=5", "pyinstaller>=6"]
    if subprocess.call(cmd + ["-i", MIRROR]) != 0:
        print("清华镜像安装失败，改用官方源重试……")
        if subprocess.call(cmd) != 0:
            fail("依赖安装失败。请检查网络；如果提示 pythonnet 安装出错，请改用 Python 3.12 再试。")


def main():
    os.chdir(ROOT)
    if sys.version_info < (3, 9):
        fail("需要 Python 3.9 或更高版本，当前是 " + sys.version.split()[0])
    if IS_WIN and sys.version_info >= (3, 14):
        print("提示：如果安装 pywebview 时 pythonnet 报错，请改用 Python 3.12。")

    print("\n[1/3] 安装打包工具（第一次需要几分钟）")
    pip_install()

    print("\n[2/3] 打包 " + NAME)
    sep = os.pathsep
    args = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--windowed", "--name", NAME,
            "--add-data", "web" + sep + "web"]
    if IS_WIN:
        args += ["--onefile", "--icon", os.path.join("assets", "icon.ico")]
    elif IS_MAC:
        args += ["--icon", os.path.join("assets", "icon.icns"), "--osx-bundle-identifier", "edu.guangying.optics"]
    args.append("main.py")
    if subprocess.call(args) != 0:
        fail("PyInstaller 打包失败，请把上面的报错信息复制下来排查。")

    out = os.path.join(ROOT, "dist", NAME + (".exe" if IS_WIN else ".app" if IS_MAC else ""))
    print("\n[3/3] 完成！软件位置：\n    " + out)
    if IS_WIN:
        print("双击即可运行，也可以把这个 exe 直接发给同学（对方不需要安装 Python）。")
        os.startfile(os.path.join(ROOT, "dist"))  # noqa: S606
    elif IS_MAC:
        print("第一次打开如果提示“无法验证开发者”，请在 访达 中右键点软件 → 打开。")
        subprocess.call(["open", os.path.join(ROOT, "dist")])


if __name__ == "__main__":
    main()
