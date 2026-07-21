import * as THREE from 'three'
import { LANE_X, ROW_Y, SPAWN_DIST, DIR_ROT, DIR_VEC } from './constants'

let noteGeo, arrowGeo, faceGlowGeo, bombGeo, halfGeo, hotGeo, wallMat

export function setGeometries(geo) {
  noteGeo = geo.noteGeo
  arrowGeo = geo.arrowGeo
  faceGlowGeo = geo.faceGlowGeo
  bombGeo = geo.bombGeo
  halfGeo = geo.halfGeo
  hotGeo = geo.hotGeo
  wallMat = geo.wallMat
}

export function createNoteMesh(d, mats, textures) {
  const g = new THREE.Group()
  const bodyMatFor = (dd) => (dd.color != null && mats.colored)
    ? mats.colored(dd.color)
    : (dd.type === 0 ? mats.matL : mats.matR)
  if (d.link) {
    // Chain link: thin slice with a glowing center dot
    const body = new THREE.Mesh(halfGeo, bodyMatFor(d))
    body.scale.set(0.9, 0.62, 0.9)
    g.add(body)
    const dot = new THREE.Mesh(faceGlowGeo, textures.dotGlowMat)
    dot.scale.set(0.5, 0.5, 1)
    dot.position.z = 0.09
    g.add(dot)
    g.position.set(d.wx ?? LANE_X[d.x], d.wy ?? ROW_Y[d.y], -SPAWN_DIST)
    g.userData.spin = 0
    return g
  }
  if (d.type === 3) {
    g.add(new THREE.Mesh(bombGeo, mats.bombMat))
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: textures.glowTex, color: 0xff2200, transparent: true,
      opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    glow.scale.set(0.7, 0.7, 1)
    g.add(glow)
  } else {
    g.add(new THREE.Mesh(noteGeo, bodyMatFor(d)))
    const rot = DIR_ROT[d.dir]
    const isDot = d.dir === 8
    // Official atlas sprite for the face glyph when loaded (per saber color)
    const sprM = d.type === 0
      ? (isDot ? textures.dotMatR : textures.arrowMatR)
      : (isDot ? textures.dotMatB : textures.arrowMatB)
    if (sprM && textures.arrowGeoOff) {
      const face = new THREE.Mesh(isDot ? textures.dotGeoOff : textures.arrowGeoOff, sprM)
      face.position.z = 0.258
      face.rotation.z = rot
      g.add(face)
    } else {
      const face = new THREE.Mesh(arrowGeo, isDot ? textures.dotMat : textures.arrowMat)
      face.position.z = 0.258
      face.rotation.z = rot
      g.add(face)
    }
    const halo = new THREE.Mesh(faceGlowGeo, isDot ? textures.dotGlowMat : textures.arrowGlowMat)
    halo.position.z = 0.254
    halo.rotation.z = rot
    g.add(halo)
  }
  g.position.set(d.wx ?? LANE_X[d.x], d.wy ?? ROW_Y[d.y], -SPAWN_DIST)
  g.userData.spin = (Math.random() - 0.5) * 1.4
  return g
}

/** Arc (slider) guide: additive tube from head note to tail note, moving with the conveyor. */
export function createArcMesh(a, speed, color) {
  const dz = Math.max(0.05, (a.tb - a.t) * speed)
  const A = 0.9
  const hd = DIR_VEC[a.d1 === 8 ? 8 : a.d1] || [0, 0]
  const td = DIR_VEC[a.d2 === 8 ? 8 : a.d2] || [0, 0]
  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(a.x1, a.y1, 0),
    new THREE.Vector3(a.x1 + hd[0] * A * a.mu, a.y1 + hd[1] * A * a.mu, -dz * 0.33),
    new THREE.Vector3(a.x2 - td[0] * A * a.tmu, a.y2 - td[1] * A * a.tmu, -dz * 0.66),
    new THREE.Vector3(a.x2, a.y2, -dz),
  )
  const geo = new THREE.TubeGeometry(curve, 24, 0.08, 6, false)
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })
  return new THREE.Mesh(geo, mat)
}

// Walls share one unit-box geometry (scaled per wall): wall-art maps spawn
// hundreds of walls per second and per-wall BoxGeometry+EdgesGeometry would stutter
const _wallGeo = new THREE.BoxGeometry(1, 1, 1)
const _wallEdgeGeo = new THREE.EdgesGeometry(_wallGeo)

export function createWallMesh(w, speed, hitZ) {
  const len = Math.max(w.dur * speed, 0.05)
  const wallH = w.wh ?? (w.crouch ? 1.3 : 2.9)
  const wallW = w.ww ?? (w.wallScale != null ? 1.15 * w.wallScale : 1.15)
  // Official look: deep translucent red body with bright glowing edges (Chroma color honored)
  const baseCol = new THREE.Color(w.color != null ? w.color : 0xd8103c)
  const fillMat = new THREE.MeshBasicMaterial({
    color: baseCol, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide,
  })
  const m = new THREE.Mesh(_wallGeo, fillMat)
  m.scale.set(wallW, wallH, len)
  const edgeCol = baseCol.clone().lerp(new THREE.Color(0xffffff), 0.35)
  const edgeMat = new THREE.LineBasicMaterial({
    color: edgeCol, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })
  const edge = new THREE.LineSegments(_wallEdgeGeo, edgeMat)
  m.add(edge)
  m.userData.ownMats = [fillMat, edgeMat]
  m.userData.baseScale = [wallW, wallH, len]
  m.userData.sharedGeo = true
  const x = w.wx ?? w.side * 0.58
  const y = w.wy ?? (w.crouch ? 2.1 : 1.55)
  m.position.set(x, y, hitZ - SPAWN_DIST)
  return { m, len }
}

