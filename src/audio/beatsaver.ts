// BeatSaver API client + beatmap zip parser
import type { LightEvent, Song, BeatSaverMapInfo, NoteData, ArcData } from '../types'
import { LANE_X, ROW_Y, DIR_VEC } from '../game/constants'

const API = 'https://api.beatsaver.com'

// Hand-crafted themed environments for specific well-known maps (by BeatSaver id).
// The showcase versions of these maps use Vivify Unity asset bundles we can't load;
// these are our own Three.js approximations of their stages.
export const THEME_ENV: Record<string, string> = {
  '4f454': 'shrine', // kz - Reply (Kaguya): torii gate + sea lanterns
}

export async function searchBeatSaver(query: string, page = 0): Promise<BeatSaverMapInfo[]> {
  const q = encodeURIComponent(query)
  return fetchMapList(`${API}/search/text/${page}?q=${q}&sortOrder=Relevance`)
}

/** Browse without a query: top rated or latest, optionally filtered by a genre tag. */
export async function browseBeatSaver(sort: 'Rating' | 'Latest' = 'Rating', page = 0, tag = ''): Promise<BeatSaverMapInfo[]> {
  const t = tag ? `&tags=${encodeURIComponent(tag)}` : ''
  return fetchMapList(`${API}/search/text/${page}?sortOrder=${sort}${t}`)
}

async function fetchMapList(url: string): Promise<BeatSaverMapInfo[]> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Search failed: ${res.status}`)
  const data = await res.json()
  return data.docs.map(doc => ({
    id: doc.id,
    name: doc.name,
    songName: doc.metadata.songName,
    songAuthor: doc.metadata.songAuthorName,
    levelAuthor: doc.metadata.levelAuthorName,
    bpm: doc.metadata.bpm,
    duration: doc.metadata.duration,
    hash: doc.versions[0]?.hash,
    diffs: doc.versions[0]?.diffs || [],
    coverUrl: doc.versions[0]?.coverURL || `https://cdn.beatsaver.com/${doc.versions[0]?.hash}.jpg` || `https://cdn.beatsaver.com/${doc.id}.jpg`,
    downloadCount: doc.stats?.downloads || 0,
    upvotes: doc.stats?.upvotes || 0,
  }))
}

export async function downloadBeatMap(mapData, onProgress) {
  let { hash, id } = mapData
  let coverURL = mapData.coverUrl || null

  if (!hash && id) {
    try {
      onProgress?.('resolving', 0)
      const res = await fetch(`${API}/maps/id/${id}`)
      if (res.ok) {
        const detail = await res.json()
        hash = detail.versions?.[0]?.hash
        coverURL = coverURL || detail.versions?.[0]?.coverURL
        if (!hash) throw new Error('map detail has no hash')
      }
    } catch (e) { /* fall through */ }
  }

  if (!hash && !id) throw new Error('No hash or id to download')

  const downloadUrls = [
    `https://r2cdn.beatsaver.com/${hash}.zip?t=${Date.now()}`,
    `https://cdn.beatsaver.com/${hash}.zip?t=${Date.now()}`,
    `https://eu.cdn.beatsaver.com/${hash}.zip?t=${Date.now()}`,
    `https://na.cdn.beatsaver.com/${hash}.zip?t=${Date.now()}`,
    `https://as.cdn.beatsaver.com/${hash}.zip?t=${Date.now()}`,
  ]

  let response = null
  for (const url of downloadUrls) {
    try {
      response = await fetch(url, { cache: 'no-store' })
      if (response.ok) break
    } catch (e) { /* try next */ }
  }

  if (!response || !response.ok) {
    try {
      onProgress?.('fetching', 50)
      response = await fetch(`${API}/maps/id/${id}/download`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`Download failed: ${response.status}`)
    } catch (e) {
      throw new Error('Download failed. Try a different song.')
    }
  }

  // Track download progress via ReadableStream
  const contentLength = parseInt(response.headers.get('content-length') || '0', 10)
  const reader = response.body.getReader()
  const chunks = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    if (contentLength > 0 && onProgress) {
      onProgress('downloading', Math.round((received / contentLength) * 100))
    }
  }

  onProgress?.('parsing', 95)
  const totalLen = chunks.reduce((s, c) => s + c.length, 0)
  const buffer = new Uint8Array(totalLen)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.length
  }

  // Download cover image
  let coverBlob = null
  if (coverURL) {
    try {
      const cr = await fetch(coverURL)
      if (cr.ok) coverBlob = await cr.blob()
    } catch (e) { /* skip cover */ }
  }

  return parseBeatMapZip(buffer, mapData, coverBlob)
}

