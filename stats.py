"""
在终端里查看使用统计：python stats.py
（软件里“设置 → 使用数据”显示的是同样的内容）
"""
from server import LOG_FILE, summary


def main():
    s = summary()
    if not s["events"]:
        print("还没有使用记录。记录文件位置：" + LOG_FILE)
        return
    print("========== 光影助教 使用统计 ==========")
    print(f"时间范围：{s['first']} ~ {s['last']}（共 {s['days']} 天）")
    print(f"AI 提问：{s['ask']} 次")
    print(f"手动调参：{s['adjust']} 次")
    print(f"随堂小测：{s['quiz']} 道，正确率 {s['quiz_rate']:.0%}")
    for lab in s["labs"]:
        print(f"虚拟实验·{lab['name']}：记录 {lab['records']} 条，AI 批改 {lab['reviews']} 次")
    print(f"DeepSeek 调用：{s['ai_calls']} 次，平均响应 {s['ai_avg_seconds']} 秒，共 {s['ai_tokens']} tokens")
    print(f"AI 调用失败：{s['ai_errors']} 次")
    print("记录文件：" + LOG_FILE)


if __name__ == "__main__":
    main()
