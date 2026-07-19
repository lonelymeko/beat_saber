function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Improved Beat Saber-style pattern generator
// Directions: 0=up 1=down 2=left 3=right 4=up-left 5=up-right 6=down-right 7=down-left 8=any
function genMap(sections, spb, seed) {
  const rng = mulberry32(seed)
  const bar = spb * 4
  const notes = []
  const walls = []

  // Generate walls
  for (const sec of sections) {
    if (!sec.walls) continue
    for (let b = sec.from; b < sec.to; b++) {
      if ((b - sec.from) % 4 === 2)
        walls.push({ t: b * bar, dur: bar * 1.5, side: ((b / 4) | 0) % 2 === 0 ? -1 : 1 })
    }
  }
  function wallSide(t) {
    for (const w of walls)
      if (t > w.t - spb * 0.5 && t < w.t + w.dur + spb * 0.5) return w.side
    return 0
  }

  // Position mapping: x=0,1 left hand preferred; x=2,3 right hand preferred
  // y=0 bottom, y=1 middle, y=2 top
  // dir→pos: up(0)→bottom rows, down(1)→middle/top, left(2)→right cols, right(3)→left cols
  
  function add(t, x, y, type, dir) {
    for (const n of notes) {
      if (Math.abs(n.t - t) < spb * 0.35 && n.x === x && n.y === y) return
    }
    notes.push({ t, x, y, type, dir })
  }

  // Get best position for a direction to feel natural
  function posForDir(dir, hand) {
    const side = hand === 0 ? [0, 1] : [2, 3]
    const x = side[rng() < 0.55 ? 0 : 1]
    let y
    if (dir === 0) y = rng() < 0.7 ? 0 : 1           // up cut: mostly bottom
    else if (dir === 1) y = rng() < 0.65 ? 1 : (rng() < 0.5 ? 0 : 2) // down cut: mostly middle
    else if (dir === 2) y = rng() < 0.6 ? 1 : 0       // left cut
    else if (dir === 3) y = rng() < 0.6 ? 1 : 2       // right cut
    else if (dir === 5) y = rng() < 0.6 ? 1 : 0       // up-right
    else if (dir === 6) y = rng() < 0.6 ? 1 : 2       // down-right
    else if (dir === 7) y = rng() < 0.6 ? 1 : 0       // down-left
    else { const r = rng(); y = r < 0.35 ? 0 : r < 0.7 ? 1 : 2 }
    return { x, y }
  }

  // Natural alternating direction flow
  const dirPairs = [[0, 1], [1, 0], [2, 3], [3, 2], [5, 6], [6, 5], [7, 5], [5, 7]]
  const lastDir = [1, 1]
  const lastX = [-1, -1]
  
  function nextDir(h) {
    const prev = lastDir[h]
    // Prefer the complementary direction for better flow
    const pair = dirPairs.find(p => p[0] === prev)
    if (pair && rng() < 0.7) { lastDir[h] = pair[1]; return pair[1] }
    // Occasionally switch to any
    if (rng() < 0.1) return 8
    // Pick a related direction
    const opts = [0, 1]
    if (prev <= 1) {
      if (rng() < 0.3) opts.push(2, 3)
      if (rng() < 0.15 && h === 1) opts.push(5, 7)
    } else if (prev === 8) {
      opts.push(2, 3, 5, 6, 7)
    }
    const d = opts[(rng() * opts.length) | 0]
    if (d <= 1) lastDir[h] = d
    return d
  }

  // Pattern: stream (alternating hands)
  function stream(t, count, interval, baseDir) {
    let h = rng() < 0.5 ? 0 : 1
    const dir = baseDir || (rng() < 0.5 ? 0 : 1)
    for (let i = 0; i < count; i++) {
      const d = i === 0 ? dir : nextDir(h === 0 ? 1 : 0)
      const p = posForDir(d, h)
      const ws = wallSide(t)
      if (ws === -1 && h !== 1) h = 1
      else if (ws === 1 && h !== 0) h = 0
      add(t, p.x, p.y, h, d)
      lastDir[h] = d
      h = 1 - h
    }
  }

  // Pattern: doubles (both hands simultaneously, same direction or complementary)
  function double(t, dL, dR) {
    if (wallSide(t) !== 0) {
      // During walls, favor the non-wall side
      add(t, 2, 1, 1, dR || 1)
      add(t, 3, 0, 1, dR || 1)
      return
    }
    const dl = dL || (rng() < 0.6 ? 0 : 1)
    const dr = dR || ((rng() < 0.5) ? dl : (1 - dl))
    const pL = posForDir(dl, 0)
    const pR = posForDir(dr, 1)
    // Ensure notes aren't on the same x
    const lx = rng() < 0.7 ? 0 : 1
    const rx = rng() < 0.7 ? 3 : 2
    add(t, lx, pL.y, 0, dl)
    add(t, rx, pR.y, 1, dr)
    lastDir[0] = dl
    lastDir[1] = dr
  }

  // Pattern: triple (three quick notes)
  function triple(t, interval) {
    const h = rng() < 0.5 ? 0 : 1
    const d0 = rng() < 0.6 ? 0 : 1
    add(t, h === 0 ? 0 : 3, rng() < 0.5 ? 0 : 1, h, d0)
    lastDir[h] = d0
    add(t + interval, 1 - h === 0 ? 1 : 2, rng() < 0.5 ? 1 : 2, 1 - h, 1 - d0)
    lastDir[1 - h] = 1 - d0
    add(t + interval * 2, 2, 0, h, d0)
    lastDir[h] = d0
  }

  // Pattern: staircase (ascending/descending rows with alternating hands)
  function staircase(t, count, interval, ascend) {
    let h = rng() < 0.5 ? 0 : 1
    for (let i = 0; i < count; i++) {
      const y = ascend ? i % 3 : (count - 1 - i) % 3
      const d = ascend ? (y === 0 ? 0 : y === 1 ? 8 : 1) : (y === 2 ? 1 : y === 0 ? 0 : 8)
      const x = h === 0 ? (i % 2 === 0 ? 0 : 1) : (i % 2 === 0 ? 3 : 2)
      add(t, x, y, h, d)
      lastDir[h] = d
      h = 1 - h
    }
  }

  // Pattern: cross-body (right hand hits left lanes, vice versa)
  function crossBody(t, count, interval) {
    let h = rng() < 0.5 ? 0 : 1
    for (let i = 0; i < count; i++) {
      const crossHand = h === 0 ? 1 : 0
      const x = crossHand === 0 ? (rng() < 0.7 ? 0 : 1) : (rng() < 0.7 ? 3 : 2)
      const d = lastDir[1 - h] === 0 ? 1 : 0
      add(t, x, rng() < 0.5 ? 0 : 1, h, d)
      lastDir[h] = d
      h = 1 - h
    }
  }

  // Generate notes based on sections
  for (const sec of sections) {
    const { from, to, d } = sec
    const count = to - from
    const beginBeat = from * bar

    for (let bi = 0; bi < count; bi++) {
      const b = from + bi
      const bt = b * bar
      const localBar = bi
      const ws = wallSide(bt)

      switch (d) {
        case 'sparse': // One note per bar
          if (rng() < 0.7) {
            const h = ws === -1 ? 1 : ws === 1 ? 0 : (rng() < 0.5 ? 0 : 1)
            const dir = rng() < 0.5 ? 0 : 1
            const p = posForDir(dir, h)
            add(bt, p.x, p.y, h, dir)
            lastDir[h] = dir
          }
          break

        case 'half':
          for (let k = 0; k < 2; k++) {
            const h = ws === -1 ? 1 : ws === 1 ? 0 : ((localBar + k) % 2)
            const dir = k === 0 ? 0 : 1
            const p = posForDir(dir, h)
            add(bt + k * 2 * spb, p.x, p.y, h, dir)
            lastDir[h] = dir
          }
          break

        case 'beat':
          for (let k = 0; k < 4; k++) {
            const h = ws === -1 ? 1 : ws === 1 ? 0 : ((localBar + k) % 2)
            const dir = dirPairs.find(pp => pp[0] === lastDir[h])?.[1] || (rng() < 0.5 ? 0 : 1)
            const p = posForDir(dir, h)
            add(bt + k * spb, p.x, p.y, h, dir)
            lastDir[h] = dir
          }
          break

        case 'stream4':
          for (let k = 0; k < 4; k++) {
            const h = (k % 2 === 0) ? 0 : 1
            const dir = k >= 2 ? 1 : 0
            const p = posForDir(dir, h)
            add(bt + k * spb * 0.5, p.x, p.y, h, dir)
            lastDir[h] = dir
          }
          break

        case 'eighth':
          if (localBar % 4 === 0) double(bt)
          for (let k = 0; k < 8; k++) {
            if (localBar % 4 === 0 && k === 0) continue
            if (k % 2 === 1 && rng() < 0.18) continue
            const h = ws === -1 ? 1 : ws === 1 ? 0 : ((localBar * 4 + k) % 2)
            const dir = dirPairs.find(pp => pp[0] === lastDir[h])?.[1] || (k % 4 < 2 ? 0 : 1)
            const p = posForDir(dir, h)
            add(bt + k * spb * 0.5, p.x, p.y, h, dir)
            lastDir[h] = dir
          }
          break

        case 'stream': // 8 notes per bar, stream pattern
          for (let k = 0; k < 8; k++) {
            const h = k % 2
            let dir
            if (k === 0) dir = 0
            else if (k === 1) dir = 1
            else dir = dirPairs.find(pp => pp[0] === lastDir[h])?.[1] || 0
            const p = posForDir(dir, h)
            add(bt + k * spb * 0.5, p.x, p.y, h, dir)
            lastDir[h] = dir
          }
          break

        case 'cross': // Cross-body patterns
          if (localBar % 2 === 0) crossBody(bt, 4, spb * 0.5)
          else {
            const h = rng() < 0.5 ? 0 : 1
            for (let k = 0; k < 4; k++) {
              const dir = k % 2 === 0 ? 0 : 1
              add(bt + k * spb, p.x, p.y, h, dir)
            }
          }
          break

        case 'mixed': // Varied patterns
          const r = localBar % 8
          if (r === 0 || r === 4) double(bt)
          else if (r === 2 || r === 6) {
            for (let k = 0; k < 3; k++) {
              const h = k % 2
              add(bt + k * spb * 0.5, h === 0 ? 0 : 3, 1, h, h === 0 ? 0 : 1)
            }
          } else {
            for (let k = 0; k < 4; k++) {
              const h = (localBar % 2 + k) % 2
              const dir = k < 2 ? 0 : 1
              const p = posForDir(dir, h)
              add(bt + k * spb, p.x, p.y, h, dir)
              lastDir[h] = dir
            }
          }
          break

        case 'empty':
          break
      }

      // Bombs in certain sections
      if (sec.bombs && localBar % 2 === 1) {
        const bt2 = bt + spb * (rng() < 0.5 ? 1 : 3)
        if (rng() < 0.7) add(bt2, 1, 2, 3, 8)
        if (rng() < 0.7) add(bt2, 2, 2, 3, 8)
      }
    }
  }

  notes.sort((a, b) => a.t - b.t)
  return { notes, walls }
}