async function parseBeatMapZip(buffer: Uint8Array, mapData: any, coverBlob?: Blob | null): Promise<Song> {
  // Use browser's built-in DecompressionStream
  const ds = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  const reader = ds.readable.getReader()

  // Try standard zip decompression first
  let zipBuffer
  try {
    // Zip format: check for PK header
    const header = new Uint8Array(buffer.slice(0, 4))
    const isZip = header[0] === 0x50 && header[1] === 0x4b

    if (!isZip) throw new Error('Not a valid zip file')

    // Parse zip manually (simple approach for beatmaps)
    zipBuffer = new Uint8Array(buffer)
  } catch (e) {
    throw new Error('ZIP 解析失败: ' + e.message)
  }

  return parseZipManually(zipBuffer, mapData, coverBlob)
}

/** Load a map zip bundled with the app (no network download, marked non-deletable). */
export async function loadBuiltinMap(id: string, url: string, onProgress?: (stage: string, pct: number) => void): Promise<Song> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`builtin map fetch failed: ${res.status}`)
  const contentLength = parseInt(res.headers.get('content-length') || '0', 10)
  let buffer: Uint8Array
  if (res.body && contentLength > 0) {
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      onProgress?.('loading', Math.round((received / contentLength) * 100))
    }
    buffer = new Uint8Array(received)
    let off = 0
    for (const c of chunks) { buffer.set(c, off); off += c.length }
  } else {
    buffer = new Uint8Array(await res.arrayBuffer())
  }
  onProgress?.('parsing', 100)
  const song = await parseBeatMapZip(buffer, { id }, null)
  ;(song as any).builtin = true
  return song
}

