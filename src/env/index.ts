import * as THREE from 'three'
import type { LightEvent } from '../types'

type BasicMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>

function canvasTex(w: number, h: number, fn: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  fn(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.anisotropy = 4
  return t
}

export class BaseEnv {
  scene: THREE.Scene
  colorL: number
  colorR: number
  group: THREE.Group
  pulse: number
  hasLightEvents?: boolean
  constructor(scene: THREE.Scene, colorL: number, colorR: number) {
    this.scene = scene
    this.colorL = colorL
    this.colorR = colorR
    this.group = new THREE.Group()
    scene.add(this.group)
    this.pulse = 0
  }
  onBeat(i: number) { this.pulse = 1 }
  onLightEvent(ev: LightEvent) {}
  update(dt: number, t: number) { this.pulse *= Math.exp(-dt * 4.5) }
  dispose() {
    this.group.traverse((o: any) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material]
        ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose() })
      }
    })
    this.scene.remove(this.group)
  }
}

class NeonEnv extends BaseEnv {
  gridTex: THREE.CanvasTexture
  strips: THREE.MeshBasicMaterial[]
  edges: { m: THREE.LineBasicMaterial, base: THREE.Color }[]
  rings: BasicMesh[]
  lasers: BasicMesh[]
  constructor(scene: THREE.Scene, cl: number, cr: number) {
    super(scene, cl, cr)
    scene.background = new THREE.Color(0x030309)
    scene.fog = new THREE.Fog(0x05030f, 25, 190)

    this.gridTex = canvasTex(256, 256, (g) => {
      g.fillStyle = '#060310'; g.fillRect(0, 0, 256, 256)
      g.strokeStyle = 'rgba(255,43,208,0.85)'; g.lineWidth = 3
      for (let i = 0; i <= 4; i++) {
        g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke()
        g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke()
      }
      g.strokeStyle = 'rgba(0,229,255,0.5)'; g.lineWidth = 1
      for (let i = 0; i <= 8; i++) {
        g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 256); g.stroke()
        g.beginPath(); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke()
      }
    })
    this.gridTex.wrapS = this.gridTex.wrapT = THREE.RepeatWrapping
    this.gridTex.repeat.set(10, 40)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 500),
      new THREE.MeshBasicMaterial({ map: this.gridTex }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, 0, -180)
    this.group.add(floor)

    this.strips = []
    ;[[-1.6, cl], [1.6, cr]].forEach(([x, c]) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.02, 400),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
      )
      m.position.set(x, 0.02, -160)
      this.group.add(m); this.strips.push(m.material)
    })

    this.edges = []
    const darkMat = new THREE.MeshBasicMaterial({ color: 0x05060d })
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 16; i++) {
        const w = 2 + Math.random() * 2.5
        const hgt = 5 + Math.random() * 13
        const geo = new THREE.BoxGeometry(w, hgt, w)
        const box = new THREE.Mesh(geo, darkMat)
        box.position.set(side * (8 + Math.random() * 10), hgt / 2, -12 - i * 10 - Math.random() * 5)
        this.group.add(box)
        const c = (i % 2 === 0) ? cl : cr
        const lm = new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.9 })
        const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo), lm)
        lines.position.copy(box.position)
        this.group.add(lines)
        this.edges.push({ m: lm, base: new THREE.Color(c) })
      }
    }

    this.rings = []
    for (let i = 0; i < 9; i++) {
      const c = i % 2 === 0 ? cl : cr
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(5.5, 0.09, 8, 48),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }),
      )
      ring.position.set(0, 2.2, -12 - i * 14)
      this.group.add(ring); this.rings.push(ring)
    }

    const sunTex = canvasTex(512, 512, (g) => {
      const gr = g.createLinearGradient(0, 60, 0, 460)
      gr.addColorStop(0, '#ffd76e'); gr.addColorStop(0.45, '#ff6ec7'); gr.addColorStop(1, '#7f2bff')
      g.fillStyle = gr
      g.beginPath(); g.arc(256, 256, 200, 0, Math.PI * 2); g.fill()
      g.globalCompositeOperation = 'destination-out'
      for (let i = 0; i < 7; i++) { g.fillRect(0, 280 + i * 26, 512, 6 + i * 2.2) }
    })
    const sun = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, depthWrite: false }),
    )
    sun.position.set(0, 20, -186)
    this.group.add(sun)

    this.lasers = []
    for (let i = 0; i < 6; i++) {
      const c = i % 2 === 0 ? cl : cr
      const l = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 70, 0.18),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
      )
      l.position.set(-25 + i * 10, 0, -120 - (i % 3) * 15)
      this.group.add(l); this.lasers.push(l)
    }
  }
  update(dt: number, t: number) {
    super.update(dt, t)
    this.gridTex.offset.y -= dt * 1.35
    this.rings.forEach((r, i) => {
      r.position.z += dt * 9
      if (r.position.z > 3) r.position.z -= 126
      r.rotation.z += dt * 0.25 * (i % 2 ? 1 : -1)
      const s = 1 + this.pulse * 0.13
      r.scale.set(s, s, 1)
      r.material.opacity = 0.45 + this.pulse * 0.5
    })
    this.lasers.forEach((l, i) => {
      l.rotation.z = Math.sin(t * 0.45 + i * 1.1) * 0.85
      l.material.opacity = 0.3 + this.pulse * 0.45
    })
    this.edges.forEach((e, i) => {
      const k = 0.55 + this.pulse * 0.45 + 0.1 * Math.sin(t * 2 + i)
      e.m.color.copy(e.base).multiplyScalar(k)
    })
    this.strips.forEach(m => m.opacity = 0.5 + this.pulse * 0.5)
  }
}

