const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const clone = value => JSON.parse(JSON.stringify(value));
function env() {
  const local = new Map(), images = new Map(), calls = []; let failLocal = false, failImages = false;
  const localStorage = { getItem:key => local.get(key) ?? null, setItem:(key,value) => { if (failLocal && key === 'forward-study.v1') throw Error('local quota'); local.set(key,String(value)); } };
  const db = { objectStoreNames:{ contains:()=>true }, transaction() {
    const tx = { error:null, abort(){ tx.error = Error('abort'); queueMicrotask(() => tx.onabort?.()); }, objectStore() {
      const request = (operation) => { const request = {}; queueMicrotask(() => {
        if (failImages) { tx.error = Error('image quota'); tx.onabort?.(); return; }
        request.result = operation(); request.onsuccess?.(); queueMicrotask(() => tx.oncomplete?.());
      }); return request; };
      return { put:asset=>request(()=>images.set(asset.id,clone(asset))), get:id=>request(()=>images.get(id)), delete:id=>request(()=>images.delete(id)) };
    } }; return tx;
  } };
  const indexedDB = { open:()=> { const request={}; queueMicrotask(()=>{ request.result=db; request.onsuccess?.(); }); return request; } };
  class Image {
    set src(value) { this.naturalWidth = value.startsWith('blob:') ? 3200 : 2; this.naturalHeight = value.startsWith('blob:') ? 1600 : 2; queueMicrotask(()=>this.onload()); }
  }
  const document = { createElement:()=>({ getContext:()=>({ drawImage:()=>{},fillRect:()=>{} }), toDataURL(type,quality){ calls.push([this.width,this.height,type,quality]); return 'data:image/webp;base64,AAAA'; } }) };
  const context = vm.createContext({ localStorage, indexedDB, Date, Math, Set, TextEncoder, console, Image, document, URL:{ createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{} } });
  for (const name of ['storage','defaults','models','plans','assets']) vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js',`${name}.js`),'utf8'),context);
  return { S:context.StudyStorage, B:context.TodayWorkAssets, local, images, calls, failLocal:value=>{failLocal=value;}, failImages:value=>{failImages=value;} };
}
const image = (id='image-1') => ({id,width:2,height:2,dataUrl:'data:image/png;base64,AAAA'});
function withImage(S,B,id='image-1') { const data=S.emptyData('2026-10-15');data.settings.personalization=B.defaults();data.settings.personalization.cards.left={mode:'image',assetId:id,x:20,y:80,overlay:false};return data; }
test('appearance defaults are independent; settings and backup reject invalid images, refs and crop values', () => {
  const {S,B}=env(); const settings=B.defaults();settings.cards.left.mode='hidden';assert.equal(settings.cards.right.mode,'default');
  assert.throws(()=>B.appearance({cards:{left:{mode:'image',assetId:'i',x:101}}}));
  const data=withImage(S,B);assert.throws(()=>S.parseBackup(JSON.stringify(S.backup(data))),/缺少/);
  assert.throws(()=>B.validateAsset({...image(),dataUrl:'data:image/svg+xml;base64,AAAA'}));
  assert.throws(()=>B.validateAsset({...image(),dataUrl:'data:image/png;base64,'+'A'.repeat(700000)}));
});
test('image compression validates type and source size, scales aspect ratio before encoding', async () => {
  const {B,calls}=env();await assert.rejects(B.compress({type:'image/svg+xml',size:10}));await assert.rejects(B.compress({type:'image/png',size:16*1024*1024}));
  const asset=await B.compress({type:'image/png',size:20000});assert.equal(asset.width,1600);assert.equal(asset.height,800);assert.equal(calls[0][2],'image/webp');
});
test('complete backup includes images/settings; old backups remain usable without opening image storage', async () => {
  const {S,B,images}=env();const data=withImage(S,B);images.set('image-1',image());
  const backup=await B.backup(data);const parsed=S.parseBackup(JSON.stringify(backup));
  assert.equal(parsed.imageAssets['image-1'].dataUrl,image().dataUrl);assert.equal(parsed.data.settings.personalization.cards.left.x,20);
  const old=S.emptyData();delete old.plans;delete old.settings.personalization;
  const result=await B.restore(S.parseBackup(JSON.stringify(old)));assert.equal(result.data.plans.length,0);
});
test('restore stages immutable images then commits full data; retained original image supports pre-restore backup', async () => {
  const {S,B,images}=env();const live=withImage(S,B,'old');images.set('old',image('old'));S.save(live);
  const candidate=withImage(S,B);const result=await B.restore({data:candidate,imageAssets:{'image-1':image()}});
  const id=result.data.settings.personalization.cards.left.assetId;assert.notEqual(id,'image-1');assert.ok(images.has(id));assert.ok(images.has('old'));
  assert.equal(S.load().settings.personalization.cards.left.assetId,id);
  const previous=S.parseBackup(result.previous.rawData,{allowExternalImages:true});assert.ok((await B.backup(previous.data)).imageAssets.old);
});
test('image-store failure or localStorage commit failure leaves live data and original image intact', async () => {
  const {S,B,images,local,failLocal,failImages}=env();const live=withImage(S,B,'old');images.set('old',image('old'));S.save(live);const original=local.get(S.KEY);
  const candidate={data:withImage(S,B),imageAssets:{'image-1':image()}};
  failImages(true);await assert.rejects(B.restore(candidate));assert.equal(local.get(S.KEY),original);assert.ok(images.has('old'));
  failImages(false);failLocal(true);await assert.rejects(B.restore(candidate));assert.equal(local.get(S.KEY),original);assert.equal(images.size,1);
});