// Manual ZIP parser with async inflate support
async function parseZipManually(data: Uint8Array, mapData: any, coverBlob?: Blob | null): Promise<Song> {
  const decoder = new TextDecoder('utf-8')

  let eocdOffset = -1
  for (let i = data.length - 22; i >= 0; i--) {
    if (data[i] === 0x50 && data[i + 1] === 0x4b && data[i + 2] === 0x05 && data[i + 3] === 0x06) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset < 0) throw new Error('找不到 ZIP 目录')

  const cdSize = data[eocdOffset + 12] | (data[eocdOffset + 13] << 8) | (data[eocdOffset + 14] << 16) | (data[eocdOffset + 15] << 24)
  const cdOffset = data[eocdOffset + 16] | (data[eocdOffset + 17] << 8) | (data[eocdOffset + 18] << 16) | (data[eocdOffset + 19] << 24)

  const entries = await processZipEntries(data, cdOffset, cdSize)
  const files = {}

  for (const entry of entries) {
    const raw = data.slice(entry.dataStart, entry.dataStart + entry.compSize)
    if (entry.compMethod === 0) {
      files[entry.name] = raw
    } else if (entry.compMethod === 8) {
      files[entry.name] = await inflateDeflate(raw)
    }
  }

  // Find and parse the same as before...
  let info = null
  for (const name of Object.keys(files)) {
    const lower = name.toLowerCase()
    if (lower === 'info.dat' || lower.endsWith('/info.dat')) {
      try { info = JSON.parse(decoder.decode(files[name])); break } catch (e) {}
    }
  }
  if (!info) throw new Error('找不到 Info.dat')

  let audioBuffer = null
  for (const name of Object.keys(files)) {
    const lower = name.toLowerCase()
    if (lower.endsWith('.ogg') || lower.endsWith('.egg') || lower.endsWith('.mp3') || lower.endsWith('.wav')) {
      audioBuffer = files[name]
      break
    }
  }
  if (!audioBuffer) throw new Error('找不到音频文件')

  // Cover fallback: use the image bundled inside the zip
  if (!coverBlob) {
    for (const name of Object.keys(files)) {
      const lower = name.toLowerCase()
      if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
        const type = lower.endsWith('.png') ? 'image/png' : 'image/jpeg'
        coverBlob = new Blob([files[name]], { type })
        break
      }
    }
  }

  // Parse every difficulty chart, keyed by lowercased filename
  const fileCharts: Record<string, any> = {}
  for (const name of Object.keys(files)) {
    const lower = name.toLowerCase()
    if (!lower.endsWith('.dat')) continue
    const base = lower.split(/[\\/]/).pop()
    if (!base || base === 'info.dat') continue
    try { fileCharts[base] = JSON.parse(decoder.decode(files[name])) } catch (e: any) { console.log('[ZIP-FAIL]', name, e.message) }
  }

  let bpm = mapData.bpm || 120
  if (info._beatsPerMinute) bpm = info._beatsPerMinute
  const spb = 60 / bpm

  // Enumerate difficulties from Info.dat (authoritative filename→difficulty mapping),
  // preferring the Standard characteristic so Lawless/OneSaber sets don't collide
  const DIFF_RANK = ['easy', 'normal', 'hard', 'expert', 'expertplus']
  const diffs: Record<string, any> = {}
  const sets = info._difficultyBeatmapSets || []
  const chosenSet = sets.find((s: any) => s._beatmapCharacteristicName === 'Standard') || sets[0]
  if (chosenSet) {
    for (const db of chosenSet._difficultyBeatmaps || []) {
      const json = fileCharts[String(db._beatmapFilename || '').toLowerCase()]
      const key = String(db._difficulty || '').toLowerCase()
      if (!json || !key) continue
      diffs[key] = parseChart(json, spb)
      diffs[key].label = diffLabels[key] || db._difficulty
    }
  }
  if (!Object.keys(diffs).length) {
    // Fallback: filename heuristic for zips with broken Info sets
    for (const [fname, json] of Object.entries(fileCharts)) {
      let key = fname.replace(/\.dat$/, '').replace(/(standard|lawless|onesaber|360degree|90degree|noarrows|lightshow)$/, '')
      key = ({ 'expert+': 'expertplus' } as any)[key] || key || 'hard'
      diffs[key] = parseChart(json, spb)
      diffs[key].label = diffLabels[key] || key.toUpperCase()
    }
  }
  const currentDiff = [...DIFF_RANK].reverse().find(k => diffs[k]) || Object.keys(diffs)[0]
  if (!currentDiff) throw new Error('找不到可用难度')
  const cur = diffs[currentDiff]
  console.log('[ZIP-CHOSEN]', currentDiff, 'of', Object.keys(diffs), 'notes:', cur.notes.length)
  console.log('[ZIP-LIGHTS]', cur.lights.length, 'events')
  console.log('[ZIP-ARCS]', cur.arcs.length, 'arcs,', cur.notes.filter((n: NoteData) => n.link).length, 'chain links')

  // Map-level colors: SongCore _customData takes priority, then official _colorSchemes
  const cc = customColorsFor(info, currentDiff)
  const sc = schemeColorsFor(info, currentDiff)
  const colorL = cc.colorL ?? sc.colorL ?? 0xff2b2b
  const colorR = cc.colorR ?? sc.colorR ?? 0x2b9eff
  const obstacleCol = cc.obstacle ?? sc.obstacle
  if (obstacleCol != null) {
    for (const k of Object.keys(diffs)) {
      for (const w of diffs[k].walls) { if (w.color == null) w.color = obstacleCol }
    }
  }

  const duration = mapData.duration || (cur.notes.length > 0 ? cur.notes[cur.notes.length - 1].t + 3 : 180)
  const songName = info._songName || mapData.songName || '未知歌曲'
  const songAuthor = info._songAuthorName || mapData.songAuthor || ''
  const diffList = DIFF_RANK.filter(k => diffs[k]).map(k => ({ key: k, label: diffs[k].label }))
  for (const k of Object.keys(diffs)) {
    if (!DIFF_RANK.includes(k)) diffList.push({ key: k, label: diffs[k].label })
  }

  const blob = new Blob([audioBuffer], { type: 'audio/ogg' })
  const url = URL.createObjectURL(blob)

  return {
    id: 'bs_' + mapData.id,
    name: songName,
    en: songAuthor,
    style: `BeatSaver · ${cur.label}`,
    desc: `谱师: ${mapData.levelAuthor || '未知'} · BPM: ${Math.round(bpm)}`,
    bpm: Math.round(bpm),
    diff: cur.label,
    diffList,
    env: THEME_ENV[mapData.id] || 'official',
    envName: info._environmentName || undefined,
    speed: 19,
    colorL, colorR,
    envColorL: sc.envL, envColorR: sc.envR,
    cardBg: coverBlob ? `url(${URL.createObjectURL(coverBlob)}) center/cover no-repeat` : 'linear-gradient(160deg,#2b0a3d,#0e1445 55%,#032c3f)',
    coverBlob,
    audioUrl: url,
    internal: {
      events: [],
      diffs, currentDiff,
      duration: duration || 180,
      bpm: Math.round(bpm), spb,
      buffer: audioBuffer,
    },
    build() {
      const it: any = (this as any).internal
      const d = it.diffs?.[it.currentDiff] || (it.diffs && Object.values(it.diffs)[0])
      return d ? { ...it, notes: d.notes, walls: d.walls, lights: d.lights, arcs: d.arcs, noodle: d.noodle } : it
    },
  }
}