export function createHalves(note, angle, sp, good, noteCol, textures, hotTex) {
  // Official-style slice: the block splits into two halves along the saber
  // swing plane, each with a white-hot glowing cut face, flying apart.
  const halves = []
  const nx = -Math.sin(angle)   // cut-plane normal (halves separate along this)
  const ny = Math.cos(angle)
  const baseColor = new THREE.Color(noteCol)
  const glowColor = baseColor.clone().lerp(new THREE.Color(0xffffff), good ? 0.8 : 0.35)
  const bodyMat = note.g.children[0]?.material

  for (let side = -1; side <= 1; side += 2) {
    const grp = new THREE.Group()
    const body = new THREE.Mesh(halfGeo, bodyMat)
    body.position.y = side * 0.13
    grp.add(body)

    // Glowing cut face on the sliced side
    const hotMat = new THREE.MeshBasicMaterial({
      color: glowColor, transparent: true, opacity: good ? 0.95 : 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
    const face = new THREE.Mesh(hotTex, hotMat)
    face.rotation.x = Math.PI / 2
    face.position.y = side * 0.012
    grp.add(face)

    grp.position.copy(note.g.position)
    grp.rotation.z = angle   // local +y = cut normal
    const sep = 1.1 + Math.min(2.2, sp * 0.14) + Math.random() * 0.3
    halves.push({
      m: grp, hotMat,
      vx: nx * side * sep + (Math.random() - 0.5) * 0.4,
      vy: ny * side * sep + 0.7,
      vz: 3.4 + sp * 0.22,
      rx: side * (1.6 + Math.random() * 1.4),
      ry: 0,
      rz: (Math.random() - 0.5) * 1.6,
      life: 0.75 + Math.random() * 0.15,
    })
  }
  return halves
}

// Pooled hit-burst particles: reuse geometry/materials across hits to avoid GC churn
const _burstPool: Record<number, any[]> = {}

export function createBurst(pos, color, textures, n = 14, size = 0.12, spd = 5) {
  const pool = (_burstPool[n] = _burstPool[n] || [])
  let b = pool.pop()
  if (!b) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      map: textures.sparkTex, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: textures.glowTex, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    const vels = []
    for (let i = 0; i < n; i++) vels.push(new THREE.Vector3())
    b = { pts, flash, vels, n, life: 0, max: 0 }
  }
  const p = b.pts.geometry.attributes.position.array
  for (let i = 0; i < n; i++) {
    p[i * 3] = pos.x
    p[i * 3 + 1] = pos.y
    p[i * 3 + 2] = pos.z
    const a = Math.random() * Math.PI * 2
    const e = (Math.random() - 0.5) * Math.PI
    const v = spd * (0.5 + Math.random() * 0.8)
    b.vels[i].set(
      Math.cos(a) * Math.cos(e) * v,
      Math.sin(e) * v + 1.5,
      Math.sin(a) * Math.cos(e) * v * 0.7 + 3,
    )
  }
  b.pts.geometry.attributes.position.needsUpdate = true
  b.pts.material.color.set(color)
  b.pts.material.size = size
  b.pts.material.opacity = 1
  b.flash.material.color.set(color)
  b.flash.material.opacity = 0.85
  b.flash.position.copy(pos)
  b.flash.scale.set(0.3, 0.3, 1)
  b.life = 0.45
  b.max = 0.45
  return b
}

export function releaseBurst(b) {
  const pool = (_burstPool[b.n] = _burstPool[b.n] || [])
  if (pool.length < 24) pool.push(b)
  else {
    b.pts.geometry.dispose()
    b.pts.material.dispose()
    b.flash.material.dispose()
  }
}

// Floating score texts repeat heavily (115/114/MISS/...) — cache textures by content
const _textTexCache = new Map<string, THREE.CanvasTexture>()

export function createFloatingText(pos, str, color) {
  const key = str + '|' + color
  let tex = _textTexCache.get(key)
  if (!tex) {
    const c = document.createElement('canvas')
    c.width = 192
    c.height = 96
    const g = c.getContext('2d')
    g.font = "bold 56px 'Avenir Next','PingFang SC',sans-serif"
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.shadowColor = color
    g.shadowBlur = 16
    g.fillStyle = color
    g.fillText(str, 96, 48)
    tex = new THREE.CanvasTexture(c)
    _textTexCache.set(key, tex)
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, opacity: 1, depthWrite: false,
  }))
  sp.position.copy(pos)
  sp.position.z += 0.3
  sp.scale.set(0.85, 0.42, 1)
  // tex: null → the cleanup path must not dispose the cached texture
  return { sp, tex: null, life: 0.75, max: 0.75, rise: 1.1, grow: 0 }
}
