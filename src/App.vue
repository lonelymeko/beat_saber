<script setup>
import { ref, onMounted, onUnmounted, provide } from 'vue'
import { useGame } from './composables/useGame.js'

const game = useGame()
provide('game', game)

const canvasRef = ref(null)
const uploadStatus = ref('CLICK OR DROP AUDIO FILE (MP3 / WAV / M4A…)  ·  AUTO ANALYZE BEAT & MOOD')
const uploadErr = ref(false)
const uploadBusy = ref(false)

// BeatSaver search
const bsQuery = ref('')
const bsResults = ref([])
const bsLoading = ref(false)
const bsError = ref('')
const bsDownloading = ref('')
const bsShowSearch = ref(false)
const bsSearchLabel = ref('')

async function doSearch(q) {
  if (bsLoading.value) return
  bsLoading.value = true; bsError.value = ''; bsResults.value = []
  bsSearchLabel.value = q || bsQuery.value.trim()
  try {
    bsResults.value = await game.searchSong(bsSearchLabel.value)
    if (!bsResults.value.length) bsError.value = 'No results'
  } catch (e) { bsError.value = 'Search failed: ' + e.message }
  bsLoading.value = false
}

async function doDownload(result) {
  bsDownloading.value = result.id; bsError.value = ''
  try {
    const { idx } = await game.downloadSong(result)
    bsDownloading.value = ''
    bsResults.value = []; bsShowSearch.value = false; bsQuery.value = ''
  } catch (e) { bsError.value = 'Download failed: ' + e.message; bsDownloading.value = '' }
}

// Artists → search and show their songs
const popularArtists = [
  'YOASOBI', 'Ado', 'Eve', 'YOASOBI', 'Kenshi Yonezu',
  'Hatsune Miku', 'Aimer', 'Kanaria', 'wowaka', 'DECO*27',
  'ヨルシカ', 'ずっと真夜中でいいのに', 'Official髭男dism',
  'King Gnu', 'TUYU', '星街すいせい', '米津玄師',
]
// Specific songs → search for the right version
const popularSongs = [
  '夜に駆ける', 'アイドル', '群青',
  '千本桜', 'Senbonzakura',
  'Roki', 'ロキ',
  'Ghost Rule', 'ゴーストルール',
  'Tell Your World',
  'Rolling Girl',
  'Donut Hole',
  '廻廻奇譚', 'KICK BACK', '残響散歌', '白日',
  'ヒバナ', 'QUEEN', 'KING',
]

async function doQuickSearch(q) {
  bsResults.value = []
  bsShowSearch.value = true
  await doSearch(q)
}

async function onFileDrop(e) {
  e.preventDefault()
  if (uploadBusy.value) return
  const f = e.dataTransfer.files && e.dataTransfer.files[0]
  if (f) await handleFile(f)
}

async function onFileSelect(e) {
  const f = e.target.files && e.target.files[0]
  if (f) await handleFile(f)
  e.target.value = ''
}

async function handleFile(file) {
  uploadBusy.value = true
  try {
    uploadStatus.value = '分析中…'
    uploadErr.value = false
    const result = await game.handleMusicFile(file)
    uploadStatus.value = `${result.custom.name} — ${result.custom.bpm} BPM · ${result.custom.desc.split('·')[1]}`
    uploadErr.value = false
  } catch (e) {
    uploadStatus.value = e.message
    uploadErr.value = true
  }
  uploadBusy.value = false
}

onMounted(() => {
  if (canvasRef.value) {
    game.init(canvasRef.value)
  }

  window.addEventListener('mousemove', game.onMouseMove)
  window.addEventListener('keydown', game.onKeyDown)
  window.addEventListener('keyup', game.onKeyUp)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state.value === 'playing') game.pauseSong()
  })

  window.addEventListener('dragover', e => e.preventDefault())
  window.addEventListener('drop', onFileDrop)
})

onUnmounted(() => {
  game.dispose()
  window.removeEventListener('mousemove', game.onMouseMove)
  window.removeEventListener('keydown', game.onKeyDown)
  window.removeEventListener('keyup', game.onKeyUp)
  window.removeEventListener('dragover', e => e.preventDefault())
  window.removeEventListener('drop', onFileDrop)
})
</script>

