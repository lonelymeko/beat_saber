import * as THREE from 'three'
import { LANE_X, ROW_Y, SPAWN_DIST, DIR_ROT } from './constants.js'

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
  if (d.type === 3) {
    g.add(new THREE.Mesh(bombGeo, mats.bombMat))
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: textures.glowTex, color: 0xff2200, transparent: true,
      opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    glow.scale.set(0.7, 0.7, 1)
    g.add(glow)
  } else {
    g.add(new THREE.Mesh(noteGeo, d.type === 0 ? mats.matL : mats.matR))
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
  g.position.set(LANE_X[d.x], ROW_Y[d.y], -SPAWN_DIST)
  g.userData.spin = (Math.random() - 0.5) * 1.4
  return g
}

export function createWallMesh(w, speed, hitZ) {
  const len = w.dur * speed
  const wallH = w.crouch ? 1.3 : 2.9
  const wallW = w.wallScale != null ? 1.15 * w.wallScale : 1.15
  const m = new THREE.Mesh(new THREE.BoxGeometry(wallW, wallH, len), wallMat)
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(m.geometry),
    new THREE.LineBasicMaterial({ color: 0xff5566, transparent: true, opacity: 0.6 }),
  )
  m.add(edge)
  const x = w.wallScale != null ? w.side * 0.58 : w.side * 0.58
  const y = w.crouch ? 2.1 : 1.55
  m.position.set(x, y, hitZ - SPAWN_DIST)
  return { m, len }
}

export function createHalves(note, angle, sp, good, noteCol, textures, hotTex) {
  const halves = []
  const nx = -Math.sin(angle)
  const ny = Math.cos(angle)
  for (let s = -1; s <= 1; s += 2) {
    const grp = new THREE.Group()
    const hotBase = good ? 1 : 0.35
    const hotMat = new THREE.MeshBasicMaterial({
      map: textures.hotTex, transparent: true, opacity: hotBase,
      color: new THREE.Color(noteCol).lerp(new THREE.Color(0xffffff), good ? 0.6 : 0.15),
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
    const hot = new THREE.Mesh(textures.hotGeo, hotMat)
    hot.rotation.x = s * Math.PI / 2
    hot.position.y = -s * 0.122
    grp.add(hot)
    grp.position.copy(note.g.position)
    grp.rotation.z = angle
    grp.position.x += nx * 0.13 * s
    grp.position.y += ny * 0.13 * s
    halves.push({
      m: grp,
      hotMat,
      vx: nx * s * (1.6 + sp * 0.25) + (Math.random() - 0.5),
      vy: ny * s * (1.6 + sp * 0.25) + 1.2,
      vz: 3.5 + Math.random() * 2,
      rx: (Math.random() - 0.5) * 9,
      rz: (Math.random() - 0.5) * 9,
      life: 0.7,
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
    const v = spd * (0.4 + Math.random() * 0.6)
    vels.push(new THREE.Vector3(
      Math.cos(a) * Math.cos(b) * v,
      Math.sin(b) * v + 1,
      Math.sin(a) * Math.cos(b) * v * 0.5 + 2,
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
