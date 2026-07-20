import * as THREE from 'three'
import { Trail } from './Trail'
import { SABER_Z } from './constants'

export class Saber {
  hand: string
  color: number
  style: string
  pos: THREE.Vector3
  prev: THREE.Vector3
  vel: THREE.Vector3
  speed: number
  rx: number
  rz: number
  tassel: THREE.Mesh
  glow1: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>
  glow2: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>
  dust: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
  light: THREE.PointLight
  group: THREE.Group
  trail: Trail
  tipV: THREE.Vector3
  baseV: THREE.Vector3
  prevTipV: THREE.Vector3
  prevBaseV: THREE.Vector3
  _vrInit: boolean
  _vrLogCount: number

  constructor(hand, color, style, textures) {
    this.hand = hand
    this.color = color
    this.style = style
    this.pos = new THREE.Vector3(hand === 'L' ? -0.5 : 0.5, 1.15, SABER_Z)
    this.prev = this.pos.clone()
    this.vel = new THREE.Vector3()
    this.speed = 0
    this.rx = -0.45
    this.rz = 0

    const g = new THREE.Group()
    const handleGeo = style === 'neon'
      ? new THREE.CylinderGeometry(0.034, 0.042, 0.3, 6)
      : new THREE.CylinderGeometry(0.034, 0.04, 0.3, 16)
    const handle = new THREE.Mesh(handleGeo, new THREE.MeshLambertMaterial({ color: 0x181820 }))
    handle.position.y = 0
    g.add(handle)

    const accent = style === 'ink' ? 0xd8b45a : color
    ;[[0.145, 0.045], [-0.13, 0.042]].forEach(([y, r]) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.009, 8, 24),
        new THREE.MeshBasicMaterial({ color: accent }),
      )
      ring.rotation.x = Math.PI / 2
      ring.position.y = y
      g.add(ring)
    })

    if (style === 'ink') {
      const tassel = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.14, 0.02),
        new THREE.MeshLambertMaterial({ color: 0xbb2222 }),
      )
      tassel.position.y = -0.24
      g.add(tassel)
      this.tassel = tassel
    }

    const BL = 1.05
    const by = 0.15 + BL / 2
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, BL, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    )
    core.position.y = by
    g.add(core)

    this.glow1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, BL * 1.01, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    this.glow1.position.y = by
    g.add(this.glow1)

    this.glow2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, BL * 1.03, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    this.glow2.position.y = by
    g.add(this.glow2)

    const tipGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: textures.glowTex, color, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    tipGlow.scale.set(0.3, 0.3, 1)
    tipGlow.position.y = 0.15 + BL
    g.add(tipGlow)

    if (style === 'space') {
      const n = 10
      const pos = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 0.16
        pos[i * 3 + 1] = 0.2 + Math.random() * BL
        pos[i * 3 + 2] = (Math.random() - 0.5) * 0.16
      }
      const sg = new THREE.BufferGeometry()
      sg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      this.dust = new THREE.Points(sg, new THREE.PointsMaterial({
        map: textures.sparkTex, color: 0xffffff, size: 0.07, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }))
      g.add(this.dust)
    }

    this.light = new THREE.PointLight(color, 1.1, 7)
    this.light.position.y = by
    g.add(this.light)

    g.position.copy(this.pos)
    g.rotation.x = this.rx
    this.group = g
    this.trail = new Trail(color)

    this.tipV = new THREE.Vector3()
    this.baseV = new THREE.Vector3()
    this.prevTipV = new THREE.Vector3()
    this.prevBaseV = new THREE.Vector3()
    this._vrInit = false
  }

  addToScene(scene) {
    scene.add(this.group)
    scene.add(this.trail.mesh)
  }

  attachTo(parent, vr) {
    if (this.group.parent) this.group.parent.remove(this.group)
    parent.add(this.group)
    if (vr) {
      this.group.position.set(0, 0, -0.03)
      this.group.rotation.set(-Math.PI / 2, 0, 0)
      this._vrInit = false
    }
  }

  _fx(dt) {
    if (this.style === 'neon') {
      this.glow1.material.opacity = 0.48 + Math.random() * 0.16
      this.glow2.material.opacity = 0.13 + Math.random() * 0.07
    }
    if (this.dust) {
      this.dust.rotation.y += dt * 3
      this.dust.material.opacity = 0.5 + 0.4 * Math.sin(performance.now() * 0.006)
    }
    if (this.tassel) this.tassel.rotation.z = THREE.MathUtils.clamp(this.vel.x * 0.06, -0.9, 0.9)
  }

  _sampleBlade() {
    this.prevTipV.copy(this.tipV)
    this.prevBaseV.copy(this.baseV)
    this.group.updateMatrixWorld(true)
    this.tipV.set(0, 1.22, 0)
    this.group.localToWorld(this.tipV)
    this.baseV.set(0, 0.05, 0)
    this.group.localToWorld(this.baseV)
    if (!this._vrInit) {
      this.prevTipV.copy(this.tipV)
      this.prevBaseV.copy(this.baseV)
      this._vrInit = true
    }
  }

  update(dt, tx, ty) {
    this.prev.copy(this.pos)
    const k = 1 - Math.exp(-dt * 28)
    this.pos.x += (tx - this.pos.x) * k
    this.pos.y += (ty - this.pos.y) * k
    this.vel.set((this.pos.x - this.prev.x) / dt, (this.pos.y - this.prev.y) / dt, 0)
    this.speed = this.vel.length()
    this.group.position.copy(this.pos)
    const trx = -0.45 + THREE.MathUtils.clamp(this.vel.y * 0.035, -0.45, 0.45)
    const trz = THREE.MathUtils.clamp(-this.vel.x * 0.04, -0.6, 0.6)
    const rk = 1 - Math.exp(-dt * 14)
    this.rx += (trx - this.rx) * rk
    this.rz += (trz - this.rz) * rk
    this.group.rotation.set(this.rx, 0, this.rz)
    this._sampleBlade()
    this.trail.update(this.tipV, this.baseV)
    this._fx(dt)
  }

  updateVR(dt, pos, quat) {
    this.group.position.set(pos.x, pos.y, pos.z)
    const gripQuat = new THREE.Quaternion(quat.x, quat.y, quat.z, quat.w)
    const saberRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
    this.group.quaternion.copy(gripQuat).multiply(saberRot)
    this._sampleBlade()
    this.vel.subVectors(this.tipV, this.prevTipV).divideScalar(dt || 1e-4)
    this.speed = this.vel.length()
    this.trail.update(this.tipV, this.baseV)
    this._fx(dt)
    if (!this._vrLogCount) this._vrLogCount = 0
    if (this._vrLogCount < 5 || this._vrLogCount % 60 === 0) {
      console.log('[Saber-VR]', this.hand, 'pos=', pos.x.toFixed(2), pos.y.toFixed(2), pos.z.toFixed(2),
        'quat=', quat.x.toFixed(2), quat.y.toFixed(2), quat.z.toFixed(2), quat.w.toFixed(2),
        'tipWorld=', this.tipV.x.toFixed(2), this.tipV.y.toFixed(2), this.tipV.z.toFixed(2),
        'speed=', this.speed.toFixed(2))
    }
    this._vrLogCount++
  }

  updateFromHand(dt, hand) {
    if (hand && hand.joints) {
      const w = hand.joints['wrist']
      const m = hand.joints['middle-finger-metacarpal'] || hand.joints['middle-finger-phalanx-proximal']
      if (w && m) {
        const hw = new THREE.Vector3()
        const hm = new THREE.Vector3()
        const hd = new THREE.Vector3()
        hw.setFromMatrixPosition(w.matrixWorld)
        hm.setFromMatrixPosition(m.matrixWorld)
        hd.subVectors(hm, hw)
        if (hd.lengthSq() > 1e-8) {
          hd.normalize()
          this.group.position.copy(hm)
          const hq = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0), hd,
          )
          this.group.quaternion.slerp(hq, 1 - Math.exp(-dt * 30))
        }
      }
    }
    this._sampleBlade()
    this.vel.subVectors(this.tipV, this.prevTipV).divideScalar(dt || 1e-4)
    this.speed = this.vel.length()
    this.trail.update(this.tipV, this.baseV)
    this._fx(dt)
  }

  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group)
    if (this.trail.mesh.parent) this.trail.mesh.parent.remove(this.trail.mesh)
    this.group.traverse((o: any) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) o.material.dispose()
    })
    this.trail.dispose()
  }
}
