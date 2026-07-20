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
    const face = new THREE.Mesh(arrowGeo, d.dir === 8 ? textures.dotMat : textures.arrowMat)
    face.position.z = 0.258
    face.rotation.z = rot
    g.add(face)
    const halo = new THREE.Mesh(faceGlowGeo, d.dir === 8 ? textures.dotGlowMat : textures.arrowGlowMat)
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

export function createWallMesh(w, speed, hitZ) {
  const len = w.dur * speed
  const wallH = w.crouch ? 1.3 : 2.9
  const wallW = w.wallScale != null ? 1.15 * w.wallScale : 1.15
  // Official look: deep translucent red body with bright glowing edges (Chroma color honored)
  const baseCol = new THREE.Color(w.color != null ? w.color : 0xd8103c)
  const fillMat = new THREE.MeshBasicMaterial({
    color: baseCol, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide,
  })
  const m = new THREE.Mesh(new THREE.BoxGeometry(wallW, wallH, len), fillMat)
  const edgeCol = baseCol.clone().lerp(new THREE.Color(0xffffff), 0.35)
  const edgeMat = new THREE.LineBasicMaterial({
    color: edgeCol, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), edgeMat)
  m.add(edge)
  m.userData.ownMats = [fillMat, edgeMat]
  const x = w.wallScale != null ? w.side * 0.58 : w.side * 0.58
  const y = w.crouch ? 2.1 : 1.55
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

export function createBurst(pos, color, textures, n = 14, size = 0.12, spd = 5) {
  const posArr = new Float32Array(n * 3)
  const vels = []
  for (let i = 0; i < n; i++) {
    posArr[i * 3] = pos.x
    posArr[i * 3 + 1] = pos.y
    posArr[i * 3 + 2] = pos.z
    const a = Math.random() * Math.PI * 2
    const b = (Math.random() - 0.5) * Math.PI
    const v = spd * (0.5 + Math.random() * 0.8)
    vels.push(new THREE.Vector3(
      Math.cos(a) * Math.cos(b) * v,
      Math.sin(b) * v + 1.5,
      Math.sin(a) * Math.cos(b) * v * 0.7 + 3,
    ))
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3))
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    map: textures.sparkTex, color, size, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: textures.glowTex, color, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  flash.position.copy(pos)
  flash.scale.set(0.3, 0.3, 1)
  return { pts, vels, flash, life: 0.45, max: 0.45 }
}

export function createFloatingText(pos, str, color) {
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
  const tex = new THREE.CanvasTexture(c)
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, opacity: 1, depthWrite: false,
  }))
  sp.position.copy(pos)
  sp.position.z += 0.3
  sp.scale.set(0.85, 0.42, 1)
  return { sp, tex, life: 0.75, max: 0.75, rise: 1.1, grow: 0 }
}
