<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, provide } from 'vue'
import { useGame } from './composables/useGame'

const game = useGame()
provide('game', game)

const canvasRef = ref(null)

// Song selection (official-style list + detail panel)
const selectedIdx = ref(0)
watch(game.songListVersion, () => {
  if (selectedIdx.value >= game.SONGS.length) selectedIdx.value = 0
})

function selectSong(i) {
  game.uiClick()
  selectedIdx.value = i
  game.previewSong(i)
}

// Returning to the menu resumes the selected song's preview
watch(game.state, (s) => {
  if (s === 'menu') game.previewSong(selectedIdx.value)
})

function playSelected() {
  game.uiClick()
  if (game.SONGS[selectedIdx.value]) game.startSong(selectedIdx.value)
}
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
  const term = (q || bsQuery.value).trim()
  if (!term) return
  // Direct map ID: download immediately
  if (/^[a-f0-9]{4,6}$/i.test(term)) {
    doDownload({ id: term, name: 'BeatSaver #' + term, songName: 'Map ' + term, songAuthor: '', levelAuthor: '', bpm: 150, duration: 180 })
    return
  }
  bsLoading.value = true; bsError.value = ''; bsResults.value = []
  bsSearchLabel.value = term
  try {
    bsResults.value = await game.searchSong(term)
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
    if (idx != null && idx >= 0) { selectedIdx.value = idx; game.previewSong(idx) }
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

  <!-- Local song loading toast (official-style notification) -->
  <div v-if="game.localLoad.value.active" id="load-toast">
    <div class="lt-spinner"></div>
    <div class="lt-body">
      <div class="lt-label">{{ game.localLoad.value.label }}</div>
      <div class="lt-bar">
        <div
          class="lt-fill"
          :class="{ indet: game.localLoad.value.pct < 0 }"
          :style="game.localLoad.value.pct >= 0 ? { width: game.localLoad.value.pct + '%' } : {}"
        ></div>
      </div>
    </div>
  </div>

  <!-- ============ MAIN MENU ============ -->
  <div
    id="menu"
    class="overlay"
    :class="{ hidden: game.state.value !== 'menu' }"
  >
    <!-- Left: song list -->
    <aside id="song-panel">
      <div id="panel-logo">
        <div class="logo-bars"></div>
        <div class="logo-text"><span class="logo-beat">BEAT</span><span class="logo-saber">SABER</span></div>
      </div>

      <div id="song-list" :key="game.songListVersion.value">
        <div
          v-for="(song, i) in game.SONGS"
          :key="i"
          class="song-row"
          :class="{ sel: i === selectedIdx }"
          @click="selectSong(i)"
          @mouseenter="game.uiHover()"
        >
          <div class="row-cover" :style="{ background: song.cardBg }"></div>
          <div class="row-info">
            <div class="row-name">{{ song.name }}</div>
            <div class="row-sub">{{ song.en }} · {{ song.diff }}</div>
          </div>
          <div class="row-bpm">{{ song.bpm }}<span> BPM</span></div>
          <div
            v-if="song.id && song.id.startsWith('bs_') && !song.builtin"
            class="song-delete"
            @click.stop="game.uiClick(); game.deleteDownloadedSong(i)"
            title="Delete map"
          >×</div>
        </div>
      </div>
    </aside>

    <!-- Right: song detail -->
    <section id="detail-panel" v-if="game.SONGS[selectedIdx]">
      <div class="detail-main">
        <div class="detail-cover" :style="{ background: game.SONGS[selectedIdx].cardBg }"></div>
        <div class="detail-info">
          <div class="detail-name">{{ game.SONGS[selectedIdx].name }}</div>
          <div class="detail-en">{{ game.SONGS[selectedIdx].en }}</div>
          <div class="detail-chips">
            <span class="chip">{{ game.SONGS[selectedIdx].bpm }} BPM</span>
            <span class="chip chip-diff">{{ game.SONGS[selectedIdx].diff }}</span>
            <span class="chip">{{ game.SONGS[selectedIdx].style }}</span>
            <span class="chip chip-desc">{{ game.SONGS[selectedIdx].desc }}</span>
          </div>
          <div
            class="play-btn"
            @click="playSelected()"
            @mouseenter="game.uiHover()"
          >开始 · PLAY</div>
        </div>
      </div>

      <div class="detail-toggles">
        <div
          id="auto-toggle"
          :class="{ on: game.auto.value }"
          @click="game.uiClick(); game.toggleAuto()"
          @mouseenter="game.uiHover()"
        >
          <span class="sw"></span>
          DEMO MODE · 自动演示
        </div>
        <div
          id="auto-toggle"
          :class="{ on: game.invincible.value }"
          @click="game.uiClick(); game.toggleInvincible()"
          @mouseenter="game.uiHover()"
        >
          <span class="sw"></span>
          NO FAIL · 血量清空不失败但扣 50% 分数
        </div>
      </div>

      <div class="detail-actions">
        <div
          class="vr-btn"
          :class="{ 'vr-off': !game.xrSupported.value }"
          @click="game.uiClick(); game.enterVR()"
          @mouseenter="game.uiHover()"
          :style="{ cursor: game.xrSupported.value ? 'pointer' : 'default' }"
        >
          {{ game.xrSupported.value ? 'ENTER VR' : 'VR UNAVAILABLE' }}
        </div>
        <div
          class="vr-btn"
          @click="game.uiClick(); uploadBusy ? null : $refs.fileInput.click()"
          @mouseenter="game.uiHover()"
        >
          IMPORT · 导入音乐
        </div>
        <div
          class="vr-btn bs-open-btn"
          @click="game.uiClick(); bsShowSearch = true"
          @mouseenter="game.uiHover()"
        >
          BEATSAVER · 社区谱面搜索
        </div>
      </div>
      <input ref="fileInput" type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac" style="display:none" @change="onFileSelect" />

      <div class="upload-status" :style="{ color: uploadErr ? '#ff6677' : '#7b84ab' }">{{ uploadStatus }}</div>

      <div id="controls-hint">
        <b>DESKTOP</b> — Mouse swing sabers · <b>A / D</b> dodge walls · <b>ESC</b> pause<br />
        <b>VR</b> — HTTPS required · Left red · Right blue · Trigger select · Grip pause
      </div>
    </section>
  </div>

  <!-- BeatSaver search card -->
  <div class="song-card bs-card" style="display:none"></div>

  <!-- BeatSaver search overlay -->
  <div v-if="bsShowSearch" class="bs-overlay" @click.self="bsShowSearch = false; bsResults = []; bsError = ''">
    <div class="bs-panel">
      <div class="bs-header">BEATSAVER SEARCH</div>
      <div class="bs-input-row">
          <input v-model="bsQuery" class="bs-input" placeholder="搜索 或 输入谱面ID（如 4f454）直接下载..." @keyup.enter="doSearch(bsQuery)" />
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

    <div id="energy" v-if="!game.invincibleUsed.value">
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
