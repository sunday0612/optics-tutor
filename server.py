"""
光影助教 · 内置服务器
----------------------------------------------
桌面软件（main.py）启动时会在后台运行它，负责：
1. 提供界面文件（web 文件夹）
2. /api/chat      把提问转发给 DeepSeek（API Key 只保存在本机）
3. /api/settings  读取 / 保存 API Key 和模型；/api/test 测试连接
4. /api/log       记录使用数据；/api/stats 汇总；/api/open-data 打开数据文件夹
5. /api/report    生成实验报告（Word / 网页），/api/open-reports 打开报告文件夹，/api/report-who 记住报告上的姓名、学号、班级
6. /api/prefs     教学设置（不确定度约定、“我先算”的方式）

只用 Python 标准库。开发时也可以单独运行：python server.py，再用浏览器打开显示的地址。
"""
import base64
import json
import os
import subprocess
import sys
import time
import secrets
import threading
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import report

APP_NAME = "光影助教"
APP_VERSION = "1.11.0"


# ---------------- 路径 ----------------
def resource_dir():
    """界面文件所在目录。打包成软件后，PyInstaller 会把文件解压到 sys._MEIPASS。"""
    return getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))


def user_dir():
    """保存配置和使用数据的目录（可写）。"""
    if os.environ.get("GY_DATA_DIR"):
        base = os.environ["GY_DATA_DIR"]
    elif sys.platform == "win32":
        base = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), APP_NAME)
    elif sys.platform == "darwin":
        base = os.path.join(os.path.expanduser("~/Library/Application Support"), APP_NAME)
    else:
        base = os.path.join(os.path.expanduser("~"), ".optics-tutor")
    os.makedirs(base, exist_ok=True)
    return base


def report_dir():
    """实验报告保存在“文档/光影助教实验报告”，方便学生找到；测试时放在数据目录里。"""
    if os.environ.get("GY_DATA_DIR"):
        return os.path.join(os.environ["GY_DATA_DIR"], "reports")
    docs = os.path.join(os.path.expanduser("~"), "Documents")
    return os.path.join(docs if os.path.isdir(docs) else os.path.expanduser("~"), "光影助教实验报告")


RES_DIR = resource_dir()
WEB_DIR = os.path.join(RES_DIR, "web")
DATA_DIR = user_dir()
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")
LOG_FILE = os.path.join(DATA_DIR, "usage_log.jsonl")
MAX_BODY = 500_000
MAX_REPORT_BODY = 12_000_000          # 实验报告带图片，单独放宽
SESSION_TOKEN = secrets.token_urlsafe(32)
DATA_LOCK = threading.RLock()
LAB_FILE = os.path.join(DATA_DIR, "lab_sessions.json")
WHO_FILE = os.path.join(DATA_DIR, "report_who.json")   # 导出报告时填写的姓名、学号、班级
PREFS_FILE = os.path.join(DATA_DIR, "teaching.json")    # 教学设置：不确定度约定、“我先算”的方式
PREFS_OPTIONS = {"calc": ("try", "must", "show"), "tA": ("none", "t68"), "k": (1, 2), "sig": ("auto", "1", "2"), "round": ("up", "half")}
PREFS_DEFAULT = {"calc": "try", "tA": "none", "k": 1, "sig": "auto", "round": "up"}
LAB_ROW_LIMIT = {"bm": 1500}                           # 每个实验最多保存的记录条数；刀口扫描每次 30 点，单独放宽
WHO_KEYS = ("name", "sid", "cls")


def row_limit(lab):
    return LAB_ROW_LIMIT.get(lab, 500)
MODELS = ("deepseek-chat", "deepseek-reasoner")


# ---------------- 配置 ----------------
def load_config():
    """优先级：用户目录 config.json > 打包时内置的 default_config.json > 项目目录 config.json > 环境变量。"""
    cfg = {"api_key": os.environ.get("DEEPSEEK_API_KEY", ""), "model": "deepseek-chat",
           "base_url": os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com"), "temperature": 0.7}
    for path in (os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json"),
                 os.path.join(RES_DIR, "default_config.json"),
                 CONFIG_FILE):
        if os.path.exists(path):
            try:
                with open(path, encoding="utf-8") as f:
                    cfg.update({k: v for k, v in json.load(f).items() if v not in ("", None) and not str(v).startswith("在这里")})
            except (OSError, ValueError):
                pass
    if os.environ.get("DEEPSEEK_BASE_URL"):
        cfg["base_url"] = os.environ["DEEPSEEK_BASE_URL"]
    return cfg


CFG = load_config()


def save_config(api_key=None, model=None):
    saved = {}
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, encoding="utf-8") as f:
                saved = json.load(f)
        except (OSError, ValueError):
            saved = {}
    if api_key:
        saved["api_key"] = CFG["api_key"] = api_key
    if model in MODELS:
        saved["model"] = CFG["model"] = model
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(saved, f, ensure_ascii=False, indent=2)


