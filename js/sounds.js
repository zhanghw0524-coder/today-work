(function (global) {
  'use strict';
  function settings(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('音效设置无效。');
    if (value.enabled !== undefined && typeof value.enabled !== 'boolean') throw new Error('音效开关无效。');
    if (value.volume !== undefined && (!Number.isFinite(value.volume) || value.volume < 0 || value.volume > 1)) throw new Error('音量需在 0–100% 之间。');
    return { enabled: value.enabled ?? false, volume: value.volume ?? 0.25 };
  }
  const scores = {
    task: [[659.25, 0, 0.18, 1]],
    all: [[523.25, 0, 0.22, 0.75], [659.25, 0.09, 0.24, 0.8], [783.99, 0.18, 0.3, 1]]
  };
  function completionKind(before, after, info) {
    if (!info.manual || !info.checked || info.wasDone || !before.total || after.total !== before.total || after.done !== before.done + 1) return null;
    return info.date === info.today && before.done < before.total && after.done === after.total ? 'all' : 'task';
  }
  // The same synthesis is used by live playback and the isolated OfflineAudioContext audition.
  function synthesize(context, destination, kind, volume, start = context.currentTime) {
    if (!scores[kind]) throw new Error('无效的音效。');
    const voices = [];
    for (const [frequency, offset, length, strength] of scores[kind]) {
      for (const [ratio, level] of [[1, 0.14], [2, 0.018]]) {
        const oscillator = context.createOscillator(), gain = context.createGain(), time = start + offset;
        oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency * ratio, time);
        gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(volume * level * strength, time + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + length); gain.gain.linearRampToValueAtTime(0, time + length + 0.025);
        oscillator.connect(gain); gain.connect(destination); oscillator.start(time); oscillator.stop(time + length + 0.04);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        voices.push(oscillator);
      }
    }
    return voices;
  }
  function createPlayer(factory = () => {
    const Context = global.AudioContext || global.webkitAudioContext;
    if (!Context) throw new Error('浏览器不支持音效。');
    return new Context();
  }) {
    let context = null, active = null, ticket = 0, plays = 0, lastKind = '';
    function stop() {
      ticket++;
      if (active && context) {
        const time = context.currentTime;
        try { active.bus.gain.cancelScheduledValues(time); active.bus.gain.setTargetAtTime(0, time, 0.006); } catch { /* already stopped */ }
        for (const voice of active.voices) try { voice.stop(time + 0.035); } catch { /* ended */ }
        const old = active.bus; setTimeout(() => old.disconnect(), 80);
      }
      active = null;
    }
    async function play(kind, value, preview = false) {
      const options = settings(value);
      if (!scores[kind] || (!options.enabled && !preview) || options.volume === 0) return false;
      stop(); const ownTicket = ticket;
      try {
        context ||= factory();
        if (context.state === 'suspended') await context.resume();
        if (ownTicket !== ticket || context.state !== 'running') return false;
        const bus = context.createGain(); bus.gain.setValueAtTime(1, context.currentTime); bus.connect(context.destination);
        const voices = synthesize(context, bus, kind, options.volume);
        active = { bus, voices }; plays++; lastKind = kind;
        setTimeout(() => { if (active?.bus === bus) active = null; bus.disconnect(); }, 850);
        return true;
      } catch { return false; } // A sound failure never rejects the saved checkbox operation.
    }
    return { play, stop, status: () => ({ plays, lastKind, contextState: context?.state || 'uninitialized' }) };
  }
  const player = createPlayer();
  function feedback(kind, value) {
    if (!kind) return;
    player.play(kind, value).then(played => {
      if (played && global.document) document.dispatchEvent(new CustomEvent('todaywork:sound', { detail: { kind } }));
    }).catch(() => {});
  }
  global.TodayWorkSounds = { settings, completionKind, synthesize, createPlayer, player, feedback, scores };
})(globalThis);