// ===== Noodle Extensions animation parsing (v2 modcharts) =====
// Normalized event: { t, path, tracks[], dur, easing, props: { position/rotation/localRotation/scale/dissolve/definitePosition → points } }
// Points: [[...values, time, (easing?)], ...]; values length 1 = scalar, 3 = vec3.
const NOODLE_PROPS = ['_position', '_rotation', '_localRotation', '_scale', '_dissolve', '_dissolveArrow', '_definitePosition']

function normPoints(v: any, pd: Record<string, any>): any {
  if (v == null) return null
  if (typeof v === 'string') return pd[v] ? normPoints(pd[v], pd) : null
  if (!Array.isArray(v)) return typeof v === 'number' ? [[v, 0]] : null
  if (!v.length) return null
  if (Array.isArray(v[0])) return v // already keyframes
  return [[...v, 0]] // constant vector/scalar → single keyframe
}

function pickNoodleProps(d: any, pd: Record<string, any>) {
  const props: any = {}
  for (const k of NOODLE_PROPS) {
    if (d?.[k] == null) continue
    const pts = normPoints(d[k], pd)
    if (pts) props[k.slice(1)] = pts
  }
  return props
}

function parseNoodle(chart: any, spb: number) {
  const cd = chart._customData || {}
  const pd: Record<string, any> = {}
  for (const def of cd._pointDefinitions || []) {
    if (def?._name) pd[def._name] = def._points
  }
  const events: any[] = []
  let skipped = 0
  for (const e of cd._customEvents || []) {
    const dd = e._data || {}
    if (e._type === 'AssignPlayerToTrack') {
      if (dd._track) events.push({ t: (e._time || 0) * spb, player: dd._track })
      continue
    }
    if (e._type === 'AssignTrackParent') {
      const children = (Array.isArray(dd._childrenTracks) ? dd._childrenTracks : [dd._childrenTracks]).filter(Boolean)
      if (dd._parentTrack && children.length) events.push({ t: (e._time || 0) * spb, parent: dd._parentTrack, children })
      continue
    }
    if (e._type !== 'AnimateTrack' && e._type !== 'AssignPathAnimation') { skipped++; continue }
    const d = e._data || {}
    const tracks = (Array.isArray(d._track) ? d._track : [d._track]).filter(Boolean)
    if (!tracks.length) continue
    const props = pickNoodleProps(d, pd)
    if (!Object.keys(props).length) continue
    events.push({
      t: (e._time || 0) * spb,
      path: e._type === 'AssignPathAnimation',
      tracks,
      dur: (d._duration || 0) * spb,
      easing: d._easing,
      props,
    })
  }
  if (skipped) console.log('[NOODLE] skipped unsupported custom events:', skipped)
  events.sort((a, b) => a.t - b.t)
  return { events, pd }
}

