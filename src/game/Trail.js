import * as THREE from 'three'

export class Trail {
  constructor(color) {
    this.N = 14
    this.pts = []
    const pos = new Float32Array(this.N * 2 * 3)
    const col = new Float32Array(this.N * 2 * 3)
    const c = new THREE.Color(color)
    for (let i = 0; i < this.N; i++) {
      const k = Math.pow(1 - i / (this.N - 1), 1.7) * 0.85
      for (let j = 0; j < 2; j++) {
        col[(i * 2 + j) * 3] = c.r * k
        col[(i * 2 + j) * 3 + 1] = c.g * k
        col[(i * 2 + j) * 3 + 2] = c.b * k
      }
    }
    const idx = []
    for (let i = 0; i < this.N - 1; i++) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    this.geo = new THREE.BufferGeometry()
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    this.geo.setIndex(idx)
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }))
    this.mesh.frustumCulled = false
    this.inited = false
  }

  update(tip, base) {
    if (!this.inited) {
      for (let i = 0; i < this.N; i++) this.pts.push({ t: tip.clone(), b: base.clone() })
      this.inited = true
    }
    this.pts.pop()
    this.pts.unshift({ t: tip.clone(), b: base.clone() })
    const p = this.geo.attributes.position.array
    for (let i = 0; i < this.N; i++) {
      const o = i * 6
      p[o] = this.pts[i].t.x
      p[o + 1] = this.pts[i].t.y
      p[o + 2] = this.pts[i].t.z
      p[o + 3] = this.pts[i].b.x
      p[o + 4] = this.pts[i].b.y
      p[o + 5] = this.pts[i].b.z
    }
    this.geo.attributes.position.needsUpdate = true
  }

  dispose() {
    this.geo.dispose()
    this.mesh.material.dispose()
  }
}