// ========== Miku 千本桜 Senbonzakura ==========
function buildSenbonzakura() {
  const bpm = 154, spb = 60 / bpm, bar = spb * 4, s16 = spb / 4
  const E = []
  const P = (t, i, o = {}) => E.push(Object.assign({ t, i }, o))

  // Characteristic 千本桜 melody: Dm progression
  const melody = [
    69, 71, 72, 74, 76, 72, 71, 69,
    69, 71, 72, 74, 76, 77, 76, 74,
    74, 76, 77, 79, 81, 77, 76, 74,
    72, 71, 72, 74, 72, 71, 69, 67,
  ]
  const roots = [38, 43, 36, 40]
  const pads = [[38, 45, 50, 53], [43, 50, 55, 57], [36, 43, 48, 52], [40, 47, 52, 55]]

  function drums(b, fill) {
    const t = b * bar
    for (let k = 0; k < 4; k++) P(t + k * spb, 'kick', { v: 0.95 })
    P(t + spb, 'snare', { v: 0.9 }); P(t + 3 * spb, 'snare', { v: 0.9 })
    for (let k = 0; k < 16; k++) P(t + k * s16, (k % 4 === 0 || k % 4 === 3) ? 'hat' : 'ohat', { v: 0.45 + (k % 2 ? 0.05 : 0.15) })
    if (fill) for (let k = 0; k < 8; k++) P(t + 3 * spb + k * s16 * 0.5, 'snare', { v: 0.4 + k * 0.08 })
  }
  function bass(b) {
    const t = b * bar, r = roots[b % 4]
    for (let k = 0; k < 8; k++) P(t + k * spb * 0.5, 'bass', { m: k % 4 < 2 ? r : r + 12, d: s16 * 1.5, v: 0.85 })
  }
  function arp(b) {
    const t = b * bar, c = pads[b % 4]
    const pat = [0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 1, 3]
    pat.forEach((i, k) => P(t + k * s16, 'arp', { m: c[i], d: s16, v: 0.45 + (k % 4 ? 0 : 0.15) }))
  }

  // Intro
  for (let b = 0; b < 4; b++) {
    P(b * bar, 'pad', { ms: pads[b % 4], d: bar, v: 0.8 })
    if (b >= 2) for (let k = 0; k < 8; k++) P(b * bar + k * spb * 0.5, 'hat', { v: 0.2 + k * 0.01 })
  }
  // Verse 1
  for (let b = 4; b < 12; b++) {
    drums(b, b % 8 === 7); bass(b); arp(b)
    P(b * bar, 'pad', { ms: pads[b % 4], d: bar, v: 0.5 })
    melody.slice((b - 4) * 4, (b - 4) * 4 + 4).forEach((m, k) => {
      P(b * bar + k * spb, 'lead', { m, d: spb * 0.85, v: 0.8 })
    })
  }
  // Chorus
  P(12 * bar, 'riser', { d: 4 * bar, v: 0.8 })
  for (let b = 12; b < 20; b++) {
    drums(b, true); bass(b); arp(b)
    P(b * bar, 'pad', { ms: pads[b % 4], d: bar, v: 0.65 })
    melody.slice(((b - 12) * 2) % 32, ((b - 12) * 2 + 4) % 33).forEach((m, k) => {
      P(b * bar + k * spb * 2, 'lead', { m: m + 12, d: spb * 1.8, v: 0.85 })
    })
  }
  // Break
  for (let b = 20; b < 24; b++) {
    P(b * bar, 'pad', { ms: pads[b % 4], d: bar, v: 0.7 })
    if (b === 23) { P(b * bar, 'riser', { d: bar, v: 1 }); for (let k = 0; k < 16; k++) P(b * bar + k * s16, 'snare', { v: 0.3 + k * 0.045 }) }
  }
  // Final chorus
  for (let b = 24; b < 32; b++) {
    drums(b, b % 4 === 3); bass(b); arp(b)
    P(b * bar, 'pad', { ms: pads[b % 4], d: bar, v: 0.7 })
    melody.slice(((b - 24) * 2 + 8) % 32, ((b - 24) * 2 + 12) % 33).forEach((m, k) => {
      P(b * bar + k * spb * 2, 'lead', { m: m + (b % 4 < 2 ? 24 : 12), d: spb * 1.8, v: 0.9 })
    })
  }
  // Outro
  for (let b = 32; b < 36; b++) {
    P(b * bar, 'pad', { ms: pads[b % 4], d: bar, v: 0.7 - (b - 32) * 0.15 })
    for (let k = 0; k < 4; k++) P(b * bar + k * spb, 'kick', { v: 0.6 - (b - 32) * 0.1 })
  }
  P(36 * bar - spb, 'gong', { v: 0.4 })

  const map = genMap([
    { from: 2, to: 6, d: 'half' },
    { from: 6, to: 12, d: 'beat' },
    { from: 12, to: 20, d: 'eighth', walls: true },
    { from: 20, to: 24, d: 'sparse', bombs: true },
    { from: 24, to: 32, d: 'eighth', walls: true },
    { from: 32, to: 35, d: 'half' },
  ], spb, 393939)

  return { events: E, notes: map.notes, walls: map.walls, duration: 36 * bar + 2, bpm, spb }
}