/** Parse one difficulty chart (v2 or v3) into playable data. Times converted to seconds. */
function parseChart(chart: any, spb: number) {
  const notes: NoteData[] = [], walls: any[] = [], arcs: ArcData[] = []
  const noodle = chart._notes ? parseNoodle(chart, spb) : null
  if (chart.colorNotes || chart.bombNotes) {
    // v3 format
    for (const n of chart.colorNotes || []) {
      notes.push({ t: n.b, x: n.x, y: n.y, type: n.c, dir: n.d, color: chromaHex(n.customData?.color) })
    }
    for (const n of chart.bombNotes || []) {
      notes.push({ t: n.b, x: n.x, y: n.y, type: 3, dir: 8 })
    }
    // Arcs (sliders): visual guides between two notes
    if (Array.isArray(chart.sliders)) {
      for (const s of chart.sliders) {
        const x1 = clampIdx(s.x, 3), y1 = clampIdx(s.y, 2)
        const x2 = clampIdx(s.tx, 3), y2 = clampIdx(s.ty, 2)
        arcs.push({
          t: s.b, tb: s.tb, c: s.c,
          x1: LANE_X[x1], y1: ROW_Y[y1], d1: s.d ?? 8, mu: s.mu ?? 1,
          x2: LANE_X[x2], y2: ROW_Y[y2], d2: s.tc ?? 8, tmu: s.tmu ?? 1,
        })
      }
    }
    // Chains (burstSliders): head note stays a colorNote; add sc-1 link pads along the path
    if (Array.isArray(chart.burstSliders)) {
      for (const s of chart.burstSliders) {
        const sc = Math.max(2, s.sc | 0)
        const squish = s.s > 0 ? s.s : 1
        const hx = LANE_X[clampIdx(s.x, 3)], hy = ROW_Y[clampIdx(s.y, 2)]
        const tx = LANE_X[clampIdx(s.tx, 3)], ty = ROW_Y[clampIdx(s.ty, 2)]
        const dv = DIR_VEC[s.d === 8 || s.d == null ? 8 : s.d]
        const dist = Math.hypot(tx - hx, ty - hy)
        const cx = hx + dv[0] * dist * 0.5
        const cy = hy + dv[1] * dist * 0.5
        for (let i = 1; i < sc; i++) {
          const f = (i / (sc - 1)) * squish
          const u = 1 - f
          const wx = u * u * hx + 2 * u * f * cx + f * f * tx
          const wy = u * u * hy + 2 * u * f * cy + f * f * ty
          notes.push({
            t: s.b + (s.tb - s.b) * f,
            x: clampIdx(s.tx, 3), y: clampIdx(s.ty, 2),
            type: s.c, dir: 8, link: true, wx, wy,
          } as NoteData)
        }
      }
    }
    const LX = [-0.9, -0.3, 0.3, 0.9]
    for (const o of chart.obstacles || []) {
      const li = Math.max(0, Math.min(3, o.x || 0))
      const ww = Math.max(1, Math.min(4, o.w || 1))
      const endIdx = Math.min(3, li + ww - 1)
      const startX = LX[li], endX = LX[endIdx]
      walls.push({
        t: o.b, dur: o.d,
        side: (startX + endX) / 2 / 0.58,
        width: ww, type: o.h === 1 ? 1 : 0,
        wallScale: (endX - startX + 0.6) / 1.15,
        crouch: o.h === 1,
        color: chromaHex(o.customData?.color),
      })
    }
  } else if (chart._notes) {
    // v2 format — skip Noodle Extensions fake notes/walls (decorative, not cuttable)
    const noodlePd = noodle?.pd || {}
    for (const n of chart._notes) {
      const cd = n._customData
      if (cd?._fake) continue
      const note: NoteData = { t: n._time, x: n._lineIndex, y: n._lineLayer, type: n._type, dir: n._cutDirection, color: chromaHex(cd?._color) }
      // Noodle precise position: [x, y] grid floats where x = lineIndex - 2
      if (Array.isArray(cd?._position)) {
        note.wx = 0.3 + cd._position[0] * 0.6
        note.wy = 0.85 + (cd._position[1] || 0) * 0.5
        note.x = Math.max(0, Math.min(3, Math.round(cd._position[0] + 2)))
        note.y = Math.max(0, Math.min(2, Math.round(cd._position[1] || 0)))
      }
      if (cd?._track) (note as any).track = Array.isArray(cd._track) ? cd._track : [cd._track]
      if (cd?._animation) {
        const a = pickNoodleProps(cd._animation, noodlePd)
        if (Object.keys(a).length) (note as any).anim = a
      }
      if (cd?._interactable === false) (note as any).ghost = true
      notes.push(note)
    }
    const LX = [-0.9, -0.3, 0.3, 0.9]
    for (const o of chart._obstacles || []) {
      const cd = o._customData
      if (cd?._fake) continue
      if (cd && (Array.isArray(cd._position) || Array.isArray(cd._scale))) {
        // Noodle wall art: place at true coords (usually far off the track)
        const px = Array.isArray(cd._position) ? cd._position[0] : (o._lineIndex || 0) - 2
        const py = Array.isArray(cd._position) ? (cd._position[1] || 0) : 0
        const sw = Array.isArray(cd._scale) ? (cd._scale[0] || 1) : (o._width || 1)
        const sh = Array.isArray(cd._scale) ? (cd._scale[1] || 1) : 3
        const wwWorld = Math.max(0.05, sw * 0.6)
        const whWorld = Math.max(0.05, sh * 0.5)
        const w: any = {
          t: o._time, dur: Math.max(o._duration || 0, 0.02),
          side: 0, width: 1, type: o._type, wallScale: 1, crouch: false,
          color: chromaHex(cd._color),
          wx: 0.3 + px * 0.6 + wwWorld / 2,
          wy: 0.85 + py * 0.5 + whWorld / 2,
          ww: wwWorld, wh: whWorld,
        }
        if (cd._track) w.track = Array.isArray(cd._track) ? cd._track : [cd._track]
        if (cd._animation) {
          const a = pickNoodleProps(cd._animation, noodle?.pd || {})
          if (Object.keys(a).length) w.anim = a
        }
        // Static per-wall rotation (wall-art strokes tilt with these; a bare
        // number means yaw) → fold into constant keyframes for the noodle runtime
        const srot = cd._rotation, slrot = cd._localRotation
        if (srot != null || slrot != null) {
          w.anim = w.anim || {}
          if (srot != null && w.anim.rotation == null)
            w.anim.rotation = [[...(Array.isArray(srot) ? srot : [0, srot, 0]), 0]]
          if (slrot != null && w.anim.localRotation == null)
            w.anim.localRotation = [[...(Array.isArray(slrot) ? slrot : [0, slrot, 0]), 0]]
        }
        walls.push(w)
        continue
      }
      const li = Math.max(0, Math.min(3, o._lineIndex || 0))
      const ww = Math.max(1, Math.min(4, o._width || 1))
      const endIdx = Math.min(3, li + ww - 1)
      const startX = LX[li], endX = LX[endIdx]
      walls.push({
        t: o._time, dur: o._duration,
        side: (startX + endX) / 2 / 0.58,
        width: ww, type: o._type,
        wallScale: (endX - startX + 0.6) / 1.15,
        crouch: o._type === 1,
        color: chromaHex(cd?._color),
      })
    }
  }
  // Keep full wall data at parse time (observation maps use walls as "video pixels");
  // the runtime samples decorations per graphics tier. This is only a sanity ceiling.
  const MAX_WALLS = 150000
  if (walls.length > MAX_WALLS) {
    const gameplay = walls.filter(w => w.wx == null)
    const deco = walls.filter(w => w.wx != null)
    const keepEvery = Math.ceil(deco.length / (MAX_WALLS - gameplay.length))
    const sampled = deco.filter((_, i) => i % keepEvery === 0)
    console.log('[ZIP-WALLS] sampled decorative walls', deco.length, '→', sampled.length)
    walls.length = 0
    walls.push(...gameplay, ...sampled)
    walls.sort((a, b) => a.t - b.t)
  }
  for (const n of notes) n.t = n.t * spb
  for (const w of walls) w.t = w.t * spb
  for (const a of arcs) { a.t = a.t * spb; a.tb = a.tb * spb }
  notes.sort((a, b) => a.t - b.t)
  // Wall-art generators emit walls grouped by pixel/column, not by time — the
  // spawn loop requires time order, so always sort (not only when sampling)
  walls.sort((a, b) => a.t - b.t)
  arcs.sort((a, b) => a.t - b.t)
  const lights = parseLightEvents(chart, spb)
  const noodleEvents = noodle?.events?.length ? noodle.events : undefined
  if (noodleEvents) console.log('[NOODLE]', noodleEvents.length, 'track animation events')
  return { notes, walls, arcs, lights, noodle: noodleEvents, label: '' }
}

