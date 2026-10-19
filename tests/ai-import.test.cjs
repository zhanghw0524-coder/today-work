const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const samples=require('./fixtures/ai-plans.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
function env(){
  const map=new Map();let fail=false,writes=0;
  const localStorage={getItem:key=>map.get(key)??null,setItem:(key,value)=>{if(fail)throw Error('quota');map.set(key,String(value));writes++;}};
  const ctx=vm.createContext({localStorage,Date,Math,Set,Map,TextEncoder,URL,console});
  for(const file of ['storage','defaults','models','plans','deletions','stats'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js',file+'.js'),'utf8'),ctx);
  return {S:ctx.StudyStorage,P:ctx.TodayWorkPlans,M:ctx.TodayWorkModels,D:ctx.TodayWorkDeletions,T:ctx.StudyStats,map,fail:value=>{fail=value;},writes:()=>writes};
}
const rules=(extra={})=>({startDate:'2026-10-16',weekdays:[1,2,3,4,5],maxMinutes:60,maxTasks:null,defaultMinutes:30,...extra});
const flat=data=>Object.entries(data.days).flatMap(([date,day])=>day.categories.flatMap(group=>group.tasks.map(task=>({date,...task}))));
test('parser accepts explained/fenced JSON and quoted braces, rejects ambiguity and broken structures',()=>{
  const {P}=env(),value=clone(samples.programming);value.days[0].tasks[0].note='quoted { } \\" end';
  for(const input of [JSON.stringify(value),'以下是计划\n'+JSON.stringify(value)+'\n请检查','说明\n```json\n'+JSON.stringify(value)+'\n```\n以上为计划'])assert.equal(P.parse(input).planName,value.planName);
  for(const input of ['随便写的计划','{','说明 { "format":"TW_PLAN_V1", }',JSON.stringify(value)+'\n'+JSON.stringify(value),JSON.stringify(value)+'\n{'])assert.throws(()=>P.parse(input));
});
test('specific validation errors preserve content; dates, versions, types, resources and dependencies',()=>{
  const {P}=env();
  for(const [edit,error] of [[p=>p.format='TW_PLAN_V2',/format/],[p=>delete p.planName,/planName/],[p=>p.days[0].tasks[0].estimatedMinutes='30',/estimatedMinutes/],[p=>p.days[0].day=2,/连续/],[p=>p.deadline='2026-02-30',/deadline/],[p=>p.days[0].tasks[0].date='2026-13-01',/date/],[p=>p.days[0].tasks[0].resources[0].url='javascript:alert(1)',/链接/],[p=>p.days[0].tasks[1].dependsOn=['missing'],/dependsOn/]]){const value=clone(samples.programming);edit(value);assert.throws(()=>P.parse(JSON.stringify(value)),error);}
  const fixed=clone(samples.exam);delete fixed.days[0].tasks[0].date;assert.throws(()=>P.normalize(fixed),/date/);
  const legacy=clone(samples.programming);delete legacy.scheduling;legacy.days[0].tasks[0].date='2026-10-19';assert.throws(()=>P.normalize(legacy),/固定日期/);
});
test('both entry prompts and repair share a complete contract and parseable example, no private tasks',()=>{
  const {P}=env();const texts=[P.prompt({goal:'考试复习',days:7,minutes:40,basis:'已完成第一章',startDate:'2026-10-16',weekdays:[1,3,5]}),P.conversionPrompt(),P.repairPrompt('bad input','missing title')];
  for(const text of texts){for(const field of ['TW_PLAN_V1','planName','categories','estimatedMinutes','dependsOn','deadline','resources','scheduling'])assert.ok(text.includes(field));const start=text.indexOf('{\n  "format"');const end=text.indexOf('\n待修复原输入');assert.ok(P.parse(text.slice(start,end<0?undefined:end)));assert.ok(!text.includes('PRIVATE EXISTING TASK'));}
  assert.match(texts[0],/已完成第一章/);assert.match(texts[1],/不.*编造|不编造/);assert.match(texts[2],/bad input/);assert.match(texts[2],/missing title/);
});
test('sequence packing respects existing pending load, weekends, order, stages and multiple plans',()=>{
  const {S,P}=env(),data=S.emptyData('2026-10-16');data.days['2026-10-16']={categories:[{id:'old',name:'已有',tasks:[{id:'pending',title:'已有待办',done:false,estimatedMinutes:40},{id:'done',title:'已完成',done:true,estimatedMinutes:300}]}]};
  const plan=P.normalize(samples.programming),preview=P.schedule(plan,rules(),data);
  assert.deepEqual(clone(preview.mapping.map(x=>[x.day,x.date,x.taskIndexes])),[[1,'2026-10-19',[0,1]],[2,'2026-10-20',[0,1]]]);
  const record=P.importPlan(data,plan,rules(),{preview});S.save(data);assert.equal(record.scheduleVersion,2);assert.equal(flat(data).find(task=>task.sourceTaskId===record.id+':1:0'),undefined);
  const added=flat(data).filter(task=>task.sourcePlanId===record.id);assert.deepEqual(added.map(task=>task.title),plan.days.flatMap(day=>day.tasks.map(task=>task.title)));assert.equal(added[0].stage,'基础');assert.equal(added[0].resources[0].url,'https://example.com/debug');
  const next=P.schedule(plan,rules(),data);assert.equal(next.mapping[0].date,'2026-10-21');assert.equal(P.schedule(plan,rules({startDate:'2026-10-17'}),S.emptyData()).mapping[0].date,'2026-10-19');
});
test('unknown estimates are explicit and editable; oversized tasks require permission, never fake splitting',()=>{
  const {S,P}=env(),data=S.emptyData(),plan=P.normalize(samples.thesis);const preview=P.schedule(plan,rules(),data);
  assert.ok(preview.needsAcknowledgement);assert.match(preview.mapping.flatMap(x=>x.warnings).join(),/估算/);assert.match(preview.mapping.flatMap(x=>x.warnings).join(),/超/);assert.throws(()=>P.importPlan(data,plan,rules()),/超限|判断/);
  const record=P.importPlan(data,plan,rules(),{preview,keepSchedule:true});const task=flat(data).find(task=>task.estimatedFromDefault);assert.equal(task.estimatedMinutes,30);assert.equal(record.plan.days[0].tasks[1].estimatedMinutes,null);
  const revised=P.schedule(plan,rules({defaultMinutes:10}),S.emptyData());assert.equal(revised.mapping[0].taskIndexes.length,2);
});
test('deadline blocks silent extension; explicit budget/date/task changes resolve it',()=>{
  const {S,P}=env(),data=S.emptyData(),plan=P.normalize({...clone(samples.programming),deadline:'2026-10-16'}),preview=P.schedule(plan,rules(),data);assert.ok(preview.errors.length);const before=JSON.stringify(data);assert.throws(()=>P.importPlan(data,plan,rules(),{keepSchedule:true}),/截止/);assert.equal(JSON.stringify(data),before);
  assert.equal(P.schedule(plan,rules({maxMinutes:150}),data).errors.length,0);assert.equal(P.schedule(plan,rules({deadline:'2026-10-20'}),data).errors.length,0);
});
test('fixed dates never move; conflicts warn or block rather than silently changing intent',()=>{
  const {S,P}=env(),plan=P.normalize(samples.exam),data=S.emptyData();const preview=P.schedule(plan,rules({weekdays:[2],maxMinutes:20}),data);assert.deepEqual(clone(preview.mapping.map(x=>x.date)),['2026-10-19','2026-10-20']);assert.ok(preview.needsAcknowledgement);assert.throws(()=>P.importPlan(data,plan,rules({weekdays:[2],maxMinutes:20})),/超限|判断/);
  assert.throws(()=>P.schedule(plan,rules({startDate:'2026-10-20'}),data),/固定/);assert.throws(()=>P.schedule(plan,rules({mode:'day'}),data),/固定/);
  const reversed=clone(samples.exam);reversed.days[1].tasks[0].date='2026-10-18';assert.throws(()=>P.schedule(P.normalize(reversed),rules(),data),/前序/);
});
test('preview is read-only; confirmed exact mapping is saved; stale or tampered previews reject atomically',()=>{
  const {S,P,map,writes}=env();S.initialize('2026-10-16');const initial=map.get(S.KEY),count=writes(),plan=P.normalize(samples.programming),data=S.load(),preview=P.schedule(plan,rules(),data);assert.equal(map.get(S.KEY),initial);assert.equal(writes(),count);
  const altered=clone(preview);altered.defaultMinutes=1;assert.throws(()=>P.importPlan(data,plan,rules(),{preview:altered}),/预览/);assert.equal(map.get(S.KEY),initial);
  data.days['2026-10-16'].categories.push({id:'extra',name:'新增',tasks:[{id:'a',title:'new',done:false,estimatedMinutes:50}]});const snapshot=JSON.stringify(data);assert.throws(()=>P.importPlan(data,plan,rules(),{preview}),/预览/);assert.equal(JSON.stringify(data),snapshot);
  const fresh=P.schedule(plan,rules(),data),record=P.importPlan(data,plan,rules(),{preview:fresh});assert.deepEqual(clone(record.mapping),clone(fresh.mapping.map(({day,date,taskIndexes})=>({day,date,taskIndexes}))));S.save(data);assert.equal(writes(),count+1);
});
test('duplicates and repeated submission block, explicit second plan works; failed save preserves original',()=>{
  const {S,P,map,fail}=env();S.initialize('2026-10-16');const plan=P.normalize(samples.programming),next=S.load(),preview=P.schedule(plan,rules(),next);P.importPlan(next,plan,rules(),{preview});const before=map.get(S.KEY);fail(true);assert.throws(()=>S.save(next),/quota/);assert.equal(map.get(S.KEY),before);fail(false);S.save(next);
  const snapshot=JSON.stringify(next);assert.throws(()=>P.importPlan(next,plan,rules(),{preview}),/预览/);assert.throws(()=>P.importPlan(next,plan,rules()),/已经导入/);assert.equal(JSON.stringify(next),snapshot);P.importPlan(next,plan,rules(),{allowDuplicate:true});assert.equal(next.plans.length,2);
});
test('undo import removes only linked data and keeps unrelated additions, edits and renamed/new categories',()=>{
  const {S,P}=env(),data=S.emptyData(),record=P.importPlan(data,P.normalize(samples.programming),rules());const date=record.mapping[0].date,category=data.days[date].categories[0];category.tasks.push({id:'unrelated',title:'后来新增',done:true});category.name='改名保留';data.settings.theme='dark';P.undoImport(data,record.id);assert.equal(data.plans.length,0);assert.equal(flat(data).length,1);assert.equal(flat(data)[0].id,'unrelated');assert.equal(data.days[date].categories[0].name,'改名保留');assert.equal(data.settings.theme,'dark');S.save(data);assert.equal(S.load().plans.length,0);
});
test('completed import undo needs explicit confirmation; associated deletion snapshots cannot resurrect undone imports',()=>{
  const {S,P,D}=env(),data=S.emptyData(),record=P.importPlan(data,P.normalize(samples.programming),rules());const date=record.mapping[0].date,category=data.days[date].categories[0];category.tasks[0].done=true;assert.throws(()=>P.undoImport(data,record.id),/完成/);const removed=D.execute(data,{type:'task',date,categoryId:category.id,taskId:category.tasks[1].id});assert.throws(()=>P.undoImport(data,record.id,{includeCompleted:true}),/删除副本/);D.undo(data,removed.id);P.undoImport(data,record.id,{includeCompleted:true});assert.equal(flat(data).length,0);
});
test('new and legacy backup mappings round-trip without rescheduling or regeneration after deletion',()=>{
  const {S,P,D}=env(),data=S.emptyData(),record=P.importPlan(data,P.normalize(samples.programming),rules());const date=record.mapping[0].date,category=data.days[date].categories[0],id=category.tasks[0].id;D.execute(data,{type:'task',date,categoryId:category.id,taskId:id});S.save(data);const restored=S.parseBackup(JSON.stringify(S.backup(S.load()))).data;assert.ok(!flat(restored).some(task=>task.id===id));assert.deepEqual(clone(restored.plans[0].mapping),clone(record.mapping));
  const old=S.emptyData();delete old.plans;delete old.deletions;assert.equal(S.parseBackup(JSON.stringify(old)).data.plans.length,0);
  const legacyPlan=P.normalize({format:'TW_PLAN_V1',planName:'旧计划',categories:['阅读'],days:[{day:1,tasks:[{title:'阅读',category:'阅读'}]}]});const legacy={id:'old',createdAt:'2026-10-16T00:00:00Z',plan:legacyPlan,rules:rules({maxMinutes:null}),mapping:[{day:1,date:'2026-10-16'}]};P.validateRecord(legacy);
});
test('postpone keeps provenance and order data, never moves completed history; refresh and undo import remain valid',()=>{
  const {S,P,M}=env(),data=S.emptyData(),record=P.importPlan(data,P.normalize(samples.programming),rules());const first=flat(data)[0];M.postponeTask(data,first.date,first.id,'2026-10-30');S.save(data);const moved=flat(S.load()).find(task=>task.id===first.id);assert.equal(moved.date,'2026-10-30');assert.equal(moved.sourceTaskId,first.sourceTaskId);assert.ok(!data.days[first.date].categories.some(category=>category.tasks.some(task=>task.id===first.id)));const category=data.days['2026-10-30'].categories[0];category.tasks[0].done=true;assert.throws(()=>M.postponeTask(data,'2026-10-30',first.id,'2026-11-02'),/完成/);P.undoImport(data,record.id,{includeCompleted:true});assert.equal(flat(data).length,0);
});
test('renamed duplicate and explicitly defaulted legacy mode are detected without relying on name',()=>{
  const {S,P}=env(),data=S.emptyData(),plan=P.normalize(samples.programming);P.importPlan(data,plan,rules());assert.equal(P.duplicates(data,{...clone(plan),planName:'换名',goal:'换目标'}).length,1);
  const old={format:'TW_PLAN_V1',planName:'旧',categories:['阅读'],deadline:'2026-12-31',days:[{day:1,tasks:[{title:'阅读',category:'阅读',estimatedMinutes:10}]}]};const oldData=S.emptyData();P.importPlan(oldData,old,rules());assert.equal(P.duplicates(oldData,{...old,scheduling:'day'}).length,1);
});
test('excluding prerequisite is rejected; empty selections and malformed fenced top-level types reject',()=>{
  const {P}=env(),plan=clone(samples.programming);plan.days[0].tasks.shift();assert.throws(()=>P.normalize(plan),/dependsOn/);assert.throws(()=>P.normalize({...samples.programming,days:[]}),/days/);assert.throws(()=>P.parse('```json\n[]\n```'),/对象/);
});
test('saved mapping cannot reverse task order or alter fixed date; backup rejects instead of repairing',()=>{
  const {S,P}=env(),data=S.emptyData(),record=P.importPlan(data,P.normalize(samples.programming),rules());const reversed=clone(data);reversed.plans[0].mapping[0].taskIndexes.reverse();assert.throws(()=>S.parseBackup(JSON.stringify(S.backup(reversed))),/异常/);
  const fixed=S.emptyData(),fixedRecord=P.importPlan(fixed,P.normalize(samples.exam),rules());fixedRecord.mapping[0].date='2026-10-18';assert.throws(()=>P.validateRecord(fixedRecord),/映射|固定/);assert.ok(record.id);
});
test('undo save failure leaves durable plan intact and retry changes only the intended import',()=>{
  const {S,P,map,fail}=env();S.initialize('2026-10-16');const data=S.load(),record=P.importPlan(data,P.normalize(samples.programming),rules());S.save(data);const before=map.get(S.KEY),next=S.load();P.undoImport(next,record.id);fail(true);assert.throws(()=>S.save(next),/quota/);assert.equal(map.get(S.KEY),before);fail(false);S.save(next);assert.equal(S.load().plans.length,0);
});
test('budget shifts carry a reason and cross-year local calendar order is stable',()=>{
  const {S,P}=env(),plan=P.normalize(samples.programming),preview=P.schedule(plan,rules({startDate:'2026-12-31',maxMinutes:30}),S.emptyData());assert.ok(preview.adjustments.length);assert.equal(preview.mapping[0].date,'2026-12-31');assert.equal(preview.mapping[1].date,'2027-01-01');assert.match(preview.adjustments[0].reason,/预算|执行/);
});