// ========== Miku ロキ ROKI ==========
function buildRoki() {
  const bpm = 150, spb = 60 / bpm, bar = spb * 4, s16 = spb / 4
  const E = []
  const P = (t, i, o = {}) => E.push(Object.assign({ t, i }, o))

  const roots = [40, 38, 36, 40]
  const chords = [[40, 47, 52, 56], [38, 45, 50, 53], [36, 43, 48, 52], [40, 47, 52, 56]]
  const leadPhrases = [
    [64, 66, 67, 69, 71, 69, 67, 66],
    [69, 71, 72, 74, 76, 74, 72, 71],
    [72, 74, 76, 77, 76, 74, 72, 71],
    [69, 67, 66, 64, 66, 67, 69, 71],
  ]

  function drums(b, full) {
    const t = b * bar
    for (let k = 0; k < 4; k++) P(t + k * spb, 'kick', { v: full ? 1 : 0.8 })
    if (full) P(t + spb, 'snare', { v: 0.9 }); P(t + 3 * spb, 'snare', { v: 0.9 })
    if (full) for (let k = 0; k < 16; k++) P(t + k * s16, k % 2 ? 'ohat' : 'hat', { v: 0.5 })
  }
  function bass(b) {
    const t = b * bar, r = roots[b % 4]
    ;[0, 1.5, 3, 4.5, 6, 7.5, 9, 10.5].forEach(st => {
      P(t + st * spb * 0.25, 'bass', { m: r + (st % 2 === 0 ? 0 : 12), d: s16 * 1.2, v: 0.8 })
    })
  }
  function chordPad(b) {
    P(b * bar, 'pad', { ms: chords[b % 4], d: bar, v: 0.6 })
  }

  // Intro riff
  for (let b = 0; b < 4; b++) {
    P(b * bar, 'pad', { ms: chords[b % 4], d: bar, v: 0.9 })
    if (b === 0) leadPhrases[0].forEach((m, k) => P(b * bar + k * spb * 0.5, 'pluck', { m, d: spb * 0.4, v: 0.7 }))
    if (b >= 2) { bass(b); for (let k = 0; k < 8; k++) P(b * bar + k * spb * 0.5, k % 2 ? 'ohat' : 'hat', { v: 0.3 }) }
  }
  P(4 * bar, 'crash', { v: 0.8 })
  // Verse
  for (let b = 4; b < 12; b++) {
    drums(b, true); bass(b); chordPad(b)
    const phrase = leadPhrases[(b - 4) % 4]
    phrase.forEach((m, k) => P(b * bar + k * spb * 0.5, 'lead', { m, d: spb * 0.45, v: 0.8 }))
  }
  // Chorus
  P(12 * bar, 'riser', { d: 4 * bar, v: 0.9 })
  for (let b = 12; b < 20; b++) {
    drums(b, true); bass(b); chordPad(b)
    const phrase = leadPhrases[b % 4]
    phrase.forEach((m, k) => P(b * bar + k * spb * 0.5, 'lead', { m: m + 12, d: spb * 0.45, v: 0.9 }))
  }
  // Solo-like break
  for (let b = 20; b < 24; b++) {
    drums(b, false); chordPad(b)
    ;[64, 67, 71, 74, 76, 74, 71, 67].forEach((m, k) => {
      P(b * bar + k * spb * 0.5, 'pluck', { m, d: spb * 0.4, v: 0.7 })
    })
  }
  P(24 * bar, 'crash', { v: 1 })
  for (let b = 24; b < 32; b++) {
    drums(b, true); bass(b); chordPad(b)
    leadPhrases[b % 4].forEach((m, k) => P(b * bar + k * spb * 0.5, 'lead', { m: m + 12, d: spb * 0.45, v: 0.85 }))
  }
  for (let b = 32; b < 35; b++) chordPad(b)
  P(35 * bar - spb, 'gong', { v: 0.35 })

  const map = genMap([
    { from: 2, to: 6, d: 'half' },
    { from: 6, to: 12, d: 'beat' },
    { from: 12, to: 20, d: 'eighth', walls: true },
    { from: 20, to: 24, d: 'mixed', bombs: true },
    { from: 24, to: 32, d: 'eighth', walls: true },
    { from: 32, to: 34, d: 'beat' },
  ], spb, 150150)

  return { events: E, notes: map.notes, walls: map.walls, duration: 35 * bar + 3, bpm, spb }
}