function clampIdx(v: number, max: number): number {
  return Math.max(0, Math.min(max, v | 0))
}

/** Chroma color ([r,g,b,(a)] array or {r,g,b} object, components may exceed 1) → hex, or undefined. */
function chromaHex(c: any): number | undefined {
  if (!c) return undefined
  let r: number, g: number, b: number
  if (Array.isArray(c)) { [r, g, b] = c } else { r = c.r; g = c.g; b = c.b }
  if (typeof r !== 'number' || typeof g !== 'number' || typeof b !== 'number') return undefined
  const u = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255)
  return (u(r) << 16) | (u(g) << 8) | u(b)
}

/** Official per-map color schemes (Info.dat v2.1 _colorSchemes + _beatmapColorSchemeIdx). */
function schemeColorsFor(info: any, chosenName: string | null) {
  const out: { colorL?: number, colorR?: number, envL?: number, envR?: number, obstacle?: number } = {}
  const schemes = info._colorSchemes
  if (!chosenName || !Array.isArray(schemes) || !schemes.length) return out
  const diffMap: any = { 'expert+': 'expertplus' }
  let idx = 0
  for (const set of info._difficultyBeatmapSets || []) {
    for (const db of set._difficultyBeatmaps || []) {
      const base = String(db._beatmapFilename || '').toLowerCase().replace(/\.dat$/, '')
      let key = base.replace(/(standard|lawless|onesaber|360degree|90degree|noarrows|lightshow)$/, '')
      key = diffMap[key] || key
      if (key === chosenName) { idx = db._beatmapColorSchemeIdx ?? 0 }
    }
  }
  const entry = schemes[Math.max(0, Math.min(schemes.length - 1, idx))]
  if (!entry || entry.useOverride === false) return out
  const s = entry.colorScheme || entry
  out.colorL = chromaHex(s.saberAColor)
  out.colorR = chromaHex(s.saberBColor)
  out.envL = chromaHex(s.environmentColor0)
  out.envR = chromaHex(s.environmentColor1)
  out.obstacle = chromaHex(s.obstaclesColor)
  return out
}

