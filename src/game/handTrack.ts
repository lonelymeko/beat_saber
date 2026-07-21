// Webcam hand tracking (MediaPipe HandLandmarker) driving the desktop sabers.
// Reference approach: collidingScopes/fruit-ninja (browser fruit ninja with the
// same model). The library + model are lazy-loaded and self-hosted under
// /mediapipe/ so play does not depend on Google CDNs.

export interface TrackedHand {
  x: number   // normalized 0..1, mirrored (moving your hand right increases x)
  y: number   // normalized 0..1, top = 0
  seen: number // performance.now() of the last detection
}

export class HandTracker {
  video: HTMLVideoElement | null = null
  ready = false
  error = ''
  hands: { left: TrackedHand, right: TrackedHand } = {
    left: { x: 0.3, y: 0.5, seen: 0 },
    right: { x: 0.7, y: 0.5, seen: 0 },
  }
  private stream: MediaStream | null = null
  private lm: any = null
  private _lastVideoTime = -1

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      })
      const v = document.createElement('video')
      v.playsInline = true
      v.muted = true
      v.srcObject = this.stream
      await v.play()
      this.video = v
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
      // Same-origin paths only — nginx 302s /mediapipe/ to the storage bucket,
      // so no storage config lives in frontend code
      const files = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
      const opts = (delegate: 'GPU' | 'CPU') => ({
        baseOptions: { modelAssetPath: '/mediapipe/hand_landmarker.task', delegate },
        runningMode: 'VIDEO' as const,
        numHands: 2,
      })
      try {
        this.lm = await HandLandmarker.createFromOptions(files, opts('GPU'))
      } catch (e) {
        this.lm = await HandLandmarker.createFromOptions(files, opts('CPU'))
      }
      this.ready = true
      this.error = ''
    } catch (e: any) {
      this.error = e?.name === 'NotAllowedError' ? '摄像头权限被拒绝' : (e?.message || String(e))
      this.stop()
      throw e
    }
  }

  /** Run detection on the current video frame (no-op if the frame is unchanged). */
  update(now: number) {
    if (!this.ready || !this.lm || !this.video) return
    if (this.video.currentTime === this._lastVideoTime) return
    this._lastVideoTime = this.video.currentTime
    let res: any
    try { res = this.lm.detectForVideo(this.video, now) } catch (e) { return }
    const n = res?.landmarks?.length || 0
    for (let i = 0; i < n; i++) {
      const pts = res.landmarks[i]
      const label = res.handedness?.[i]?.[0]?.categoryName
      if (!pts || !label) continue
      // User-verified mapping for the un-mirrored webcam frame; x is mirrored
      // below so on-screen movement matches the player.
      const hand: 'left' | 'right' = label === 'Left' ? 'left' : 'right'
      const tip = pts[8] // index fingertip
      const h = this.hands[hand]
      h.x = 1 - tip.x
      h.y = tip.y
      h.seen = now
    }
  }

  stop() {
    try { this.lm?.close?.() } catch (e) { /* already closed */ }
    this.lm = null
    if (this.stream) this.stream.getTracks().forEach(t => t.stop())
    this.stream = null
    this.video = null
    this.ready = false
  }
}
