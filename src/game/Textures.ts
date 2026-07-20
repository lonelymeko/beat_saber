import * as THREE from 'three'

function makeTex(w, h, fn) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  fn(c.getContext('2d'), w, h)
  return new THREE.CanvasTexture(c)
}

let cached = null

export function initTextures() {
  if (cached) return cached

  // Official-style face: a wide thick chevron (no stem), rounded corners, strong glow
  const arrowTex = makeTex(128, 128, (g) => {
    g.shadowColor = 'rgba(255,255,255,0.95)'
    g.shadowBlur = 14
    g.fillStyle = '#fff'
    g.strokeStyle = '#fff'
    g.lineWidth = 10
    g.lineJoin = 'round'
    g.beginPath()
    g.moveTo(18, 88)
    g.lineTo(64, 38)
    g.lineTo(110, 88)
    g.lineTo(86, 88)
    g.lineTo(64, 64)
    g.lineTo(42, 88)
    g.closePath()
    g.fill()
    g.stroke()
  })

  const dotTex = makeTex(128, 128, (g) => {
    g.shadowColor = 'rgba(255,255,255,0.95)'
    g.shadowBlur = 14
    g.fillStyle = '#fff'
    g.beginPath()
    g.arc(64, 64, 27, 0, Math.PI * 2)
    g.fill()
  })

  const glowTex = makeTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64)
    gr.addColorStop(0, 'rgba(255,255,255,1)')
    gr.addColorStop(0.35, 'rgba(255,255,255,0.35)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 128, 128)
  })

  const sparkTex = makeTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,255,255,1)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 64, 64)
  })

  const hotTex = makeTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 8, 64, 64, 84)
    gr.addColorStop(0, 'rgba(255,255,255,0.5)')
    gr.addColorStop(0.7, 'rgba(255,255,255,0.18)')
    gr.addColorStop(1, 'rgba(255,255,255,0.05)')
    g.fillStyle = gr
    g.fillRect(0, 0, 128, 128)
    g.lineWidth = 9
    g.strokeStyle = 'rgba(255,255,255,1)'
    g.shadowColor = '#fff'
    g.shadowBlur = 16
    g.strokeRect(5, 5, 118, 118)
    g.strokeRect(5, 5, 118, 118)
  })

  cached = {
    arrowTex,
    dotTex,
    glowTex,
    sparkTex,
    hotTex,
    arrowMat: new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, depthWrite: false }),
    dotMat: new THREE.MeshBasicMaterial({ map: dotTex, transparent: true, depthWrite: false }),
    arrowGlowMat: new THREE.MeshBasicMaterial({
      map: arrowTex, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
    dotGlowMat: new THREE.MeshBasicMaterial({
      map: dotTex, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  }
  return cached
}

export function makeEnvMap(renderer) {
  try {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 256
    const g = c.getContext('2d')
    const gr = g.createLinearGradient(0, 0, 0, 256)
    gr.addColorStop(0, '#46507e')
    gr.addColorStop(0.42, '#151b30')
    gr.addColorStop(0.55, '#06080f')
    gr.addColorStop(1, '#020309')
    g.fillStyle = gr
    g.fillRect(0, 0, 512, 256)

    const streak = (x, y, w2, h2, col, blur) => {
      g.save()
      g.shadowColor = col
      g.shadowBlur = blur
      g.fillStyle = col
      g.beginPath()
      g.rect(x, y, w2, h2)
      g.fill()
      g.restore()
    }
    streak(30, 28, 130, 12, 'rgba(255,255,255,0.95)', 26)
    streak(220, 20, 90, 10, 'rgba(255,255,255,0.85)', 22)
    streak(380, 32, 110, 12, 'rgba(255,255,255,0.9)', 26)
    streak(80, 88, 70, 8, 'rgba(255,120,230,0.8)', 20)
    streak(300, 96, 80, 8, 'rgba(90,220,255,0.8)', 20)
    streak(440, 84, 50, 8, 'rgba(255,210,120,0.7)', 18)

    const tex = new THREE.CanvasTexture(c)
    tex.mapping = THREE.EquirectangularReflectionMapping
    const pmrem = new THREE.PMREMGenerator(renderer)
    const rt = pmrem.fromEquirectangular(tex)
    tex.dispose()
    pmrem.dispose()
    return rt.texture
  } catch (e) {
    console.warn('环境贴图生成失败', e)
    return null
  }
}
