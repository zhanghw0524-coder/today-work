const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const clone = value => JSON.parse(JSON.stringify(value));
function env() {
  const local = new Map(), images = new Map(), calls = []; let failLocal = false, failImages = false;
  const localStorage = { getItem:key => local.get(key) ?? null, setItem:(key,value) => { if (failLocal && key === 'forward-study.v1') throw Error('local quota'); local.set(key,String(value)); }, key:index=>[...local.keys()][index],get length(){return local.size;} };
  const db = { objectStoreNames:{ contains:()=>true }, transaction() {
    const tx = { error:null, abort(){ tx.error = Error('abort'); queueMicrotask(() => tx.onabort?.()); }, objectStore() {
      const request = (operation) => { const request = {}; queueMicrotask(() => {
        if (failImages) { tx.error = Error('image quota'); tx.onabort?.(); return; }
        request.result = operation(); request.onsuccess?.(); queueMicrotask(() => tx.oncomplete?.());
      }); return request; };
      return { put:asset=>request(()=>images.set(asset.id,clone(asset))), get:id=>request(()=>images.get(id)), delete:id=>request(()=>images.delete(id)), getAllKeys:()=>request(()=>[...images.keys()]) };
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
const commitWith = S => change => { const next=S.load();change(next);S.save(next);return true; };
test('replace and reset collect only unreferenced images, retain the other card and task data',async()=>{
  const {S,B,images}=env(),data=withImage(S,B,'old');data.days['2026-10-15']={categories:[{id:'c',name:'任务',tasks:[{id:'t',title:'保留任务',done:true}]}]};data.settings.personalization.cards.right={mode:'image',assetId:'right',x:50,y:50,overlay:false};images.set('old',image('old'));images.set('right',image('right'));S.save(data);
  const result=await B.changeCard('left',{mode:'image',assetId:'staged',x:25,y:70,overlay:false},{asset:image('staged'),commit:commitWith(S)});assert.ok(!images.has('old'));assert.ok(images.has('right'));assert.ok(images.has(result.card.assetId));assert.equal(S.load().days['2026-10-15'].categories[0].tasks[0].done,true);
  await B.changeCard('left',B.defaults().cards.left,{commit:commitWith(S)});assert.ok(!images.has(result.card.assetId));assert.ok(images.has('right'));
});
test('hidden image remains available across refresh and backup; showing it keeps crop, reset releases it',async()=>{
  const {S,B,images}=env(),data=withImage(S,B);images.set('image-1',image());S.save(data);const card=data.settings.personalization.cards.left;
  await B.changeCard('left',{...card,mode:'hidden'},{commit:commitWith(S)});const restored=S.load();assert.equal(restored.settings.personalization.cards.left.assetId,'image-1');assert.ok((await B.backup(restored)).imageAssets['image-1']);
  await B.changeCard('left',{...restored.settings.personalization.cards.left,mode:'image'},{commit:commitWith(S)});assert.equal(S.load().settings.personalization.cards.left.x,20);await B.changeCard('left',B.defaults().cards.left,{commit:commitWith(S)});assert.equal(images.size,0);
});
test('shared image and restore snapshots are protected; malformed snapshots stop cleanup safely',async()=>{
  const {S,B,images,local}=env(),data=withImage(S,B);data.settings.personalization.cards.right={...data.settings.personalization.cards.left};images.set('image-1',image());S.save(data);
  await B.changeCard('left',B.defaults().cards.left,{commit:commitWith(S)});assert.ok(images.has('image-1'));
  local.set(S.RESTORE_KEY,JSON.stringify({rawData:JSON.stringify(data)}));await B.changeCard('right',B.defaults().cards.right,{commit:commitWith(S)});assert.ok(images.has('image-1'));
  local.set(S.RESTORE_KEY,'broken');assert.equal((await B.collectUnused(['image-1'])).deferred,true);assert.ok(images.has('image-1'));
  local.delete(S.RESTORE_KEY);await B.collectUnused(['image-1']);assert.equal(images.size,0);
});
test('image or settings failure and stale preview preserve both live references and rollback staged assets',async()=>{
  const {S,B,images,local,failLocal,failImages}=env(),data=withImage(S,B,'old');images.set('old',image('old'));S.save(data);const original=local.get(S.KEY),options={asset:image(),commit:commitWith(S)};
  failImages(true);await assert.rejects(B.changeCard('left',{mode:'image',assetId:'i'},options));assert.equal(local.get(S.KEY),original);
  failImages(false);failLocal(true);await assert.rejects(B.changeCard('left',{mode:'image',assetId:'i'},options));assert.equal(local.get(S.KEY),original);assert.equal(images.size,1);
  failLocal(false);await assert.rejects(B.changeCard('left',{mode:'image',assetId:'i'},{...options,expected:B.defaults().cards.left}),/其他窗口/);assert.equal(images.size,1);assert.ok(images.has('old'));
});
test('cleanup failure does not undo a successful card commit or affect later task saving',async()=>{
  const {S,B,images,failImages}=env(),data=withImage(S,B,'old');images.set('old',image('old'));S.save(data);
  const result=await B.changeCard('left',{mode:'image',assetId:'i'},{asset:image(),commit:change=>{const next=S.load();change(next);S.save(next);failImages(true);return true;}});assert.equal(result.cleanup.deferred,true);assert.equal(S.load().settings.personalization.cards.left.assetId,result.card.assetId);failImages(false);S.save(S.load());
});
test('appearance pause/mobile preferences persist in new backup and legacy data defaults remain compatible',async()=>{
  const {S,B}=env(),data=S.emptyData();data.settings.personalization={...B.defaults(),paused:true,mobileCards:true};S.save(data);const restored=S.parseBackup(JSON.stringify(await B.backup(S.load()))).data;assert.equal(restored.settings.personalization.paused,true);assert.equal(restored.settings.personalization.mobileCards,true);assert.equal(B.appearance({rotate:false,fixed:2}).paused,false);assert.equal(B.appearance().mobileCards,false);assert.throws(()=>B.appearance({mobileCards:'yes'}));
});
