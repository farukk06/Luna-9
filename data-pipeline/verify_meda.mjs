import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const req=createRequire(root+'/frontend/package.json');
const {createServer}=await import(pathToFileURL(req.resolve('vite')).href);
const server=await createServer({root:root+'/frontend',configFile:false,server:{middlewareMode:true},appType:'custom'});
try {
 const payload=JSON.parse(readFileSync(root+'/frontend/public/data/meda.json','utf8'));
 const service=await server.ssrLoadModule('/src/services/meda.ts');
 assert(service.isValidMedaFile(payload));
 globalThis.fetch=async url=>{
   assert.equal(url,'/data/meda.json');
   return new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}});
 };
 assert.deepEqual(await service.loadMeda(),payload);
 const panel=await server.ssrLoadModule('/src/panels/ConditionsPanel.tsx');
 const React=req('react');const {renderToStaticMarkup}=req('react-dom/server');
 const html=renderToStaticMarkup(React.createElement(panel.default,{meda:payload,defaultOpen:true}));
 assert(html.includes('Historical MEDA data'));
 assert(html.includes('not current conditions'));
 console.log('MEDA_SCHEMA_V2_LOAD_AND_PANEL_IMPORT=PASS');
 console.log('sols',payload.sols.length,'observations',payload.sols.reduce((n,s)=>n+s.observations.length,0));
} finally {await server.close()}
