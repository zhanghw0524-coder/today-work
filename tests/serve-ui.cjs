// Isolated browser QA only. Never packaged or used as the application's launcher.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base='/today-work/';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
http.createServer((req,res)=>{
  let relative;
  try {const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!pathname.startsWith(base))throw Error();relative=pathname.slice(base.length)||'index.html';}
  catch {res.writeHead(404);res.end();return;}
  const before=relative.startsWith('before/');
  if(before)relative=relative.slice(7);
  const allowed=['index.html','qa.html','qa.js','manifest.webmanifest','service-worker.js'].includes(relative)||/^(?:css\/[a-z-]+\.css|js\/[a-z-]+\.js|icons\/[a-z0-9-]+\.(?:svg|png))$/.test(relative);
  const source=before?path.join(root,'test-artifacts','before-2.4'):root;
  const filename=!before&&relative==='qa.html'?path.join(__dirname,'browser-harness.html'):!before&&relative==='qa.js'?path.join(__dirname,'browser-harness.js'):path.resolve(source,relative);
  if(!allowed||!filename.startsWith(source+path.sep)){res.writeHead(404);res.end();return;}
  fs.readFile(filename,(error,data)=>{if(error){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);});
}).listen(8775,'127.0.0.1',()=>console.log('QA harness: http://127.0.0.1:8775/today-work/qa.html'));
