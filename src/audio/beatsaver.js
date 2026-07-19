// BeatSaver API client + beatmap zip parser
const API = 'https://api.beatsaver.com'

export async function searchBeatSaver(query, page = 0) {
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

async function parseBeatMapZip(buffer, mapData) {
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
async function parseZipManually(data, mapData, coverBlob) {
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

  const notes = [], walls = []
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
    env: 'neon',
    speed: 19,
    colorL: 0xff2bd0, colorR: 0x00e5ff,
    cardBg: coverBlob ? `url(${URL.createObjectURL(coverBlob)}) center/cover no-repeat` : 'linear-gradient(160deg,#2b0a3d,#0e1445 55%,#032c3f)',
    coverBlob,
    audioUrl: url,
    internal: {
      events: [],
      notes, walls,
      duration: duration || 180,
      bpm: Math.round(bpm), spb,
      buffer: audioBuffer,
    },
    build() { return this.internal },
  }
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
