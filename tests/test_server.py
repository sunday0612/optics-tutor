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
 def test_stats_corrupt_line(self):
  Path(server.LOG_FILE).write_text('bad json\n{"type":"quiz","data":[],"time":"today"}\n',encoding='utf-8')
  self.assertEqual(self.req('/api/stats')[0],200)
if __name__=='__main__':unittest.main()