/** Map-level custom colors from Info.dat for the chosen difficulty (SongCore convention). */
function customColorsFor(info: any, chosenName: string | null) {
  const out: { colorL?: number, colorR?: number, obstacle?: number } = {}
  if (!chosenName) return out
  const diffMap: any = { 'expert+': 'expertplus' }
  for (const set of info._difficultyBeatmapSets || []) {
    for (const db of set._difficultyBeatmaps || []) {
      const base = String(db._beatmapFilename || '').toLowerCase().replace(/\.dat$/, '')
      let key = base.replace(/(standard|lawless|onesaber|360degree|90degree|noarrows|lightshow)$/, '')
      key = diffMap[key] || key
      if (key !== chosenName) continue
      const cd = db._customData || {}
      out.colorL = chromaHex(cd._colorLeft)
      out.colorR = chromaHex(cd._colorRight)
      out.obstacle = chromaHex(cd._obstacleColor)
      return out
    }
  }
  return out
}

// ===== Lighting events =====
// Normalized event: { t: seconds, type, value, f: floatValue }
// Types: 0=back lasers, 1=ring lights, 2=left lasers, 3=right lasers, 4=center lights,
//        5=color boost, 8=ring spin, 9=ring zoom, 12=left laser speed, 13=right laser speed
// Values: 0=off; 1-4=right(blue) on/flash/fade/transition; 5-8=left(red); 9-12=white
const LIGHT_TYPES = new Set([0, 1, 2, 3, 4, 5, 8, 9, 12, 13])

function parseLightEvents(diff: any, spb: number): LightEvent[] {
  let evs: LightEvent[] = []
  if (Array.isArray(diff._events) && diff._events.length) {
    // v2
    for (const e of diff._events) {
      if (!LIGHT_TYPES.has(e._type)) continue
      evs.push({ t: e._time * spb, type: e._type, value: e._value | 0, f: e._floatValue ?? 1, c: chromaHex(e._customData?._color) })
    }
  } else {
    // v3
    if (Array.isArray(diff.basicBeatmapEvents)) {
      for (const e of diff.basicBeatmapEvents) {
        if (!LIGHT_TYPES.has(e.et)) continue
        evs.push({ t: (e.b || 0) * spb, type: e.et, value: e.i | 0, f: e.f ?? 1, c: chromaHex(e.customData?.color) })
      }
    }
    if (Array.isArray(diff.colorBoostBeatmapEvents)) {
      for (const e of diff.colorBoostBeatmapEvents) {
        evs.push({ t: (e.b || 0) * spb, type: 5, value: e.o ? 1 : 0, f: 1 })
      }
    }
    // Newer v3 maps only carry group lighting — flatten to approximate basic events
    const lit = evs.filter(e => e.type <= 4)
    if (lit.length < 8 && Array.isArray(diff.lightColorEventBoxGroups) && diff.lightColorEventBoxGroups.length) {
      evs = evs.concat(flattenLightGroups(diff, spb))
    }
  }
  evs.sort((a, b) => a.t - b.t)
  return evs
}