// ========== Miku ゴーストルール Ghost Rule ==========
function buildGhostRule() {
  const bpm = 190, spb = 60 / bpm, bar = spb * 4, s16 = spb / 4
  const E = []
  const P = (t, i, o = {}) => E.push(Object.assign({ t, i }, o))

  const roots = [33, 36, 31, 38]
  const pwr = [[33, 40, 45], [36, 43, 48], [31, 38, 43], [38, 45, 50]]
  const ghostMel = [
    [57, 60, 57, 62, 60, 57, 55, 57, 60, 57, 62, 60, 64, 62, 60, 57],
    [60, 57, 55, 53, 55, 57, 60, 62, 60, 57, 60, 62, 64, 65, 64, 62],
    [64, 65, 67, 69, 67, 65, 64, 62, 60, 57, 60, 62, 64, 62, 60, 57],
    [57, 60, 57, 62, 60, 64, 62, 60, 57, 55, 53, 55, 57, 60, 57, 55],
  ]

  function drumsIntense(b) {
    const t = b * bar
    P(t, 'kick', { v: 1 }); P(t + spb, 'kick', { v: 0.8 })
    P(t + 2 * spb, 'kick', { v: 0.95 }); P(t + 3 * spb, 'kick', { v: 0.7 })
    P(t + spb, 'snare', { v: 0.9 }); P(t + 3 * spb, 'snare', { v: 0.9 })
    P(t + spb * 0.75, 'snare', { v: 0.3 }); P(t + 3.75 * spb, 'snare', { v: 0.3 })
    for (let k = 0; k < 16; k++) P(t + k * s16, k % 2 ? 'ohat' : 'hat', { v: 0.55 })
  }
  function bassFast(b) {
    const t = b * bar, r = roots[b % 4]
    for (let k = 0; k < 16; k++) {
      P(t + k * s16, 'bass', { m: k % 4 < 2 ? r : r + 12, d: s16 * 0.75, v: 0.85 })
    }
  }

  // Intro tension
  for (let b = 0; b < 4; b++) {
    P(b * bar, 'pad', { ms: pwr[b % 4], d: bar, v: 0.7 })
    if (b >= 2) for (let k = 0; k < 8; k++) P(b * bar + k * spb * 0.5, 'hat', { v: 0.25 })
    if (b === 3) { P(b * bar + 2 * spb, 'riser', { d: 2 * spb, v: 0.8 }); for (let k = 0; k < 16; k++) P(b * bar + 3 * spb + k * s16 * 0.25, 'snare', { v: 0.2 + k * 0.05 }) }
  }
  P(4 * bar, 'crash', { v: 1 })
  // Verse intense
  for (let b = 4; b < 12; b++) {
    drumsIntense(b); bassFast(b)
    P(b * bar, 'pad', { ms: pwr[b % 4], d: bar, v: 0.45 })
    ghostMel[(b - 4) % 4].forEach((m, k) => {
      P(b * bar + k * s16, 'lead', { m, d: s16 * 0.8, v: 0.75 })
    })
  }
  // Chorus
  P(12 * bar, 'riser', { d: 4 * bar, v: 1 })
  for (let b = 12; b < 20; b++) {
    drumsIntense(b); bassFast(b)
    P(b * bar, 'pad', { ms: pwr[b % 4], d: bar, v: 0.55 })
    ghostMel[b % 4].forEach((m, k) => {
      P(b * bar + k * s16, 'lead', { m: m + 12, d: s16 * 0.8, v: 0.85 })
    })
  }
  // Breakdown
  for (let b = 20; b < 24; b++) {
    P(b * bar, 'pad', { ms: pwr[b % 4], d: bar, v: 0.8 })
    if (b === 20) ghostMel[0].slice(0, 8).forEach((m, k) => P(b * bar + k * spb * 0.5, 'pluck', { m: m + 12, d: spb * 0.4, v: 0.6 }))
    if (b === 23) { P(b * bar + 2 * spb, 'riser', { d: 2 * spb, v: 1 }); for (let k = 0; k < 16; k++) P(b * bar + 3 * spb + k * s16 * 0.25, 'snare', { v: 0.2 + k * 0.05 }) }
  }
  P(24 * bar, 'crash', { v: 1 })
  for (let b = 24; b < 32; b++) {
    drumsIntense(b); bassFast(b)
    P(b * bar, 'pad', { ms: pwr[b % 4], d: bar, v: 0.5 })
    ghostMel[b % 4].forEach((m, k) => {
      P(b * bar + k * s16, 'lead', { m: m + (b % 2 === 0 ? 24 : 12), d: s16 * 0.8, v: 0.9 })
    })
  }
  for (let b = 32; b < 35; b++) {
    P(b * bar, 'pad', { ms: pwr[b % 4], d: bar, v: 0.6 - (b - 32) * 0.2 })
  }
  P(35 * bar, 'gong', { v: 0.5 })

  const map = genMap([
    { from: 1, to: 4, d: 'half' },
    { from: 4, to: 12, d: 'beat' },
    { from: 12, to: 20, d: 'eighth', walls: true },
    { from: 20, to: 24, d: 'stream', bombs: true },
    { from: 24, to: 32, d: 'eighth', walls: true },
    { from: 32, to: 34, d: 'beat' },
  ], spb, 190319)

  return { events: E, notes: map.notes, walls: map.walls, duration: 36 * bar + 3, bpm, spb }
}

