"""
一键打包成桌面软件：python build.py
  Windows → dist/光影助教-v版本号.exe（单个文件，双击即用，可以直接发给同学；文件属性里能看到版本号）
  macOS   → dist/光影助教.app（“显示简介”里能看到版本号）
版本号只在 server.py 的 APP_VERSION 里改一处，这里自动读取。
打包需要联网安装 pywebview 和 PyInstaller（只在第一次需要）。

python build.py --version-file 路径   只生成 Windows 版本信息文件（GitHub 自动发布时使用）
"""
import os
import plistlib
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
NAME = "光影助教"
DESC = "光影助教 · 波动光学可视化与虚拟实验"
MIRROR = "https://pypi.tuna.tsinghua.edu.cn/simple"
IS_WIN, IS_MAC = sys.platform == "win32", sys.platform == "darwin"


def fail(msg):
    print("\n[失败] " + msg)
    sys.exit(1)


def read_version():
    """从 server.py 读取 APP_VERSION，保证软件、安装包和发布页的版本号一致。"""
    with open(os.path.join(ROOT, "server.py"), encoding="utf-8") as f:
        m = re.search(r'^APP_VERSION\s*=\s*"(\d+)\.(\d+)\.(\d+)"', f.read(), re.M)
    if not m:
        fail("没有在 server.py 里找到 APP_VERSION（格式应为 \"主.次.修订\"）")
    return ".".join(m.groups())


def version_info(version, filename):
    """PyInstaller 的 Windows 版本信息（右键 exe → 属性 → 详细信息）。"""
    nums = tuple(int(x) for x in version.split(".")) + (0,)
    return f"""# 由 build.py 生成
VSVersionInfo(
  ffi=FixedFileInfo(filevers={nums}, prodvers={nums}, mask=0x3f, flags=0x0, OS=0x40004, fileType=0x1, subtype=0x0, date=(0, 0)),
  kids=[
    StringFileInfo([
      StringTable('080404b0', [
        StringStruct('CompanyName', '光影助教'),
        StringStruct('FileDescription', '{DESC}'),
        StringStruct('FileVersion', '{version}'),
        StringStruct('InternalName', 'GuangyingTutor'),
        StringStruct('LegalCopyright', 'MIT License'),
        StringStruct('OriginalFilename', '{filename}'),
        StringStruct('ProductName', '{NAME}'),
        StringStruct('ProductVersion', '{version}')])
    ]),
    VarFileInfo([VarStruct('Translation', [2052, 1200])])
  ]
)
"""


def write_version_file(path, version, filename):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(version_info(version, filename))


def mac_set_version(app, version):
    """把版本号写进 Info.plist，再重新做一次本地签名（改过 Info.plist 的签名会失效，Apple 芯片上会提示“已损坏”）。"""
    plist = os.path.join(app, "Contents", "Info.plist")
    with open(plist, "rb") as f:
        info = plistlib.load(f)
    info.update({"CFBundleShortVersionString": version, "CFBundleVersion": version, "CFBundleDisplayName": NAME,
                 "NSHumanReadableCopyright": "MIT License"})
    with open(plist, "wb") as f:
        plistlib.dump(info, f)
    if subprocess.call(["codesign", "--force", "--deep", "--sign", "-", app]) != 0:
        print("提示：重新签名失败。如果打开时提示“已损坏”，请在终端运行：xattr -cr " + app)


def pip_install():
    cmd = [sys.executable, "-m", "pip", "install", "--upgrade", "pywebview>=5", "pyinstaller>=6"]
    if subprocess.call(cmd + ["-i", MIRROR]) != 0:
        print("清华镜像安装失败，改用官方源重试……")
        if subprocess.call(cmd) != 0:
            fail("依赖安装失败。请检查网络；如果提示 pythonnet 安装出错，请改用 Python 3.12 再试。")


def main():
    os.chdir(ROOT)
    version = read_version()
    if len(sys.argv) == 3 and sys.argv[1] == "--version-file":
        write_version_file(sys.argv[2], version, os.environ.get("EXE_NAME", f"{NAME}-v{version}.exe"))
        print(sys.argv[2] + " ← v" + version)
        return
    if sys.version_info < (3, 9):
        fail("需要 Python 3.9 或更高版本，当前是 " + sys.version.split()[0])
    if IS_WIN and sys.version_info >= (3, 14):
        print("提示：如果安装 pywebview 时 pythonnet 报错，请改用 Python 3.12。")
    print(f"\n{NAME} v{version} · 打包")

    print("\n[1/3] 安装打包工具（第一次需要几分钟）")
    pip_install()

    print(f"\n[2/3] 打包 {NAME} v{version}")
    out_name = f"{NAME}-v{version}" if not IS_MAC else NAME           # macOS 的 .app 不带版本号，版本写在“显示简介”里
    sep = os.pathsep
    args = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--windowed", "--name", out_name,
            "--add-data", "web" + sep + "web"]
    if IS_WIN:
        vfile = os.path.join(ROOT, "build", "version_info.txt")
        write_version_file(vfile, version, out_name + ".exe")
        args += ["--onefile", "--icon", os.path.join("assets", "icon.ico"), "--version-file", vfile]
    elif IS_MAC:
        args += ["--icon", os.path.join("assets", "icon.icns"), "--osx-bundle-identifier", "edu.guangying.optics"]
    args.append("main.py")
    if subprocess.call(args) != 0:
        fail("PyInstaller 打包失败，请把上面的报错信息复制下来排查。")

    out = os.path.join(ROOT, "dist", out_name + (".exe" if IS_WIN else ".app" if IS_MAC else ""))
    if IS_MAC:
        mac_set_version(out, version)
    old = os.path.join(ROOT, "dist", NAME + ".exe")                         # 旧版脚本生成的、不带版本号的文件
    if IS_WIN and os.path.exists(old):
        try:
            os.remove(old)
        except OSError:
            pass
    shutil.rmtree(os.path.join(ROOT, "build"), ignore_errors=True)
    print(f"\n[3/3] 完成！{NAME} v{version}，软件位置：\n    " + out)
    if IS_WIN:
        print("双击即可运行，也可以把这个 exe 直接发给同学（对方不需要安装 Python）。右键 → 属性 → 详细信息 可以看到版本号。")
        os.startfile(os.path.join(ROOT, "dist"))  # noqa: S606
    elif IS_MAC:
        print("第一次打开如果提示“无法验证开发者”，请在 访达 中右键点软件 → 打开。")
        subprocess.call(["open", os.path.join(ROOT, "dist")])


if __name__ == "__main__":
    main()
