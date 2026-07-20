const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12)

export class Synth {
  ctx: AudioContext
  comp: DynamicsCompressorNode
  music: GainNode
  sfx: GainNode
  noiseBuf: AudioBuffer

  constructor() {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    this.ctx = new AC()
    this.comp = this.ctx.createDynamicsCompressor()
    this.comp.threshold.value = -14
    this.comp.knee.value = 20
    this.comp.ratio.value = 6
    this.comp.connect(this.ctx.destination)

    this.music = this.ctx.createGain()
    this.music.gain.value = 0.85
    this.music.connect(this.comp)

    this.sfx = this.ctx.createGain()
    this.sfx.gain.value = 0.9
    this.sfx.connect(this.comp)

    const len = this.ctx.sampleRate * 2
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = this.noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  }

  now() { return this.ctx.currentTime }

  _noise(t, dur) {
    const s = this.ctx.createBufferSource()
    s.buffer = this.noiseBuf
    s.loop = true
    s.start(t)
    s.stop(t + dur + 0.1)
    return s
  }

  _g(t) { const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); return g }

  kick(t, v = 1) {
    const o = this.ctx.createOscillator()
    const g = this._g(t)
    o.type = 'sine'
    o.frequency.setValueAtTime(160, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12)
    g.gain.linearRampToValueAtTime(v * 1.05, t + 0.003)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
    o.connect(g); g.connect(this.music)
    o.start(t); o.stop(t + 0.32)
    const n = this._noise(t, 0.03)
    const f = this.ctx.createBiquadFilter()
    const ng = this._g(t)
    f.type = 'highpass'; f.frequency.value = 3000
    ng.gain.linearRampToValueAtTime(v * 0.25, t + 0.002)
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.03)
    n.connect(f); f.connect(ng); ng.connect(this.music)
  }

  snare(t, v = 1) {
    const n = this._noise(t, 0.2)
    const f = this.ctx.createBiquadFilter()
    const g = this._g(t)
    f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7
    g.gain.linearRampToValueAtTime(v * 0.7, t + 0.002)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
    n.connect(f); f.connect(g); g.connect(this.music)
    const o = this.ctx.createOscillator()
    const og = this._g(t)
    o.type = 'sine'
    o.frequency.setValueAtTime(210, t)
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08)
    og.gain.linearRampToValueAtTime(v * 0.45, t + 0.002)
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.09)
    o.connect(og); og.connect(this.music)
    o.start(t); o.stop(t + 0.1)
  }

  clap(t, v = 1) {
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.013
      const n = this._noise(tt, 0.18)
      const f = this.ctx.createBiquadFilter()
      const g = this._g(tt)
      f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 1.4
      g.gain.linearRampToValueAtTime(v * 0.4, tt + 0.002)
      g.gain.exponentialRampToValueAtTime(0.001, tt + (i === 2 ? 0.16 : 0.03))
      n.connect(f); f.connect(g); g.connect(this.music)
    }
  }

  hat(t, v = 1, open = false) {
    const n = this._noise(t, open ? 0.3 : 0.06)
    const f = this.ctx.createBiquadFilter()
    const g = this._g(t)
    f.type = 'highpass'; f.frequency.value = 7500
    g.gain.linearRampToValueAtTime(v * 0.28, t + 0.002)
    g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.28 : 0.05))
    n.connect(f); f.connect(g); g.connect(this.music)
  }

  tom(t, f0 = 110, v = 1) {
    const o = this.ctx.createOscillator()
    const g = this._g(t)
    o.type = 'sine'
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.22)
    g.gain.linearRampToValueAtTime(v * 0.8, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
    o.connect(g); g.connect(this.music)
    o.start(t); o.stop(t + 0.42)
  }

  wood(t, v = 1) {
    ;[860, 1720].forEach((fr, i) => {
      const o = this.ctx.createOscillator()
      const g = this._g(t)
      o.type = 'sine'; o.frequency.value = fr
      g.gain.linearRampToValueAtTime(v * (i ? 0.18 : 0.5), t + 0.002)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
      o.connect(g); g.connect(this.music)
      o.start(t); o.stop(t + 0.07)
    })
  }

  gong(t, v = 1) {
    ;[72, 108, 146, 219].forEach((fr, i) => {
      const o = this.ctx.createOscillator()
      const g = this._g(t)
      o.type = 'sine'; o.frequency.value = fr * (1 + Math.random() * 0.01)
      g.gain.linearRampToValueAtTime(v * 0.32 / (i + 1), t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.001, t + 3.2)
      o.connect(g); g.connect(this.music)
      o.start(t); o.stop(t + 3.3)
    })
    const n = this._noise(t, 1)
    const f = this.ctx.createBiquadFilter()
    const g = this._g(t)
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.5
    g.gain.linearRampToValueAtTime(v * 0.12, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2)
    n.connect(f); f.connect(g); g.connect(this.music)
  }

  crash(t, v = 1) {
    const n = this._noise(t, 1.6)
    const f = this.ctx.createBiquadFilter()
    const g = this._g(t)
    f.type = 'highpass'; f.frequency.value = 4200
    g.gain.linearRampToValueAtTime(v * 0.4, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.5)
    n.connect(f); f.connect(g); g.connect(this.music)
  }

  bass(t, f0, dur, v = 1) {
    const o = this.ctx.createOscillator()
    const sub = this.ctx.createOscillator()
    const fl = this.ctx.createBiquadFilter()
    const g = this._g(t)
    o.type = 'sawtooth'; o.frequency.value = f0
    sub.type = 'sine'; sub.frequency.value = f0 * 0.5
    fl.type = 'lowpass'; fl.Q.value = 4
    fl.frequency.setValueAtTime(Math.min(f0 * 9, 900), t)
    fl.frequency.exponentialRampToValueAtTime(f0 * 2.2, t + Math.max(dur * 0.7, 0.08))
    g.gain.linearRampToValueAtTime(v * 0.5, t + 0.006)
    g.gain.setValueAtTime(v * 0.5, t + Math.max(dur - 0.05, 0.02))
    g.gain.linearRampToValueAtTime(0.0001, t + dur)
    o.connect(fl); fl.connect(g)
    const sg = this.ctx.createGain(); sg.gain.value = 0.6
    sub.connect(sg); sg.connect(g)
    g.connect(this.music)
    o.start(t); o.stop(t + dur + 0.05)
    sub.start(t); sub.stop(t + dur + 0.05)
  }

  lead(t, f0, dur, v = 1, bright = 2600) {
    const g = this._g(t)
    const fl = this.ctx.createBiquadFilter()
    fl.type = 'lowpass'; fl.frequency.value = bright; fl.Q.value = 1.2
    ;[7, -7].forEach((det) => {
      const o = this.ctx.createOscillator()
      o.type = 'sawtooth'; o.frequency.value = f0; o.detune.value = det
      o.connect(fl)
      o.start(t); o.stop(t + dur + 0.12)
    })
    g.gain.linearRampToValueAtTime(v * 0.22, t + 0.012)
    g.gain.setValueAtTime(v * 0.22, t + Math.max(dur - 0.06, 0.02))
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.1)
    fl.connect(g); g.connect(this.music)
  }

  arp(t, f0, dur, v = 1) { this.lead(t, f0, Math.min(dur, 0.16), v * 0.7, 3400) }

  pluck(t, f0, dur, v = 1) {
    const o = this.ctx.createOscillator()
    const g = this._g(t)
    const fl = this.ctx.createBiquadFilter()
    o.type = 'triangle'; o.frequency.value = f0
    fl.type = 'lowpass'; fl.Q.value = 1
    const dec = Math.min(dur * 1.4, 1.3)
    fl.frequency.setValueAtTime(f0 * 8, t)
    fl.frequency.exponentialRampToValueAtTime(f0 * 1.6, t + dec)
    g.gain.linearRampToValueAtTime(v * 0.55, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.001, t + dec)
    o.connect(fl); fl.connect(g); g.connect(this.music)
    const lfo = this.ctx.createOscillator()
    const lg = this.ctx.createGain()
    lfo.frequency.value = 4.6
    lg.gain.setValueAtTime(0, t)
    lg.gain.linearRampToValueAtTime(9, t + 0.4)
    lfo.connect(lg); lg.connect(o.detune)
    lfo.start(t); lfo.stop(t + dec)
    o.start(t); o.stop(t + dec + 0.05)
    const n = this._noise(t, 0.02)
    const nf = this.ctx.createBiquadFilter()
    const ng = this._g(t)
    nf.type = 'bandpass'; nf.frequency.value = Math.min(f0 * 4, 4000)
    ng.gain.linearRampToValueAtTime(v * 0.1, t + 0.002)
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.02)
    n.connect(nf); nf.connect(ng); ng.connect(this.music)
  }

  flute(t, f0, dur, v = 1) {
    const g = this._g(t)
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f0
    const o2 = this.ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f0 * 2
    const g2 = this.ctx.createGain(); g2.gain.value = 0.22
    const lfo = this.ctx.createOscillator()
    const lg = this.ctx.createGain()
    lfo.frequency.value = 5.2
    lg.gain.setValueAtTime(0, t)
    lg.gain.linearRampToValueAtTime(10, t + 0.35)
    lfo.connect(lg); lg.connect(o.detune); lg.connect(o2.detune)
    g.gain.linearRampToValueAtTime(v * 0.3, t + 0.09)
    g.gain.setValueAtTime(v * 0.3, t + Math.max(dur - 0.12, 0.05))
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.1)
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.music)
    const n = this._noise(t, dur)
    const nf = this.ctx.createBiquadFilter()
    const ng = this._g(t)
    nf.type = 'bandpass'; nf.frequency.value = f0 * 2; nf.Q.value = 2
    ng.gain.linearRampToValueAtTime(v * 0.05, t + 0.1)
    ng.gain.linearRampToValueAtTime(0.0001, t + dur)
    n.connect(nf); nf.connect(ng); ng.connect(this.music)
    o.start(t); o.stop(t + dur + 0.15)
    o2.start(t); o2.stop(t + dur + 0.15)
    lfo.start(t); lfo.stop(t + dur + 0.15)
  }

  pad(t, midis, dur, v = 1) {
    const atk = Math.min(0.7, dur * 0.3)
    midis.forEach((m) => {
      const f0 = mtof(m)
      const g = this._g(t)
      const fl = this.ctx.createBiquadFilter()
      fl.type = 'lowpass'; fl.frequency.value = 950
      ;[9, -9].forEach((det) => {
        const o = this.ctx.createOscillator()
        o.type = 'sawtooth'; o.frequency.value = f0; o.detune.value = det
        o.connect(fl)
        o.start(t); o.stop(t + dur + 0.8)
      })
      g.gain.linearRampToValueAtTime(v * 0.06, t + atk)
      g.gain.setValueAtTime(v * 0.06, t + Math.max(dur - 0.2, atk))
      g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.7)
      fl.connect(g); g.connect(this.music)
    })
  }

  riser(t, dur, v = 1) {
    const n = this._noise(t, dur)
    const f = this.ctx.createBiquadFilter()
    const g = this._g(t)
    f.type = 'bandpass'; f.Q.value = 1.4
    f.frequency.setValueAtTime(300, t)
    f.frequency.exponentialRampToValueAtTime(7000, t + dur)
    g.gain.linearRampToValueAtTime(v * 0.35, t + dur * 0.85)
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05)
    n.connect(f); f.connect(g); g.connect(this.music)
  }

  // Beat Saber game-extracted hit sounds: 10 random good-cut variants + last-note accents
  hitBufs: AudioBuffer[] = []
  lastHitBufs: AudioBuffer[] = []
  _hitLoading = false

  /** Load sampled hit sounds from /sfx/. Falls back to synth sfxSlash when absent. */
  loadHitSounds() {
    if (this._hitLoading) return
    this._hitLoading = true
    const load = (url: string, arr: AudioBuffer[]) => fetch(url)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer() })
      .then(ab => this.ctx.decodeAudioData(ab))
      .then(buf => { arr.push(buf) })
      .catch(() => {})
    for (let i = 1; i <= 10; i++) load(`/sfx/hit${i}.ogg`, this.hitBufs)
    for (let i = 1; i <= 2; i++) load(`/sfx/lasthit${i}.ogg`, this.lastHitBufs)
  }

  _playBuf(buf: AudioBuffer, pan: number, vol: number, rate: number) {
    const s = this.ctx.createBufferSource()
    s.buffer = buf
    s.playbackRate.value = rate
    const g = this.ctx.createGain()
    g.gain.value = vol
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner()
      p.pan.value = pan
      s.connect(p); p.connect(g)
    } else s.connect(g)
    g.connect(this.sfx)
    s.start(this.now())
  }

  /** Sampled block-hit sound (random official variant); soft=true for chain links. */
  sfxHit(pan = 0, vol = 1, rate = 1, soft = false) {
    if (!this.hitBufs.length) { this.sfxSlash(pan); return }
    const buf = this.hitBufs[Math.floor(Math.random() * this.hitBufs.length)]
    this._playBuf(buf, pan, soft ? vol * 0.8 : vol, rate)
  }

  /** Accented hit for the song's final note. */
  sfxLastHit(pan = 0) {
    if (!this.lastHitBufs.length) { this.sfxHit(pan, 1, 1); return }
    const buf = this.lastHitBufs[Math.floor(Math.random() * this.lastHitBufs.length)]
    this._playBuf(buf, pan, 1, 1)
  }

  sfxSlash(pan = 0) {
    const t = this.now()
    // Punch layer - deep thump
    const s1 = this.ctx.createOscillator()
    const g1 = this._g(t)
    s1.type = 'sine'; s1.frequency.setValueAtTime(280, t)
    s1.frequency.exponentialRampToValueAtTime(55, t + 0.08)
    g1.gain.linearRampToValueAtTime(0.8, t + 0.002)
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.09)
    s1.connect(g1); g1.connect(this.sfx); s1.start(t); s1.stop(t + 0.11)

    // Noise burst - the "slash" texture
    const n = this._noise(t, 0.12)
    const f = this.ctx.createBiquadFilter()
    const g2 = this._g(t)
    f.type = 'bandpass'; f.Q.value = 0.9
    f.frequency.setValueAtTime(3200, t)
    f.frequency.exponentialRampToValueAtTime(11000, t + 0.06)
    g2.gain.linearRampToValueAtTime(0.55, t + 0.003)
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
    n.connect(f)
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner()
      p.pan.value = pan; f.connect(p); p.connect(g2)
    } else f.connect(g2)
    g2.connect(this.sfx)

    // Sparkle - high frequency shimmer
    const s2 = this.ctx.createOscillator()
    const g3 = this._g(t)
    s2.type = 'sine'; s2.frequency.setValueAtTime(1800 + Math.random() * 400, t)
    s2.frequency.exponentialRampToValueAtTime(4400, t + 0.04)
    g3.gain.linearRampToValueAtTime(0.2, t + 0.003)
    g3.gain.exponentialRampToValueAtTime(0.001, t + 0.07)
    s2.connect(g3); g3.connect(this.sfx); s2.start(t); s2.stop(t + 0.09)
  }

  sfxBad() {
    const t = this.now()
    // Harsh buzz
    const o = this.ctx.createOscillator()
    const g = this._g(t)
    o.type = 'sawtooth'; o.frequency.setValueAtTime(180, t)
    o.frequency.exponentialRampToValueAtTime(60, t + 0.18)
    g.gain.linearRampToValueAtTime(0.3, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.22)
    // Noise crack
    const n = this._noise(t, 0.12)
    const f = this.ctx.createBiquadFilter()
    const ng = this._g(t)
    f.type = 'highpass'; f.frequency.value = 2000
    ng.gain.linearRampToValueAtTime(0.25, t + 0.002)
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
    n.connect(f); f.connect(ng); ng.connect(this.sfx)
  }

  sfxMiss() {
    const t = this.now()
    const o = this.ctx.createOscillator()
    const g = this._g(t)
    o.type = 'sine'; o.frequency.setValueAtTime(180, t)
    o.frequency.exponentialRampToValueAtTime(110, t + 0.1)
    g.gain.linearRampToValueAtTime(0.22, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
    o.connect(g); g.connect(this.sfx)
    o.start(t); o.stop(t + 0.16)
  }

  sfxBomb() {
    const t = this.now()
    const o = this.ctx.createOscillator()
    const g = this._g(t)
    o.type = 'sine'; o.frequency.setValueAtTime(90, t)
    o.frequency.exponentialRampToValueAtTime(35, t + 0.35)
    g.gain.linearRampToValueAtTime(0.85, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
    o.connect(g); g.connect(this.sfx)
    o.start(t); o.stop(t + 0.55)
    const n = this._noise(t, 0.35)
    const f = this.ctx.createBiquadFilter()
    const ng = this._g(t)
    f.type = 'lowpass'; f.frequency.value = 1100
    ng.gain.linearRampToValueAtTime(0.5, t + 0.005)
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
    n.connect(f); f.connect(ng); ng.connect(this.sfx)
  }

  sfxClick() {
    const t = this.now()
    const o = this.ctx.createOscillator()
    const g = this._g(t)
    o.type = 'sine'; o.frequency.value = 880
    g.gain.linearRampToValueAtTime(0.18, t + 0.003)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
    o.connect(g); g.connect(this.sfx)
    o.start(t); o.stop(t + 0.08)
  }

  sfxCount(final = false) {
    const t = this.now()
    const o = this.ctx.createOscillator()
    const g = this._g(t)
    o.type = 'sine'; o.frequency.value = final ? 988 : 660
    g.gain.linearRampToValueAtTime(0.25, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.001, t + (final ? 0.4 : 0.12))
    o.connect(g); g.connect(this.sfx)
    o.start(t); o.stop(t + 0.45)
  }
}

export class MusicPlayer {
  synth: Synth
  timer: any
  events: any[]
  idx: number
  startTime: number
  buffer: AudioBuffer | null
  src: AudioBufferSourceNode | null

  constructor(synth) {
    this.synth = synth
    this.timer = null
    this.events = []
    this.idx = 0
    this.startTime = 0
  }

  load(events) {
    this.events = events.slice().sort((a, b) => a.t - b.t)
    this.idx = 0
    this.buffer = null
  }

  loadBuffer(buffer) {
    this.events = []
    this.idx = 0
    this.buffer = buffer
  }

  start(startTime) {
    this.startTime = startTime
    this.stopTimer()
    if (this.buffer) {
      this.src = this.synth.ctx.createBufferSource()
      this.src.buffer = this.buffer
      this.src.connect(this.synth.music)
      this.src.start(startTime)
    } else {
      this.timer = setInterval(() => this.tick(), 30)
    }
  }

  tick() {
    const s = this.synth
    const ct = s.ctx.currentTime
    while (this.idx < this.events.length && this.startTime + this.events[this.idx].t < ct + 0.18) {
      const e = this.events[this.idx++]
      const at = this.startTime + e.t
      if (at < ct - 0.05) continue
      this.dispatch(e, at)
    }
    if (this.idx >= this.events.length) this.stopTimer()
  }

  dispatch(e, at) {
    const s = this.synth
    const v = e.v == null ? 1 : e.v
    switch (e.i) {
      case 'kick': s.kick(at, v); break
      case 'snare': s.snare(at, v); break
      case 'clap': s.clap(at, v); break
      case 'hat': s.hat(at, v, false); break
      case 'ohat': s.hat(at, v, true); break
      case 'tom': s.tom(at, e.f || 110, v); break
      case 'wood': s.wood(at, v); break
      case 'gong': s.gong(at, v); break
      case 'crash': s.crash(at, v); break
      case 'bass': s.bass(at, mtof(e.m), e.d, v); break
      case 'lead': s.lead(at, mtof(e.m), e.d, v); break
      case 'arp': s.arp(at, mtof(e.m), e.d, v); break
      case 'pluck': s.pluck(at, mtof(e.m), e.d, v); break
      case 'flute': s.flute(at, mtof(e.m), e.d, v); break
      case 'pad': s.pad(at, e.ms, e.d, v); break
      case 'riser': s.riser(at, e.d, v); break
    }
  }

  stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null } }

  stop() {
    this.stopTimer()
    this.idx = this.events.length
    if (this.src) { try { this.src.stop() } catch (e) {} this.src = null }
  }
}