def mask(key):
    return key[:5] + "…" + key[-4:] if len(key) > 12 else "已设置"


# ---------------- 使用数据 ----------------
def write_log(record):
    record["time"] = datetime.now().isoformat(timespec="seconds")
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


LAB_NAMES = {"mi": "迈克尔逊干涉仪", "nr": "牛顿环", "sp": "分光计", "pm": "三棱镜折射率", "fb": "光纤弯曲损耗", "pl": "马吕斯定律与波片", "ld": "半导体激光器与光电二极管", "bm": "激光光束半径与 M²", "ln": "光具座测焦距", "ts": "望远镜放大率与视场"}
# “处理我的数据”：真实实验数据，存档与虚拟实验分开
LAB_NAMES.update({"u" + k: v + "（实测数据）" for k, v in list(LAB_NAMES.items())})


def summary():
    """汇总使用记录，设置面板和 stats.py 共用。"""
    rows = []
    if os.path.exists(LOG_FILE):
        with open(LOG_FILE, encoding="utf-8") as f:
            for line in f:
                try:
                    row = json.loads(line)
                    if isinstance(row, dict) and isinstance(row.get("data"), dict) and isinstance(row.get("time"), str):
                        rows.append(row)
                except ValueError:
                    pass
    types = Counter(r.get("type") for r in rows)
    quiz = [r["data"].get("correct") for r in rows if r.get("type") == "quiz"]
    calls = [r["data"] for r in rows if r.get("type") == "ai_call"]
    secs = [c["seconds"] for c in calls if isinstance(c.get("seconds"), (int, float))]
    labs = {}
    for r in rows:
        if r.get("type") in ("lab_record", "lab_review"):
            name = LAB_NAMES.get(r["data"].get("lab"), r["data"].get("lab"))
            d = labs.setdefault(name, {"name": name, "records": 0, "reviews": 0})
            d["records" if r["type"] == "lab_record" else "reviews"] += 1
    return {
        "first": rows[0]["time"] if rows else None, "last": rows[-1]["time"] if rows else None,
        "days": len({r["time"][:10] for r in rows}), "events": len(rows),
        "ask": types["ask"], "adjust": types["adjust"],
        "quiz": len(quiz), "quiz_rate": (sum(1 for q in quiz if q) / len(quiz)) if quiz else 0,
        "labs": list(labs.values()),
        "ai_calls": len(calls), "ai_avg_seconds": round(sum(secs) / len(secs), 1) if secs else 0,
        "ai_tokens": sum(c.get("tokens") or 0 for c in calls if isinstance(c.get("tokens"), (int, float))), "ai_errors": types["ai_error"],
    }


# ---------------- DeepSeek ----------------
SYSTEM_PROMPT = "你是“光影助教”，一名耐心、严谨的大学物理（光学）课程 AI 助教，面向大一学生，回答使用简体中文。"
ERRORS = {401: "API Key 无效，请检查后重新填写", 402: "DeepSeek 账户余额不足，请先充值", 429: "请求太频繁，请稍后再试"}


def ask_deepseek(prompt, want_json=False, max_tokens=1500):
    payload = {"model": CFG["model"], "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
               "max_tokens": max_tokens, "stream": False}
    if CFG["model"] != "deepseek-reasoner":            # 推理模型不支持这两个参数
        payload["temperature"] = CFG["temperature"]
        if want_json:
            payload["response_format"] = {"type": "json_object"}
    req = urllib.request.Request(CFG["base_url"].rstrip("/") + "/chat/completions", data=json.dumps(payload).encode("utf-8"),
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + CFG["api_key"]}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"], data.get("usage", {})


def call_ai(prompt, want_json=False, max_tokens=1500):
    """返回 (状态码, 结果字典)。出错时把原因翻译成中文。"""
    if not CFG["api_key"]:
        return 503, {"error": "还没有设置 DeepSeek API Key", "code": "no_key"}
    t0 = time.time()
    try:
        text, usage = ask_deepseek(prompt, want_json, max_tokens)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")[:300]
        write_log({"type": "ai_error", "data": {"status": e.code, "detail": detail}})
        return 502, {"error": ERRORS.get(e.code, f"DeepSeek 返回错误 {e.code}"), "code": "rate_limited" if e.code == 429 else "upstream"}
    except Exception as e:  # noqa: BLE001  网络中断、超时等
        write_log({"type": "ai_error", "data": {"detail": str(e)[:300]}})
        return 502, {"error": "连接 DeepSeek 失败，请检查网络", "code": "network"}
    secs = round(time.time() - t0, 2)
    write_log({"type": "ai_call", "data": {"json": want_json, "seconds": secs, "tokens": usage.get("total_tokens")}})
    return 200, {"text": text, "seconds": secs}