class InkEnv extends BaseEnv {
  halo: THREE.Sprite
  mountains: { m: THREE.Mesh, phase: number, amp: number }[]
  glint: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  lanterns: { grp: THREE.Group, glow: THREE.SpriteMaterial, baseX: number, speed: number, phase: number }[]
  petalPos: Float32Array
  petalPhase: Float32Array
  petalGeo: THREE.BufferGeometry
  mists: { m: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>, phase: number }[]
  constructor(scene: THREE.Scene, cl: number, cr: number) {
    super(scene, cl, cr)
    scene.background = new THREE.Color(0x0b0f18)
    scene.fog = new THREE.Fog(0x0b0f18, 28, 185)

    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(9, 48),
      new THREE.MeshBasicMaterial({ color: 0xf6e7c1 }),
    )
    moon.position.set(-16, 18, -150)
    this.group.add(moon)
    const haloTex = canvasTex(256, 256, (g) => {
      const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128)
      gr.addColorStop(0, 'rgba(255,240,200,0.9)')
      gr.addColorStop(0.4, 'rgba(255,235,190,0.25)')
      gr.addColorStop(1, 'rgba(255,230,180,0)')
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256)
    })
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    this.halo.scale.set(46, 46, 1)
    this.halo.position.copy(moon.position)
    this.group.add(this.halo)

    const mkMountain = (color, seed, jag) => canvasTex(1024, 256, (g) => {
      g.clearRect(0, 0, 1024, 256)
      g.fillStyle = color
      g.beginPath(); g.moveTo(0, 256)
      let y = 150 + Math.sin(seed) * 30
      for (let x = 0; x <= 1024; x += 16) {
        y += (Math.sin(x * 0.013 + seed * 7) + Math.sin(x * 0.037 + seed * 3)) * jag
        y = Math.max(40, Math.min(220, y))
        g.lineTo(x, y)
      }
      g.lineTo(1024, 256); g.closePath(); g.fill()
    })
    this.mountains = []
    ;([['#0d1320', -170, 90, 1, 8], ['#121a2a', -125, 70, 2, 10], ['#182238', -85, 52, 3, 12]] as [string, number, number, number, number][]).forEach(([col, z, h, seed, jag], i) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(360, h),
        new THREE.MeshBasicMaterial({ map: mkMountain(col, seed, jag), transparent: true, depthWrite: false }),
      )
      m.position.set(0, h * 0.35, z)
      this.group.add(m)
      this.mountains.push({ m, phase: i * 2.1, amp: 3 + i * 2 })
    })

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 260),
      new THREE.MeshBasicMaterial({ color: 0x080c13 }),
    )
    water.rotation.x = -Math.PI / 2
    water.position.set(0, -0.01, -120)
    this.group.add(water)
    const glintTex = canvasTex(64, 512, (g) => {
      const gr = g.createLinearGradient(0, 0, 64, 0)
      gr.addColorStop(0, 'rgba(246,231,193,0)')
      gr.addColorStop(0.5, 'rgba(246,231,193,0.8)')
      gr.addColorStop(1, 'rgba(246,231,193,0)')
      g.fillStyle = gr
      for (let y = 0; y < 512; y += 14) g.fillRect(0, y, 64, 7)
    })
    this.glint = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 120),
      new THREE.MeshBasicMaterial({ map: glintTex, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    this.glint.rotation.x = -Math.PI / 2
    this.glint.position.set(-16, 0.02, -85)
    this.group.add(this.glint)

    this.lanterns = []
    const glowTex = canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 6, 64, 64, 64)
      gr.addColorStop(0, 'rgba(255,180,90,0.95)')
      gr.addColorStop(0.5, 'rgba(255,140,60,0.3)')
      gr.addColorStop(1, 'rgba(255,120,40,0)')
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128)
    })
    for (let i = 0; i < 26; i++) {
      const grp = new THREE.Group()
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.46, 0.34),
        new THREE.MeshBasicMaterial({ color: 0xffb060 }),
      )
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
      }))
      glow.scale.set(2.2, 2.2, 1)
      grp.add(body); grp.add(glow)
      const bx = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 22)
      grp.position.set(bx, Math.random() * 16, -15 - Math.random() * 110)
      this.group.add(grp)
      this.lanterns.push({ grp, glow: glow.material, baseX: bx, speed: 0.35 + Math.random() * 0.5, phase: Math.random() * 6.28 })
    }

    const petalTex = canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 4, 32, 32, 30)
      gr.addColorStop(0, 'rgba(255,190,205,1)')
      gr.addColorStop(1, 'rgba(255,160,190,0)')
      g.fillStyle = gr
      g.beginPath(); g.ellipse(32, 32, 26, 15, 0.8, 0, Math.PI * 2); g.fill()
    })
    const N = 240
    this.petalPos = new Float32Array(N * 3)
    this.petalPhase = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      this.petalPos[i * 3] = (Math.random() - 0.5) * 56
      this.petalPos[i * 3 + 1] = Math.random() * 18
      this.petalPos[i * 3 + 2] = -3 - Math.random() * 120
      this.petalPhase[i] = Math.random() * 6.28
    }
    this.petalGeo = new THREE.BufferGeometry()
    this.petalGeo.setAttribute('position', new THREE.BufferAttribute(this.petalPos, 3))
    const petals = new THREE.Points(this.petalGeo, new THREE.PointsMaterial({
      map: petalTex, size: 0.3, transparent: true, opacity: 0.85,
      color: 0xffc0cf, depthWrite: false,
    }))
    this.group.add(petals)

    const mistTex = canvasTex(256, 64, (g) => {
      const gr = g.createRadialGradient(128, 32, 6, 128, 32, 128)
      gr.addColorStop(0, 'rgba(200,215,235,0.5)')
      gr.addColorStop(1, 'rgba(200,215,235,0)')
      g.fillStyle = gr; g.fillRect(0, 0, 256, 64)
    })
    this.mists = []
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(90, 16),
        new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, opacity: 0.1, depthWrite: false }),
      )
      m.position.set((Math.random() - 0.5) * 40, 2.5 + i * 1.2, -35 - i * 16)
      this.group.add(m)
      this.mists.push({ m, phase: i * 1.7 })
    }
  }
  update(dt: number, t: number) {
    super.update(dt, t)
    this.halo.material.opacity = 0.45 + this.pulse * 0.35 + 0.06 * Math.sin(t * 1.2)
    this.mountains.forEach(o => { o.m.position.x = Math.sin(t * 0.02 + o.phase) * o.amp })
    this.glint.material.opacity = 0.22 + 0.08 * Math.sin(t * 2.6) + this.pulse * 0.2
    this.lanterns.forEach(l => {
      l.grp.position.y += l.speed * dt
      l.grp.position.x = l.baseX + Math.sin(t * 0.5 + l.phase) * 0.8
      if (l.grp.position.y > 22) {
        l.grp.position.y = -1
        l.baseX = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 22)
        l.grp.position.z = -15 - Math.random() * 110
      }
      l.glow.opacity = 0.5 + 0.25 * Math.sin(t * 2.2 + l.phase) + this.pulse * 0.3
    })
    const p = this.petalPos
    for (let i = 0; i < p.length / 3; i++) {
      p[i * 3 + 1] -= dt * (0.35 + 0.2 * Math.sin(this.petalPhase[i]))
      p[i * 3] += Math.sin(t * 0.9 + this.petalPhase[i]) * dt * 0.7
      if (p[i * 3 + 1] < 0) p[i * 3 + 1] = 18
    }
    this.petalGeo.attributes.position.needsUpdate = true
    this.mists.forEach(o => {
      o.m.position.x += Math.sin(t * 0.05 + o.phase) * dt * 2
      o.m.material.opacity = 0.07 + 0.04 * Math.sin(t * 0.4 + o.phase)
    })
  }
}