function flattenLightGroups(diff: any, spb: number): LightEvent[] {
  const out: LightEvent[] = []
  const groups = diff.lightColorEventBoxGroups
  const ids = [...new Set<number>(groups.map((g: any) => g.g))].sort((a, b) => a - b)
  const cyc = [1, 4, 0, 2, 3]
  const typeFor: any = {}
  ids.forEach((id, i) => { typeFor[id] = cyc[i % cyc.length] })
  for (const g of groups) {
    const type = typeFor[g.g]
    for (const box of g.e || []) {
      for (const l of box.l || []) {
        const s = l.s ?? 1
        const strobe = (l.f || 0) > 0
        const value = s <= 0.01 ? 0
          : l.c === 0 ? (strobe ? 6 : 5)
          : l.c === 2 ? (strobe ? 10 : 9)
          : (strobe ? 2 : 1)
        out.push({ t: ((g.b || 0) + (l.b || 0)) * spb, type, value, f: Math.min(1.5, s) })
      }
    }
  }
  // Ring spins from rotation groups (throttled)
  if (Array.isArray(diff.lightRotationEventBoxGroups)) {
    let lastSpin = -10
    const times = diff.lightRotationEventBoxGroups.map(g => (g.b || 0) * spb).sort((a, b) => a - b)
    for (const t of times) {
      if (t - lastSpin < 0.4) continue
      lastSpin = t
      out.push({ t, type: 8, value: 0, f: 1 })
    }
  }
  return out.length > 24000 ? out.filter((_, i) => i % 2 === 0) : out
}

const diffLabels = {
  expertplus: 'Expert+',
  expert: 'Expert',
  hard: 'Hard',
  normal: 'Normal',
  easy: 'Easy',
}

// Simple inflate implementation for deflate-compressed data
async function inflateDeflate(data) {
  try {
    const ds = new DecompressionStream('deflate-raw')
    const writer = ds.writable.getWriter()
    const reader = ds.readable.getReader()
    writer.write(data)
    writer.close()
    const chunks = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    // Combine chunks
    const totalLen = chunks.reduce((sum, c) => sum + c.length, 0)
    const result = new Uint8Array(totalLen)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    return result
  } catch (e) {
    return new Uint8Array(0)
  }
}

// Process all entries in a zip, decompressing deflated ones
async function processZipEntries(data, cdOffset, cdSize) {
  const decoder = new TextDecoder('utf-8')
  const entries = []
  let pos = cdOffset
  while (pos < cdOffset + cdSize) {
    const sig = data[pos] | (data[pos + 1] << 8) | (data[pos + 2] << 16) | (data[pos + 3] << 24)
    if (sig !== 0x02014b50) break

    const compMethod = data[pos + 10] | (data[pos + 11] << 8)
    const compSize = data[pos + 20] | (data[pos + 21] << 8) | (data[pos + 22] << 16) | (data[pos + 23] << 24)
    const uncompSize = data[pos + 24] | (data[pos + 25] << 8) | (data[pos + 26] << 16) | (data[pos + 27] << 24)
    const nameLen = data[pos + 28] | (data[pos + 29] << 8)
    const extraLen = data[pos + 30] | (data[pos + 31] << 8)
    const commentLen = data[pos + 32] | (data[pos + 33] << 8)
    const localOffset = data[pos + 42] | (data[pos + 43] << 8) | (data[pos + 44] << 16) | (data[pos + 45] << 24)

    const name = decoder.decode(data.slice(pos + 46, pos + 46 + nameLen))
    const localNameLen = data[localOffset + 26] | (data[localOffset + 27] << 8)
    const localExtraLen = data[localOffset + 28] | (data[localOffset + 29] << 8)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen

    entries.push({ name, compMethod, compSize, uncompSize, dataStart })
    pos += 46 + nameLen + extraLen + commentLen
  }
  return entries
}