def open_folder(path):
    if sys.platform == "win32":
        os.startfile(path)  # noqa: S606
    elif sys.platform == "darwin":
        subprocess.Popen(["open", path])
    else:
        subprocess.Popen(["xdg-open", path])


def save_report(req):
    """生成实验报告并保存到报告文件夹；同时返回文件内容（base64），浏览器里可以直接下载。"""
    rep, fmt = req.get("report"), req.get("format")
    if not isinstance(rep, dict) or fmt not in ("docx", "html"):
        return {"error": "报告内容或格式不对"}, 400
    try:
        data = report.build_docx(rep) if fmt == "docx" else report.build_html(rep).encode("utf-8")
        folder = report_dir()
        os.makedirs(folder, exist_ok=True)
        who = report.safe_name((rep.get("student") or {}).get("name", ""), 12)
        base = "%s%s_%s" % (report.safe_name(rep.get("title", "")), "_" + who if who != "实验报告" else "", datetime.now().strftime("%Y%m%d-%H%M%S"))
        for k in range(1, 1000):                        # 同一秒导出多份时加序号，不覆盖已有文件
            path = os.path.join(folder, base + ("" if k == 1 else "_%d" % k) + "." + fmt)
            try:
                with open(path, "xb") as f:
                    f.write(data)
                break
            except FileExistsError:
                continue
        else:
            raise OSError("同名报告太多，请清理报告文件夹")
        write_log({"type": "report", "data": {"format": fmt, "title": str(rep.get("title", ""))[:40], "bytes": len(data)}})
        return {"ok": True, "path": path, "name": os.path.basename(path), "b64": base64.b64encode(data).decode("ascii")}, 200
    except (OSError, ValueError, TypeError) as e:
        return {"error": "生成报告失败：" + str(e)}, 500


def load_labs():
    with DATA_LOCK:
        try:
            with open(LAB_FILE, encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict):
                raise ValueError("实验存档格式错误")
            return data
        except FileNotFoundError:
            return {}


def save_lab(lab, state):
    if lab not in LAB_NAMES or not isinstance(state, dict) or not isinstance(state.get("rows"), list):
        raise ValueError("实验数据格式不正确")
    if len(state["rows"]) > row_limit(lab):
        raise ValueError("每次实验最多保存 %d 条记录" % row_limit(lab))
    with DATA_LOCK:
        data = load_labs()
        data[lab] = state
        temp = LAB_FILE + ".tmp"
        with open(temp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, allow_nan=False)
        os.replace(temp, LAB_FILE)