class SpaceEnv extends BaseEnv {
  stars: THREE.Points
  nebulas: { sp: THREE.Sprite, phase: number }[]
  planet: THREE.Mesh
  asteroids: { a: THREE.Mesh, rs: number }[]
  streaks: BasicMesh[]
  strips: THREE.MeshBasicMaterial[]
  comet: THREE.Sprite
  cometT: number
  cometStart: { x: number, y: number }
  cometLife: number
  constructor(scene: THREE.Scene, cl: number, cr: number) {
    super(scene, cl, cr)
    scene.background = new THREE.Color(0x02020a)
    scene.fog = null

    const N = 2200
    const pos = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      const r = 70 + Math.random() * 280
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(Math.random() * 2 - 1)
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th)
      pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.7 - 10
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) - 40
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.8, transparent: true, opacity: 0.9, depthWrite: false,
    }))
    this.group.add(this.stars)

    const mkNebula = (r, g2, b) => canvasTex(256, 256, (g) => {
      for (let i = 0; i < 3; i++) {
        const x = 80 + Math.random() * 96, y = 80 + Math.random() * 96
        const gr = g.createRadialGradient(x, y, 10, x, y, 120)
        gr.addColorStop(0, `rgba(${r},${g2},${b},0.55)`)
        gr.addColorStop(1, `rgba(${r},${g2},${b},0)`)
        g.fillStyle = gr; g.fillRect(0, 0, 256, 256)
      }
    })
    this.nebulas = []
    ;[[112, 64, 255], [0, 184, 255], [255, 79, 216], [64, 255, 208]].forEach((c, i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: mkNebula(c[0], c[1], c[2]), transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }))
      const sc = 130 + Math.random() * 110
      sp.scale.set(sc, sc, 1)
      sp.position.set(-140 + i * 95, 20 + Math.random() * 60, -300 - i * 25)
      this.group.add(sp)
      this.nebulas.push({ sp, phase: i * 1.9 })
    })

    const planetTex = canvasTex(256, 128, (g) => {
      const cols = ['#3a5db0', '#4a72cc', '#5d86d8', '#3d5292', '#6b96e0', '#334a85']
      for (let y = 0; y < 128; y += 8) {
        g.fillStyle = cols[(y / 8) % cols.length | 0]
        g.fillRect(0, y, 256, 8)
      }
      g.fillStyle = 'rgba(255,255,255,0.08)'
      for (let i = 0; i < 14; i++) g.fillRect(Math.random() * 256, Math.random() * 128, 40 + Math.random() * 60, 3)
    })
    this.planet = new THREE.Mesh(
      new THREE.SphereGeometry(15, 48, 32),
      new THREE.MeshBasicMaterial({ map: planetTex }),
    )
    this.planet.position.set(30, 18, -170)
    this.group.add(this.planet)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(19, 30, 64),
      new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    ring.position.copy(this.planet.position)
    ring.rotation.x = 1.35; ring.rotation.y = -0.3
    this.group.add(ring)

    this.asteroids = []
    for (let i = 0; i < 16; i++) {
      const a = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.5 + Math.random() * 1.3, 0),
        new THREE.MeshLambertMaterial({ color: 0x3a3a48 }),
      )
      a.position.set(
        (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 24),
        1 + Math.random() * 14,
        -20 - Math.random() * 140,
      )
      a.rotation.set(Math.random() * 3, Math.random() * 3, 0)
      this.group.add(a)
      this.asteroids.push({ a, rs: (Math.random() - 0.5) * 1.2 })
    }

    this.streaks = []
    for (let i = 0; i < 42; i++) {
      const c = [cl, cr, 0xffffff][i % 3]
      const len = 5 + Math.random() * 9
      const s = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.05, len),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
      )
      const ang = Math.random() * Math.PI * 2, rad = 5 + Math.random() * 13
      s.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad * 0.7 + 4, -Math.random() * 200)
      this.group.add(s)
      this.streaks.push(s)
    }

    this.strips = []
    ;[[-1.6, cl], [1.6, cr]].forEach(([x, c]) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.02, 400),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
      )
      m.position.set(x, 0.02, -160)
      this.group.add(m); this.strips.push(m.material)
    })
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 460),
      new THREE.MeshBasicMaterial({ color: 0x05050f, transparent: true, opacity: 0.85 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, -0.02, -160)
    this.group.add(floor)

    const cometTex = canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 2, 64, 64, 60)
      gr.addColorStop(0, 'rgba(255,255,255,1)')
      gr.addColorStop(0.3, 'rgba(180,220,255,0.5)')
      gr.addColorStop(1, 'rgba(150,200,255,0)')
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128)
    })
    this.comet = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cometTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    this.comet.scale.set(4, 4, 1)
    this.group.add(this.comet)
    this.cometT = 4
  }
  update(dt: number, t: number) {
    super.update(dt, t)
    this.stars.rotation.y += dt * 0.006
    this.stars.rotation.z += dt * 0.003
    this.nebulas.forEach(o => {
      o.sp.material.rotation += dt * 0.02
      o.sp.material.opacity = 0.24 + 0.08 * Math.sin(t * 0.3 + o.phase) + this.pulse * 0.12
    })
    this.planet.rotation.y += dt * 0.04
    this.asteroids.forEach(o => {
      o.a.rotation.x += dt * o.rs; o.a.rotation.y += dt * o.rs * 0.7
      o.a.position.z += dt * 2.2
      if (o.a.position.z > 6) o.a.position.z = -160
    })
    const spd = 26 + this.pulse * 85
    this.streaks.forEach(s => {
      s.position.z += spd * dt
      if (s.position.z > 6) {
        const ang = Math.random() * Math.PI * 2, rad = 5 + Math.random() * 13
        s.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad * 0.7 + 4, -200)
      }
      s.material.opacity = 0.35 + this.pulse * 0.55
    })
    this.strips.forEach(m => m.opacity = 0.45 + this.pulse * 0.5)
    this.cometT -= dt
    if (this.cometT < 0) {
      this.cometT = 6 + Math.random() * 6
      this.cometStart = { x: -80 + Math.random() * 40, y: 50 + Math.random() * 30 }
      this.cometLife = 2.2
    }
    if (this.cometLife > 0) {
      this.cometLife -= dt
      const k = 1 - this.cometLife / 2.2
      this.comet.position.set(this.cometStart.x + k * 150, this.cometStart.y - k * 35, -220)
      this.comet.material.opacity = Math.sin(k * Math.PI) * 0.9
    } else this.comet.material.opacity = 0
  }
}

