import * as THREE from 'three'
import { ref } from 'vue'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Synth, MusicPlayer } from '../audio/Synth'
import { SONGS } from '../audio/songs'
import { searchBeatSaver, downloadBeatMap, loadBuiltinMap } from '../audio/beatsaver'
import { saveMap, loadAllMaps, deleteMap } from '../audio/storage'
import { analyzeAudioBuffer } from '../audio/analyzer'
import { initTextures, makeEnvMap } from '../game/Textures'
import { Saber } from '../game/Saber'
import { VRHUD } from '../game/vrHUD'
import { createNoteMesh, createWallMesh, createHalves, createBurst, releaseBurst, createFloatingText, createArcMesh, setGeometries } from '../game/Note'
import { createEnv } from '../env/index'
import { log, dumpLog, startLog } from './vrlog'
import {
  LANE_X, ROW_Y, SABER_Z, SPAWN_DIST, MISS_Z,
  CUT_WINDOW, CUT_RADIUS, MIN_SPEED, DIR_VEC, NEED, MULT, RING_C,
} from '../game/constants'

export function useGame() {
  // ========== State ==========
  const state = ref('menu')
  const auto = ref(false)
  const invincible = ref(false)
  const invincibleUsed = ref(false)
  const songIdx = ref(0)
  const meta = ref(null)
  const score = ref(0)
  const combo = ref(0)
  const maxCombo = ref(0)
  const acc = ref('100.0%')
  const mult = ref('x1')
  const energy = ref(0.5)
  const progress = ref(0)
  const songLabel = ref('')
  const rank = ref('S')
  const rScore = ref('0')
  const rAcc = ref('0%')
  const rCombo = ref('0')
  const rHits = ref('0 / 0')
  const resultsTitle = ref('通关！')
  const failSub = ref('')
  const countdownNum = ref('')
  const countdownVisible = ref(false)
  const xrSupported = ref(false)
  const xrActive = ref(false)
  const downloadProgress = ref({ stage: '', pct: 0 })
  const songListVersion = ref(0)
  // Local song loading toast: { active, label, pct (-1 = indeterminate) }
  const localLoad = ref({ active: false, label: '', pct: -1 })
  // Graphics quality: high = full bloom, medium = half-res bloom, low = no post-processing
  const quality = ref(localStorage.getItem('bs_quality') || 'high')

  // ========== Three.js Core ==========
  let renderer, scene, camera, composer, clock
  let synth, player
  let env
  let saberL, saberR
  let envTex
  let textures
  let vrHUD = null
  let noteGeo, arrowGeo, faceGlowGeo, bombGeo, halfGeo, hotGeo, hotTexGeo, arrowMat, dotMat, arrowGlowMat, dotGlowMat, bombMat, wallMat
  let matL, matR

  // ========== Game State ==========
  let G: any = {
    startAt: 0, t: -10, lastBeat: -1, lastCount: 99,
    noteIdx: 0, wallIdx: 0, lightIdx: 0, arcIdx: 0,
    notes: [], walls: [], halves: [], bursts: [], texts: [], arcs: [],
    com: 0, jud: 0, hits: 0,
    level: 0, prog: 0, en: 0.5,
    cumMax: [], totalNotes: 0,
    lean: 0, leanTarget: 0, shake: 0,
    hitZ: SABER_Z,
    mouse: { x: 0.35, y: 0.3 },
    song: null,
    pausedByBlur: false,
    warm: null,
  }

  const XR = {
    supported: false, active: false, session: null,
    ctrlL: null, ctrlR: null, srcL: null, srcR: null,
    handL: null, handR: null, useHands: false, pinchL: 0, pinchR: 0,
    wallHapT: 0,
  }

  let animFrameId = null

  // ========== Init ==========
  function init(canvas) {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false, canvas })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x050510, 1)
    renderer.xr.enabled = true
    renderer.xr.setReferenceSpaceType('local-floor')

    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 600)
    camera.position.set(0, 1.7, 0)

    scene.add(new THREE.AmbientLight(0x8890b0, 0.75))
    const dl = new THREE.DirectionalLight(0xffffff, 0.8)
    dl.position.set(2, 6, 3)
    scene.add(dl)

    rebuildComposer()

    envTex = makeEnvMap(renderer)

    textures = initTextures()

    const RB = RoundedBoxGeometry
    noteGeo = RB ? new RB(0.5, 0.5, 0.5, 4, 0.075) : new THREE.BoxGeometry(0.5, 0.5, 0.5)
    halfGeo = RB ? new RB(0.5, 0.24, 0.5, 3, 0.05) : new THREE.BoxGeometry(0.5, 0.24, 0.5)
    arrowGeo = new THREE.PlaneGeometry(0.32, 0.32)
    faceGlowGeo = new THREE.PlaneGeometry(0.42, 0.42)
    bombGeo = new THREE.IcosahedronGeometry(0.23, 1)
    hotTexGeo = new THREE.PlaneGeometry(0.46, 0.46)
    hotGeo = hotTexGeo
    bombMat = new THREE.MeshStandardMaterial({
      color: 0x0d0d13, metalness: 0.92, roughness: 0.32,
      envMap: envTex, envMapIntensity: 1.1,
      emissive: 0x330000, emissiveIntensity: 1,
    })
    wallMat = new THREE.MeshBasicMaterial({ color: 0xff2233, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })

    setGeometries({
      noteGeo, arrowGeo, faceGlowGeo, bombGeo, halfGeo, hotGeo, hotTexGeo,
      bombMat, wallMat,
    })

    clock = new THREE.Clock()

    window.addEventListener('resize', () => {
      if (XR.active) return
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
      if (composer) composer.setSize(window.innerWidth, window.innerHeight)
    })

    checkXRSupport()
    // First user gesture unlocks audio → start menu music
    const unlockAudio = () => {
      window.removeEventListener('pointerdown', unlockAudio)
      ensureAudio()
      if (state.value === 'menu') synth.startMenuMusic()
    }
    window.addEventListener('pointerdown', unlockAudio)
    // Load bundled + saved maps in parallel, adding songs to the list as each arrives
    const addSong = (s: any) => {
      if (SONGS.find(existing => existing.id === s.id)) return
      SONGS.push(s)
      songListVersion.value++
    }
    localLoad.value = { active: true, label: '读取本地歌曲…', pct: -1 }
    loadAllMaps((song, i, total) => {
      addSong(song)
      localLoad.value = { active: true, label: `读取已下载歌曲 ${i}/${total}…`, pct: total ? Math.round(i / total * 100) : -1 }
    }).catch(e => console.error('loadAllMaps failed:', e)).then(() => {
      // Bundled map: fetch only if it isn't cached in IndexedDB yet, then cache it
      if (SONGS.find(existing => existing.id === 'bs_4f454')) return
      return loadBuiltinMap('4f454', '/builtin/4f454.zip', (stage, pct) => {
        localLoad.value = {
          active: true,
          label: stage === 'parsing' ? '解析内置歌曲 Reply…' : '下载内置歌曲 Reply…',
          pct: stage === 'parsing' ? -1 : pct,
        }
      }).then(song => {
        addSong(song)
        log('builtin-map-loaded', song.name)
        saveMap(song.id, song).catch(e => console.error('builtin saveMap failed:', e))
      }).catch(e => console.error('builtin map load failed:', e))
    }).finally(() => {
      localLoad.value = { active: false, label: '', pct: -1 }
    })
    scheduleFrame()
  }

  function scheduleFrame() {
    if (XR.active) return
    animFrameId = requestAnimationFrame((time) => {
      tick(time, null)
    })
  }

  function onXRSessionEnd() {
    XR.active = false
    XR.session = null
    XR.ctrlL = null; XR.ctrlR = null
    XR.srcL = null; XR.srcR = null
    xrActive.value = false
    cleanupVRMenu()
    if (vrHUD) { vrHUD.dispose(); vrHUD = null }
    renderer.setAnimationLoop(null)
    if (state.value === 'vrmenu') {
      if (env) { env.dispose(); env = null }
      state.value = 'menu'
    }
    scheduleFrame()
  }

  function checkXRSupport() {
    if (navigator.xr) {
      navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
        XR.supported = supported
        xrSupported.value = supported
      })
    }
  }

  let coloredMatCache = new Map()
  function initSongAssets(meta) {
    const dim = (c) => new THREE.Color(c).multiplyScalar(0.55)
    const metal = (c) => new THREE.MeshStandardMaterial({
      color: dim(c), metalness: 0.88, roughness: 0.42,
      envMap: envTex, envMapIntensity: 1.35,
      emissive: c, emissiveIntensity: 0.3,
    })
    matL = metal(meta.colorL)
    matR = metal(meta.colorR)
    coloredMatCache.forEach(m => m.dispose())
    coloredMatCache = new Map()

    return { matL, matR, bombMat, textures, hotGeo }
  }

  // Chroma per-note colors: cached metal material per hex
  function coloredMat(hex) {
    let m = coloredMatCache.get(hex)
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(hex).multiplyScalar(0.55), metalness: 0.88, roughness: 0.42,
        envMap: envTex, envMapIntensity: 1.35,
        emissive: hex, emissiveIntensity: 0.3,
      })
      coloredMatCache.set(hex, m)
    }
    return m
  }

  // ========== Spawn ==========
  function spawnNote(d, mats) {
    const g = createNoteMesh(d, mats, textures)
    g.position.z = G.hitZ - SPAWN_DIST
    scene.add(g)
    G.notes.push({ d, g, cut: false, missed: false })
  }

  function spawnWall(w, speed) {
    const { m, len } = createWallMesh(w, speed, G.hitZ)
    scene.add(m)
    G.walls.push({ w, m, len })
  }

  function spawnArc(a) {
    const color = a.c === 0 ? meta.value.colorL : meta.value.colorR
    const m = createArcMesh(a, meta.value.speed, color)
    m.position.z = G.hitZ - SPAWN_DIST
    scene.add(m)
    G.arcs.push({ a, m })
  }

  function spawnBurst(pos, color, n = 14, size = 0.12, spd = 5) {
    const b = createBurst(pos, color, textures, n, size, spd)
    scene.add(b.pts)
    scene.add(b.flash)
    G.bursts.push(b)
  }

  function spawnText(pos, str, color) {
    const t = createFloatingText(pos, str, color)
    scene.add(t.sp)
    G.texts.push(t)
  }

  // ========== Clear ==========
  function clearPlayfield() {
    G.notes.forEach(n => scene.remove(n.g))
    G.arcs.forEach(o => { scene.remove(o.m); o.m.geometry.dispose(); o.m.material.dispose() })
    G.walls.forEach(w => { scene.remove(w.m); w.m.geometry.dispose(); (w.m.userData.ownMats || []).forEach(mm => mm.dispose()) })
    G.halves.forEach(h => { scene.remove(h.m); h.m.children.forEach(c => { if (c.material) c.material.dispose() }) })
    G.bursts.forEach(b => { scene.remove(b.pts); scene.remove(b.flash); releaseBurst(b) })
    G.texts.forEach(t => { scene.remove(t.sp); if (t.tex) t.tex.dispose(); t.sp.material.dispose() })
    G.notes = []; G.walls = []; G.halves = []; G.bursts = []; G.texts = []; G.arcs = []
  }

  // ========== Scoring ==========
  function multNeed() { return G.level < 3 ? NEED[G.level] : Infinity }

  function addCombo() {
    G.com++
    G.maxCombo = Math.max(G.maxCombo, G.com)
    G.prog++
    if (G.prog >= multNeed()) { G.level = Math.min(3, G.level + 1); G.prog = 0 }
    combo.value = G.com
  }

  function breakCombo() {
    G.com = 0
    G.level = Math.max(0, G.level - 1)
    G.prog = 0
    combo.value = 0
  }

  function addEnergy(v) {
    if (auto.value && v < 0) return
    G.en = THREE.MathUtils.clamp(G.en + v, 0, 1)
    energy.value = G.en
    if (G.en <= 0 && state.value === 'playing') {
      if (invincible.value) {
        if (!_invincibleUsed) {
          _invincibleUsed = true
          invincibleUsed.value = true
          G.score = Math.round(G.score * 0.5)
          score.value = Math.round(G.score)
          log('invincible-trigger', 'score halved permanently')
        }
        G.en = 0.01
        energy.value = 0.01
      } else {
        failSong()
      }
    }
  }

  function updateHUD() {
    score.value = Math.round(G.score)
    const accMax = G.jud > 0 ? G.cumMax[Math.min(G.jud, G.cumMax.length - 1)] : 0
    acc.value = accMax > 0 ? ((G.score / accMax) * 100).toFixed(1) + '%' : '100.0%'
    mult.value = 'x' + MULT[G.level]
  }

  // ========== Cut detection ==========
  function distToSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay
    const l2 = dx * dx + dy * dy
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0
    t = THREE.MathUtils.clamp(t, 0, 1)
    const cx = ax + t * dx, cy = ay + t * dy
    return Math.hypot(px - cx, py - cy)
  }

  function distPointSeg3(p, a, b) {
    const sv1 = new THREE.Vector3().subVectors(b, a)
    const l2 = sv1.lengthSq()
    let t = l2 > 0 ? new THREE.Vector3().subVectors(p, a).dot(sv1) / l2 : 0
    t = THREE.MathUtils.clamp(t, 0, 1)
    const sv3 = new THREE.Vector3().copy(a).addScaledVector(sv1, t)
    return sv3.distanceTo(p)
  }

  function removeNote(note) {
    note.cut = true
    scene.remove(note.g)
  }

  // Controller haptics (official-style: short strong pulse on good cut, harsher on errors)
  function haptic(hand, intensity, ms) {
    if (!XR.active || !XR.session) return
    const h = hand === 'L' ? 'left' : hand === 'R' ? 'right' : hand
    for (const src of XR.session.inputSources) {
      if (src.handedness !== h) continue
      const gp: any = src.gamepad
      const act = gp?.hapticActuators?.[0]
      try { act?.pulse?.(intensity, ms) } catch (e) { /* some runtimes lack pulse */ }
    }
  }

  function goodCut(note, saber, dist) {
    const sp = saber.speed
    const pts = Math.round(70 + Math.min(30, sp * 3.4) + Math.max(0, 1 - dist / CUT_RADIUS) * 15)
    G.score += pts * MULT[G.level]
    G.jud++
    G.hits++
    addCombo()
    addEnergy(0.012)
    const angle = Math.atan2(saber.vel.y, saber.vel.x)
    const noteCol = note.d.type === 0 ? meta.value.colorL : meta.value.colorR
    G.halves.push(...createHalves(note, angle, sp, true, noteCol, textures, hotTexGeo))
    G.halves.forEach(h => scene.add(h.m))
    spawnBurst(note.g.position, saber.color, 10, 0.1, 4.5)
    spawnText(note.g.position, String(pts), pts >= 108 ? '#ffd76e' : (pts >= 95 ? '#ffffff' : '#9fb0ff'))
    const hitPan = saber.hand === 'L' ? -0.4 : 0.4
    if (note.d.t >= G.lastNoteT - 0.001) synth.sfxLastHit(hitPan)
    else synth.sfxHit(hitPan, 0.85, 0.97 + Math.random() * 0.06)
    haptic(saber.hand, 0.75, 70)
    G.shake = Math.min(0.5, G.shake + 0.12)
    removeNote(note)
    updateHUD()
  }

  function badCut(note, saber) {
    G.jud++
    breakCombo()
    addEnergy(-0.08)
    const angle = Math.atan2(saber.vel.y, saber.vel.x)
    const noteCol = note.d.type === 0 ? meta.value.colorL : meta.value.colorR
    G.halves.push(...createHalves(note, angle, saber.speed, false, noteCol, textures, hotTexGeo))
    G.halves.forEach(h => scene.add(h.m))
    spawnText(note.g.position, '×', '#ff5566')
    synth.sfxBad()
    haptic(saber.hand, 1.0, 160)
    removeNote(note)
    updateHUD()
  }

  function missNote(note) {
    note.missed = true
    G.jud++
    breakCombo()
    addEnergy(-0.1)
    spawnText(note.g.position, 'MISS', '#ff5566')
    synth.sfxMiss()
    updateHUD()
  }

  function goodLink(note, saber) {
    G.score += 20 * MULT[G.level]
    addCombo()
    addEnergy(0.004)
    spawnBurst(note.g.position, saber.color, 8, 0.09, 3.5)
    synth.sfxHit(saber.hand === 'L' ? -0.4 : 0.4, 0.4, 1.1 + Math.random() * 0.08, true)
    haptic(saber.hand, 0.4, 45)
    removeNote(note)
    updateHUD()
  }

  function badLink(note) {
    breakCombo()
    addEnergy(-0.05)
    spawnText(note.g.position, '×', '#ff5566')
    synth.sfxBad()
    removeNote(note)
    updateHUD()
  }

  function missLink(note) {
    note.missed = true
    breakCombo()
    addEnergy(-0.05)
    spawnText(note.g.position, 'MISS', '#ff5566')
    synth.sfxMiss()
    updateHUD()
  }

  function bombHit(note, saber) {
    breakCombo()
    addEnergy(-0.15)
    spawnBurst(note.g.position, 0xff3300, 22, 0.16, 7)
    synth.sfxBomb()
    if (saber) haptic(saber.hand, 1.0, 250)
    G.shake = 0.8
    removeNote(note)
    updateHUD()
  }

  function checkCuts() {
    const vr = XR.active && !auto.value
    const minSpeed = vr ? 0.9 : MIN_SPEED
    const radius = vr ? 0.5 : CUT_RADIUS
    for (const saber of [saberL, saberR]) {
      for (const note of G.notes) {
        if (note.cut || note.missed) continue
        const z = note.g.position.z
        let d
        if (vr) {
          if (z < G.hitZ - 2 || z > 0.8) continue
          d = Math.min(
            distPointSeg3(note.g.position, saber.baseV, saber.tipV),
            distPointSeg3(note.g.position, saber.prevBaseV, saber.prevTipV),
          )
        } else {
          if (Math.abs(z - G.hitZ) > CUT_WINDOW) continue
          d = distToSeg(
            note.g.position.x, note.g.position.y,
            saber.prev.x, saber.prev.y, saber.pos.x, saber.pos.y,
          )
        }
        if (note.d.type === 3) {
          if (!auto.value && d < 0.42) bombHit(note, saber)
          continue
        }
        if (note.d.link) {
          // Chain link: touch with the matching-color saber, no direction gate
          if (d > radius || saber.speed < minSpeed * 0.5) continue
          if ((saber.hand === 'L') === (note.d.type === 0)) goodLink(note, saber)
          else badLink(note)
          continue
        }
        if (d > radius || saber.speed < minSpeed) continue
        const typeOK = (saber.hand === 'L') === (note.d.type === 0)
        let dirOK = true
        if (note.d.dir !== 8) {
          const dv = DIR_VEC[note.d.dir]
          const vxy = Math.hypot(saber.vel.x, saber.vel.y) || 1
          const dot = (saber.vel.x * dv[0] + saber.vel.y * dv[1]) / vxy
          dirOK = dot > 0.42
        }
        if (typeOK && dirOK) goodCut(note, saber, d * (CUT_RADIUS / radius))
        else badCut(note, saber)
      }
    }
  }

  // ========== Auto aim ==========
  function autoAim(saber, t) {
    const type = saber.hand === 'L' ? 0 : 1
    let target = null
    for (const n of G.notes) {
      if (n.cut || n.missed || n.d.type !== type) continue
      if (!target || n.d.t < target.d.t) target = n
    }
    if (!target || target.d.t - t > 1.6) {
      const ix = saber.hand === 'L' ? -0.55 : 0.55
      const ph = type ? 1.7 : 0
      return { x: ix + Math.sin(t * 1.3 + ph) * 0.14, y: 1.15 + Math.sin(t * 1.8 + ph) * 0.09 }
    }
    const d = target.d
    const nx = d.wx ?? LANE_X[d.x], ny = d.wy ?? ROW_Y[d.y]
    const dv = DIR_VEC[d.dir === 8 ? 1 : d.dir]
    if (d.t - t > 0.05) {
      return { x: nx - dv[0] * 0.55, y: ny - dv[1] * 0.55 }
    }
    return { x: nx + dv[0] * 0.85, y: ny + dv[1] * 0.85 }
  }

  // ========== Flow ==========
  function ensureAudio() {
    if (!synth) { synth = new Synth(); player = new MusicPlayer(synth); synth.loadHitSounds() }
    if (synth.ctx.state === 'suspended') synth.ctx.resume()
    return !!synth && !!synth.ctx
  }

  function startSong(idx) {
    // Stop any currently playing audio first
    if (player) player.stop()
    
    ensureAudio()
    if (!synth || !synth.ctx || synth.ctx.state === 'closed') {
      console.error('[startSong] AudioContext not available:', synth?.ctx?.state)
      return
    }
    synth.stopMenuMusic()
    synth.stopPreview()
    stopEventPreview()
    G.playToken = (G.playToken || 0) + 1
    songIdx.value = idx
    meta.value = { ...SONGS[idx] }
    G.song = SONGS[idx].build()
    G.meta = { ...SONGS[idx] }
    G.hitZ = XR.active ? -0.65 : SABER_Z

    const mats = initSongAssets(meta.value)
    clearPlayfield()

    if (env) env.dispose()
    env = createEnv(meta.value.env, scene, (meta.value as any).envColorL ?? meta.value.colorL, (meta.value as any).envColorR ?? meta.value.colorR)
    env.hasLightEvents = (G.song.lights?.length || 0) > 0

    if (saberL) saberL.dispose()
    if (saberR) saberR.dispose()
    saberL = new Saber('L', meta.value.colorL, meta.value.env, textures)
    saberR = new Saber('R', meta.value.colorR, meta.value.env, textures)
    saberL.addToScene(scene)
    saberR.addToScene(scene)
    if (auto.value) {
      saberL.pos.z = saberR.pos.z = G.hitZ
    } else if (XR.active) {
      log('startSong-VR', { leftCtrl: !!_ctrlPos['left'].length(), rightCtrl: !!_ctrlPos['right'].length(), leftPos: _ctrlPos['left'].toArray().map(v => v.toFixed(2)), rightPos: _ctrlPos['right'].toArray().map(v => v.toFixed(2)) })
      // Sabers stay as children of the scene, world position set directly in updateVR
    } else {
      // Desktop mode: ensure sabers at hit plane
      saberL.pos.z = G.hitZ
      saberR.pos.z = G.hitZ
    }

    const hexL = '#' + meta.value.colorL.toString(16).padStart(6, '0')
    const hexR = '#' + meta.value.colorR.toString(16).padStart(6, '0')
    document.documentElement.style.setProperty('--pl', hexL)
    document.documentElement.style.setProperty('--pr', hexR)

    G.score = 0
    G.com = 0
    G.jud = 0
    G.hits = 0
    G.level = 0
    G.prog = 0
    G.en = 0.5
    G.noteIdx = 0
    G.wallIdx = 0
    G.lightIdx = 0
    G.arcIdx = 0
    G.lastBeat = -1
    G.lastCount = 99
    G.lean = 0
    G.leanTarget = 0
    G.shake = 0
    G.totalNotes = G.song.notes.filter(n => n.type !== 3 && !n.link).length
    G.lastNoteT = G.song.notes.reduce((m, n) => (n.type !== 3 && !n.link && n.t > m ? n.t : m), -1)
    _vrPlayingDebugged = false
    _vrPollLogged = false
    _vrPollNoUpdate = false
    _noteSpawnLogged = false
    _invincibleUsed = false
    invincibleUsed.value = false
    G.cumMax = [0]
    for (let i = 1; i <= G.totalNotes; i++) {
      const m = i <= 2 ? 1 : i <= 6 ? 2 : i <= 14 ? 4 : 8
      G.cumMax.push(G.cumMax[i - 1] + 115 * m)
    }

    score.value = 0
    combo.value = 0
    acc.value = '100.0%'
    mult.value = 'x1'
    energy.value = 0.5
    progress.value = 0

    songLabel.value = `《${meta.value.name}》 · ${meta.value.style} · ${meta.value.bpm} BPM${auto.value ? ' · 纯享演示' : ''}`

    countdownVisible.value = true
    countdownNum.value = ''

    player.load(G.song.events)
    const rawBuf = G.song.buffer
    if (rawBuf && (rawBuf instanceof Uint8Array || (rawBuf instanceof ArrayBuffer && !(rawBuf as any).sampleRate))) {
      G.startAt = synth.ctx.currentTime + 3.6
      const ab = rawBuf instanceof Uint8Array ? rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength) : rawBuf
      const cached = (SONGS[idx] as any)._previewBuf
      if (cached) {
        // Already decoded for preview — start instantly, no re-decode
        player.loadBuffer(cached)
        player.start(G.startAt)
      } else {
        const playTok = G.playToken
        synth.ctx.decodeAudioData(ab, (decoded) => {
          ;(SONGS[idx] as any)._previewBuf = decoded
          if (playTok !== G.playToken || state.value === 'menu' || state.value === 'vrmenu') return // superseded by a newer start/quit
          player.loadBuffer(decoded)
          player.start(G.startAt)
          log('audio-decoded', { duration: decoded.duration?.toFixed(1), sampleRate: decoded.sampleRate })
        }, (err) => {
          log('audio-decode-error', err?.message || err)
        })
      }
    } else {
      if (rawBuf) player.loadBuffer(rawBuf)
      G.startAt = synth.ctx.currentTime + 3.6
      player.start(G.startAt)
    }
    state.value = 'playing'
  }

  function pauseSong() {
    if (state.value !== 'playing') return
    state.value = 'paused'
    synth.ctx.suspend()
  }

  function resumeSong() {
    if (state.value !== 'paused') return
    state.value = 'playing'
    synth.ctx.resume()
  }

  function quitToMenu() {
    if (player) player.stop()
    clearPlayfield()
    if (env && !XR.active) { env.dispose(); env = null }
    if (saberL) { saberL.dispose(); saberL = null }
    if (saberR) { saberR.dispose(); saberR = null }
    countdownVisible.value = false
    _vrPlayingDebugged = false
    _vrPollLogged = false
    _vrPollNoUpdate = false
    if (synth && synth.ctx.state === 'suspended') synth.ctx.resume()
    if (XR.active) {
      state.value = 'vrmenu'
      _vrFirstMenuFrame = true
      // Guard against click-through from the panel button that opened the menu
      _vrTriggerDown = { left: true, right: true }
      _vrMenuCooldown = 0.6
    } else {
      state.value = 'menu'
    }
    if (synth) synth.startMenuMusic()
  }

  function failSong() {
    state.value = 'failed'
    player.stop()
    failSub.value = `完成度 ${Math.round(G.t / G.song.duration * 100)}% · 得分 ${Math.round(G.score).toLocaleString()}`
    synth.sfxBomb()
  }

  function finishSong() {
    state.value = 'results'
    const accMax = G.cumMax[G.totalNotes] || 1
    const accVal = G.score / accMax
    const rk = accVal >= 0.95 ? 'SS' : accVal >= 0.9 ? 'S' : accVal >= 0.8 ? 'A' : accVal >= 0.65 ? 'B' : accVal >= 0.5 ? 'C' : 'D'
    const fc = G.hits === G.totalNotes && G.totalNotes > 0
    resultsTitle.value = (auto.value ? '纯享演示 · ' : '') + (fc ? '全连击！FULL COMBO' : '通关！')
    rank.value = rk
    rScore.value = Math.round(G.score).toLocaleString()
    rAcc.value = (accVal * 100).toFixed(1) + '%'
    rCombo.value = G.maxCombo
    rHits.value = `${G.hits} / ${G.totalNotes}`
  }

  // ========== Input ==========
  function onMouseMove(e) {
    G.mouse.x = (e.clientX / window.innerWidth) * 2 - 1
    G.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
  }

  function onKeyDown(e) {
    if (e.code === 'Escape') {
      if (state.value === 'playing') pauseSong()
      else if (state.value === 'paused') resumeSong()
    }
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') G.leanTarget = -0.85
    if (e.code === 'KeyD' || e.code === 'ArrowRight') G.leanTarget = 0.85
  }

  function onKeyUp(e) {
    if ((e.code === 'KeyA' || e.code === 'ArrowLeft') && G.leanTarget < 0) G.leanTarget = 0
    if ((e.code === 'KeyD' || e.code === 'ArrowRight') && G.leanTarget > 0) G.leanTarget = 0
  }

  function toggleAuto() {
    auto.value = !auto.value
    if (synth) synth.sfxClick()
  }

  // ========== Graphics quality ==========
  function rebuildComposer() {
    composer = null
    if (quality.value === 'low') return
    try {
      const scale = quality.value === 'medium' ? 0.5 : 1
      composer = new EffectComposer(renderer)
      composer.addPass(new RenderPass(scene, camera))
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth * scale, window.innerHeight * scale),
        quality.value === 'medium' ? 0.8 : 0.95, 0.55, 0.32,
      )
      composer.addPass(bloom)
    } catch (e) { composer = null }
  }

  function setQuality(q: string) {
    if (q !== 'high' && q !== 'medium' && q !== 'low') return
    quality.value = q
    localStorage.setItem('bs_quality', q)
    rebuildComposer()
    if (synth) synth.sfxClick()
  }

  // Ambient official stage behind the desktop menu (official colors, slow lasers)
  function ensureMenuEnv() {
    if (env || !scene) return
    env = createEnv('official', scene, 0xff2b2b, 0x2b9eff)
    env.hasLightEvents = true // don't run the beat-driven show; we set a static mood
    env.onLightEvent({ t: 0, type: 0, value: 1, f: 0.5 })   // back lasers dim red-blue
    env.onLightEvent({ t: 0, type: 2, value: 5, f: 0.55 })  // left lasers red
    env.onLightEvent({ t: 0, type: 3, value: 1, f: 0.55 })  // right lasers blue
    env.onLightEvent({ t: 0, type: 1, value: 9, f: 0.35 })  // rings faint white
    env.onLightEvent({ t: 0, type: 12, value: 1, f: 1 })
    env.onLightEvent({ t: 0, type: 13, value: 1, f: 1 })

    // Big neon BEAT SABER sign (official-style, flickers like a neon tube)
    const c = document.createElement('canvas')
    c.width = 1024; c.height = 512
    const g = c.getContext('2d')
    g.textAlign = 'center'
    g.font = 'italic 900 175px "Rajdhani", "Arial Black", sans-serif'
    g.shadowColor = 'rgba(255,43,76,0.95)'
    g.shadowBlur = 42
    g.fillStyle = '#ff3b5c'
    g.fillText('BEAT', 512, 205)
    g.shadowColor = 'rgba(43,123,255,0.95)'
    g.fillStyle = '#3b8bff'
    g.fillText('SABER', 512, 415)
    const tex = new THREE.CanvasTexture(c)
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 7.5),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    )
    sign.position.set(23, 7, -26)
    sign.rotation.y = -0.7
    env.group.add(sign)
    ;(env as any)._menuSign = sign
    ;(env as any)._signSeed = Math.random() * 100
  }

  // Official-style song preview: selecting a song in the menu plays a looped excerpt
  let previewPlayer: MusicPlayer | null = null

  function stopEventPreview() {
    if (previewPlayer) { previewPlayer.stop(); previewPlayer = null }
  }

  async function previewSong(idx) {
    if (state.value !== 'menu') return
    ensureAudio()
    stopEventPreview()
    const song: any = SONGS[idx]
    const raw = song?._previewBuf || song?.internal?.buffer
    if (raw) {
      try {
        const decoded = await synth.startPreview(raw)
        if (decoded && !song._previewBuf) song._previewBuf = decoded
      } catch (e) { /* keep silence */ }
      return
    }
    // Built-in synth songs: play their generated event track from ~25% in
    synth.stopPreview()
    synth.stopMenuMusic()
    try {
      const data = song?.build?.()
      if (data?.events?.length) {
        previewPlayer = new MusicPlayer(synth)
        previewPlayer.load(data.events)
        const skip = (data.duration || 60) * 0.25
        while (previewPlayer.idx < previewPlayer.events.length && previewPlayer.events[previewPlayer.idx].t < skip) previewPlayer.idx++
        previewPlayer.start(synth.ctx.currentTime - skip)
      }
    } catch (e) { /* keep silence */ }
  }

  // ========== UI sounds (DOM menu hooks) ==========
  function uiClick() {
    ensureAudio()
    synth.sfxClick()
    if (state.value === 'menu') synth.startMenuMusic()
  }

  function uiHover() {
    if (synth) synth.sfxHover()
  }

  function toggleInvincible() {
    invincible.value = !invincible.value
    if (synth) synth.sfxClick()
  }

  // ========== Custom song upload ==========
  async function handleMusicFile(file) {
    ensureAudio()
    try {
      const arr = await file.arrayBuffer()
      const buf = await synth.ctx.decodeAudioData(arr)
      if (buf.duration < 20) throw new Error('音频太短，至少需要 20 秒')
      if (buf.duration > 600) throw new Error('音频太长，请控制在 10 分钟内')
      const res = await (analyzeAudioBuffer as any)(buf)
      if (res.notes.length < 10) throw new Error('节拍太弱，无法生成有效谱面')

      const envRef = SONGS.find(s => s.env === res.mood)
      const custom = {
        id: 'custom',
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 20),
        en: 'CUSTOM',
        style: '自定义',
        desc: `${res.bpm} BPM · ${res.notes.length} 方块`,
        bpm: res.bpm, diff: '自动', env: res.mood, speed: Math.max(13, Math.min(19, res.bpm * 0.15)),
        colorL: envRef.colorL, colorR: envRef.colorR,
        cardBg: envRef.cardBg,
        build: () => ({
          events: [], notes: res.notes, walls: res.walls,
          duration: buf.duration, bpm: res.bpm, spb: res.spb,
          beatOffset: res.phase, buffer: buf,
        }),
        custom: true,
      }

      SONGS.push(custom)
      const idx = SONGS.length - 1
      return { idx, custom }
    } catch (e) {
      console.error('分析失败', e)
      throw e
    }
  }

  // ========== BeatSaver integration ==========
  async function searchSong(query) {
    log('beatsaver-search', query)
    return await searchBeatSaver(query)
  }

  async function downloadSong(mapData) {
    const existingIdx = SONGS.findIndex(s => s.id === 'bs_' + mapData.id)
    if (existingIdx >= 0) {
      downloadProgress.value = { stage: 'done', pct: 100 }
      return { song: SONGS[existingIdx], idx: existingIdx }
    }
    log('beatsaver-download', mapData.id)
    downloadProgress.value = { stage: 'resolving', pct: 10 }
    const song = await downloadBeatMap(mapData, (stage, pct) => {
      downloadProgress.value = { stage, pct }
    })
    SONGS.push(song as any)
    songListVersion.value++
    saveMap(song.id, song).catch(e => console.error('saveMap failed:', e))
    downloadProgress.value = { stage: 'done', pct: 100 }
    log('beatsaver-added', { name: song.name, notes: song.internal?.notes?.length || 0 })
    return { song, idx: SONGS.length - 1 }
  }

  async function deleteDownloadedSong(idx) {
    const song = SONGS[idx]
    if (!song || !song.id || !song.id.startsWith('bs_') || (song as any).builtin) return
    try {
      await deleteMap(song.id)
      SONGS.splice(idx, 1)
      log('beatmap-deleted', song.name)
    } catch (e) {
      console.error('deleteMap failed:', e)
    }
  }

  // ========== Loop ==========
  const _target = new THREE.Vector3()
  function mouseToWorld() {
    const v = _target.set(G.mouse.x, G.mouse.y, 0.5).unproject(camera)
    const dir = v.sub(camera.position).normalize()
    const k = (SABER_Z - camera.position.z) / dir.z
    return {
      x: THREE.MathUtils.clamp(camera.position.x + dir.x * k, -2.6, 2.6),
      y: THREE.MathUtils.clamp(camera.position.y + dir.y * k, 0.15, 2.9),
    }
  }

  function tick(timestamp, xrFrame) {
    try {
    const dt = Math.min(clock.getDelta(), 0.05)
    const time = performance.now() * 0.001

    if (XR.active && xrFrame) {
      pollXRControllers(xrFrame)
    }

    if (state.value === 'menu' && !XR.active) {
      // Official-style menu backdrop: render the stage with ambient lighting
      if (!env) ensureMenuEnv()
      if (env) {
        // Lighting pulses with whatever is playing (preview / menu music)
        const lv = synth ? synth.getLevel() : 0
        const gs: any = (env as any).groups
        if (gs) {
          gs.ring.intensity = Math.max(gs.ring.intensity, lv * 1.2)
          gs.back.intensity = Math.max(gs.back.intensity, lv * 0.95)
          gs.left.intensity = Math.max(gs.left.intensity, 0.3 + lv * 0.9)
          gs.right.intensity = Math.max(gs.right.intensity, 0.3 + lv * 0.9)
          gs.center.intensity = Math.max(gs.center.intensity, 0.4 + lv * 0.6)
        }
        // Neon sign flicker: slow hum + random dropouts + music boost
        const sign: any = (env as any)._menuSign
        if (sign) {
          const seed = (env as any)._signSeed || 0
          const hum = 0.86 + 0.08 * Math.sin(time * 2.1 + seed) + 0.05 * Math.sin(time * 13.7 + seed * 3)
          const drop = Math.sin(time * 4.3 + seed) > 0.996 || Math.sin(time * 9.1 + seed * 2) > 0.997 ? 0.35 : 1
          sign.material.opacity = Math.min(1.3, hum * drop + lv * 0.35)
        }
        env.update(dt, time)
      }
      camera.position.set(0, 1.7, 0)
      camera.rotation.z = 0
      if (composer) composer.render()
      else renderer.render(scene, camera)
      scheduleFrame()
      return
    }
    if (XR.active && (state.value === 'results' || state.value === 'failed' || state.value === 'paused')) {
      if (vrPanelState !== state.value) buildVRPanel(state.value)
      updateVRPanel(dt)
    } else if (vrPanelState) {
      cleanupVRPanel()
    }
    if (state.value === 'vrmenu') {
      if (env) env.update(dt, time)
      updateVRMenu(dt)
      renderer.render(scene, camera)
      // Auto-dump log every 3s
      if (!_vrDebugLastDump || time - _vrDebugLastDump > 3) {
        _vrDebugLastDump = time
        console.log('[VR-DEBUG]', {
          state: state.value,
          hasEnv: !!env,
          hasMenu: !!vrMenuOrigin,
          ctrlL: !!_ctrlObj['left'],
          ctrlR: !!_ctrlObj['right'],
          ctrlLInScene: !!(_ctrlObj['left'] && _ctrlObj['left'].parent),
          ctrlRInScene: !!(_ctrlObj['right'] && _ctrlObj['right'].parent),
          posL: _ctrlObj['left'] ? _ctrlPos['left'].toArray().map(v => v.toFixed(2)) : 'none',
          posR: _ctrlObj['right'] ? _ctrlPos['right'].toArray().map(v => v.toFixed(2)) : 'none',
          menuSaberL: !!_menuSaberL,
          menuSaberR: !!_menuSaberR,
          cards: vrMenuItems.length,
          laserL: !!vrLaserLeft,
          laserR: !!vrLaserRight,
          menuChildren: vrMenuOrigin ? vrMenuOrigin.children.length : 0,
        })
      }
      return
    }

    if (state.value === 'playing') {
      if (!synth || !synth.ctx) { console.error('[DESKTOP] synth not ready'); return }
      try {
      // VR pause via left menu button
      if (XR.active && XR.session) {
        let paused = false
        for (const src of XR.session.inputSources) {
          if (src.handedness !== 'left') continue
          const gp = src.gamepad
          if (!gp) continue
          if (gp.buttons[5]?.pressed || gp.buttons[4]?.pressed) {
            if (!_vrPauseBtnPressed) { _vrPauseBtnPressed = true; paused = true }
          } else {
            _vrPauseBtnPressed = false
          }
        }
        if (paused) pauseSong()
      }
      G.t = synth.ctx.currentTime - G.startAt
      if (isNaN(G.t) || !isFinite(G.t)) return
      const t = G.t

      // Countdown
      if (t < 0.6) {
        const n = Math.ceil(-t - 0.15)
        if (n !== G.lastCount) {
          G.lastCount = n
          if (n >= 1 && n <= 3) {
            countdownNum.value = String(n)
            synth.sfxCount(false)
          } else if (n === 0) {
            countdownNum.value = 'GO!'
            synth.sfxCount(true)
          }
        }
      } else if (countdownVisible.value) {
        countdownVisible.value = false
      }

      // Beat pulse
      if (t >= 0 && G.song.spb) {
        const beat = Math.floor((t - (G.song.beatOffset || 0)) / G.song.spb)
        if (beat !== G.lastBeat) { G.lastBeat = beat; if (env) env.onBeat(beat) }
      }

      // Lighting events
      const le = G.song.lights
      if (le && le.length && env) {
        while (G.lightIdx < le.length && le[G.lightIdx].t <= t) env.onLightEvent(le[G.lightIdx++])
      }

      // Spawn
      const ahead = SPAWN_DIST / meta.value.speed
      const ns = G.song.notes
      const mats = { matL, matR, bombMat, textures, colored: coloredMat }
      while (G.noteIdx < ns.length && ns[G.noteIdx].t - t < ahead) spawnNote(ns[G.noteIdx++], mats)
      // Log first few notes
      if (G.noteIdx > 0 && !_noteSpawnLogged) {
        _noteSpawnLogged = true
        log('note-spawn', { total: ns.length, spawned: G.noteIdx, firstT: ns[0]?.t?.toFixed(2), ahead: ahead.toFixed(1), t: t.toFixed(2) })
      }
      const ws = G.song.walls
      while (G.wallIdx < ws.length && ws[G.wallIdx].t - t < ahead) spawnWall(ws[G.wallIdx++], meta.value.speed)
      const as = G.song.arcs
      if (as) while (G.arcIdx < as.length && as[G.arcIdx].t - t < ahead) spawnArc(as[G.arcIdx++])

      // Move notes
      for (let i = G.notes.length - 1; i >= 0; i--) {
        const n = G.notes[i]
        const z = G.hitZ + (t - n.d.t) * meta.value.speed
        n.g.position.z = z
        const born = (z - (G.hitZ - SPAWN_DIST)) / 14
        if (born < 1) {
          const e = Math.max(0, Math.min(1, born))
          const s = 0.45 + 0.55 * e
          n.g.scale.set(s, s, s)
          n.g.rotation.z = n.g.userData.spin * (1 - e)
        } else if (n.g.scale.x !== 1) {
          n.g.scale.set(1, 1, 1)
          n.g.rotation.z = 0
        }
        if (n.d.type === 3) n.g.rotation.y += dt * 2
        const missZ = XR.active ? 0.35 : MISS_Z
        if (!n.cut && !n.missed && n.d.type !== 3 && z > missZ) { n.d.link ? missLink(n) : missNote(n) }
        if (!n.cut && n.d.type === 3 && z > 1.5) { n.cut = true; scene.remove(n.g) }
        if ((n.cut || n.missed) && z > 2.5) { scene.remove(n.g); G.notes.splice(i, 1) }
        else if (n.cut && n.d.type !== 3 && !n.missed) { G.notes.splice(i, 1) }
      }

      // Arcs travel with the conveyor; drop them once the tail passes the player
      for (let i = G.arcs.length - 1; i >= 0; i--) {
        const o = G.arcs[i]
        o.m.position.z = G.hitZ + (t - o.a.t) * meta.value.speed
        if (G.hitZ + (t - o.a.tb) * meta.value.speed > 2.5) {
          scene.remove(o.m)
          o.m.geometry.dispose()
          o.m.material.dispose()
          G.arcs.splice(i, 1)
        }
      }

      // Walls
      const headX = camera.position.x, headZ = XR.active ? camera.position.z : 0
      for (let i = G.walls.length - 1; i >= 0; i--) {
        const o = G.walls[i]
        const frontZ = G.hitZ + (t - o.w.t) * meta.value.speed
        o.m.position.z = frontZ - o.len / 2
        if (frontZ - o.len > 3) {
          scene.remove(o.m)
          o.m.traverse(c => { if (c.geometry) c.geometry.dispose() })
          ;(o.m.userData.ownMats || []).forEach(mm => mm.dispose())
          G.walls.splice(i, 1)
        }
      }

      // Sabers
      if (auto.value) {
        const ta = autoAim(saberL, t), tb = autoAim(saberR, t)
        saberL.update(dt, ta.x, ta.y)
        saberR.update(dt, tb.x, tb.y)
      } else if (XR.active && XR.useHands) {
        saberL.updateFromHand(dt, XR.handL)
        saberR.updateFromHand(dt, XR.handR)
      } else if (XR.active) {
        saberL.updateVR(dt, _ctrlPos['left'], _ctrlQuat['left'])
        saberR.updateVR(dt, _ctrlPos['right'], _ctrlQuat['right'])
        if (!_vrPlayingDebugged && performance.now() * 0.001 - G.t > 1) {
          _vrPlayingDebugged = true
          log('playing-VR', {
            saberLInScene: !!(saberL && saberL.group && saberL.group.parent),
            saberRInScene: !!(saberR && saberR.group && saberR.group.parent),
            tipL: saberL ? saberL.tipV.toArray().map(v => v.toFixed(2)) : 'none',
            tipR: saberR ? saberR.tipV.toArray().map(v => v.toFixed(2)) : 'none',
            ctrlLInScene: !!(_ctrlObj['left'] && _ctrlObj['left'].parent),
            ctrlRInScene: !!(_ctrlObj['right'] && _ctrlObj['right'].parent),
          })
        }
      } else {
        const mp = mouseToWorld()
        saberR.update(dt, mp.x, mp.y)
        saberL.update(dt, -mp.x, mp.y)
      }

      if (t > -0.5) checkCuts()

      // Camera lean
      if (!XR.active && auto.value) {
        G.leanTarget = 0
        for (const o of G.walls) {
          const frontZ = G.hitZ + (t - o.w.t) * meta.value.speed
          if (frontZ > -14 && frontZ - o.len < 1) { G.leanTarget = -o.w.side * 0.85; break }
        }
      }
      if (!XR.active) {
        G.lean += (G.leanTarget - G.lean) * (1 - Math.exp(-dt * 9))
        camera.position.x = G.lean
        camera.rotation.z = -G.lean * 0.07
        if (G.shake > 0.001) {
          G.shake *= Math.exp(-dt * 7)
          camera.position.y = 1.7 + (Math.random() - 0.5) * G.shake * 0.05
          camera.position.x += (Math.random() - 0.5) * G.shake * 0.05
        } else camera.position.y = 1.7
      }

      // Progress
      progress.value = Math.min(100, Math.max(0, t / G.song.duration * 100))
      if (t > G.song.duration + 1.2) finishSong()
      } catch (e) { console.error('playing tick error:', e.message, e.stack) }
    }

    // Halves
    for (let i = G.halves.length - 1; i >= 0; i--) {
      const h = G.halves[i]
      h.life -= dt
      if (h.life <= 0) {
        scene.remove(h.m)
        h.hotMat.dispose()
        G.halves.splice(i, 1)
        continue
      }
      h.vy -= 8 * dt
      h.m.position.x += h.vx * dt
      h.m.position.y += h.vy * dt
      h.m.position.z += h.vz * dt
      h.m.rotation.x += h.rx * dt
      h.m.rotation.z += h.rz * dt
      if (h.hotMat && h.life < 0.3) h.hotMat.opacity = Math.max(0, h.life / 0.3) * 0.95
    }

    // Bursts
    for (let i = G.bursts.length - 1; i >= 0; i--) {
      const b = G.bursts[i]
      b.life -= dt
      if (b.life <= 0) {
        scene.remove(b.pts)
        scene.remove(b.flash)
        releaseBurst(b)
        G.bursts.splice(i, 1)
        continue
      }
      const p = b.pts.geometry.attributes.position.array
      for (let j = 0; j < b.vels.length; j++) {
        b.vels[j].y -= 7 * dt
        p[j * 3] += b.vels[j].x * dt
        p[j * 3 + 1] += b.vels[j].y * dt
        p[j * 3 + 2] += b.vels[j].z * dt
      }
      b.pts.geometry.attributes.position.needsUpdate = true
      b.pts.material.opacity = b.life / b.max
    }

    // Texts
    for (let i = G.texts.length - 1; i >= 0; i--) {
      const o = G.texts[i]
      o.life -= dt
      if (o.life <= 0) {
        scene.remove(o.sp)
        if (o.tex) o.tex.dispose()
        o.sp.material.dispose()
        G.texts.splice(i, 1)
        continue
      }
      const k = 1 - o.life / o.max
      if (o.rise) o.sp.position.y += o.rise * dt
      if (o.grow) { const s = 0.3 + k * o.grow * 0.18; o.sp.scale.set(s, s, 1) }
      o.sp.material.opacity = 1 - k * k
    }

    if (env) env.update(dt, time)
    if (vrHUD && XR.active) {
      vrHUD.update(
        state.value,
        Math.round(G.score || 0),
        G.com || 0,
        acc.value,
        mult.value,
        energy.value,
        progress.value,
        countdownVisible.value ? countdownNum.value : null,
        songLabel.value || '',
        state.value === 'results' ? {
          title: resultsTitle.value,
          rank: rank.value,
          score: rScore.value,
          acc: rAcc.value,
          combo: rCombo.value,
          hits: rHits.value,
        } : null,
        state.value === 'failed' ? {
          title: 'ENERGY LOST',
          sub: failSub.value,
          score: Math.round(G.score || 0).toLocaleString(),
        } : null,
        state.value === 'paused',
      )
    }
    if (composer && !XR.active) composer.render()
    else renderer.render(scene, camera)
    if (!XR.active) scheduleFrame()
    } catch (e) { console.error('tick error', e.message, e.stack) }
  }

  const _ctrlPos = { left: new THREE.Vector3(), right: new THREE.Vector3() }
  const _ctrlQuat = { left: new THREE.Quaternion(), right: new THREE.Quaternion() }
  const _ctrlObj = { left: null, right: null }
  const _ctrlTracked = { left: false, right: false }

  function pollXRControllers(xrFrame) {
    if (!XR.session || !xrFrame) {
      if (state.value === 'playing' && !_vrPollLogged) { console.warn('[VR-POLL] skipped: session=', !!XR.session, 'frame=', !!xrFrame); _vrPollLogged = true }
      return
    }
    const refSpace = renderer.xr.getReferenceSpace()
    if (!refSpace) {
      if (state.value === 'playing' && !_vrPollLogged) { console.warn('[VR-POLL] no refSpace'); _vrPollLogged = true }
      return
    }
    let updated = false
    for (const src of XR.session.inputSources) {
      const h = src.handedness
      if (h !== 'left' && h !== 'right') continue
      const gp = src.gripSpace
      if (!gp) continue
      const pose = xrFrame.getPose(gp, refSpace)
      if (!pose) continue
      const pos = _ctrlPos[h]
      const quat = _ctrlQuat[h]
      pos.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z)
      quat.set(pose.transform.orientation.x, pose.transform.orientation.y, pose.transform.orientation.z, pose.transform.orientation.w)
      if (!_ctrlObj[h]) {
        _ctrlObj[h] = new THREE.Group()
        _ctrlObj[h].position.copy(pos)
        _ctrlObj[h].quaternion.copy(quat)
        scene.add(_ctrlObj[h])
        log('ctrl-add', { hand: h, pos: pos.toArray().map(v => v.toFixed(2)) })
        if (h === 'left') XR.srcL = src
        else XR.srcR = src
      } else if (!_ctrlObj[h].parent) {
        scene.add(_ctrlObj[h])
        log('ctrl-reparent', { hand: h })
      }
      _ctrlObj[h].position.copy(pos)
      _ctrlObj[h].quaternion.copy(quat)
      if (!_ctrlTracked[h]) {
        _ctrlTracked[h] = true
        log('ctrl-tracked', { hand: h, pos: pos.toArray().map(v => v.toFixed(2)) })
      }
      updated = true
    }
    if (state.value === 'playing' && !updated && !_vrPollNoUpdate) {
      _vrPollNoUpdate = true
      log('poll-no-update', 'no controllers found in inputSources during gameplay')
    }
  }

  // ========== VR Menu ==========
  let vrMenuItems = []
  let vrMenuOrigin = null
  let vrLaserLeft, vrLaserRight
  let _menuSaberL = null
  let _menuSaberR = null
  let _vrTriggerDown = { left: false, right: false }
  let _vrMenuCooldown = 0
  let _vrLastHovered = -1
  let _vrPanelLastHovered = -1
  let _vrTriggerLogCount = 0
  let _vrLaserLogCount = 0
  let _vrTriggerDownPrev = { left: false, right: false }
  let _vrInputDumped = false
  let _vrButtonFound = {}
  let _vrAxisTriggerFound = false
  let _vrOtherBtnLogged = false
  let _vrPauseBtnPressed = false
  let _noteSpawnLogged = false
  let _invincibleUsed = false

  function _createVRSaberMesh(color) {
    const g = new THREE.Group()
    const handleGeo = new THREE.CylinderGeometry(0.034, 0.04, 0.3, 16)
    const handle = new THREE.Mesh(handleGeo, new THREE.MeshLambertMaterial({ color: 0x181820 }))
    g.add(handle)
    ;[[0.145, 0.045], [-0.13, 0.042]].forEach(([y, r]) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.009, 8, 24),
        new THREE.MeshBasicMaterial({ color }),
      )
      ring.rotation.x = Math.PI / 2
      ring.position.y = y
      g.add(ring)
    })
    const BL = 1.05
    const by = 0.15 + BL / 2
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, BL, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    )
    core.position.y = by
    g.add(core)
    const glow1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, BL * 1.01, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    glow1.position.y = by
    g.add(glow1)
    const glow2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, BL * 1.03, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    glow2.position.y = by
    g.add(glow2)
    if (textures && textures.glowTex) {
      const tipGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: textures.glowTex, color, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }))
      tipGlow.scale.set(0.3, 0.3, 1)
      tipGlow.position.y = 0.15 + BL
      g.add(tipGlow)
    }
    const light = new THREE.PointLight(color, 1.1, 7)
    light.position.y = by
    g.add(light)
    g.position.set(0, 0, -0.03)
    g.rotation.set(-Math.PI / 2, 0, 0)
    return g
  }

  function buildVRMenu() {
    if (vrMenuOrigin) return
    log('buildVRMenu', 'start')
    vrMenuOrigin = new THREE.Group()
    vrMenuOrigin.position.set(0, 1.6, -2.5)
    scene.add(vrMenuOrigin)

    // Title
    const c = document.createElement('canvas')
    c.width = 512; c.height = 128
    const g = c.getContext('2d')
    g.font = 'bold 44px sans-serif'
    g.textAlign = 'center'
    g.fillStyle = '#ffffff'
    g.fillText('SELECT SONG', 256, 64)
    const titleTex = new THREE.CanvasTexture(c)
    const title = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 0.5),
      new THREE.MeshBasicMaterial({ map: titleTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    )
    title.position.y = 1.1
    vrMenuOrigin.add(title)

    // Song cards
    vrMenuItems = []
    const cardsPerRow = 4
    const CARD_COLORS = SONGS.map(s => '#' + s.colorR.toString(16).padStart(6, '0'))
    SONGS.forEach((s, i) => {
      const row = Math.floor(i / cardsPerRow)
      const col = i % cardsPerRow
      const cc = document.createElement('canvas')
      cc.width = 512; cc.height = 256
      const cg = cc.getContext('2d')
      const accent = CARD_COLORS[i]
      
      cg.fillStyle = 'rgba(6,8,18,0.95)'
      cg.fillRect(0, 0, 512, 256)
      
      cg.fillStyle = accent
      cg.globalAlpha = 0.08
      cg.fillRect(0, 0, 512, 256)
      cg.globalAlpha = 1
      
      cg.strokeStyle = accent
      cg.lineWidth = 2
      cg.globalAlpha = 0.4
      cg.strokeRect(1, 1, 510, 254)
      cg.globalAlpha = 1
      
      cg.font = 'bold 34px "Rajdhani", sans-serif'
      cg.textAlign = 'center'
      cg.fillStyle = '#ffffff'
      cg.fillText(s.name, 256, 90)
      
      cg.font = '18px "Rajdhani", sans-serif'
      cg.fillStyle = accent
      cg.fillText(s.en, 256, 130)
      
      cg.font = '20px "Rajdhani", sans-serif'
      cg.fillStyle = '#aaaacc'
      cg.fillText(s.bpm + ' BPM  ·  ' + s.diff, 256, 170)
      const tex = new THREE.CanvasTexture(cc)
      const card = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 0.6),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      )
      card.position.set(col * 1.4 - 1.95, 0.35 - row * 0.7, 0)
      card.userData = { songIdx: i, baseScale: 1 }
      vrMenuOrigin.add(card)
      vrMenuItems.push(card)
    })

    // Laser pointers (left=red, right=cyan like real Beat Saber)
    const laserGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 4)
    laserGeo.translate(0, 0.5, 0)
    vrLaserLeft = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: 0xff2b2b }))
    vrLaserRight = new THREE.Mesh(laserGeo.clone(), new THREE.MeshBasicMaterial({ color: 0x00e5ff }))
    vrLaserLeft.visible = false
    vrLaserRight.visible = false
    scene.add(vrLaserLeft)
    scene.add(vrLaserRight)

    // Controller saber models (like real Beat Saber)
    if (!_ctrlObj['left']) { _ctrlObj['left'] = new THREE.Group(); scene.add(_ctrlObj['left']) }
    if (!_ctrlObj['right']) { _ctrlObj['right'] = new THREE.Group(); scene.add(_ctrlObj['right']) }
    _menuSaberL = _createVRSaberMesh(0xff2b2b)
    _menuSaberR = _createVRSaberMesh(0x2b9eff)
    _ctrlObj['left'].add(_menuSaberL)
    _ctrlObj['right'].add(_menuSaberR)
    log('buildVRMenu', { sabers: 'created', ctrlL: !!_ctrlObj['left'], ctrlR: !!_ctrlObj['right'], ctrlLInScene: !!(_ctrlObj['left'] && _ctrlObj['left'].parent), ctrlRInScene: !!(_ctrlObj['right'] && _ctrlObj['right'].parent) })
  }

  let _vrFirstMenuFrame = true
  let _vrDebugLastDump = 0
  let _vrPlayingDebugged = false
  let _vrNoCtrlLogged = false
  let _vrPollLogged = false
  let _vrPollNoUpdate = false

  function updateVRMenu(dt) {
    if (_vrMenuCooldown > 0) _vrMenuCooldown -= dt
    if (!vrMenuOrigin) buildVRMenu()
    if (!_ctrlObj['left'] && !_ctrlObj['right']) {
      if (!_vrNoCtrlLogged) {
        _vrNoCtrlLogged = true
        log('waiting-ctrl', 'no controllers detected yet')
      }
      return
    }
    _vrNoCtrlLogged = false

    if (_vrFirstMenuFrame) {
      _vrFirstMenuFrame = false
      log('menu-ready', {
        left: !!_ctrlObj['left'],
        right: !!_ctrlObj['right'],
        posL: _ctrlObj['left'] ? _ctrlPos['left'].toArray().map(v => v.toFixed(2)) : 'none',
        posR: _ctrlObj['right'] ? _ctrlPos['right'].toArray().map(v => v.toFixed(2)) : 'none',
        cards: vrMenuItems.length,
        cardsInScene: vrMenuOrigin ? vrMenuOrigin.children.length : 0,
      })
    }

    let hovered = -1
    for (const card of vrMenuItems) {
      card.scale.setScalar(card.userData.baseScale)
    }

    for (const hand of ['left', 'right']) {
      const pos = _ctrlPos[hand]
      const quat = _ctrlQuat[hand]
      const laser = hand === 'left' ? vrLaserLeft : vrLaserRight
      if (!laser) continue

      // Point laser forward from controller
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(quat)
      const start = pos.clone()

      // Check intersection with menu cards
      let closestHit = -1
      let closestDist = Infinity
      for (let i = 0; i < vrMenuItems.length; i++) {
        const card = vrMenuItems[i]
        const cardWorld = new THREE.Vector3()
        card.getWorldPosition(cardWorld)
        const cardNormal = new THREE.Vector3(0, 0, 1)
        cardWorld.z -= 0.01

        const denom = dir.dot(cardNormal)
        if (Math.abs(denom) < 0.001) continue
        const t = (cardWorld.dot(cardNormal) - start.dot(cardNormal)) / denom
        if (t > 0 && t < 10) {
          const pt = start.clone().addScaledVector(dir, t)
          const local = card.parent.worldToLocal(pt.clone())
          if (Math.abs(local.x - card.position.x) < 0.6 && Math.abs(local.y - card.position.y) < 0.3) {
            if (t < closestDist) { closestDist = t; closestHit = i }
          }
        }
      }

      // Show laser and update
      laser.visible = true
      const mid = start.clone().addScaledVector(dir, closestHit >= 0 ? closestDist : 3)
      const center = start.clone().add(mid).multiplyScalar(0.5)
      laser.position.copy(center)
      laser.scale.y = closestHit >= 0 ? closestDist : 3
      laser.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)

      if (closestHit >= 0) {
        vrMenuItems[closestHit].scale.setScalar(1.15)
        hovered = closestHit
        vrMenuItems[closestHit].userData.baseScale = 1.15
      }
    }
    
    if (hovered !== _vrLastHovered) {
      if (hovered >= 0 && synth) synth.sfxHover()
      _vrLastHovered = hovered
    }

    // Debug laser hit periodically
    if (!_vrLaserLogCount) _vrLaserLogCount = 0
    _vrLaserLogCount++
    if (_vrLaserLogCount % 120 === 0 || hovered >= 0) {
      log('laser-debug', { hovered, posR: _ctrlPos['right'].toArray().map(v => v.toFixed(2)), dirR: new THREE.Vector3(0, 0, -1).applyQuaternion(_ctrlQuat['right']).toArray().map(v => v.toFixed(2)) })
    }

    // Check trigger press (both hands)
    // Check trigger press (both hands)
    if (!XR.session) return
    // Debug: dump all input source info once
    if (!_vrInputDumped) {
      _vrInputDumped = true
      for (const src of XR.session.inputSources) {
        if (src.handedness !== 'right' && src.handedness !== 'left') continue
        const gp = src.gamepad
        log('input-source-dump', {
          handedness: src.handedness,
          mapping: gp?.mapping || 'none',
          buttons: gp?.buttons?.map((b, i) => `${i}:val=${b?.value?.toFixed(2)} pressed=${b?.pressed}`) || [],
          axes: gp?.axes?.map(v => v?.toFixed(2)) || [],
        })
      }
    }
    for (const src of XR.session.inputSources) {
      if (src.handedness !== 'right' && src.handedness !== 'left') continue
      const gp = src.gamepad
      if (!gp) continue
      const hand = src.handedness
      // Check ALL buttons for any press
      let triggerPressed = false
      let anyButtonActive = false
      if (gp.buttons) {
        for (let i = 0; i < gp.buttons.length; i++) {
          const b = gp.buttons[i]
          if (!b) continue
          if (b.value > 0.3 || b.pressed) {
            anyButtonActive = true
            if (i === 0 || i === 2 || i === 4) { // trigger, A/X, thumbstick
              triggerPressed = true
              if (!_vrButtonFound[i]) {
                _vrButtonFound[i] = true
                log('button-found', { hand, index: i, value: b.value, pressed: b.pressed })
              }
            }
          }
        }
      }
      // Also check axes for trigger (some controllers use axis for trigger)
      if (gp.axes && gp.axes.length > 0 && gp.axes[0] !== undefined) {
        if (Math.abs(gp.axes[0]) > 0.3) {
          triggerPressed = true
          if (!_vrAxisTriggerFound) {
            _vrAxisTriggerFound = true
            log('axis-trigger-found', { hand, axis0: gp.axes[0] })
          }
        }
      }
      if (anyButtonActive && !triggerPressed && !_vrOtherBtnLogged) {
        _vrOtherBtnLogged = true
        const active = []
        for (let i = 0; i < gp.buttons.length; i++) {
          if (gp.buttons[i] && (gp.buttons[i].value > 0.1 || gp.buttons[i].pressed)) {
            active.push(`${i}:${gp.buttons[i].value.toFixed(2)}`)
          }
        }
        log('other-buttons', { hand, active })
      }
      if (triggerPressed && !_vrTriggerDown[hand] && hovered >= 0 && _vrMenuCooldown <= 0) {
        _vrTriggerDown[hand] = true
        log('trigger-select', { hovered, song: SONGS[hovered].name, hand })
        if (synth) synth.sfxClick()
        startSong(hovered)
        cleanupVRMenu()
        return
      }
      _vrTriggerDown[hand] = triggerPressed
      if (!_vrTriggerLogCount) _vrTriggerLogCount = 0
      _vrTriggerLogCount++
      // Log immediately on trigger change
      if (triggerPressed !== _vrTriggerDownPrev[hand]) {
        _vrTriggerDownPrev[hand] = triggerPressed
        log('trigger-raw', { hand, pressed: triggerPressed, value: gp.buttons[0]?.value?.toFixed(3), hovered, buttonsLen: gp.buttons.length })
      }
      if (_vrTriggerLogCount % 120 === 0) {
        log('trigger-debug', { triggerValue: gp.buttons[0]?.value, triggerPressed: gp.buttons[0]?.pressed, hovered, hand, buttonsLen: gp.buttons.length })
      }
    }
  }

  // ========== VR state panels: card buttons for pause / results / fail ==========
  let vrPanelGroup = null
  let vrPanelItems = []
  let vrPanelState = ''
  let vrPanelLaserL = null
  let vrPanelLaserR = null
  let _vrPanelTriggerDown = { left: false, right: false }
  let _vrPanelCooldown = 0

  function _makePanelCard(cn, en, accent) {
    const c = document.createElement('canvas')
    c.width = 512; c.height = 160
    const g = c.getContext('2d')
    const r = 26
    g.beginPath()
    g.moveTo(r, 2)
    g.arcTo(510, 2, 510, 158, r)
    g.arcTo(510, 158, 2, 158, r)
    g.arcTo(2, 158, 2, 2, r)
    g.arcTo(2, 2, 510, 2, r)
    g.closePath()
    g.fillStyle = 'rgba(8,10,22,0.94)'
    g.fill()
    g.lineWidth = 4
    g.strokeStyle = accent
    g.globalAlpha = 0.85
    g.stroke()
    g.globalAlpha = 1
    g.textAlign = 'center'
    g.fillStyle = '#ffffff'
    g.font = 'bold 58px "PingFang SC", "Microsoft YaHei", sans-serif'
    g.fillText(cn, 256, 78)
    g.fillStyle = accent
    g.font = '26px "Rajdhani", sans-serif'
    g.fillText(en, 256, 126)
    const tex = new THREE.CanvasTexture(c)
    return new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 0.27),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    )
  }

  function buildVRPanel(st) {
    cleanupVRPanel()
    vrPanelState = st
    _vrPanelCooldown = 0.6
    _vrPanelTriggerDown = { left: true, right: true } // require trigger release before first click
    vrPanelGroup = new THREE.Group()
    vrPanelGroup.position.set(0, 1.1, -2.1)
    scene.add(vrPanelGroup)
    const defs = st === 'paused' ? [
      { cn: '继续', en: 'RESUME', accent: '#39e07f', act: () => resumeSong() },
      { cn: '重新开始', en: 'RESTART', accent: '#7fdcff', act: () => startSong(songIdx.value) },
      { cn: '选歌菜单', en: 'SONG MENU', accent: '#ff6ec7', act: () => quitToMenu() },
    ] : [
      { cn: st === 'failed' ? '重试' : '再来一次', en: 'RETRY', accent: '#7fdcff', act: () => startSong(songIdx.value) },
      { cn: '选歌菜单', en: 'SONG MENU', accent: '#ff6ec7', act: () => quitToMenu() },
    ]
    defs.forEach((d, i) => {
      const card = _makePanelCard(d.cn, d.en, d.accent)
      card.position.x = (i - (defs.length - 1) / 2) * 0.95
      card.userData = { act: d.act }
      vrPanelGroup.add(card)
      vrPanelItems.push(card)
    })
    const laserGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 4)
    laserGeo.translate(0, 0.5, 0)
    vrPanelLaserL = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: 0xff2b2b }))
    vrPanelLaserR = new THREE.Mesh(laserGeo.clone(), new THREE.MeshBasicMaterial({ color: 0x00e5ff }))
    scene.add(vrPanelLaserL)
    scene.add(vrPanelLaserR)
    log('vr-panel-open', { state: st, buttons: defs.length })
  }

  function cleanupVRPanel() {
    if (vrPanelGroup) {
      scene.remove(vrPanelGroup)
      vrPanelGroup.traverse((o: any) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose() }
      })
      vrPanelGroup = null
    }
    vrPanelItems = []
    ;[vrPanelLaserL, vrPanelLaserR].forEach(l => {
      if (l) { scene.remove(l); l.geometry.dispose(); l.material.dispose() }
    })
    vrPanelLaserL = null
    vrPanelLaserR = null
    vrPanelState = ''
  }

  function updateVRPanel(dt) {
    if (_vrPanelCooldown > 0) _vrPanelCooldown -= dt
    let hovered = -1
    for (const card of vrPanelItems) card.scale.setScalar(1)
    for (const hand of ['left', 'right']) {
      const laser = hand === 'left' ? vrPanelLaserL : vrPanelLaserR
      if (!laser) continue
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(_ctrlQuat[hand])
      const start = _ctrlPos[hand].clone()
      let closestHit = -1
      let closestDist = Infinity
      for (let i = 0; i < vrPanelItems.length; i++) {
        const cardWorld = new THREE.Vector3()
        vrPanelItems[i].getWorldPosition(cardWorld)
        const n = new THREE.Vector3(0, 0, 1)
        const denom = dir.dot(n)
        if (Math.abs(denom) < 0.001) continue
        const t = (cardWorld.dot(n) - start.dot(n)) / denom
        if (t > 0 && t < 10) {
          const pt = start.clone().addScaledVector(dir, t)
          if (Math.abs(pt.x - cardWorld.x) < 0.47 && Math.abs(pt.y - cardWorld.y) < 0.16) {
            if (t < closestDist) { closestDist = t; closestHit = i }
          }
        }
      }
      laser.visible = true
      const end = closestHit >= 0 ? closestDist : 3
      laser.position.copy(start.clone().addScaledVector(dir, end * 0.5))
      laser.scale.y = end
      laser.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
      if (closestHit >= 0) { vrPanelItems[closestHit].scale.setScalar(1.12); hovered = closestHit }
    }
    if (hovered !== _vrPanelLastHovered) {
      if (hovered >= 0 && synth) synth.sfxHover()
      _vrPanelLastHovered = hovered
    }
    if (!XR.session) return
    for (const src of XR.session.inputSources) {
      const hand = src.handedness
      if (hand !== 'left' && hand !== 'right') continue
      const gp = src.gamepad
      if (!gp) continue
      let pressed = false
      if (gp.buttons) {
        for (let i = 0; i < gp.buttons.length; i++) {
          const b = gp.buttons[i]
          if (b && (i === 0 || i === 2 || i === 4) && (b.value > 0.3 || b.pressed)) pressed = true
        }
      }
      if (gp.axes && gp.axes.length > 0 && Math.abs(gp.axes[0] || 0) > 0.3) pressed = true
      if (pressed && !_vrPanelTriggerDown[hand] && hovered >= 0 && _vrPanelCooldown <= 0) {
        _vrPanelTriggerDown[hand] = true
        log('vr-panel-click', { state: vrPanelState, hovered })
        if (synth) synth.sfxClick()
        vrPanelItems[hovered].userData.act()
        return
      }
      _vrPanelTriggerDown[hand] = pressed
    }
  }

  function cleanupVRMenu() {
    // Remove menu saber visuals from controller groups
    ;[_menuSaberL, _menuSaberR].forEach((saber, i) => {
      if (!saber) return
      const parent = saber.parent
      if (parent) parent.remove(saber)
      saber.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) o.material.dispose()
      })
    })
    _menuSaberL = null
    _menuSaberR = null
    if (vrMenuOrigin) { scene.remove(vrMenuOrigin); vrMenuOrigin = null }
    vrMenuItems = []
    if (vrLaserLeft) { scene.remove(vrLaserLeft); vrLaserLeft = null }
    if (vrLaserRight) { scene.remove(vrLaserRight); vrLaserRight = null }
  }

  async function enterVR() {
    if (!XR.supported || XR.active) return
    if (synth) { synth.stopPreview() }
    stopEventPreview()
    log('enterVR', 'requesting session')
    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        requiredFeatures: ['local-floor'],
      })
      log('session-created', { inputSources: session.inputSources?.length })
      XR.session = session
      XR.active = true
      xrActive.value = true
      startLog()

      if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null }
      renderer.xr.setSession(session)
      renderer.setAnimationLoop(tick)
      log('setAnimationLoop', 'done')

      if (!vrHUD) {
        vrHUD = new VRHUD(scene, camera)
        log('vrHUD', 'created')
      }

      if (!env) {
        const firstSong = SONGS[0]
        env = createEnv(firstSong.env, scene, firstSong.colorL, firstSong.colorR)
        state.value = 'vrmenu'
      }
      if (ensureAudio() && state.value === 'vrmenu') synth.startMenuMusic()

      session.addEventListener('end', onXRSessionEnd)
    } catch (e) {
      console.warn('VR session failed', e)
    }
  }

  function dispose() {
    if (animFrameId) cancelAnimationFrame(animFrameId)
    if (player) player.stop()
    clearPlayfield()
    if (env) env.dispose()
    if (saberL) saberL.dispose()
    if (saberR) saberR.dispose()
    if (vrHUD) { vrHUD.dispose(); vrHUD = null }
    if (renderer) renderer.dispose()
  }

  return {
    state, auto, invincible, invincibleUsed, downloadProgress, songListVersion, localLoad, songIdx, score, combo, acc, mult, energy, progress, songLabel,
    rank, rScore, rAcc, rCombo, rHits, resultsTitle, failSub,
    countdownNum, countdownVisible, xrSupported, xrActive,
    SONGS,
    init, startSong, pauseSong, resumeSong, quitToMenu, failSong,
    onMouseMove, onKeyDown, onKeyUp, toggleAuto, toggleInvincible,
    handleMusicFile, searchSong, downloadSong, deleteDownloadedSong, enterVR, dumpLog, dispose,
    uiClick, uiHover, previewSong, quality, setQuality,
  }
}
