// IndexedDB storage for downloaded beatmaps
import type { Song } from '../types'

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
      cardBg: data.cardBg,
      coverBuffer,
      notes: data.internal?.notes || [],
      walls: data.internal?.walls || [],
      lights: data.internal?.lights || [],
      duration: data.internal?.duration || 180,
      // Store audio as ArrayBuffer (not Uint8Array - IndexedDB handles ArrayBuffer natively)
      audioBuffer: data.internal?.buffer ? data.internal.buffer.buffer.slice(data.internal.buffer.byteOffset, data.internal.buffer.byteOffset + data.internal.buffer.byteLength) : null,
    }
    const req = store.put(record)
    req.onsuccess = () => resolve()
    req.onerror = (e) => reject((e.target as any).error)
  })
}

export async function loadAllMaps(): Promise<Song[]> {
  const db = await openDB()
  return new Promise<Song[]>((resolve, reject) => {
    const tx = db.transaction('maps', 'readonly')
    const store = tx.objectStore('maps')
    const req = store.getAll()
    req.onsuccess = (e) => {
      const records = (e.target as any).result || []
      const songs: Song[] = []
      for (const r of records) {
        if (!r.notes || r.notes.length === 0) {
          deleteMap(r.id).catch(() => {})
          continue
        }
        songs.push({
          id: r.id,
          name: r.name,
          en: r.en,
          style: r.style,
          desc: r.desc,
          bpm: r.bpm,
          diff: r.diff,
          env: r.env,
          speed: r.speed,
          colorL: r.colorL,
          colorR: r.colorR,
          cardBg: r.coverBuffer
            ? `url(${URL.createObjectURL(new Blob([r.coverBuffer]))}) center/cover no-repeat`
            : (r.cardBg || 'linear-gradient(160deg,#2b0a3d,#0e1445 55%,#032c3f)'),
          coverBlob: r.coverBuffer ? new Blob([r.coverBuffer]) : null,
          internal: {
            events: [],
            notes: r.notes || [],
            walls: r.walls || [],
            lights: r.lights || [],
            duration: r.duration || 180,
            bpm: r.bpm,
            spb: 60 / r.bpm,
            buffer: r.audioBuffer ? new Uint8Array(r.audioBuffer) : null,
          },
          build() { return this.internal },
        })
      }
      resolve(songs)
    }
    req.onerror = (e) => reject((e.target as any).error)
  })
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