def load_prefs():
    try:
        with open(PREFS_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    return {k: data[k] if data.get(k) in PREFS_OPTIONS[k] else PREFS_DEFAULT[k] for k in PREFS_OPTIONS}


def save_prefs(req):
    prefs = load_prefs()
    for k, opts in PREFS_OPTIONS.items():
        if k in req:
            if req[k] not in opts:
                raise ValueError("教学设置 %s 的取值不正确" % k)
            prefs[k] = req[k]
    with DATA_LOCK:
        temp = PREFS_FILE + ".tmp"
        with open(temp, "w", encoding="utf-8") as f:
            json.dump(prefs, f, ensure_ascii=False)
        os.replace(temp, PREFS_FILE)
    return prefs


def load_who():
    try:
        with open(WHO_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return {k: str(data.get(k, ""))[:40] for k in WHO_KEYS} if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save_who(req):
    """保存姓名、学号、班级；三项都为空时删除文件（公用电脑上清除个人信息）。"""
    who = {k: str(req.get(k, "")).strip()[:40] for k in WHO_KEYS}
    with DATA_LOCK:
        if not any(who.values()):
            try:
                os.remove(WHO_FILE)
            except FileNotFoundError:
                pass
            return who
        temp = WHO_FILE + ".tmp"
        with open(temp, "w", encoding="utf-8") as f:
            json.dump(who, f, ensure_ascii=False)
        os.replace(temp, WHO_FILE)
    return who


# ---------------- HTTP ----------------
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def end_headers(self):
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length < 0 or length > (MAX_REPORT_BODY if self.path == "/api/report" else MAX_BODY):
            raise ValueError("请求内容太长")
        req = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        if not isinstance(req, dict):
            raise ValueError("请求必须是 JSON 对象")
        return req

    def valid_host(self):
        return self.headers.get("Host") in (f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}")

    def do_GET(self):
        if not self.valid_host():
            return self.send_json({"error": "不允许的访问地址"}, 403)
        path = self.path.split("?")[0]
        if path == "/api/health":
            return self.send_json({"token": SESSION_TOKEN, "backend": True, "ok": bool(CFG["api_key"]), "model": CFG["model"], "version": APP_VERSION})
        if path == "/api/settings":
            return self.send_json({"has_key": bool(CFG["api_key"]), "key_masked": mask(CFG["api_key"]) if CFG["api_key"] else "",
                                   "model": CFG["model"], "data_dir": DATA_DIR})
        if path == "/api/labs":
            try:
                return self.send_json(load_labs())
            except (OSError, ValueError):
                return self.send_json({"error": "实验存档读取失败，请保留存档并检查数据文件"}, 500)
        if path == "/api/stats":
            return self.send_json(summary())
        if path == "/api/report-who":
            return self.send_json(load_who())
        if path == "/api/prefs":
            return self.send_json(load_prefs())
        return super().do_GET()

    def do_POST(self):
        origin = self.headers.get("Origin")
        expected = "http://" + self.headers.get("Host", "")
        if (not self.valid_host() or (origin and origin != expected)
                or not secrets.compare_digest(self.headers.get("X-Session-Token", ""), SESSION_TOKEN)):
            return self.send_json({"error": "请求来源无效，请重新打开软件"}, 403)
        if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/json":
            return self.send_json({"error": "需要 application/json"}, 415)
        try:
            req = self.read_json()
        except Exception as e:  # noqa: BLE001
            return self.send_json({"error": str(e), "code": "bad_request"}, 400)
        if self.path == "/api/labs":
            try:
                save_lab(req.get("lab"), req.get("state"))
                return self.send_json({"ok": True})
            except (ValueError, OSError) as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path == "/api/chat":
            prompt = str(req.get("prompt", "")).strip()
            if not prompt:
                return self.send_json({"error": "提问内容为空", "code": "bad_request"}, 400)
            status, result = call_ai(prompt, bool(req.get("json")))
            return self.send_json(result, status)
        if self.path == "/api/settings":
            key = str(req.get("api_key", "")).strip()
            save_config(key or None, req.get("model"))
            return self.send_json({"ok": True})
        if self.path == "/api/test":
            status, result = call_ai("请只回复两个字：收到", max_tokens=20)
            return self.send_json({"ok": status == 200, "seconds": result.get("seconds"), "error": result.get("error")}, status)
        if self.path == "/api/log":
            if not isinstance(req.get("data", {}), dict):
                return self.send_json({"error": "日志 data 必须是对象"}, 400)
            write_log({"type": str(req.get("type", ""))[:40], "data": req.get("data", {})})
            return self.send_json({"ok": True})
        if self.path == "/api/report":
            return self.send_json(*save_report(req))
        if self.path == "/api/prefs":
            try:
                return self.send_json({"ok": True, "prefs": save_prefs(req)})
            except ValueError as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path == "/api/report-who":
            try:
                return self.send_json({"ok": True, "who": save_who(req)})
            except OSError as e:
                return self.send_json({"error": str(e)}, 500)
        if self.path == "/api/open-reports":
            try:
                os.makedirs(report_dir(), exist_ok=True)
                open_folder(report_dir())
                return self.send_json({"ok": True})
            except Exception as e:  # noqa: BLE001
                return self.send_json({"error": str(e)}, 500)
        if self.path == "/api/open-data":
            try:
                open_folder(DATA_DIR)
                return self.send_json({"ok": True})
            except Exception as e:  # noqa: BLE001
                return self.send_json({"error": str(e)}, 500)
        return self.send_json({"error": "未知接口"}, 404)

    def log_message(self, fmt, *args):
        # 打包成窗口程序后没有终端（sys.stderr 为 None），这里要先判断
        if sys.stderr and self.path.startswith("/api/"):
            sys.stderr.write("[%s] %s\n" % (datetime.now().strftime("%H:%M:%S"), fmt % args))


def make_server(port=0):
    """port=0 表示自动选一个空闲端口。只监听本机，不对局域网开放。"""
    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


if __name__ == "__main__":
    httpd = make_server(int(os.environ.get("PORT", 8000)))
    print("光影助教（开发模式）：浏览器打开 http://localhost:%d" % httpd.server_address[1])
    print("数据目录：" + DATA_DIR)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
