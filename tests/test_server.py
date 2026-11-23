import os, sys, tempfile, unittest, threading, json, urllib.request, urllib.error
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
_tmp=tempfile.TemporaryDirectory()
os.environ['GY_DATA_DIR']=_tmp.name
import server
server.CFG['api_key']=''
class API(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.http=server.make_server(0); cls.port=cls.http.server_port
  cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True); cls.thread.start()
 @classmethod
 def tearDownClass(cls): cls.http.shutdown(); cls.http.server_close(); _tmp.cleanup()
 def req(self,path,data=None,headers=None):
  h={'Content-Type':'application/json','X-Session-Token':server.SESSION_TOKEN}; h.update(headers or {})
  req=urllib.request.Request(f'http://127.0.0.1:{self.port}'+path,data=None if data is None else json.dumps(data).encode(),headers=h)
  try:
   with urllib.request.urlopen(req) as r:return r.status,json.load(r)
  except urllib.error.HTTPError as e:
   with e:return e.code,json.load(e)
 def test_health(self): self.assertEqual(self.req('/api/health')[1]['token'],server.SESSION_TOKEN)
 def test_no_token(self):self.assertEqual(self.req('/api/chat',{'prompt':'x'},{'X-Session-Token':''})[0],403)
 def test_origin(self):self.assertEqual(self.req('/api/chat',{'prompt':'x'},{'Origin':'https://external.example'})[0],403)
 def test_content_type(self):self.assertEqual(self.req('/api/chat',{'prompt':'x'},{'Content-Type':'text/plain'})[0],415)
 def test_array(self):self.assertEqual(self.req('/api/chat',[])[0],400)
 def test_bad_log(self):self.assertEqual(self.req('/api/log',{'type':'quiz','data':[]})[0],400)
 def test_persistence(self):
  state={'rows':[{'N':50,'R':32.1}],'M':32.1,'review':'saved review'}
  self.assertEqual(self.req('/api/labs',{'lab':'mi','state':state})[0],200)
  self.assertEqual(self.req('/api/labs')[1]['mi'],state)
  self.assertEqual(server.load_labs()['mi'],state)
  self.assertEqual(json.loads(Path(server.LAB_FILE).read_text(encoding='utf-8'))['mi'],state)
 def test_fiber_lab(self):
  state={'rows':[{'t':'base','P':700.1}],'x':0.1,'review':''}
  self.assertEqual(self.req('/api/labs',{'lab':'fb','state':state})[0],200)
  self.assertEqual(self.req('/api/labs')[1]['fb'],state)
 def test_build_version(self):
  import build
  self.assertEqual(build.read_version(),server.APP_VERSION)
  text=build.version_info(server.APP_VERSION,'光影助教-v'+server.APP_VERSION+'.exe')
  got={}
  rec=lambda name:(lambda *a,**k:(name,a,k))
  env={n:rec(n) for n in ['VSVersionInfo','FixedFileInfo','StringFileInfo','StringTable','VarFileInfo','VarStruct']}
  env['StringStruct']=lambda k,v:got.__setitem__(k,v)
  eval(text.split('\n',1)[1],env)                                    # PyInstaller 用 eval 读取这个文件
  self.assertEqual(got['FileVersion'],server.APP_VERSION); self.assertEqual(got['ProductVersion'],server.APP_VERSION)
  filevers=eval(text.split('\n',1)[1],{**env,'VSVersionInfo':lambda ffi,kids:ffi,'FixedFileInfo':lambda **k:k['filevers']})
  self.assertEqual(filevers,tuple(int(x) for x in server.APP_VERSION.split('.'))+(0,))
 def test_report_docx_and_html(self):
  import report, zipfile, io, base64
  from xml.etree import ElementTree as ET
  png=base64.b64encode(bytes.fromhex('89504e470d0a1a0a0000000d4948445200000001000000010806000000'
   '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082')).decode()
  rep={'title':'测试实验','version':server.APP_VERSION,'date':'2026-11-23 09:00','student':{'name':'张三','sid':'1','cls':''},
   'sections':[{'h':'一、原理','blocks':[{'p':[{'t':'u'},{'t':'A','sub':True},{'t':' < 1 & 2','b':True}]},{'li':[{'t':'第一步'}],'done':True}]},
               {'h':'二、数据','blocks':[{'table':[[[{'t':'z'}],[{'t':'w'}]],[[{'t':'100'}],[{'t':'0.44'}]]]},{'img':'data:image/png;base64,'+png,'w':400,'h':200,'cap':'图'},{'img':'data:image/png;base64,@@@'}]}]}
  z=zipfile.ZipFile(io.BytesIO(report.build_docx(rep)))
  self.assertIn('word/media/image1.png',z.namelist()); self.assertNotIn('word/media/image2.png',z.namelist())
  doc=ET.fromstring(z.read('word/document.xml'))                     # XML 合法（含 < & 等需要转义的字符）
  W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
  self.assertTrue(any(v.get(W+'val')=='subscript' for v in doc.iter(W+'vertAlign')))
  self.assertEqual(len(list(doc.iter(W+'tbl'))),1)
  for name in ('[Content_Types].xml','_rels/.rels','word/_rels/document.xml.rels','word/styles.xml'): ET.fromstring(z.read(name))
  h=report.build_html(rep)
  self.assertIn('<sub>A</sub>',h); self.assertIn('&lt; 1 &amp; 2',h); self.assertIn('张三',h)
  self.assertEqual(report.safe_name('a/b:c*?'),'abc')
  st,j=self.req('/api/report',{'format':'docx','report':rep})
  self.assertEqual(st,200); self.assertTrue(j['name'].endswith('.docx')); self.assertTrue(os.path.exists(j['path']))
  self.assertEqual(self.req('/api/report',{'format':'pdf','report':rep})[0],400)
 def test_report_same_second_not_overwritten(self):
  from unittest import mock
  from datetime import datetime as real
  rep=lambda body:{'title':'同秒','student':{'name':'李四'},'sections':[{'h':'一','blocks':[{'p':[{'t':body}]}]}]}
  with mock.patch.object(server,'datetime') as dt:
   dt.now.return_value=real(2026,11,23,9,0,0)
   a=self.req('/api/report',{'format':'html','report':rep('第一份')})[1]; b=self.req('/api/report',{'format':'html','report':rep('第二份')})[1]
  self.assertNotEqual(a['path'],b['path']); self.assertTrue(b['name'].endswith('_2.html'))
  self.assertIn('第一份',Path(a['path']).read_text(encoding='utf-8')); self.assertIn('第二份',Path(b['path']).read_text(encoding='utf-8'))
 def test_report_who(self):
  self.assertEqual(self.req('/api/report-who',{'name':' 王五 ','sid':'2025','cls':'光电','x':'ignored'})[0],200)
  self.assertEqual(self.req('/api/report-who')[1],{'name':'王五','sid':'2025','cls':'光电'})
  self.assertEqual(self.req('/api/report-who',{'name':'','sid':'','cls':''})[0],200)
  self.assertEqual(self.req('/api/report-who')[1],{}); self.assertFalse(os.path.exists(server.WHO_FILE))
 def test_row_limits(self):
  rows=lambda n:{'rows':[{'z':100,'x':1.0,'P':0.5}]*n,'review':''}
  self.assertEqual(self.req('/api/labs',{'lab':'bm','state':rows(1500)})[0],200)
  self.assertEqual(self.req('/api/labs',{'lab':'bm','state':rows(1501)})[0],400)
  self.assertEqual(self.req('/api/labs',{'lab':'mi','state':rows(501)})[0],400)
 def test_stats_corrupt_line(self):
  Path(server.LOG_FILE).write_text('bad json\n{"type":"quiz","data":[],"time":"today"}\n',encoding='utf-8')
  self.assertEqual(self.req('/api/stats')[0],200)
if __name__=='__main__':unittest.main()
