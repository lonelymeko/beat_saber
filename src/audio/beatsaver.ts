// BeatSaver API client + beatmap zip parser
import type { LightEvent, Song, BeatSaverMapInfo, NoteData, ArcData } from '../types'
import { LANE_X, ROW_Y, DIR_VEC } from '../game/constants'

const API = 'https://api.beatsaver.com'

export async function searchBeatSaver(query: string, page = 0): Promise<BeatSaverMapInfo[]> {
  const q = encodeURIComponent(query)
  const url = `${API}/search/text/${page}?q=${q}&sortOrder=Latest`
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

  return parseZipManually(zipBuffer, mapData)
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

  const difficulties = {}
  const allDatFiles = []
  for (const name of Object.keys(files)) {
    const lower = name.toLowerCase()
    if (!lower.endsWith('.dat')) continue
    allDatFiles.push(name)
    const base = lower.split(/[\\/]/).pop().replace(/\.dat$/, '')
    if (!base || base === 'info') continue
    let key = base.replace(/(standard|lawless|onesaber|360degree|90degree|noarrows|lightshow)$/, '')
    if (!key) key = base
    const diffMap = { 'expert+': 'expertplus' }
    key = diffMap[key] || key
    console.log('[ZIP-DIFF]', name, '→', key)
    try {
      const parsed = JSON.parse(decoder.decode(files[name]))
      difficulties[key] = parsed
      console.log('[ZIP-NOTES]', key, 'notes:', parsed._notes?.length || 0, 'walls:', parsed._obstacles?.length || 0)
    } catch (e) { console.log('[ZIP-FAIL]', name, e.message) }
  }

  const diffOrder = ['expertplus', 'expert', 'hard', 'normal', 'easy']
  let chosenDiff = null, chosenName = null
  for (const d of diffOrder) {
    if (difficulties[d]) { chosenDiff = difficulties[d]; chosenName = d; break }
  }
  if (!chosenDiff) {
    const keys = Object.keys(difficulties)
    if (keys.length > 0) { chosenDiff = difficulties[keys[0]]; chosenName = keys[0] }
  }
  console.log('[ZIP-CHOSEN]', chosenName, 'notes:', chosenDiff?._notes?.length, 'keys:', Object.keys(difficulties))

  const notes = [], walls = [], arcs: ArcData[] = []
  if (chosenDiff) {
    // Support both BeatSaver v2 (_notes/_obstacles) and v3 (colorNotes/bombNotes/obstacles)
    if (chosenDiff.colorNotes || chosenDiff.bombNotes) {
      // v3 format
      if (chosenDiff.colorNotes) {
        for (const n of chosenDiff.colorNotes) {
          notes.push({ t: n.b, x: n.x, y: n.y, type: n.c, dir: n.d })
        }
      }
      if (chosenDiff.bombNotes) {
        for (const n of chosenDiff.bombNotes) {
          notes.push({ t: n.b, x: n.x, y: n.y, type: 3, dir: 8 })
        }
      }
      // v3 arcs (sliders): visual guides between two notes
      if (Array.isArray(chosenDiff.sliders)) {
        for (const s of chosenDiff.sliders) {
          const x1 = clampIdx(s.x, 3), y1 = clampIdx(s.y, 2)
          const x2 = clampIdx(s.tx, 3), y2 = clampIdx(s.ty, 2)
          arcs.push({
            t: s.b, tb: s.tb, c: s.c,
            x1: LANE_X[x1], y1: ROW_Y[y1], d1: s.d ?? 8, mu: s.mu ?? 1,
            x2: LANE_X[x2], y2: ROW_Y[y2], d2: s.tc ?? 8, tmu: s.tmu ?? 1,
          })
        }
      }
      // v3 chains (burstSliders): head note stays a colorNote; add sc-1 link pads along the path
      if (Array.isArray(chosenDiff.burstSliders)) {
        for (const s of chosenDiff.burstSliders) {
          const sc = Math.max(2, s.sc | 0)
          const squish = s.s > 0 ? s.s : 1
          const hx = LANE_X[clampIdx(s.x, 3)], hy = ROW_Y[clampIdx(s.y, 2)]
          const tx = LANE_X[clampIdx(s.tx, 3)], ty = ROW_Y[clampIdx(s.ty, 2)]
          const dv = DIR_VEC[s.d === 8 || s.d == null ? 8 : s.d]
          const dist = Math.hypot(tx - hx, ty - hy)
          // quadratic bezier: control point follows the head cut direction
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
      if (chosenDiff.obstacles) {
        const LX = [-0.9, -0.3, 0.3, 0.9]
        for (const o of chosenDiff.obstacles) {
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
          })
        }
      }
    } else if (chosenDiff._notes) {
      // v2 format
      for (const n of chosenDiff._notes) {
        notes.push({ t: n._time, x: n._lineIndex, y: n._lineLayer, type: n._type, dir: n._cutDirection })
      }
      if (chosenDiff._obstacles) {
        const LX = [-0.9, -0.3, 0.3, 0.9]
        for (const o of chosenDiff._obstacles) {
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
          })
        }
      }
    }
  }

  let bpm = mapData.bpm || 120
  if (info._beatsPerMinute) bpm = info._beatsPerMinute
  const spb = 60 / bpm

  // Convert beat-time to seconds for all notes and walls
  for (const n of notes) n.t = n.t * spb
  for (const w of walls) w.t = w.t * spb
  for (const a of arcs) { a.t = a.t * spb; a.tb = a.tb * spb }
  notes.sort((a, b) => a.t - b.t)
  arcs.sort((a, b) => a.t - b.t)

  const lights = chosenDiff ? parseLightEvents(chosenDiff, spb) : []
  console.log('[ZIP-LIGHTS]', lights.length, 'events')
  console.log('[ZIP-ARCS]', arcs.length, 'arcs,', notes.filter((n: NoteData) => n.link).length, 'chain links')

  const duration = mapData.duration || (notes.length > 0 ? notes[notes.length - 1].t + 3 : 180)
  const songName = info._songName || mapData.songName || '未知歌曲'
  const songAuthor = info._songAuthorName || mapData.songAuthor || ''
  const diffLabel = diffLabels[chosenName] || chosenName?.toUpperCase() || 'Hard'

  const blob = new Blob([audioBuffer], { type: 'audio/ogg' })
  const url = URL.createObjectURL(blob)

  return {
    id: 'bs_' + mapData.id,
    name: songName,
    en: songAuthor,
    style: `BeatSaver · ${diffLabel}`,
    desc: `谱师: ${mapData.levelAuthor || '未知'} · BPM: ${Math.round(bpm)}`,
    bpm: Math.round(bpm),
    diff: diffLabel,
    env: 'official',
    speed: 19,
    colorL: 0xff2b2b, colorR: 0x2b9eff,
    cardBg: coverBlob ? `url(${URL.createObjectURL(coverBlob)}) center/cover no-repeat` : 'linear-gradient(160deg,#2b0a3d,#0e1445 55%,#032c3f)',
    coverBlob,
    audioUrl: url,
    internal: {
      events: [],
      notes, walls, lights, arcs,
      duration: duration || 180,
      bpm: Math.round(bpm), spb,
      buffer: audioBuffer,
    },
    build() { return (this as any).internal },
  }
}

function clampIdx(v: number, max: number): number {
  return Math.max(0, Math.min(max, v | 0))
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
      evs.push({ t: e._time * spb, type: e._type, value: e._value | 0, f: e._floatValue ?? 1 })
    }
  } else {
    // v3
    if (Array.isArray(diff.basicBeatmapEvents)) {
      for (const e of diff.basicBeatmapEvents) {
        if (!LIGHT_TYPES.has(e.et)) continue
        evs.push({ t: (e.b || 0) * spb, type: e.et, value: e.i | 0, f: e.f ?? 1 })
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