// ========== Miku ドーナツホール Donut Hole ==========
function buildDonutHole() {
  const bpm = 126, spb = 60 / bpm, bar = spb * 4, s16 = spb / 4
  const E = []
  const P = (t, i, o = {}) => E.push(Object.assign({ t, i }, o))

  const roots = [41, 39, 36, 41]
  const chords = [[41, 48, 53, 57], [39, 46, 51, 55], [36, 43, 48, 52], [41, 48, 53, 57]]
  const melA = [60, 62, 64, 65, 67, 65, 64, 62, 60, 60, 62, 64, 65, 64, 62, 60]
  const melB = [64, 65, 67, 69, 72, 71, 69, 67, 65, 64, 62, 64, 65, 67, 69, 67]
  const melC = [67, 69, 72, 74, 72, 69, 67, 65, 64, 62, 64, 65, 67, 69, 67, 65]

  function drumsSwing(b) {
    const t = b * bar
    P(t, 'kick', { v: 0.9 }); P(t + 2 * spb, 'kick', { v: 0.85 })
    P(t + 1.75 * spb, 'kick', { v: 0.5 })
    P(t + spb, 'snare', { v: 0.8 }); P(t + 3 * spb, 'snare', { v: 0.8 })
    for (let k = 0; k < 16; k++) P(t + k * s16, 'hat', { v: k % 4 === 0 ? 0.5 : k % 2 ? 0.25 : 0.35 })
  }
  function bassSmooth(b) {
    const t = b * bar, r = roots[b % 4]
    ;[0, 2, 4, 6].forEach(st => P(t + st * spb * 0.5, 'bass', { m: st % 2 === 0 ? r : r + 7, d: spb * 0.8, v: 0.75 }))
  }
  function pad(b) {
    P(b * bar, 'pad', { ms: chords[b % 4], d: bar, v: 0.65 })
  }

  // Intro
  for (let b = 0; b < 4; b++) pad(b)
  for (let b = 2; b < 4; b++) {
    P(b * bar, 'pluck', { m: 60, d: bar * 2, v: 0.5 })
    for (let k = 0; k < 8; k++) P(b * bar + k * spb * 0.5, 'hat', { v: 0.15 + k * 0.01 })
  }
  // Verse
  for (let b = 4; b < 12; b++) {
    drumsSwing(b); bassSmooth(b); pad(b)
    const mel = b < 8 ? melA : melB
    mel.slice(((b - 4) * 2) % 16, ((b - 4) * 2 + 4) % 17).forEach((m, k) => {
      P(b * bar + k * spb, 'lead', { m, d: spb * 0.85, v: 0.75 })
    })
  }
  // Chorus
  P(12 * bar, 'riser', { d: 4 * bar, v: 0.7 })
  for (let b = 12; b < 20; b++) {
    drumsSwing(b); bassSmooth(b); pad(b)
    const mel = b < 16 ? melB : melC
    mel.slice(((b - 12) * 2) % 16, ((b - 12) * 2 + 4) % 17).forEach((m, k) => {
      P(b * bar + k * spb, 'lead', { m: m + 12, d: spb * 0.85, v: 0.85 })
    })
  }
  // Bridge
  for (let b = 20; b < 24; b++) {
    pad(b); bassSmooth(b)
    if (b === 20) melA.slice(0, 8).forEach((m, k) => P(b * bar + k * spb * 0.5, 'pluck', { m: m + 24, d: spb * 0.4, v: 0.5 }))
    P(b * bar, 'tom', { f: 80, v: 0.4 })
    if (b === 23) { P(b * bar + 2 * spb, 'riser', { d: 2 * spb, v: 0.9 }); for (let k = 0; k < 16; k++) P(b * bar + 3 * spb + k * s16 * 0.25, 'snare', { v: 0.15 + k * 0.05 }) }
  }
  // Final chorus
  P(24 * bar, 'crash', { v: 0.9 })
  for (let b = 24; b < 32; b++) {
    drumsSwing(b); bassSmooth(b); pad(b)
    melC.slice(((b - 24) * 2) % 16, ((b - 24) * 2 + 4) % 17).forEach((m, k) => {
      P(b * bar + k * spb, 'lead', { m: m + 12, d: spb * 0.85, v: 0.9 })
    })
  }
  // Outro
  for (let b = 32; b < 35; b++) pad(b)
  P(35 * bar, 'gong', { v: 0.3 })

  const map = genMap([
    { from: 1, to: 5, d: 'half' },
    { from: 5, to: 12, d: 'beat' },
    { from: 12, to: 20, d: 'eighth', walls: true },
    { from: 20, to: 24, d: 'mixed', bombs: true },
    { from: 24, to: 32, d: 'eighth', walls: true },
    { from: 32, to: 34, d: 'half' },
  ], spb, 126126)

  return { events: E, notes: map.notes, walls: map.walls, duration: 36 * bar + 3, bpm, spb }
}

