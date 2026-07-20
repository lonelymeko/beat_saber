// Shared data structures across the game

/** A single note/bomb in play coordinates. type: 0=left 1=right 3=bomb, dir: 0-8 (8=dot) */
export interface NoteData {
  t: number
  x: number
  y: number
  type: number
  dir: number
  /** burst-slider chain link: small pad, fixed 20 pts, combo but no accuracy weight */
  link?: boolean
  /** fractional world coords (links sit between grid cells); fall back to LANE_X[x]/ROW_Y[y] */
  wx?: number
  wy?: number
  /** Chroma per-note color override (hex) */
  color?: number
}

/** Arc (v3 slider) — visual guide between two notes; world coords precomputed at parse. */
export interface ArcData {
  t: number
  tb: number
  c: number
  x1: number
  y1: number
  d1: number
  mu: number
  x2: number
  y2: number
  d2: number
  tmu: number
}

export interface WallData {
  t: number
  dur: number
  side: number
  width: number
  type: number
  wallScale: number
  crouch: boolean
  /** Chroma per-wall color override (hex) */
  color?: number
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
  /** Chroma per-event color override (hex) */
  c?: number
}

/** Everything a song's build() returns — the playable chart. */
export interface SongData {
  events: any[]
  notes: NoteData[]
  walls: WallData[]
  lights?: LightEvent[]
  arcs?: ArcData[]
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
  /** environment light colors when the map's color scheme differs from saber colors */
  envColorL?: number
  envColorR?: number
  cardBg?: string
  coverBlob?: Blob | null
  audioUrl?: string
  custom?: boolean
  /** bundled with the app; not deletable */
  builtin?: boolean
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