class MikuEnv extends BaseEnv {
  gridTex: THREE.CanvasTexture
  particles: THREE.Mesh[]
  lightBars: THREE.Group
  constructor(scene: THREE.Scene, cl: number, cr: number) {
    super(scene, cl, cr)
    scene.background = new THREE.Color(0x060a18)
    scene.fog = new THREE.Fog(0x080a20, 20, 160)

    // Grid floor
    this.gridTex = canvasTex(256, 256, (g) => {
      g.fillStyle = '#040610'; g.fillRect(0, 0, 256, 256)
      g.strokeStyle = 'rgba(57,224,224,0.6)'; g.lineWidth = 2
      for (let i = 0; i <= 4; i++) {
        g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke()
        g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke()
      }
    })
    this.gridTex.wrapS = THREE.RepeatWrapping; this.gridTex.wrapT = THREE.RepeatWrapping
    this.gridTex.repeat.set(8, 16)
    const gridGeo = new THREE.PlaneGeometry(180, 360)
    gridGeo.rotateX(-Math.PI / 2)
    const gridMat = new THREE.MeshBasicMaterial({ map: this.gridTex, transparent: true, opacity: 0.35, depthWrite: false })
    const grid = new THREE.Mesh(gridGeo, gridMat)
    grid.position.y = -4
    this.group.add(grid)

    // Particle ring
    this.particles = []
    for (let i = 0; i < 200; i++) {
      const geo = new THREE.SphereGeometry(0.03 + Math.random() * 0.06, 3, 3)
      const mat = new THREE.MeshBasicMaterial({ color: i < 100 ? cl : cr, transparent: true, opacity: 0.4 + Math.random() * 0.4, depthWrite: false })
      const p = new THREE.Mesh(geo, mat)
      const angle = Math.random() * Math.PI * 2, dist = 8 + Math.random() * 20
      p.position.set(Math.cos(angle) * dist, -2 + Math.random() * 12, -20 - Math.random() * 30)
      p.userData = { angle, dist, speed: 0.3 + Math.random() * 1.2, yBase: p.position.y, yAmp: 1 + Math.random() * 3 }
      this.group.add(p)
      this.particles.push(p)
    }

    // Floating light bars
    const lightBars = new THREE.Group()
    for (let i = 0; i < 8; i++) {
      const geo = new THREE.PlaneGeometry(0.08, 3 + Math.random() * 5)
      const mat = new THREE.MeshBasicMaterial({ color: i < 4 ? 0x39e0e0 : 0xff6ec7, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide })
      const bar = new THREE.Mesh(geo, mat)
      bar.position.set(-15 + i * 4.2, 2 + Math.random() * 8, -30 - Math.random() * 15)
      bar.rotation.z = (Math.random() - 0.5) * 0.3
      bar.userData = { osc: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() }
      lightBars.add(bar)
    }
    this.group.add(lightBars)
    this.lightBars = lightBars
  }

  update(dt: number, t: number) {
    super.update(dt, t)
    this.gridTex.offset.x += dt * 0.6
    const pulse = 1 + this.pulse * 0.2
    for (const p of this.particles) {
      p.userData.angle += dt * p.userData.speed * 0.5
      p.position.x = Math.cos(p.userData.angle) * p.userData.dist * pulse
      p.position.z += dt * 0.4
      if (p.position.z > 10) p.position.z = -40
      p.position.y = p.userData.yBase + Math.sin(p.userData.angle * 0.7 + t) * p.userData.yAmp
    }
    this.lightBars.children.forEach((bar: any) => {
      bar.material.opacity = 0.2 + Math.sin(t * bar.userData.speed + bar.userData.osc) * 0.1
    })
  }

  dispose() {
    this.gridTex.dispose()
    super.dispose()
  }
}

class GhostEnv extends BaseEnv {
  gridTex: THREE.CanvasTexture
  flames: BasicMesh[]
  centerGlow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  constructor(scene: THREE.Scene, cl: number, cr: number) {
    super(scene, cl, cr)
    scene.background = new THREE.Color(0x020208)
    scene.fog = new THREE.Fog(0x050308, 18, 140)

    // Dark grid with purple glow
    this.gridTex = canvasTex(128, 128, (g) => {
      g.fillStyle = '#020104'; g.fillRect(0, 0, 128, 128)
      g.strokeStyle = 'rgba(153,51,255,0.3)'; g.lineWidth = 1
      for (let i = 0; i <= 4; i++) {
        g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 128); g.stroke()
        g.beginPath(); g.moveTo(0, i * 32); g.lineTo(128, i * 32); g.stroke()
      }
    })
    this.gridTex.wrapS = THREE.RepeatWrapping; this.gridTex.wrapT = THREE.RepeatWrapping
    this.gridTex.repeat.set(10, 20)
    const gridGeo = new THREE.PlaneGeometry(200, 400)
    gridGeo.rotateX(-Math.PI / 2)
    const gridMat = new THREE.MeshBasicMaterial({ map: this.gridTex, transparent: true, opacity: 0.4, depthWrite: false })
    const grid = new THREE.Mesh(gridGeo, gridMat)
    grid.position.y = -5
    this.group.add(grid)