// Keep original songs ==========
function buildNeonPulse() {
  const bpm = 128, spb = 60 / bpm, bar = spb * 4, s16 = spb / 4
  const E = []
  const P = (t, i, o = {}) => E.push(Object.assign({ t, i }, o))
  const CH = [[57, 60, 64], [57, 60, 65], [55, 60, 64], [55, 59, 62]]
  const ROOT = [45, 41, 48, 43]
  const HOOK = [[76, 74, 72, 71], [69, 71, 72, 74], [76, 79, 76, 74], [72, 71, 69, 67]]
  const BREAK_MEL = [[69, 71, 72, 76], [74, 72, 71, 67], [72, 71, 69, 64], [64, 67, 69, 0]]
  const ARPPAT = [0, 1, 2, 3, 2, 1, 0, 2, 0, 1, 2, 3, 4, 3, 2, 1]

  const drums = (b, fill) => {
    const t = b * bar
    for (let k = 0; k < 4; k++) P(t + k * spb, 'kick', { v: 1 })
    P(t + spb, 'clap', { v: 0.9 }); P(t + 3 * spb, 'clap', { v: 0.9 })
    for (let k = 0; k < 8; k++) P(t + k * spb * 0.5, k % 2 ? 'ohat' : 'hat', { v: k % 2 ? 0.5 : 0.7 })
    if (fill) for (let k = 0; k < 4; k++) P(t + 3 * spb + k * s16, 'snare', { v: 0.5 + k * 0.12 })
  }
  const bassline = (b, ci) => {
    const t = b * bar, r = ROOT[ci]
    ;[0, 3, 6, 8, 11, 14].forEach((st, j) => {
      P(t + st * s16, 'bass', { m: j % 3 === 2 ? r + 12 : r, d: s16 * 2.2, v: 0.9 })
    })
  }
  const arps = (b, ci) => {
    const t = b * bar, c = CH[ci]
    const tones = [c[0] + 12, c[1] + 12, c[2] + 12, c[0] + 24, c[1] + 24]
    for (let k = 0; k < 16; k++) P(t + k * s16, 'arp', { m: tones[ARPPAT[k]], d: s16, v: 0.55 })
  }

  for (let b = 0; b < 8; b++) {
    P(b * bar, 'pad', { ms: CH[b % 4], d: bar, v: 1 })
    if (b >= 4) for (let k = 0; k < 8; k++) P(b * bar + k * spb * 0.5, 'hat', { v: 0.4 })
    if (b >= 2) P(b * bar, 'pluck', { m: CH[b % 4][2] + 12, d: spb * 2, v: 0.5 })
  }
  for (let b = 8; b < 16; b++) {
    const ci = b % 4, t = b * bar
    for (let k = 0; k < 4; k++) P(t + k * spb, 'kick', { v: 0.95 })
    bassline(b, ci)
    P(t, 'pad', { ms: CH[ci], d: bar, v: 0.8 })
    for (let k = 0; k < 8; k++) P(t + k * spb * 0.5, k % 2 ? 'ohat' : 'hat', { v: 0.5 })
    if (b === 15) for (let k = 0; k < 16; k++) P(t + k * s16, 'snare', { v: 0.35 + k * 0.045 })
  }
  P(12 * bar, 'riser', { d: 4 * bar, v: 1 })
  P(16 * bar, 'crash', { v: 1 })
  for (let b = 16; b < 32; b++) {
    const ci = b % 4
    drums(b, b % 4 === 3)
    bassline(b, ci)
    arps(b, ci)
    if (b % 8 >= 4) HOOK[b % 4].forEach((m, k) => m && P(b * bar + k * spb, 'lead', { m, d: spb * 0.9, v: 0.8 }))
  }
  P(32 * bar, 'crash', { v: 0.8 })
  for (let b = 32; b < 40; b++) {
    const ci = b % 4, t = b * bar
    P(t, 'pad', { ms: CH[ci], d: bar, v: 1 })
    BREAK_MEL[b % 4].forEach((m, k) => m && P(t + k * spb, 'pluck', { m, d: spb, v: 0.7 }))
    if (b >= 36) for (let k = 0; k < 4; k++) P(t + k * spb, 'kick', { v: 0.9 })
    for (let k = 0; k < 8; k++) P(t + k * spb * 0.5, 'hat', { v: 0.35 })
  }
  P(36 * bar, 'riser', { d: 4 * bar, v: 1 })
  P(40 * bar, 'crash', { v: 1 })
  for (let b = 40; b < 56; b++) {
    const ci = b % 4
    drums(b, b % 4 === 3)
    bassline(b, ci)
    arps(b, ci)
    HOOK[b % 4].forEach((m, k) => m && P(b * bar + k * spb, 'lead', { m: m + (b % 8 >= 4 ? 12 : 0), d: spb * 0.9, v: 0.85 }))
  }
  P(56 * bar, 'crash', { v: 1 })
  for (let b = 56; b < 60; b++) {
    P(b * bar, 'pad', { ms: CH[b % 4], d: bar, v: 0.9 - (b - 56) * 0.2 })
    for (let k = 0; k < 8; k++) P(b * bar + k * spb * 0.5, 'hat', { v: 0.3 - (b - 56) * 0.06 })
  }
  P(60 * bar - spb, 'gong', { v: 0.4 })

  const map = genMap([
    { from: 1, to: 8, d: 'half' },
    { from: 8, to: 16, d: 'beat' },
    { from: 16, to: 32, d: 'eighth', walls: true },
    { from: 32, to: 36, d: 'half', bombs: true },
    { from: 36, to: 40, d: 'beat' },
    { from: 40, to: 56, d: 'eighth', walls: true },
    { from: 56, to: 59, d: 'half' },
  ], spb, 20260718)

  return { events: E, notes: map.notes, walls: map.walls, duration: 60 * bar + 2, bpm, spb }
}

