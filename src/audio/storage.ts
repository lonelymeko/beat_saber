// IndexedDB storage for downloaded beatmaps
import type { Song } from '../types'
import { THEME_ENV } from './beatsaver'

const DB_NAME = 'beat_saber_maps'
const DB_VERSION = 1

function openDB(): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as any).result
      if (!db.objectStoreNames.contains('maps')) {
        db.createObjectStore('maps', { keyPath: 'id' })
      }
    }
    req.onsuccess = (e) => resolve((e.target as any).result)
    req.onerror = (e) => reject((e.target as any).error)
  })
}

export async function saveMap(mapId: string, data: any): Promise<void> {
  const db = await openDB()
  const coverBuffer = data.coverBlob ? await data.coverBlob.arrayBuffer() : null
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('maps', 'readwrite')
    const store = tx.objectStore('maps')
    // Serialize: convert Uint8Array to regular array for IndexedDB
    const record = {
      id: mapId,
      name: data.name,
      en: data.en,
      style: data.style,
      desc: data.desc,
      bpm: data.bpm,
      diff: data.diff,
      env: data.env,
      speed: data.speed,
      colorL: data.colorL,
      colorR: data.colorR,
      envColorL: data.envColorL,
      envColorR: data.envColorR,
      cardBg: data.cardBg,
      coverBuffer,
      notes: data.internal?.notes || [],
      walls: data.internal?.walls || [],
      lights: data.internal?.lights || [],
      arcs: data.internal?.arcs || [],
      duration: data.internal?.duration || 180,
      // Store audio as ArrayBuffer (not Uint8Array - IndexedDB handles ArrayBuffer natively)
      audioBuffer: data.internal?.buffer ? data.internal.buffer.buffer.slice(data.internal.buffer.byteOffset, data.internal.buffer.byteOffset + data.internal.buffer.byteLength) : null,
    }
    const req = store.put(record)
    req.onsuccess = () => resolve()
    req.onerror = (e) => reject((e.target as any).error)
  })
}

/** Load saved maps one by one via cursor so the UI can show progress and add songs incrementally. */
export async function loadAllMaps(onEach?: (song: Song, index: number, total: number) => void): Promise<Song[]> {
  const db = await openDB()
  return new Promise<Song[]>((resolve, reject) => {
    const tx = db.transaction('maps', 'readonly')
    const store = tx.objectStore('maps')
    const songs: Song[] = []
    let total = 0
    let index = 0
    const countReq = store.count()
    countReq.onsuccess = () => { total = countReq.result || 0 }
    const req = store.openCursor()
    req.onsuccess = (e) => {
      const cursor = (e.target as any).result
      if (!cursor) { resolve(songs); return }
      const r = cursor.value
      index++
      if (!r.notes || r.notes.length === 0) {
        deleteMap(r.id).catch(() => {})
        cursor.continue()
        return
      }
      const song = recordToSong(r)
      songs.push(song)
      if (onEach) onEach(song, index, total)
      cursor.continue()
    }
    req.onerror = (e) => reject((e.target as any).error)
  })
}

// Bundled maps cached into IndexedDB stay non-deletable when loaded back
const BUILTIN_IDS = new Set(['bs_4f454'])

function recordToSong(r: any): Song {
  return ({
          id: r.id,
          builtin: BUILTIN_IDS.has(r.id),
          name: r.name,
          en: r.en,
          style: r.style,
          desc: r.desc,
          bpm: r.bpm,
          diff: r.diff,
          env: THEME_ENV[String(r.id).replace(/^bs_/, '')] || r.env,
          speed: r.speed,
          colorL: r.colorL,
          colorR: r.colorR,
          envColorL: r.envColorL,
          envColorR: r.envColorR,
          cardBg: r.coverBuffer
            ? `url(${URL.createObjectURL(new Blob([r.coverBuffer]))}) center/cover no-repeat`
            : (r.cardBg || 'linear-gradient(160deg,#2b0a3d,#0e1445 55%,#032c3f)'),
          coverBlob: r.coverBuffer ? new Blob([r.coverBuffer]) : null,
          internal: {
            events: [],
            notes: r.notes || [],
            walls: r.walls || [],
            lights: r.lights || [],
            arcs: r.arcs || [],
            duration: r.duration || 180,
            bpm: r.bpm,
            spb: 60 / r.bpm,
            buffer: r.audioBuffer ? new Uint8Array(r.audioBuffer) : null,
          },
          build() { return this.internal },
        }) as Song
}

export async function deleteMap(mapId: string): Promise<void> {
  const db = await openDB()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('maps', 'readwrite')
    const store = tx.objectStore('maps')
    const req = store.delete(mapId)
    req.onsuccess = () => resolve()
    req.onerror = (e) => reject((e.target as any).error)
  })
}
