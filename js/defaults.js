(function (global) {
  'use strict';
  // New users begin with an empty route space; existing routes are never replaced.
  global.TodayWorkDefaults = {
    routes: () => [],
    quotes: ['今天的积累，是明天的底气。', '完成比完美更重要。', '每天向前一点点。', '真正拉开差距的是长期稳定。', '先完成今天，再考虑远方。']
  };
})(globalThis);
