const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const clone = value => JSON.parse(JSON.stringify(value));
const date = '2026-10-16';
function env() {
  const map = new Map(), errors = []; let fail = false, writes = 0;
  const localStorage = { getItem:key=>map.get(key)??null, setItem:(key,value)=>{if(fail)throw Error('quota');writes++;map.set(key,String(value));},key:i=>[...map.keys()][i],get length(){return map.size;} };
  const ctx = vm.createContext({localStorage,Date,Math,Set,TextEncoder,console:{error:(...args)=>errors.push(args)}});
  for(const file of ['storage','defaults','models','plans','deletions','stats'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js',`${file}.js`),'utf8'),ctx);
  return {S:ctx.StudyStorage,M:ctx.TodayWorkModels,P:ctx.TodayWorkPlans,D:ctx.TodayWorkDeletions,T:ctx.StudyStats,map,errors,writes:()=>writes,fail:value=>{fail=value;}};
}
function manual(S) {
  const data=S.emptyData(date);
  data.days[date]={categories:[{id:'group',name:'阅读',manualOrder:true,tasks:[{id:'one',title:'第一项',done:true,note:'备注',estimatedMinutes:30,actualMinutes:20},{id:'two',title:'第二项',done:false,priority:'高'}]}]};return data;
}
const taskRequest={type:'task',date,categoryId:'group',taskId:'one'};
const categoryRequest={type:'category',date,categoryId:'group'};
function planned(S,P,M) {
  const data=S.emptyData('2026-10-15');
  const plan=P.normalize({format:'TW_PLAN_V1',planName:'测试计划',categories:['阅读'],days:[1,2,3].map(day=>({day,tasks:[{title:`计划第${day}项`,category:'阅读',estimatedMinutes:20}]}))});
  const record=P.importPlan(data,plan,{startDate:'2026-10-15',weekdays:[0,1,2,3,4,5,6]});
  data.days['2026-10-15'].categories[0].tasks[0].done=false;
  const original=data.days['2026-10-15'].categories[0].tasks[0];
  M.handleCarryOver(data,date,[original.id],'added');
  data.days[date].categories[0].tasks[0].done=true;
  data.days['2026-10-17'].categories.push({id:'unrelated',name:'手动',tasks:[{id:'manual',title:'不相关任务',done:false}]});
  return {data,record};
}
test('single task delete persists with undo, updates stats and restores exact ID/order/fields',()=>{
  const {S,D,T,writes}=env();const data=manual(S);S.save(data);const count=writes(),before=clone(data.days);
  const entry=D.execute(data,taskRequest,{today:date});S.save(data);
  assert.equal(writes(),count+1);assert.equal(T.calculate(S.load(),date).today.done,0);
  assert.equal(S.load().deletions[0].removedTasks[0].task.id,'one');
  const loaded=S.load();D.undo(loaded,entry.id);S.save(loaded);
  assert.deepEqual(clone(S.load().days),before);assert.equal(T.calculate(S.load(),date).today.percent,50);assert.equal(S.load().deletions.length,0);
});
test('category defaults move tasks into existing uncategorized group without changing completion or plan sources; undo retains later task edits',()=>{
  const {S,D}=env();const data=manual(S);data.days[date].categories.push({id:'uncat',name:'未分类',tasks:[{id:'other',title:'已有任务',done:false}]});
  data.days[date].categories[0].tasks[0].sourcePlanId='old';data.days[date].categories[0].tasks[0].sourceTaskId='old:1:1';
  const entry=D.execute(data,categoryRequest,{mode:'keep',today:date});S.save(data);
  assert.equal(data.days[date].categories.length,1);assert.equal(data.days[date].categories[0].tasks[1].done,true);assert.equal(data.days[date].categories[0].tasks[1].sourceTaskId,'old:1:1');
  data.days[date].categories[0].tasks[1].title='移动后编辑';D.undo(data,entry.id);S.save(data);
  assert.equal(data.days[date].categories[0].tasks[0].title,'移动后编辑');assert.equal(data.days[date].categories[0].tasks[0].id,'one');assert.equal(data.days[date].categories[1].tasks[0].id,'other');
});
test('new uncategorized container is cleaned on undo only if empty; user-added tasks remain',()=>{
  const {S,D}=env();const data=manual(S);const entry=D.execute(data,categoryRequest,{mode:'keep',today:date});
  data.days[date].categories[0].tasks.push({id:'new',title:'后来新增',done:false});
  D.undo(data,entry.id);assert.equal(data.days[date].categories.length,2);assert.equal(data.days[date].categories[1].tasks[0].id,'new');
  const another=manual(S),deleted=D.execute(another,categoryRequest,{mode:'keep',today:date});D.undo(another,deleted.id);assert.equal(another.days[date].categories.length,1);
});
test('category can delete tasks explicitly, including empty categories; undo restores category position and task fields',()=>{
  const {S,D}=env();const data=manual(S),before=clone(data.days);const entry=D.execute(data,categoryRequest,{mode:'delete',today:date});
  assert.equal(data.days[date].categories.length,0);D.undo(data,entry.id);assert.deepEqual(clone(data.days),before);
  data.days[date].categories[0].tasks=[];const empty=D.execute(data,categoryRequest,{mode:'keep',today:date});assert.equal(data.days[date].categories.length,0);D.undo(data,empty.id);assert.equal(data.days[date].categories.length,1);
});
test('deleting uncategorized with keep uses a new container and can undo its identity',()=>{
  const {S,D}=env(),data=manual(S);data.days[date].categories[0].name='未分类';
  const entry=D.execute(data,categoryRequest,{mode:'keep',today:date});assert.notEqual(data.days[date].categories[0].id,'group');assert.equal(data.days[date].categories[0].tasks.length,2);
  D.undo(data,entry.id);assert.equal(data.days[date].categories[0].id,'group');
});
test('plan keep removes association from every carried instance; undo restores plan and sources without overwriting new edits',()=>{
  const {S,P,M,D}=env();const {data,record}=planned(S,P,M);const request={type:'plan',planId:record.id},info=D.describe(data,request,date);
  assert.equal(info.linked.length,4);assert.equal(info.logical,3);
  const entry=D.execute(data,request,{mode:'keep',today:date});assert.equal(data.plans.length,0);
  assert.equal(data.days[date].categories[0].tasks[1].sourceTaskId,undefined);
  data.days[date].categories[0].tasks[1].note='后来修改备注';D.undo(data,entry.id);S.save(data);
  assert.equal(data.plans[0].id,record.id);assert.equal(data.days[date].categories[0].tasks[1].sourcePlanId,record.id);assert.equal(data.days[date].categories[0].tasks[1].note,'后来修改备注');
});
test('plan pending removes only present/future unfinished records; all explicitly removes historical and completed linked records and undo restores all',()=>{
  const {S,P,M,D}=env();const {data,record}=planned(S,P,M);const before=clone(data.days),request={type:'plan',planId:record.id};
  const entry=D.execute(data,request,{mode:'pending',today:date});
  assert.equal(entry.removedTasks.length,2);assert.equal(data.days['2026-10-15'].categories[0].tasks.length,1);assert.equal(data.days[date].categories[0].tasks[0].done,true);assert.equal(data.days['2026-10-17'].categories[1].tasks[0].id,'manual');
  D.undo(data,entry.id);assert.deepEqual(clone(data.days),before);
  const all=D.execute(data,request,{mode:'all',today:date});assert.equal(all.removedTasks.length,4);assert.equal(data.days['2026-10-15'].categories[0].tasks.length,0);assert.equal(data.days['2026-10-17'].categories[1].tasks[0].id,'manual');
  D.undo(data,all.id);assert.deepEqual(clone(data.days),before);
});
test('single carried task deletion affects only that instance, not original history or the plan',()=>{
  const {S,P,M,D}=env(),{data,record}=planned(S,P,M);const carried=data.days[date].categories[0].tasks[1],historical=clone(data.days['2026-10-15']);
  D.execute(data,{type:'task',date,categoryId:data.days[date].categories[0].id,taskId:carried.id},{today:date});
  assert.deepEqual(clone(data.days['2026-10-15']),historical);assert.equal(data.plans[0].id,record.id);
});
test('stale dialogs, duplicate requests, missing IDs and invalid modes reject without partial changes',()=>{
  const {S,D}=env();const data=manual(S);const old=D.describe(data,categoryRequest,date);
  data.days[date].categories[0].tasks.push({id:'third',title:'另一窗口新增',done:false});const current=clone(data);
  assert.throws(()=>D.execute(data,categoryRequest,{mode:'delete',today:date,expected:old.signature}),/已变化/);assert.deepEqual(clone(data),current);
  assert.throws(()=>D.execute(data,categoryRequest,{mode:'invalid',today:date}));assert.deepEqual(clone(data),current);
  const entry=D.execute(data,taskRequest,{today:date});const deleted=clone(data);assert.throws(()=>D.execute(data,taskRequest,{today:date}));assert.deepEqual(clone(data),deleted);
  D.undo(data,entry.id);const undone=clone(data);assert.throws(()=>D.undo(data,entry.id));assert.deepEqual(clone(data),undone);
});
test('undo conflicts are atomic and do not overwrite new associations or dependent later deletions',()=>{
  const {S,P,M,D}=env();const {data,record}=planned(S,P,M);const entry=D.execute(data,{type:'plan',planId:record.id},{mode:'keep',today:date});
  data.days[date].categories[0].tasks[0].sourcePlanId='different';const current=clone(data);assert.throws(()=>D.undo(data,entry.id),/关联/);assert.deepEqual(clone(data),current);
  const manualData=manual(S);const removed=D.execute(manualData,taskRequest,{today:date});const category=D.execute(manualData,categoryRequest,{mode:'delete',today:date});const deleted=clone(manualData);
  assert.throws(()=>D.undo(manualData,removed.id));assert.deepEqual(clone(manualData),deleted);D.undo(manualData,category.id);D.undo(manualData,removed.id);assert.equal(manualData.days[date].categories[0].tasks.length,2);
});
test('save failure preserves live data and undo history; retry saves both in exactly one main write',()=>{
  const {S,D,map,writes,fail}=env();const data=manual(S);S.save(data);const raw=map.get(S.KEY),count=writes();const next=S.load();D.execute(next,taskRequest,{today:date});
  fail(true);assert.throws(()=>S.save(next));assert.equal(map.get(S.KEY),raw);
  fail(false);S.save(next);assert.equal(writes(),count+1);const deleted=map.get(S.KEY),undo=S.load();D.undo(undo,undo.deletions[0].id);
  fail(true);assert.throws(()=>S.save(undo));assert.equal(map.get(S.KEY),deleted);
});
test('new backups preserve deletions with source records; old backups without history remain accepted; invalid snapshots reject',()=>{
  const {S,P,M,D}=env();const {data,record}=planned(S,P,M);D.execute(data,{type:'plan',planId:record.id},{mode:'all',today:date});
  const parsed=S.parseBackup(JSON.stringify(S.backup(data)));D.undo(parsed.data,parsed.data.deletions[0].id);assert.equal(parsed.data.plans[0].id,record.id);assert.equal(parsed.data.days[date].categories[0].tasks.length,2);
  const old=manual(S);delete old.deletions;assert.equal(S.parseBackup(JSON.stringify(old)).data.deletions.length,0);
  const bad=clone(data);bad.deletions[0].removedTasks[0].task.done='false';assert.throws(()=>S.parseBackup(JSON.stringify(S.backup(bad))));
});
test('undo capacity does not silently discard earlier snapshots',()=>{
  const {S,D}=env();const data=manual(S);for(let i=0;i<50;i++){const task={id:`t${i}`,title:`task ${i}`,done:false};data.days[date].categories[0].tasks.push(task);D.execute(data,{...taskRequest,taskId:task.id},{today:date});}
  const current=clone(data);assert.throws(()=>D.execute(data,taskRequest,{today:date}),/50/);assert.deepEqual(clone(data),current);
});
