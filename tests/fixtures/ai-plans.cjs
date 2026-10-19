// Synthetic plans only. No browser exports or personal records.
const task = (title, estimatedMinutes, extra = {}) => ({ title, category: '实践', estimatedMinutes, ...extra });
module.exports = {
  programming: { format:'TW_PLAN_V1', planName:'编程学习样例', goal:'掌握基本调试流程', scheduling:'sequence', categories:['实践'], days:[{day:1,stage:'基础',tasks:[task('阅读调试说明',30,{id:'read',description:'记录输入和预期输出',resources:[{title:'示例资料',url:'https://example.com/debug'}]}),task('运行示例并定位问题',30,{id:'run',dependsOn:['read']})]},{day:2,stage:'练习',tasks:[task('完成独立练习',20),task('整理验证步骤',40)]}] },
  exam: { format:'TW_PLAN_V1', planName:'考试复习样例', scheduling:'fixed', deadline:'2026-10-20', categories:['实践'], days:[{day:1,stage:'知识点',tasks:[task('复习第一章',30,{id:'chapter',date:'2026-10-19'})]},{day:2,stage:'自测',tasks:[task('限时练习并检查',40,{date:'2026-10-20',dependsOn:['chapter']})]}] },
  thesis: { format:'TW_PLAN_V1', planName:'论文写作样例', scheduling:'sequence', deadline:'2026-10-20', categories:['实践'], days:[{day:1,stage:'提纲',tasks:[task('列出研究问题',45,{id:'outline'}),task('补充相关工作',null,{id:'related',dependsOn:['outline'],note:'资料范围待确认'})]},{day:2,stage:'写作',tasks:[task('完成方法章节草稿',70,{dependsOn:['related'],description:'先写已验证的方法，不编造实验结论'})]}] }
};