    // Ghost particles
    this.flames = []
    for (let i = 0; i < 150; i++) {
      const geo = new THREE.SphereGeometry(0.04 + Math.random() * 0.08, 4, 4)
      const alpha = 0.3 + Math.random() * 0.5
      const mat = new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0x00ffaa : i % 3 === 1 ? 0x9933ff : 0xff3388, transparent: true, opacity: alpha, depthWrite: false })
      const p = new THREE.Mesh(geo, mat)
      p.position.set((Math.random() - 0.5) * 30, -1 + Math.random() * 14, -15 - Math.random() * 40)
      p.userData = { vy: 0.5 + Math.random() * 3, life: Math.random() * 2, phase: Math.random() * Math.PI * 2 }
      this.group.add(p)
      this.flames.push(p)
    }

    // Pulsing center glow
    const glowGeo = new THREE.PlaneGeometry(40, 30)
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x9933ff, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide })
    this.centerGlow = new THREE.Mesh(glowGeo, glowMat)
    this.centerGlow.position.set(0, 4, -60)
    this.group.add(this.centerGlow)

    // Side pillars
    for (let side = -1; side <= 1; side += 2) {
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 20, 2),
        new THREE.MeshBasicMaterial({ color: 0x9933ff, transparent: true, opacity: 0.08, depthWrite: false })
      )
      pillar.position.set(side * 8, 6, -20)
      this.group.add(pillar)
    }
  }

  update(dt: number, t: number) {
    super.update(dt, t)
    this.gridTex.offset.x += dt * 1.2
    const pulse = 1 + this.pulse * 0.3
    for (const f of this.flames) {
      f.position.y += f.userData.vy * dt * pulse
      f.userData.life -= dt
      if (f.position.y > 15 || f.userData.life < 0) {
        f.position.y = -2
        f.position.x = (Math.random() - 0.5) * 30
        f.userData.life = 1.5 + Math.random() * 2
      }
      f.material.opacity = 0.1 + Math.abs(Math.sin(f.userData.life * 5 + f.userData.phase)) * 0.4
    }
    this.centerGlow.material.opacity = 0.04 + Math.sin(t * 0.5) * 0.03 + this.pulse * 0.08
  }

  dispose() {
    this.gridTex.dispose()
    super.dispose()
  }
}

// ===== Official Beat Saber default stage =====
// Light groups follow the official event semantics:
//   type 0 back lasers · 1 ring lights · 2/3 left/right rotating lasers · 4 center lights
//   type 5 color boost · 8 ring spin · 9 ring zoom · 12/13 laser rotation speed
// Values: 0 off · 1-4 right color on/flash/fade/transition · 5-8 left · 9-12 white
const _lgColor = new THREE.Color()

class LightGroup {
  intensity: number
  base: number
  colorIdx: 'L' | 'R' | 'W'
  custom: THREE.Color | null
  mats: { mat: THREE.MeshBasicMaterial | THREE.SpriteMaterial, gain: number }[]
  constructor() {
    this.intensity = 0
    this.base = 0
    this.colorIdx = 'R'
    this.custom = null
    this.mats = []
  }
  add(mat: THREE.MeshBasicMaterial | THREE.SpriteMaterial, gain = 1) { this.mats.push({ mat, gain }) }
  onEvent(value: number, f = 1, customColor?: number) {
    const v = value | 0
    if (v === 0) { this.base = 0; return }
    this.custom = customColor != null ? new THREE.Color(customColor) : null
    this.colorIdx = v <= 4 ? 'R' : v <= 8 ? 'L' : 'W'
    const kind = (v - 1) % 4 // 0=on 1=flash 2=fade 3=transition
    if (kind === 0 || kind === 3) { this.intensity = f; this.base = f }
    else if (kind === 1) { this.intensity = Math.min(1.5, f * 1.25); this.base = f }
    else { this.intensity = Math.min(1.5, f * 1.1); this.base = 0 }
  }
  update(dt: number, palette: { L: THREE.Color, R: THREE.Color, W: THREE.Color }) {
    const rate = this.base > this.intensity ? 16 : (this.base === 0 ? 4.5 : 7)
    this.intensity += (this.base - this.intensity) * (1 - Math.exp(-dt * rate))
    if (this.base === 0 && this.intensity < 0.003) this.intensity = 0
    _lgColor.copy(this.custom || palette[this.colorIdx]).multiplyScalar(this.intensity)
    for (const { mat, gain } of this.mats) mat.color.copy(_lgColor).multiplyScalar(gain)
  }
}

