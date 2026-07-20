// Shared data structures across the game

/** A single note/bomb in play coordinates. type: 0=left 1=right 3=bomb, dir: 0-8 (8=dot) */
export interface NoteData {
  t: number
  x: number
  y: number
  type: number
  dir: number
}

export interface WallData {
  t: number
  dur: number
  side: number
  width: number
  type: number
  wallScale: number
  crouch: boolean
}

/**
 * Normalized lighting event (seconds).
 * type: 0=back lasers · 1=ring lights · 2/3=left/right lasers · 4=center lights ·
 *       5=color boost · 8=ring spin · 9=ring zoom · 12/13=laser rotation speed
 * value: 0=off · 1-4=right color on/flash/fade/transition · 5-8=left · 9-12=white
 */
export interface LightEvent {
  t: number
  type: number
  value: number
  f: number
}

/** Everything a song's build() returns — the playable chart. */
export interface SongData {
  events: any[]
  notes: NoteData[]
  walls: WallData[]
  lights?: LightEvent[]
  duration: number
  bpm: number
  spb: number
  beatOffset?: number
  buffer?: AudioBuffer | Uint8Array | ArrayBuffer | null
}

export interface Song {
  id: string
  name: string
  en: string
  style: string
  desc: string
  bpm: number
  diff: string
  env: string
  speed: number
  colorL: number
  colorR: number
  cardBg?: string
  coverBlob?: Blob | null
  audioUrl?: string
  custom?: boolean
  internal?: SongData
  build(): SongData
}

/** BeatSaver search result entry. */
export interface BeatSaverMapInfo {
  id: string
  name: string
  songName: string
  songAuthor: string
  levelAuthor: string
  bpm: number
  duration: number
  hash?: string
  diffs: any[]
  coverUrl: string
  downloadCount: number
  upvotes: number
}
