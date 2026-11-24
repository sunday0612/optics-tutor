"""
report.py —— 把前端整理好的实验报告内容生成 Word（.docx）或网页（.html，可在浏览器里打印为 PDF）。
只用 Python 标准库：.docx 本质是一个 zip，里面放 Office Open XML。

报告结构（前端 collectReport 生成）：
{
  "title": "迈克尔逊干涉仪测 He-Ne 激光波长", "version": "1.7.0", "date": "2026-11-23 09:30",
  "student": {"name": "", "sid": "", "cls": ""},
  "sections": [{"h": "实验原理", "blocks": [块, ...]}, ...]
}
块：{"p": [片段]}、{"li": [片段], "done": true}、{"table": [[[片段], ...], ...]}、{"img": "data:image/png;base64,...", "w": 宽px, "h": 高px, "cap": "说明"}
片段：{"t": "文字", "b": 加粗, "sub": 下标, "sup": 上标}
"""
import base64
import html
import io
import re
import zipfile
from xml.sax.saxutils import escape

EMU_PER_PX = 9525                 # 96 dpi
MAX_W_EMU = 5_760_000             # 正文宽度约 16 cm
IMG_RE = re.compile(r"^data:image/(png|jpeg);base64,([A-Za-z0-9+/=]+)$")


def _runs(runs):
    if isinstance(runs, str):
        runs = [{"t": runs}]
    return [r for r in (runs or []) if isinstance(r, dict) and str(r.get("t", ""))]


def _text(runs):
    return "".join(str(r.get("t", "")) for r in _runs(runs))


def _image(block):
    m = IMG_RE.match(str(block.get("img", "")))
    if not m:
        return None
    try:
        data = base64.b64decode(m.group(2), validate=True)
    except ValueError:
        return None
    w, h = max(1, int(block.get("w") or 600)), max(1, int(block.get("h") or 400))
    return {"ext": "jpeg" if m.group(1) == "jpeg" else "png", "data": data, "w": w, "h": h, "cap": str(block.get("cap", ""))}


# ---------------------------------------------------------------- Word
def _w_run(r, size=None):
    props = ""
    if r.get("b"):
        props += "<w:b/>"
    if r.get("sub"):
        props += '<w:vertAlign w:val="subscript"/>'
    elif r.get("sup"):
        props += '<w:vertAlign w:val="superscript"/>'
    if size:
        props += '<w:sz w:val="%d"/><w:szCs w:val="%d"/>' % (size, size)
    text = escape(str(r.get("t", "")))
    return '<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r>' % ("<w:rPr>%s</w:rPr>" % props if props else "", text)


def _w_par(runs, style=None, align=None, size=None):
    ppr = ""
    if style:
        ppr += '<w:pStyle w:val="%s"/>' % style
    if align:
        ppr += '<w:jc w:val="%s"/>' % align
    return "<w:p>%s%s</w:p>" % ("<w:pPr>%s</w:pPr>" % ppr if ppr else "", "".join(_w_run(r, size) for r in _runs(runs)))


def _w_table(rows):
    rows = [row for row in rows if isinstance(row, list) and row]
    if not rows:
        return ""
    ncol = max(len(r) for r in rows)
    out = ['<w:tbl><w:tblPr><w:tblStyle w:val="Grid"/><w:tblW w:w="5000" w:type="pct"/><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>%s</w:tblGrid>'
           % ("<w:gridCol/>" * ncol)]
    for i, row in enumerate(rows):
        cells = []
        for c in row + [[]] * (ncol - len(row)):
            runs = [dict(r, b=True) for r in _runs(c)] if i == 0 else _runs(c)
            shade = '<w:shd w:val="clear" w:color="auto" w:fill="EFEDE6"/>' if i == 0 else ""
            cells.append('<w:tc><w:tcPr>%s</w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/><w:jc w:val="center"/></w:pPr>%s</w:p></w:tc>'
                         % (shade, "".join(_w_run(r, 19) for r in runs)))
        out.append("<w:tr>%s</w:tr>" % "".join(cells))
    out.append("</w:tbl>")
    return "".join(out) + "<w:p/>"


