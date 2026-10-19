'use strict';
const frame=document.querySelector('#app-frame'),fault={image:false,settings:false};
document.querySelector('#frame-width').onchange=event=>{frame.style.width=event.target.value+'px';};
document.querySelector('#refresh-frame').onclick=()=>frame.contentWindow.location.reload();
document.querySelector('#before-frame').onclick=()=>{frame.src='before/index.html';};
document.querySelector('#after-frame').onclick=()=>{frame.src='index.html';};
document.querySelectorAll('[data-fixture]').forEach(button=>button.onclick=async()=>{
  const side=button.dataset.fixture,canvas=document.createElement('canvas');canvas.width=side==='right'?400:1200;canvas.height=side==='right'?1200:400;
  const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,canvas.width,canvas.height);gradient.addColorStop(0,'#4f46e5');gradient.addColorStop(1,'#39b8ad');ctx.fillStyle=gradient;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#ffffffcc';ctx.fillRect(canvas.width*.1,canvas.height*.15,canvas.width*.4,canvas.height*.5);
  const blob=side==='invalid'?new Blob(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'],{type:'image/svg+xml'}):await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  const win=frame.contentWindow,file=new win.File([blob],side==='invalid'?'invalid.svg':'synthetic.png',{type:blob.type}),transfer=new win.DataTransfer();transfer.items.add(file);const input=frame.contentDocument.querySelector(side==='right'?'#card-right-file':'#card-left-file');input.files=transfer.files;input.dispatchEvent(new win.Event('change',{bubbles:true}));
});
frame.addEventListener('load',()=>{
  const win=frame.contentWindow,originalSet=win.Storage.prototype.setItem,originalTx=win.IDBDatabase.prototype.transaction;
  win.Storage.prototype.setItem=function(key,value){if(fault.settings&&key==='forward-study.v1')throw new DOMException('QA simulated settings quota','QuotaExceededError');return originalSet.call(this,key,value);};
  win.IDBDatabase.prototype.transaction=function(...args){if(fault.image&&args[1]==='readwrite')throw new DOMException('QA simulated image quota','QuotaExceededError');return originalTx.apply(this,args);};
});
document.querySelector('#fail-image').onclick=()=>{fault.image=true;document.querySelector('#fault-status').textContent='图片写入故障已开启';};
document.querySelector('#fail-settings').onclick=()=>{fault.settings=true;document.querySelector('#fault-status').textContent='设置保存故障已开启';};
document.querySelector('#clear-fault').onclick=()=>{fault.image=false;fault.settings=false;document.querySelector('#fault-status').textContent='正常存储已恢复';};
document.querySelector('#count-images').onclick=()=>{const request=frame.contentWindow.indexedDB.open('today-work-images',1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('images','readonly'),count=tx.objectStore('images').count();count.onsuccess=()=>{document.querySelector('#fault-status').textContent=`图片记录数：${count.result}`;};tx.oncomplete=()=>db.close();};};
function wav(samples,rate){const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer),write=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};write(0,'RIFF');view.setUint32(4,36+samples.length*2,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,samples.length*2,true);for(let i=0;i<samples.length;i++)view.setInt16(44+i*2,Math.max(-1,Math.min(1,samples[i]))*32767,true);return buffer;}
document.querySelectorAll('[data-render]').forEach(button=>button.onclick=async()=>{
  const kind=button.dataset.render;await TodayWorkSounds.player.play(kind,{enabled:true,volume:.45},true);
  const rate=44100,context=new OfflineAudioContext(1,Math.ceil(rate*.8),rate);TodayWorkSounds.synthesize(context,context.destination,kind,.45,0);const rendered=await context.startRendering(),data=rendered.getChannelData(0),wave=new Blob([wav(data,rate)],{type:'audio/wav'}),reader=new FileReader();reader.onload=()=>{document.querySelector('#wave-data').value=reader.result;};reader.readAsDataURL(wave);
  const audio=document.querySelector('#audition');if(audio.dataset.previous)URL.revokeObjectURL(audio.dataset.previous);audio.src=URL.createObjectURL(wave);audio.dataset.previous=audio.src;
  document.querySelector('#audio-status').textContent=`已实际渲染并播放：${kind}；${data.length} samples，peak=${Math.max(...data.map(Math.abs)).toFixed(4)}`;
});