function buildInkShadows() {
  const bpm = 84, spb = 60 / bpm, bar = spb * 4, s16 = spb / 4
  const E = []
  const P = (t, i, o = {}) => E.push(Object.assign({ t, i }, o))
  const DRONE_D = [38, 50, 57, 62], DRONE_B = [35, 47, 54, 62]
  const MEL_A = [
    [[0, 62, 4], [4, 64, 4], [8, 66, 4], [12, 69, 4]],
    [[0, 71, 4], [4, 69, 4], [8, 66, 8]],
    [[0, 64, 4], [4, 66, 4], [8, 69, 4], [12, 71, 4]],
    [[0, 69, 4], [4, 66, 4], [8, 64, 8]],
    [[0, 74, 4], [4, 71, 4], [8, 69, 4], [12, 66, 4]],
    [[0, 71, 4], [4, 69, 4], [8, 66, 4], [12, 64, 4]],
    [[0, 66, 4], [4, 64, 4], [8, 62, 4], [12, 64, 4]],
    [[0, 62, 16]],
  ]
  const MEL_B = [
    [[0, 66, 8], [8, 69, 8]],
    [[0, 71, 16]],
    [[0, 74, 4], [4, 71, 4], [8, 69, 8]],
    [[0, 66, 16]],
    [[0, 64, 4], [4, 66, 4], [8, 69, 4], [12, 71, 4]],
    [[0, 69, 8], [8, 66, 8]],
    [[0, 64, 4], [4, 62, 4], [8, 64, 4], [12, 66, 4]],
    [[0, 64, 16]],
  ]
  const ARP_D = [50, 57, 62, 66, 69, 66, 62, 57]
  const ARP_B = [47, 54, 59, 62, 66, 62, 59, 54]

  const playMel = (startBar, mel, inst, oct = 0, vol = 0.8) => {
    mel.forEach((barNotes, bi) => {
      barNotes.forEach(([st, m, d]) => {
        P((startBar + bi) * bar + st * s16, inst, { m: m + oct, d: d * s16 * 0.95, v: vol })
      })
    })
  }
  const perc = (b, full) => {
    const t = b * bar
    P(t, 'tom', { f: 85, v: full ? 0.9 : 0.6 })
    if (full) P(t + 2 * spb, 'tom', { f: 68, v: 0.5 })
    P(t + 2 * spb, 'wood', { v: 0.6 })
    if (full) for (let k = 0; k < 8; k++) P(t + k * spb * 0.5, 'hat', { v: 0.18 })
  }

  for (let b = 0; b < 4; b++) {
    P(b * bar, 'pad', { ms: DRONE_D, d: bar, v: 0.9 })
    if (b === 1) P(b * bar, 'flute', { m: 69, d: bar * 0.9, v: 0.7 })
    if (b === 2) P(b * bar, 'flute', { m: 71, d: bar * 0.6, v: 0.6 })
    if (b === 3) { P(b * bar, 'flute', { m: 66, d: bar * 0.45, v: 0.6 }); P(b * bar + 2 * spb, 'flute', { m: 64, d: bar * 0.45, v: 0.5 }) }
    P(b * bar, 'pluck', { m: 50, d: spb * 2, v: 0.4 })
  }
  playMel(4, MEL_A, 'pluck', 0, 0.85)
  for (let b = 4; b < 12; b++) {
    P(b * bar, 'pad', { ms: b % 4 < 2 ? DRONE_D : DRONE_B, d: bar, v: 0.55 })
    perc(b, b >= 8)
  }
  playMel(12, MEL_B, 'flute', 0, 0.85)
  for (let b = 12; b < 20; b++) {
    const t = b * bar
    const arp = (b % 4 < 2) ? ARP_D : ARP_B
    arp.forEach((m, k) => P(t + k * spb * 0.5, 'pluck', { m, d: spb, v: 0.5 }))
    P(t, 'pad', { ms: b % 4 < 2 ? DRONE_D : DRONE_B, d: bar, v: 0.5 })
    perc(b, true)
  }
  for (let b = 20; b < 24; b++) {
    P(b * bar, 'pad', { ms: DRONE_D, d: bar, v: 0.8 })
    if (b % 2 === 0) { P(b * bar + spb, 'pluck', { m: 86, d: spb * 2, v: 0.35 }); P(b * bar + 3 * spb, 'pluck', { m: 81, d: spb * 2, v: 0.3 }) }
    if (b === 23) for (let k = 0; k < 8; k++) P(b * bar + 2 * spb + k * spb * 0.25, 'tom', { f: 70 + k * 6, v: 0.25 + k * 0.06 })
  }
  P(24 * bar, 'gong', { v: 0.6 })
  playMel(24, MEL_A, 'pluck', 0, 0.9)
  playMel(24, MEL_A, 'flute', 12, 0.4)
  for (let b = 24; b < 32; b++) {
    P(b * bar, 'pad', { ms: b % 4 < 2 ? DRONE_D : DRONE_B, d: bar, v: 0.6 })
    perc(b, true)
  }
  for (let b = 32; b < 36; b++) {
    P(b * bar, 'pad', { ms: DRONE_D, d: bar, v: 0.8 - (b - 32) * 0.15 })
    if (b === 32) P(b * bar, 'flute', { m: 74, d: bar * 1.8, v: 0.6 })
    if (b === 34) P(b * bar, 'flute', { m: 69, d: bar * 1.5, v: 0.45 })
    if (b === 33) P(b * bar, 'pluck', { m: 62, d: bar, v: 0.5 })
  }
  P(35 * bar + 2 * spb, 'gong', { v: 0.7 })

  const map = genMap([
    { from: 1, to: 4, d: 'half' },
    { from: 4, to: 12, d: 'beat' },
    { from: 12, to: 20, d: 'stream', walls: true },
    { from: 20, to: 24, d: 'half', bombs: true },
    { from: 24, to: 32, d: 'beat' },
    { from: 32, to: 35, d: 'half' },
  ], spb, 8848)

  return { events: E, notes: map.notes, walls: map.walls, duration: 36 * bar + 3, bpm, spb }
}