class OfficialEnv extends BaseEnv {
  palNormal: { L: THREE.Color, R: THREE.Color, W: THREE.Color }
  palBoost: { L: THREE.Color, R: THREE.Color, W: THREE.Color }
  boost: boolean
  groups: { back: LightGroup, ring: LightGroup, left: LightGroup, right: LightGroup, center: LightGroup }
  rings: { g: THREE.Group, angle: number, target: number, z: number, zTarget: number }[]
  ringSpacing: number
  ringSpacingTarget: number
  sideLasers: { left: { beam: THREE.Mesh, phase: number, dir: number }[], right: { beam: THREE.Mesh, phase: number, dir: number }[] }
  laserSpeed: { left: number, right: number }
  laserAngle: { left: number, right: number }
  _beatCount: number
  constructor(scene: THREE.Scene, cl: number, cr: number) {
    super(scene, cl, cr)
    scene.background = new THREE.Color(0x010104)
    scene.fog = new THREE.Fog(0x02020a, 30, 230)

    this.palNormal = { L: new THREE.Color(cl), R: new THREE.Color(cr), W: new THREE.Color(0xdfe6ff) }
    this.palBoost = {
      L: new THREE.Color(cl).offsetHSL(0.07, 0, 0.06),
      R: new THREE.Color(cr).offsetHSL(-0.07, 0, 0.06),
      W: new THREE.Color(0xffffff),
    }
    this.boost = false
    this.hasLightEvents = false

    this.groups = {
      back: new LightGroup(),
      ring: new LightGroup(),
      left: new LightGroup(),
      right: new LightGroup(),
      center: new LightGroup(),
    }

    const addMat = (opts = {}) => new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, ...opts,
    })

    // -- Runway --
    const lane = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 420),
      new THREE.MeshBasicMaterial({ color: 0x05050c }),
    )
    lane.rotation.x = -Math.PI / 2
    lane.position.set(0, 0, -170)
    this.group.add(lane)
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 420),
      new THREE.MeshBasicMaterial({ color: 0x020206 }),
    )
    apron.rotation.x = -Math.PI / 2
    apron.position.set(0, -0.02, -170)
    this.group.add(apron)

    // Track edge strips + far crossbar → center lights (type 4)
    const stripMat = addMat()
    ;[-2.25, 2.25].forEach(x => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 420), stripMat)
      s.position.set(x, 0.03, -170)
      this.group.add(s)
    })
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(36, 0.35, 0.35), stripMat)
    crossbar.position.set(0, 0.2, -150)
    this.group.add(crossbar)
    const glowTex = canvasTex(256, 256, (g) => {
      const gr = g.createRadialGradient(128, 128, 8, 128, 128, 128)
      gr.addColorStop(0, 'rgba(255,255,255,0.9)')
      gr.addColorStop(0.35, 'rgba(255,255,255,0.25)')
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256)
    })
    const sunMat = new THREE.SpriteMaterial({
      map: glowTex, color: 0x000000, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const sun = new THREE.Sprite(sunMat)
    sun.scale.set(65, 65, 1)
    sun.position.set(0, 6, -175)
    this.group.add(sun)
    this.groups.center.add(stripMat, 1)
    this.groups.center.add(sunMat, 0.22)

    // -- Ring tunnel (type 1 lights, type 8 spin, type 9 zoom) --
    this.rings = []
    this.ringSpacing = 9
    this.ringSpacingTarget = 9
    const RING_N = 12
    const S = 11, F = 0.45
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x07080e })
    for (let i = 0; i < RING_N; i++) {
      const g = new THREE.Group()
      const tubeMat = addMat()
      // 4 sides: dark frame + inner glow tube
      const sides = [
        [0, S / 2, S + F, F],   // top    [x, y, w, h]
        [0, -S / 2, S + F, F],  // bottom
        [-S / 2, 0, F, S + F],  // left
        [S / 2, 0, F, S + F],   // right
      ]
      for (const [x, y, w, h] of sides) {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), frameMat)
        frame.position.set(x, y, 0)
        g.add(frame)
        const tube = new THREE.Mesh(new THREE.BoxGeometry(w > h ? w - F * 2 : 0.12, h > w ? h - F * 2 : 0.12, 0.14), tubeMat)
        tube.position.set(x * (1 - F / S * 2), y * (1 - F / S * 2), 0.28)
        g.add(tube)
      }
      g.position.set(0, 3.2, -22 - i * this.ringSpacing)
      this.group.add(g)
      this.rings.push({ g, angle: 0, target: 0, z: g.position.z, zTarget: g.position.z })
      this.groups.ring.add(tubeMat, 1 - i * 0.03)
    }

    // -- Back laser fan (type 0): a row of emitters so beams don't stack into one hotspot --
    const backMat = addMat()
    for (let i = 0; i < 10; i++) {
      const geo = new THREE.BoxGeometry(0.08, 95, 0.08)
      geo.translate(0, 46, 0)
      const beam = new THREE.Mesh(geo, backMat)
      const k = i / 9 - 0.5
      beam.position.set(k * 20, -6, -158)
      beam.rotation.z = -k * 1.15
      this.group.add(beam)
    }
    this.groups.back.add(backMat, 0.45)

    // -- Rotating side lasers (types 2/3, speeds 12/13) --
    this.sideLasers = { left: [], right: [] }
    this.laserSpeed = { left: 1, right: 1 }
    this.laserAngle = { left: 0, right: 0 }
    for (const side of ['left', 'right']) {
      const sgn = side === 'left' ? -1 : 1
      const mat = addMat()
      for (let i = 0; i < 6; i++) {
        const geo = new THREE.BoxGeometry(0.07, 70, 0.07)
        geo.translate(0, 30, 0)
        const beam = new THREE.Mesh(geo, mat)
        beam.position.set(sgn * (14 + i * 2.2), -1.5, -55 - i * 13)
        this.group.add(beam)
        this.sideLasers[side].push({ beam, phase: i * 0.55, dir: i % 2 ? 1 : -1 })
      }
      this.groups[side].add(mat, 0.4)
    }

    // Attract state before events arrive
    this.groups.center.onEvent(1, 0.55)
    this._beatCount = 0
  }

  spin() {
    const step = (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 7 + Math.random() * Math.PI / 4)
    const twist = (Math.random() - 0.5) * 0.3
    this.rings.forEach((r, i) => { r.target += step + twist * i })
  }

  toggleZoom() {
    this.ringSpacingTarget = this.ringSpacingTarget > 11 ? 9 : 15
    this.rings.forEach((r, i) => { r.zTarget = -22 - i * this.ringSpacingTarget })
  }

  onLightEvent(ev: LightEvent) {
    switch (ev.type) {
      case 0: this.groups.back.onEvent(ev.value, ev.f, ev.c); break
      case 1: this.groups.ring.onEvent(ev.value, ev.f, ev.c); break
      case 2: this.groups.left.onEvent(ev.value, ev.f, ev.c); break
      case 3: this.groups.right.onEvent(ev.value, ev.f, ev.c); break
      case 4: this.groups.center.onEvent(ev.value, ev.f, ev.c); break
      case 5: this.boost = ev.value > 0; break
      case 8: this.spin(); break
      case 9: this.toggleZoom(); break
      case 12: this.laserSpeed.left = ev.value; break
      case 13: this.laserSpeed.right = ev.value; break
    }
  }

  onBeat(i: number) {
    super.onBeat(i)
    if (this.hasLightEvents) return
    // Built-in light show for maps without lighting data
    this._beatCount = i
    const right = i % 4 < 2
    this.groups.ring.onEvent(i % 8 === 0 ? (right ? 2 : 6) : (right ? 1 : 5), 0.85)
    if (i % 2 === 0) this.groups.back.onEvent(i % 8 === 0 ? 6 : 2, 0.9)
    if (i % 4 === 2) this.groups.center.onEvent(right ? 5 : 1, 0.8)
    this.groups.left.onEvent(right ? 7 : 3, 0.9)
    this.groups.right.onEvent(right ? 3 : 7, 0.9)
    if (i % 8 === 4) this.spin()
    if (i % 16 === 12) this.toggleZoom()
  }

  update(dt: number, t: number) {
    super.update(dt, t)
    const pal = this.boost ? this.palBoost : this.palNormal
    for (const k in this.groups) this.groups[k].update(dt, pal)

    for (const r of this.rings) {
      r.angle += (r.target - r.angle) * (1 - Math.exp(-dt * 4.5))
      r.g.rotation.z = r.angle
      r.z += (r.zTarget - r.z) * (1 - Math.exp(-dt * 3))
      r.g.position.z = r.z
    }

    for (const side of ['left', 'right']) {
      this.laserAngle[side] += dt * this.laserSpeed[side] * 0.55
      const a = this.laserAngle[side]
      const sgn = side === 'left' ? 1 : -1
      for (const l of this.sideLasers[side]) {
        l.beam.rotation.z = sgn * (0.5 + Math.sin(a * l.dir + l.phase) * 0.5)
        l.beam.rotation.x = Math.cos(a * 0.7 * l.dir + l.phase) * 0.22
      }
    }
  }
}

