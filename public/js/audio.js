const CHORDS = [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]];
const BASS = [45, 41, 48, 43];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 2, 1, 0, 1];

function mtof(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function createAudio() {
  let ctx = null;
  let master, sfx, noiseBuf;
  let engOsc1, engOsc2, engFilter, engGain;
  let sirOsc, sirGain;
  let radioBus;
  let radioOn = true;
  let radioNext = 0;
  let radioStep = 0;
  let lastView = null;
  let lastFrenzy = -100;

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(comp);
    sfx = ctx.createGain();
    sfx.gain.value = 0.9;
    sfx.connect(master);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    engFilter = ctx.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.frequency.value = 600;
    engFilter.Q.value = 4;
    engGain = ctx.createGain();
    engGain.gain.value = 0;
    engOsc1 = ctx.createOscillator();
    engOsc1.type = 'sawtooth';
    engOsc2 = ctx.createOscillator();
    engOsc2.type = 'square';
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    engOsc1.connect(engFilter);
    engOsc2.connect(g2).connect(engFilter);
    engFilter.connect(engGain).connect(master);
    engOsc1.start();
    engOsc2.start();

    sirOsc = ctx.createOscillator();
    sirOsc.type = 'sawtooth';
    const sf = ctx.createBiquadFilter();
    sf.type = 'lowpass';
    sf.frequency.value = 2200;
    sirGain = ctx.createGain();
    sirGain.gain.value = 0;
    sirOsc.connect(sf).connect(sirGain).connect(master);
    sirOsc.start();

    radioBus = ctx.createGain();
    radioBus.gain.value = 0;
    radioBus.connect(master);
  }

  function tone(type, f0, f1, t0, dur, vol, dest = sfx, attack = 0.005) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise(t0, dur, vol, type, f0, f1, q = 1, dest = sfx) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t0, Math.random() * 0.5);
    s.stop(t0 + dur + 0.05);
  }

  function distVol(ev, view, range = 90) {
    const me = view && view.me;
    if (!me || ev.x == null) return 1;
    const d = Math.hypot(ev.x - me.x, ev.z - me.z);
    const k = Math.max(0, 1 - d / range);
    return k * k;
  }

  function shot(w, v) {
    const t = ctx.currentTime;
    if (w === 0) {
      noise(t, 0.08, 0.5 * v, 'lowpass', 900, 200);
      tone('sine', 140, 60, t, 0.1, 0.5 * v);
    } else if (w === 1) {
      noise(t, 0.16, 0.9 * v, 'bandpass', 2400, 600, 0.8);
      tone('square', 220, 70, t, 0.1, 0.35 * v);
    } else if (w === 2) {
      noise(t, 0.07, 0.6 * v, 'bandpass', 3200, 1200, 1);
      tone('square', 320, 120, t, 0.05, 0.22 * v);
    } else if (w === 3) {
      noise(t, 0.35, 1.0 * v, 'lowpass', 3500, 300, 0.7);
      tone('sine', 110, 40, t, 0.25, 0.7 * v);
      noise(t + 0.32, 0.05, 0.25 * v, 'highpass', 3000, 3000);
      noise(t + 0.42, 0.05, 0.25 * v, 'highpass', 2500, 2500);
    } else {
      noise(t, 0.6, 0.6 * v, 'bandpass', 600, 2400, 2);
      tone('sawtooth', 90, 260, t, 0.5, 0.18 * v);
    }
  }

  function explode(v) {
    const t = ctx.currentTime;
    noise(t, 1.6, 1.2 * v, 'lowpass', 1400, 60, 0.8);
    tone('sine', 70, 25, t, 1.1, 1.0 * v);
    noise(t, 0.25, 0.7 * v, 'highpass', 2000, 800);
  }

  function hit(target, v) {
    const t = ctx.currentTime;
    if (target === 'car') {
      tone('square', 880, 520, t, 0.12, 0.18 * v);
      tone('triangle', 1320, 900, t, 0.18, 0.12 * v);
    } else if (target === 'wall') {
      noise(t, 0.05, 0.25 * v, 'highpass', 2500, 1500);
    } else {
      noise(t, 0.09, 0.45 * v, 'lowpass', 700, 150);
      tone('sine', 120, 60, t, 0.09, 0.35 * v);
    }
  }

  function jingle(notes, type = 'triangle', step = 0.07, vol = 0.35) {
    const t = ctx.currentTime;
    notes.forEach((m, i) => tone(type, mtof(m), mtof(m), t + i * step, 0.22, vol));
  }

  function stinger(kind) {
    const t = ctx.currentTime;
    if (kind === 'wasted') {
      [[57, 60, 64], [56, 59, 63], [55, 58, 62], [43, 46, 50]].forEach((ch, i) => {
        for (const m of ch) tone('sawtooth', mtof(m), mtof(m - (i === 3 ? 12 : 0)), t + i * 0.32, i === 3 ? 1.6 : 0.34, 0.12);
      });
      noise(t, 1.8, 0.2, 'lowpass', 400, 60);
    } else if (kind === 'busted') {
      for (let i = 0; i < 6; i++) tone('square', i % 2 ? 660 : 880, null, t + i * 0.2, 0.19, 0.12);
      tone('sawtooth', mtof(40), mtof(28), t + 1.2, 1.2, 0.25);
    } else {
      [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => tone('square', mtof(m), mtof(m), t + i * 0.06, 0.18, 0.15));
      tone('sawtooth', mtof(48), mtof(60), t, 0.5, 0.15);
    }
  }

  function scheduleRadio() {
    const stepDur = 60 / 104 / 4;
    if (radioNext < ctx.currentTime) radioNext = ctx.currentTime + 0.05;
    while (radioNext < ctx.currentTime + 0.25) {
      const t = radioNext;
      const s = radioStep % 16;
      const bar = Math.floor(radioStep / 16) % 4;
      const ch = CHORDS[bar];
      if (s % 4 === 0) {
        tone('sine', 150, 40, t, 0.28, 0.9, radioBus, 0.002);
      }
      if (s === 4 || s === 12) {
        noise(t, 0.18, 0.5, 'bandpass', 1800, 1200, 0.7, radioBus);
        tone('triangle', 200, 140, t, 0.1, 0.3, radioBus, 0.002);
      }
      if (s % 2 === 1) noise(t, 0.04, 0.18, 'highpass', 7000, 7000, 1, radioBus);
      if (s % 2 === 0) {
        const m = BASS[bar] + (s % 4 === 2 ? 12 : 0);
        tone('sawtooth', mtof(m), mtof(m), t, stepDur * 1.8, 0.28, radioBus, 0.004);
      }
      const am = ch[ARP[s]] + 12;
      tone('square', mtof(am), mtof(am), t, stepDur * 0.9, 0.07, radioBus, 0.003);
      if (s === 0) for (const m of ch) tone('sawtooth', mtof(m), mtof(m), t, stepDur * 15, 0.035, radioBus, 0.3);
      radioNext += stepDur;
      radioStep++;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyM' || e.repeat) return;
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    radioOn = !radioOn;
    window.dispatchEvent(new CustomEvent('gta-radio', { detail: { on: radioOn } }));
  });

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    try {
      if (document.hidden) ctx.suspend();
      else ctx.resume();
    } catch {}
  });

  function silenceLoops(t) {
    engGain.gain.cancelScheduledValues(t);
    engGain.gain.setTargetAtTime(0, t, 0.05);
    sirGain.gain.cancelScheduledValues(t);
    sirGain.gain.setTargetAtTime(0, t, 0.05);
    radioBus.gain.cancelScheduledValues(t);
    radioBus.gain.setTargetAtTime(0, t, 0.05);
    radioNext = 0;
  }

  return {
    unlock() {
      try {
        if (!ctx) build();
        if (ctx.state !== 'running' && !document.hidden) ctx.resume();
      } catch {}
    },

    state() {
      return ctx ? { state: ctx.state, eng: engGain.gain.value, sir: sirGain.gain.value, radio: radioBus.gain.value } : null;
    },

    event(ev, view) {
      if (!ctx) return;
      if (view) lastView = view;
      const meId = view && view.me && view.me.id;
      switch (ev.kind) {
        case 'shot': {
          const v = ev.by === meId ? 1 : distVol(ev, view) * 0.85;
          if (v > 0.01) shot(ev.w ?? 1, v);
          break;
        }
        case 'hit': {
          const v = distVol(ev, view, 60);
          if (v > 0.01) hit(ev.target, v);
          break;
        }
        case 'explode': {
          const v = Math.max(0.08, distVol(ev, view, 220));
          explode(v);
          break;
        }
        case 'cash':
          if (ev.id === meId) jingle([72, 76, 79, 84], 'triangle', 0.06, 0.3);
          break;
        case 'pickup':
        case 'pistol':
        case 'uzi':
        case 'shotgun':
        case 'rocket':
        case 'health':
        case 'armor':
        case 'bribe': {
          if (ev.by !== meId) break;
          const kind = ev.kind === 'pickup' ? ev.item : ev.kind;
          if (kind === 'cash' || kind === 'bribe') jingle([76, 79, 84, 88], 'square', 0.06, 0.12);
          else if (kind === 'health' || kind === 'armor') jingle([67, 72, 76], 'sine', 0.08, 0.35);
          else {
            const t = ctx.currentTime;
            noise(t, 0.05, 0.4, 'highpass', 2000, 2000);
            noise(t + 0.12, 0.06, 0.5, 'bandpass', 1500, 1500, 2);
          }
          break;
        }
        case 'carjack':
          if (ev.by === meId) {
            const t = ctx.currentTime;
            noise(t, 0.12, 0.6, 'lowpass', 500, 120);
            tone('sine', 90, 50, t, 0.12, 0.5);
          }
          break;
        case 'wasted':
          if (ev.id === meId) stinger('wasted');
          break;
        case 'busted':
          if (ev.id === meId) stinger('busted');
          break;
        case 'frenzy':
          if (ev.id === meId) {
            const tf = ctx.currentTime;
            if (tf - lastFrenzy > 6.5) stinger('frenzy');
            lastFrenzy = tf;
          }
          break;
        case 'chat':
          if (ev.from !== meId) tone('sine', 1200, 1500, ctx.currentTime, 0.08, 0.08);
          break;
      }
    },

    update(view, dt) {
      if (!ctx || !view) return;
      lastView = view;
      const me = view.me || {};
      const t = ctx.currentTime;
      if (!view.connected) { silenceLoops(t); return; }
      const driving = !!me.car && !me.dead;
      const sp = Math.abs(me.v || 0);
      const gear = Math.min(4, Math.floor(sp / 9));
      const rpm = (sp - gear * 9) / 9;
      const f = 38 + gear * 7 + rpm * 62 + (driving ? 0 : 0);
      engOsc1.frequency.setTargetAtTime(f, t, 0.05);
      engOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
      engFilter.frequency.setTargetAtTime(300 + sp * 40, t, 0.08);
      engGain.gain.setTargetAtTime(driving ? 0.07 + Math.min(0.08, sp * 0.003) : 0, t, 0.1);

      let best = Infinity;
      for (const c of view.cars || []) {
        if (!c.siren || c.wreck) continue;
        const d = c.id === me.car ? 0 : Math.hypot(c.x - me.x, c.z - me.z);
        if (d < best) best = d;
      }
      const k = Math.max(0, 1 - best / 130);
      sirGain.gain.setTargetAtTime(0.07 * k * k, t, 0.15);
      const ph = (view.time || t) * 1.6;
      sirOsc.frequency.setTargetAtTime(Math.floor(ph) % 2 ? 950 : 720 + 260 * (ph % 1), t, 0.03);

      const playRadio = radioOn && driving;
      radioBus.gain.setTargetAtTime(playRadio ? 0.22 : 0, t, 0.3);
      if (playRadio) scheduleRadio();
      else radioNext = 0;
    },
  };
}