def _w_image(img, rid, n):
    cx, cy = img["w"] * EMU_PER_PX, img["h"] * EMU_PER_PX
    if cx > MAX_W_EMU:
        cy, cx = int(cy * MAX_W_EMU / cx), MAX_W_EMU
    drawing = (
        '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
        '<wp:extent cx="%d" cy="%d"/><wp:docPr id="%d" name="图 %d"/>'
        '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>'
        '<pic:nvPicPr><pic:cNvPr id="%d" name="image%d.%s"/><pic:cNvPicPr/></pic:nvPicPr>'
        '<pic:blipFill><a:blip r:embed="%s"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="%d" cy="%d"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
        "</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>"
        % (cx, cy, n, n, n, n, img["ext"], rid, cx, cy))
    cap = _w_par([{"t": img["cap"]}], style="Caption", align="center") if img["cap"] else ""
    return drawing + cap


STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体" w:cs="Times New Roman"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="312" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr><w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="666666"/><w:sz w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Meta"><w:name w:val="Meta"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:color w:val="555555"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="Grid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders>
<w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/>
<w:insideH w:val="single" w:sz="4" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:color="999999"/></w:tblBorders>
<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>"""


def _meta(rep):
    st = rep.get("student") or {}
    parts = [("姓名", st.get("name")), ("学号", st.get("sid")), ("班级", st.get("cls"))]
    who = "　".join("%s：%s" % (k, str(v).strip()) for k, v in parts if str(v or "").strip())
    return (who + "　" if who else "") + "日期：" + str(rep.get("date", ""))


def footer(rep):
    src = {"real": "数据为学生在实验中实测并录入", "example": "数据为程序生成的示例数据，不是实测数据",
           "mixed": "数据中含有程序生成的示例数据（见“程序检查发现”），不全是实测数据"}.get(rep.get("source"), "数据来自虚拟实验")
    return "由光影助教 v%s 生成。%s，AI 评语仅供参考。" % (rep.get("version", ""), src)


def build_docx(rep):
    body, media, rels = [], [], []
    body.append(_w_par([{"t": "实验报告：" + str(rep.get("title", ""))}], style="Title"))
    body.append(_w_par([{"t": _meta(rep)}], style="Meta"))
    for sec in rep.get("sections") or []:
        body.append(_w_par([{"t": str(sec.get("h", ""))}], style="Heading1"))
        for b in sec.get("blocks") or []:
            if not isinstance(b, dict):
                continue
            if "p" in b:
                body.append(_w_par(b["p"]))
            elif "li" in b:
                body.append(_w_par([{"t": "✓ " if b.get("done") else "○ "}] + _runs(b["li"])))
            elif "table" in b:
                body.append(_w_table(b["table"]))
            elif "img" in b:
                img = _image(b)
                if img:
                    n = len(media) + 1
                    rid = "rIdImg%d" % n
                    media.append(("word/media/image%d.%s" % (n, img["ext"]), img["data"]))
                    rels.append('<Relationship Id="%s" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image%d.%s"/>' % (rid, n, img["ext"]))
                    body.append(_w_image(img, rid, n))
    body.append(_w_par([{"t": footer(rep)}], style="Caption", align="center"))
    doc = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
           '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
           'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
           'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
           'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
           'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>%s'
           '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1300" w:right="1200" w:bottom="1300" w:left="1200" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
           "</w:body></w:document>") % "".join(body)
    types = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
             '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
             '<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>'
             '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
             '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
             '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>')
    root_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
                 '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>')
    doc_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>%s</Relationships>') % "".join(rels)
    core = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">'
            "<dc:title>%s</dc:title><dc:creator>光影助教</dc:creator></cp:coreProperties>") % escape("实验报告：" + str(rep.get("title", "")))
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", types)
        z.writestr("_rels/.rels", root_rels)
        z.writestr("word/document.xml", doc)
        z.writestr("word/_rels/document.xml.rels", doc_rels)
        z.writestr("word/styles.xml", STYLES)
        z.writestr("docProps/core.xml", core)
        for name, data in media:
            z.writestr(name, data)
    return buf.getvalue()


# ---------------------------------------------------------------- 网页
def _h_runs(runs):
    out = []
    for r in _runs(runs):
        t = html.escape(str(r.get("t", "")))
        if r.get("sub"):
            t = "<sub>%s</sub>" % t
        elif r.get("sup"):
            t = "<sup>%s</sup>" % t
        if r.get("b"):
            t = "<b>%s</b>" % t
        out.append(t)
    return "".join(out)


def build_html(rep):
    out = []
    for sec in rep.get("sections") or []:
        out.append("<h2>%s</h2>" % html.escape(str(sec.get("h", ""))))
        items = []
        for b in sec.get("blocks") or []:
            if not isinstance(b, dict):
                continue
            if "li" in b:
                items.append('<li class="%s">%s</li>' % ("done" if b.get("done") else "", _h_runs(b["li"])))
                continue
            if items:
                out.append("<ul>%s</ul>" % "".join(items))
                items = []
            if "p" in b:
                out.append("<p>%s</p>" % _h_runs(b["p"]))
            elif "table" in b:
                rows = [r for r in b["table"] if isinstance(r, list)]
                out.append("<table>%s</table>" % "".join(
                    "<tr>%s</tr>" % "".join(("<th>%s</th>" if i == 0 else "<td>%s</td>") % _h_runs(c) for c in row)
                    for i, row in enumerate(rows)))
            elif "img" in b and _image(b):
                cap = html.escape(str(b.get("cap", "")))
                out.append('<figure><img src="%s" alt="%s" style="max-width:%dpx"><figcaption>%s</figcaption></figure>'
                           % (b["img"], cap, int(b.get("w") or 600), cap))
        if items:
            out.append("<ul>%s</ul>" % "".join(items))
    title = html.escape("实验报告：" + str(rep.get("title", "")))
    return """<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>%s</title>