<template>
  <canvas ref="canvasRef" />

  <!-- ============ MAIN MENU ============ -->
  <div
    id="menu"
    class="overlay"
    :class="{ hidden: game.state.value !== 'menu' }"
  >
    <div id="logo-area">
      <div id="logo-icon"></div>
      <div id="logo-text">BEAT SABER</div>
    </div>

    <div id="song-carousel" :key="game.songListVersion.value">
      <div
        v-for="(song, i) in game.SONGS.slice(0, 6)"
        :key="i"
        class="song-card"
        @click="game.startSong(i)"
      >
        <div class="cover">
          <div class="cover-bg" :style="{ background: song.cardBg }"></div>
          <div class="cover-overlay"></div>
          <div
            v-if="song.id && song.id.startsWith('bs_')"
            class="song-delete"
            @click.stop="game.deleteDownloadedSong(i)"
            title="Delete map"
          >×</div>
        </div>
        <div class="info">
          <div class="song-name">{{ song.name }}</div>
          <div class="song-en">{{ song.en }}</div>
          <div class="song-meta">
            <span class="song-bpm">{{ song.bpm }} BPM</span>
            <span class="song-diff" :style="{ color: '#' + song.colorR.toString(16).padStart(6, '0') }">{{ song.diff }}</span>
          </div>
        </div>
      </div>

      <!-- Upload card -->
      <div
        class="song-card upload-card"
        @click="uploadBusy ? null : $refs.fileInput.click()"
      >
        <div class="cover">
          <div class="cover-bg">
            <div class="upload-icon">+</div>
          </div>
          <div class="cover-overlay"></div>
        </div>
        <div class="info">
          <div class="song-name">IMPORT</div>
          <div class="song-en">AUTO MAP</div>
          <div class="song-meta">
            <span class="song-bpm">LOCAL FILE</span>
            <span class="song-diff" style="color: #ffd76e;">AUTO</span>
          </div>
        </div>
        <div class="upload-status" :style="{ color: uploadErr ? '#ff6677' : '#7b84ab' }">{{ uploadStatus }}</div>
      </div>
      <input ref="fileInput" type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac" style="display:none" @change="onFileSelect" />
    </div>

    <div id="menu-footer">
      <div
        id="auto-toggle"
        :class="{ on: game.auto.value }"
        @click="game.toggleAuto()"
      >
        <span class="sw"></span>
        DEMO MODE · 自动演示
      </div>
      <div
        id="auto-toggle"
        :class="{ on: game.invincible.value }"
        @click="game.toggleInvincible()"
        style="margin-top:0"
      >
        <span class="sw"></span>
        NO FAIL · 血量清空不失败但扣 50% 分数
      </div>
      <div
        class="vr-btn"
        :class="{ 'vr-off': !game.xrSupported.value }"
        @click="game.enterVR()"
        :style="{ cursor: game.xrSupported.value ? 'pointer' : 'default' }"
      >
        {{ game.xrSupported.value ? 'ENTER VR' : 'VR UNAVAILABLE' }}
      </div>
      <div id="controls-hint">
        <b>DESKTOP</b> — Mouse swing sabers · <b>A / D</b> dodge walls · <b>ESC</b> pause<br />
        <b>VR</b> — HTTPS required · Left red · Right blue · Trigger select · Grip pause
      </div>
      <div
        class="vr-btn"
        style="margin-top: 12px; background: linear-gradient(90deg, rgba(127,220,255,0.1), rgba(255,110,199,0.1)); border-color: rgba(127,220,255,0.5);"
        @click="bsShowSearch = true"
      >
        BEATSAVER · 社区谱面搜索
      </div>
    </div>
  </div>

  <!-- BeatSaver search card -->
  <div class="song-card bs-card" style="display:none"></div>

  <!-- BeatSaver search overlay -->
  <div v-if="bsShowSearch" class="bs-overlay" @click.self="bsShowSearch = false; bsResults = []; bsError = ''">
    <div class="bs-panel">
      <div class="bs-header">BEATSAVER SEARCH</div>
      <div class="bs-input-row">
          <input v-model="bsQuery" class="bs-input" placeholder="搜索歌手 / 歌曲名..." @keyup.enter="doSearch(bsQuery)" />
          <button class="bs-btn" @click="doSearch(bsQuery)" :disabled="bsLoading || !bsQuery.trim()">
          {{ bsLoading ? '...' : 'SEARCH' }}
        </button>
      </div>
      <div v-if="game.downloadProgress.value.pct > 0 && game.downloadProgress.value.stage !== 'done'" class="bs-progress">
        <div class="bs-progress-label">{{ game.downloadProgress.value.stage === 'resolving' ? 'Resolving...' : game.downloadProgress.value.stage === 'parsing' ? 'Parsing beatmap...' : 'Downloading... ' + game.downloadProgress.value.pct + '%' }}</div>
        <div class="bs-progress-bar"><div class="bs-progress-fill" :style="{ width: game.downloadProgress.value.pct + '%' }"></div></div>
      </div>
      <div v-if="bsError" class="bs-error">{{ bsError }}</div>
      <div class="bs-popular-section">
        <div class="bs-section-label">🎤 歌手</div>
        <div class="bs-popular-grid">
          <div
            v-for="q in popularArtists" :key="'a-'+q"
            class="bs-popular-card artist"
            @click="doQuickSearch(q)"
          >
            <div class="bsp-name">{{ q }}</div>
            <div class="bsp-desc">搜热门谱面</div>
          </div>
        </div>
      </div>
      <div class="bs-popular-section">
        <div class="bs-section-label">🎵 热门曲目</div>
        <div class="bs-popular-grid">
          <div
            v-for="q in popularSongs" :key="'s-'+q"
            class="bs-popular-card"
            @click="doQuickSearch(q)"
          >
            <div class="bsp-name">{{ q }}</div>
          </div>
        </div>
      </div>
      <div v-if="bsResults.length" class="bs-results">
        <div class="bs-section-label">{{ bsSearchLabel ? '结果: ' + bsSearchLabel : 'Results' }}</div>
        <div
          v-for="r in bsResults" :key="r.id"
          class="bs-result"
          :class="{ busy: bsDownloading === r.id }"
          @click="bsDownloading ? null : doDownload(r)"
        >
          <div class="bsr-name">{{ r.songName }}</div>
          <div class="bsr-author">{{ r.songAuthor || r.levelAuthor }}</div>
          <div class="bsr-meta">{{ Math.round(r.bpm) }} BPM · {{ r.diffs?.[0]?.difficulty || 'Standard' }} · ↑{{ r.upvotes }}</div>
        </div>
      </div>
      <div class="bs-close" @click="bsShowSearch = false; bsResults = []; bsError = ''">×</div>
    </div>
  </div>

  <!-- ============ IN-GAME HUD ============ -->
  <div id="hud" :class="{ hidden: game.state.value !== 'playing' && game.state.value !== 'paused' }">
    <div id="progress"><div id="progress-fill" :style="{ width: game.progress.value + '%' }"></div></div>

    <div id="score-area">
      <div id="score">{{ game.score.value.toLocaleString() }}</div>
      <div id="accuracy">{{ game.acc.value }}</div>
    </div>

    <div id="song-info">
      <div class="name" v-html="game.songLabel.value"></div>
    </div>

    <div id="combo-area" :class="{ active: game.combo.value >= 2 }">
      <div id="combo" :class="{ pop: game.combo.value > 0 }">{{ game.combo.value }}</div>
      <div id="combo-label" v-if="game.combo.value >= 2">COMBO</div>
    </div>

    <div id="mult-area" :class="{ active: game.combo.value >= 2 }">
      <div id="mult">{{ game.mult.value }}</div>
    </div>

    <div id="energy">
      <div
        v-for="i in 20"
        :key="i"
        class="energy-seg"
        :class="{
          full: (game.energy.value * 20) >= i,
          low: game.energy.value < 0.3 && (game.energy.value * 20) >= i
        }"
      ></div>
    </div>
  </div>

  <!-- ============ COUNTDOWN ============ -->
  <div id="countdown" class="overlay" :class="{ hidden: !game.countdownVisible.value }">
    <div id="count-num">{{ game.countdownNum.value }}</div>
  </div>

  <!-- ============ PAUSE ============ -->
  <div id="pause" class="overlay panel" :class="{ hidden: game.state.value !== 'paused' }">
    <h1>PAUSED</h1>
    <div class="btn" @click="game.resumeSong()">RESUME</div>
    <div class="btn" @click="game.startSong(game.songIdx.value)">RESTART</div>
    <div class="btn" @click="game.quitToMenu()">QUIT</div>
  </div>

  <!-- ============ RESULTS ============ -->
  <div id="results" class="overlay panel" :class="{ hidden: game.state.value !== 'results' }">
    <h1>{{ game.resultsTitle.value }}</h1>
    <div class="rank">{{ game.rank.value }}</div>
    <div class="stats">
      <span>SCORE</span><b>{{ game.rScore.value }}</b>
      <span>ACCURACY</span><b>{{ game.rAcc.value }}</b>
      <span>MAX COMBO</span><b>{{ game.rCombo.value }}</b>
      <span>HITS</span><b>{{ game.rHits.value }}</b>
    </div>
    <div class="btn" @click="game.startSong(game.songIdx.value)">RETRY</div>
    <div class="btn" @click="game.quitToMenu()">MENU</div>
  </div>

  <!-- ============ FAIL ============ -->
  <div id="fail" class="overlay panel" :class="{ hidden: game.state.value !== 'failed' }">
    <h1>ENERGY LOST</h1>
    <div style="color:#7b84ab; margin-bottom:22px; letter-spacing:2px; font-weight:500;">{{ game.failSub.value }}</div>
    <div class="btn" @click="game.startSong(game.songIdx.value)">RETRY</div>
    <div class="btn" @click="game.quitToMenu()">MENU</div>
  </div>
</template>