function buildStarbound() {
  const bpm = 110, spb = 60 / bpm, bar = spb * 4, s16 = spb / 4
  const E = []
  const P = (t, i, o = {}) => E.push(Object.assign({ t, i }, o))
  const ROOT = [40, 36, 43, 38]
  const PAD = [[52, 59, 64, 67], [48, 55, 60, 64], [43, 55, 59, 62], [50, 57, 62, 66]]
  const ARPT = [[64, 67, 71, 76], [60, 64, 67, 72], [59, 62, 67, 71], [62, 66, 69, 74]]
  const ARPPAT = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3]
  const CHORUS = [
    [[0, 76, 6], [6, 74, 2], [8, 71, 8]],
    [[0, 72, 4], [4, 71, 2], [6, 69, 2], [8, 67, 8]],
    [[0, 71, 4], [4, 74, 4], [8, 79, 8]],
    [[0, 78, 6], [6, 76, 2], [8, 74, 8]],
    [[0, 79, 6], [6, 78, 2], [8, 76, 8]],
    [[0, 76, 4], [4, 74, 4], [8, 72, 8]],
    [[0, 74, 4], [4, 71, 4], [8, 67, 8]],
    [[0, 69, 8], [8, 71, 8]],
  ]

  const arps = (b, v = 0.5) => {
    const t = b * bar
    const tones = ARPT[b % 4]
    for (let k = 0; k < 16; k++) P(t + k * s16, 'arp', { m: tones[ARPPAT[k]], d: s16, v })
  }
  const drums = (b) => {
    const t = b * bar
    P(t, 'kick', { v: 1 }); P(t + 2 * spb, 'kick', { v: 0.95 })
    P(t + 2.75 * spb, 'kick', { v: 0.6 })
    P(t + spb, 'snare', { v: 0.85 }); P(t + 3 * spb, 'snare', { v: 0.85 })
    for (let k = 0; k < 16; k++) if (k % 2) P(t + k * s16, 'hat', { v: 0.3 })
  }
  const bassline = (b) => {
    const t = b * bar, r = ROOT[b % 4]
    for (let k = 0; k < 8; k++) P(t + k * spb * 0.5, 'bass', { m: k % 2 ? r + 12 : r, d: spb * 0.45, v: 0.8 })
  }
  const chorusMel = (startBar, oct = 0, v = 0.85) => {
    CHORUS.forEach((barNotes, bi) => {
      barNotes.forEach(([st, m, d]) => {
        P((startBar + bi) * bar + st * s16, 'lead', { m: m + oct, d: d * s16 * 0.92, v })
      })
    })
  }

  for (let b = 0; b < 8; b++) {
    P(b * bar, 'pad', { ms: PAD[b % 4], d: bar, v: 1 })
    arps(b, 0.35 + b * 0.02)
    if (b >= 4) for (let k = 0; k < 16; k++) if (k % 2) P(b * bar + k * s16, 'hat', { v: 0.2 })
    if (b === 7) for (let k = 0; k < 8; k++) P(b * bar + 2 * spb + k * spb * 0.25, 'snare', { v: 0.25 + k * 0.08 })
  }
  P(8 * bar, 'crash', { v: 0.9 })
  for (let b = 8; b < 20; b++) {
    drums(b); bassline(b); arps(b, 0.45)
    P(b * bar, 'pad', { ms: PAD[b % 4], d: bar, v: 0.6 })
  }
  P(16 * bar, 'riser', { d: 4 * bar, v: 0.9 })
  P(20 * bar, 'crash', { v: 1 })
  for (let b = 20; b < 32; b++) {
    drums(b); bassline(b); arps(b, 0.4)
    P(b * bar, 'pad', { ms: PAD[b % 4], d: bar, v: 0.7 })
  }
  chorusMel(20, 0, 0.85)
  chorusMel(28, 0, 0.8)
  for (let b = 32; b < 38; b++) {
    const t = b * bar
    P(t, 'pad', { ms: PAD[b % 4], d: bar, v: 1 })
    arps(b, 0.3)
    P(t, 'tom', { f: 95, v: 0.5 })
    P(t + 2 * spb, 'tom', { f: 75, v: 0.4 })
    if (b === 37) { P(t, 'riser', { d: bar, v: 1 }); for (let k = 0; k < 16; k++) P(t + k * s16, 'snare', { v: 0.2 + k * 0.05 }) }
  }
  P(38 * bar, 'crash', { v: 1 })
  for (let b = 38; b < 50; b++) {
    drums(b); bassline(b); arps(b, 0.45)
    P(b * bar, 'pad', { ms: PAD[b % 4], d: bar, v: 0.7 })
  }
  chorusMel(38, 12, 0.7)
  chorusMel(46, 0, 0.8)
  for (let b = 50; b < 54; b++) {
    P(b * bar, 'pad', { ms: PAD[b % 4], d: bar, v: 0.9 - (b - 50) * 0.18 })
    arps(b, 0.3 - (b - 50) * 0.06)
  }
  P(50 * bar, 'crash', { v: 0.7 })
  P(54 * bar - spb, 'gong', { v: 0.35 })

  const map = genMap([
    { from: 1, to: 8, d: 'half' },
    { from: 8, to: 20, d: 'beat' },
    { from: 20, to: 32, d: 'eighth', walls: true },
    { from: 32, to: 38, d: 'half', bombs: true },
    { from: 38, to: 50, d: 'eighth', walls: true },
    { from: 50, to: 53, d: 'half' },
  ], spb, 424242)

  return { events: E, notes: map.notes, walls: map.walls, duration: 54 * bar + 2, bpm, spb }
}

export const SONGS = [
  {
    id: 'neon',
    name: '霓虹脉冲',
    en: 'NEON PULSE',
    style: '电子舞曲 · EDM',
    desc: '穿行赛博都市的霓虹峡谷，激光与节拍同频闪烁。',
    bpm: 128, diff: '困难', env: 'neon', speed: 19,
    colorL: 0xff2bd0, colorR: 0x00e5ff,
    cardBg: 'linear-gradient(160deg,#2b0a3d,#0e1445 55%,#032c3f), radial-gradient(80px 40px at 70% 30%, rgba(0,229,255,.8), transparent)',
    build: buildNeonPulse,
  },
  {
    id: 'ink',
    name: '墨影山河',
    en: 'INK SHADOWS',
    style: '国风 · 古筝竹笛',
    desc: '月照水墨群山，灯河随古筝声缓缓升起。',
    bpm: 84, diff: '简单', env: 'ink', speed: 13,
    colorL: 0xff4a3a, colorR: 0x2fe6a8,
    cardBg: 'linear-gradient(160deg,#131722,#1d2433 55%,#0d1120), radial-gradient(90px 50px at 30% 25%, rgba(247,231,192,.55), transparent)',
    build: buildInkShadows,
  },
  {
    id: 'space',
    name: '星海远航',
    en: 'STARBOUND',
    style: '太空合成波 · Synthwave',
    desc: '跃迁引擎轰鸣，星云与流光在舷窗外飞驰。',
    bpm: 110, diff: '普通', env: 'space', speed: 16,
    colorL: 0xb266ff, colorR: 0x4fc3ff,
    cardBg: 'linear-gradient(160deg,#0a0a2e,#1b0e3d 50%,#020214), radial-gradient(70px 70px at 75% 65%, rgba(178,102,255,.6), transparent)',
    build: buildStarbound,
  },
]