<style>
body{font-family:"Times New Roman","Songti SC","SimSun",serif;max-width:760px;margin:32px auto;padding:0 20px;line-height:1.75;color:#1d1e21}
h1{font-family:"PingFang SC","Microsoft YaHei","SimHei",sans-serif;text-align:center;font-size:26px;margin:0 0 6px}
.meta{text-align:center;color:#555;margin-bottom:24px}
h2{font-family:"PingFang SC","Microsoft YaHei","SimHei",sans-serif;font-size:19px;border-bottom:1px solid #ccc;padding-bottom:4px;margin-top:28px}
table{border-collapse:collapse;margin:10px 0;font-size:14px}th,td{border:1px solid #999;padding:3px 8px;text-align:center}th{background:#efede6}
ul{padding-left:0;list-style:none}li::before{content:"○ "}li.done::before{content:"✓ ";color:#2f855a}
figure{text-align:center;margin:14px 0}img{max-width:100%%;height:auto}figcaption{color:#666;font-size:13px}
.foot{color:#777;font-size:12px;text-align:center;margin-top:36px}.bar{text-align:center;margin:14px 0}
button{font:inherit;padding:6px 16px;border:1px solid #888;border-radius:6px;background:#fff;cursor:pointer}
@media print{.bar{display:none}body{margin:0 auto}h2{break-after:avoid}figure,table{break-inside:avoid}}
</style></head><body>
<div class="bar"><button onclick="window.print()">打印 / 另存为 PDF</button></div>
<h1>%s</h1><div class="meta">%s</div>%s
<div class="foot">%s</div>
</body></html>""" % (title, title, html.escape(_meta(rep)), "".join(out), html.escape(footer(rep)))


def safe_name(s, limit=40):
    s = re.sub(r'[\\/:*?"<>|\r\n\t]+', "", str(s)).strip().strip(".")
    return s[:limit] or "实验报告"
