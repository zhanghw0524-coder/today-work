(function (global) {
  'use strict';
  function summarize(day) {
    const tasks = (day?.categories || []).flatMap(category => category.tasks);
    const done = tasks.filter(task => task.done).length;
    const times = tasks.filter(task => typeof task.actualMinutes === 'number' && Number.isFinite(task.actualMinutes) && task.actualMinutes >= 0);
    return { total: tasks.length, done, percent: tasks.length ? Math.round(done / tasks.length * 100) : 0, minutes: times.reduce((sum, task) => sum + task.actualMinutes, 0), hasTime: times.some(task => task.actualMinutes > 0), categories: (day?.categories || []).filter(group => group.tasks.length).map(group => group.name), full: tasks.length > 0 && done === tasks.length };
  }
  function calculate(data, today = global.StudyStorage.dateKey()) {
    const records = Object.entries(data.days).filter(([date]) => date <= today).map(([date, day]) => ({ date, ...summarize(day) })).sort((a, b) => a.date.localeCompare(b.date));
    const active = records.filter(record => record.done > 0);
    let best = 0, run = 0, previous = null;
    for (const record of active) {
      run = previous && global.StudyStorage.shiftDate(previous, 1) === record.date ? run + 1 : 1;
      best = Math.max(best, run);
      previous = record.date;
    }
    const activeDates = new Set(active.map(record => record.date));
    let cursor = activeDates.has(today) ? today : global.StudyStorage.shiftDate(today, -1);
    let streak = 0;
    while (activeDates.has(cursor)) { streak++; cursor = global.StudyStorage.shiftDate(cursor, -1); }
    const aggregate = list => {
      const total = list.reduce((sum, record) => sum + record.total, 0);
      const done = list.reduce((sum, record) => sum + record.done, 0);
      return { total, done, percent: total ? Math.round(done / total * 100) : 0, minutes: list.reduce((sum, record) => sum + record.minutes, 0), hasTime: list.some(record => record.hasTime) };
    };
    const dayOfWeek = (global.StudyStorage.parseDate(today).getDay() + 6) % 7;
    const weekStart = global.StudyStorage.shiftDate(today, -dayOfWeek);
    return { today: summarize(data.days[today]), totalDone: records.reduce((sum, record) => sum + record.done, 0), learnedDays: active.length, streak, best, records, fullDays: active.filter(record => record.total === record.done).length, week: aggregate(records.filter(record => record.date >= weekStart)), month: aggregate(records.filter(record => record.date.slice(0, 7) === today.slice(0, 7))), all: aggregate(records) };
  }
  const formatMinutes = value => `${Math.floor(value / 60) ? `${Math.floor(value / 60)}h ` : ''}${value % 60}min`;
  global.StudyStats = { summarize, calculate, formatMinutes };
})(globalThis);