// ===== Shrine / Kaguya theme (torii gate + sea lanterns, heavy warm mist) =====
// Hand-built approximation of the Vivify "Reply" stage: olive-dark fog, a big torii
// silhouette backlit far ahead, and drifting paper lanterns over a dark sea.
class ShrineEnv extends BaseEnv {
  groups: { lantern: LightGroup, torii: LightGroup, left: LightGroup, right: LightGroup, back: LightGroup }
  pal: { L: THREE.Color, R: THREE.Color, W: THREE.Color }
  lanterns: { g: THREE.Group, mat: THREE.MeshBasicMaterial, glow: THREE.SpriteMaterial, phase: number, baseY: number, side: number, spd: number }[]
  toriiGlow: THREE.SpriteMaterial
  backGlow: THREE.SpriteMaterial
  glint: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  clouds: { m: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>, phase: number }[]
  sway: number
  drift: number

  constructor(scene: THREE.Scene, cl: number, cr: number) {
    super(scene, cl, cr)
    scene.background = new THREE.Color(0x0a0b04)
    scene.fog = new THREE.Fog(0x13130a, 10, 150)

    this.pal = { L: new THREE.Color(cl), R: new THREE.Color(cr), W: new THREE.Color(0xffdf8a) }
    this.groups = {
      lantern: new LightGroup(), torii: new LightGroup(),
      left: new LightGroup(), right: new LightGroup(), back: new LightGroup(),
    }
    this.sway = 0
    this.drift = 1

    // Dark sea
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(360, 300),
      new THREE.MeshBasicMaterial({ color: 0x04050a }),
    )
    sea.rotation.x = -Math.PI / 2
    sea.position.set(0, -0.06, -120)
    this.group.add(sea)
    const glintTex = canvasTex(64, 512, (g) => {
      const gr = g.createLinearGradient(0, 0, 64, 0)
      gr.addColorStop(0, 'rgba(255,220,140,0)')
      gr.addColorStop(0.5, 'rgba(255,220,140,0.7)')
      gr.addColorStop(1, 'rgba(255,220,140,0)')
      g.fillStyle = gr
      for (let y = 0; y < 512; y += 12) g.fillRect(0, y, 64, 6)
    })
    this.glint = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 90),
      new THREE.MeshBasicMaterial({ map: glintTex, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    this.glint.rotation.x = -Math.PI / 2
    this.glint.position.set(0, 0.02, -55)
    this.group.add(this.glint)

    // Torii gate silhouette
    const torii = new THREE.Group()
    const dark = new THREE.MeshBasicMaterial({ color: 0x1d0b06 })
    ;[-9, 9].forEach(x => {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 17, 1.9), dark)
      pillar.position.set(x, 8.5, 0)
      pillar.rotation.z = x < 0 ? 0.035 : -0.035
      torii.add(pillar)
    })
    const kasagi = new THREE.Mesh(new THREE.BoxGeometry(27, 2, 2.3), dark)
    kasagi.position.y = 17.6
    torii.add(kasagi)
    const kasagiTop = new THREE.Mesh(new THREE.BoxGeometry(28.5, 0.9, 2.5), dark)
    kasagiTop.position.y = 18.9
    torii.add(kasagiTop)
    const shimaki = new THREE.Mesh(new THREE.BoxGeometry(23, 1, 1.9), dark)
    shimaki.position.y = 15.9
    torii.add(shimaki)
    const nuki = new THREE.Mesh(new THREE.BoxGeometry(21.5, 0.95, 1.5), dark)
    nuki.position.y = 11.6
    torii.add(nuki)
    const gakuzuka = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.4, 1.2), dark)
    gakuzuka.position.y = 13.7
    torii.add(gakuzuka)
    torii.position.set(0, 0, -50)
    this.group.add(torii)

    const glowTex = canvasTex(256, 256, (g) => {
      const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128)
      gr.addColorStop(0, 'rgba(255,214,120,0.85)')
      gr.addColorStop(0.4, 'rgba(255,190,90,0.28)')
      gr.addColorStop(1, 'rgba(255,170,70,0)')
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256)
    })
    this.toriiGlow = new THREE.SpriteMaterial({
      map: glowTex, color: 0xffca70, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const tg = new THREE.Sprite(this.toriiGlow)
    tg.scale.set(58, 42, 1)
    tg.position.set(0, 10, -56)
    this.group.add(tg)
    this.backGlow = new THREE.SpriteMaterial({
      map: glowTex, color: 0xd9a24f, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const bg = new THREE.Sprite(this.backGlow)
    bg.scale.set(150, 70, 1)
    bg.position.set(0, 12, -90)
    this.group.add(bg)

    // Floating paper lanterns over the sea
    this.lanterns = []
    const paperTex = canvasTex(64, 64, (g) => {
      g.fillStyle = '#ffe9b0'; g.fillRect(0, 0, 64, 64)
      g.fillStyle = 'rgba(120,70,20,0.35)'
      g.fillRect(0, 0, 64, 5); g.fillRect(0, 59, 64, 5)
      g.fillRect(0, 30, 64, 2)
    })
    const lanternGlowTex = canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 6, 64, 64, 64)
      gr.addColorStop(0, 'rgba(255,225,140,0.9)')
      gr.addColorStop(0.5, 'rgba(255,205,110,0.28)')
      gr.addColorStop(1, 'rgba(255,190,90,0)')
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128)
    })
    for (let i = 0; i < 64; i++) {
      const side = Math.random() < 0.5 ? -1 : 1
      const s = 0.28 + Math.random() * 0.5
      const mat = new THREE.MeshBasicMaterial({ map: paperTex, color: 0xffe2a0 })
      const box = new THREE.Mesh(new THREE.BoxGeometry(s, s * (1 + Math.random() * 0.3), s), mat)
      const glow = new THREE.SpriteMaterial({
        map: lanternGlowTex, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
      const sp = new THREE.Sprite(glow)
      sp.scale.set(s * 4.2, s * 4.2, 1)
      const g = new THREE.Group()
      g.add(box); g.add(sp)
      const baseY = 0.15 + Math.pow(Math.random(), 1.6) * 7
      g.position.set(side * (3.2 + Math.random() * 26), baseY, -8 - Math.random() * 80)
      this.group.add(g)
      this.lanterns.push({ g, mat, glow, phase: Math.random() * 6.28, baseY, side, spd: 0.2 + Math.random() * 0.5 })
    }

    // Overhead canopy: dark mottled clouds pressing down
    const cloudTex = canvasTex(256, 128, (g) => {
      g.fillStyle = '#0e0e05'; g.fillRect(0, 0, 256, 128)
      for (let i = 0; i < 26; i++) {
        const x = Math.random() * 256, y = Math.random() * 128
        const r = 14 + Math.random() * 34
        const gr = g.createRadialGradient(x, y, 2, x, y, r)
        gr.addColorStop(0, 'rgba(46,44,16,0.55)')
        gr.addColorStop(1, 'rgba(20,20,8,0)')
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2)
      }
    })
    cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping
    this.clouds = []
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(240, 140),
        new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.92 - i * 0.25, depthWrite: false }),
      )
      m.rotation.x = Math.PI / 2
      m.position.set(0, 13 + i * 4, -60)
      this.group.add(m)
      this.clouds.push({ m, phase: i * 2.4 })
    }
  }

  onLightEvent(ev: LightEvent) {
    switch (ev.type) {
      case 0: this.groups.back.onEvent(ev.value, ev.f, ev.c); break
      case 1: this.groups.lantern.onEvent(ev.value, ev.f, ev.c); break
      case 2: this.groups.left.onEvent(ev.value, ev.f, ev.c); break
      case 3: this.groups.right.onEvent(ev.value, ev.f, ev.c); break
      case 4: this.groups.torii.onEvent(ev.value, ev.f, ev.c); break
      case 8: this.sway = 1; break
      case 12: this.drift = Math.max(0.4, ev.value || 1); break
      case 13: this.drift = Math.max(0.4, ev.value || 1); break
    }
  }

  onBeat(i: number) {
    super.onBeat(i)
    if (this.hasLightEvents) return
    this.groups.lantern.onEvent(i % 4 === 0 ? 2 : 1, 0.8)
    if (i % 4 === 2) this.groups.torii.onEvent(2, 0.9)
    if (i % 8 === 4) this.sway = 1
  }

  update(dt: number, t: number) {
    super.update(dt, t)
    for (const k in this.groups) this.groups[k].update(dt, this.pal)
    this.sway *= Math.exp(-dt * 1.2)

    // Warm ambient floor + event-driven boosts (a shrine never goes fully dark)
    const gLant = 0.5 + 0.65 * this.groups.lantern.intensity
    const gL = 0.75 + 0.6 * this.groups.left.intensity
    const gR = 0.75 + 0.6 * this.groups.right.intensity
    const warm = this.pal.W

    for (const l of this.lanterns) {
      const flick = 0.72 + 0.28 * Math.sin(t * 1.9 + l.phase) * (1 + this.sway * 1.5)
      const k = Math.min(1.6, flick * gLant * (l.side < 0 ? gL : gR))
      l.mat.color.copy(warm).multiplyScalar(0.55 + k * 0.6)
      l.glow.opacity = 0.3 + k * 0.45
      l.g.position.y = l.baseY + Math.sin(t * l.spd + l.phase) * (0.25 + this.sway * 0.6)
      l.g.position.z += dt * 0.7 * this.drift
      l.g.rotation.y += dt * 0.2
      if (l.g.position.z > -4) l.g.position.z = -88
    }

    this.toriiGlow.opacity = 0.5 + 0.45 * this.groups.torii.intensity + this.pulse * 0.1
    this.backGlow.opacity = 0.24 + 0.4 * this.groups.back.intensity
    this.glint.material.opacity = 0.1 + 0.1 * Math.sin(t * 2.2) + 0.2 * this.groups.torii.intensity
    this.clouds.forEach(c => { (c.m.material.map as THREE.Texture).offset.x += dt * 0.004; c.m.position.x = Math.sin(t * 0.03 + c.phase) * 5 })
  }
}

export function createEnv(id: string, scene: THREE.Scene, colorL: number, colorR: number): BaseEnv {
  switch (id) {
    case 'neon': return new NeonEnv(scene, colorL, colorR)
    case 'ink': return new InkEnv(scene, colorL, colorR)
    case 'space': return new SpaceEnv(scene, colorL, colorR)
    case 'miku': return new MikuEnv(scene, colorL, colorR)
    case 'ghost': return new GhostEnv(scene, colorL, colorR)
    case 'official': return new OfficialEnv(scene, colorL, colorR)
    case 'shrine': return new ShrineEnv(scene, colorL, colorR)
  }
  return new BaseEnv(scene, colorL, colorR)
}
