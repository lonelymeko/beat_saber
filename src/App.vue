<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, provide } from 'vue'
import { useGame } from './composables/useGame'
import { browseBeatSaver } from './audio/beatsaver'

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
  bsBrowseActive.value = false
  bsShowSearch.value = true
  await doSearch(q)
}

// ===== Keyword-less browsing: genre tag + sort (Rating/Latest), paginated =====
const BS_TAGS: [string, string][] = [
  ['', '全部'], ['anime', '动漫'], ['j-pop', 'J-POP'], ['vocaloid', 'V家'],
  ['pop', '流行'], ['electronic', '电子'], ['dance-style', '舞曲'], ['rock', '摇滚'],
  ['metal', '金属'], ['hip-hop-rap', '说唱'], ['classical-orchestral', '古典'],
]
const bsSort = ref<'Rating' | 'Latest'>('Rating')
const bsTag = ref('')
const bsPage = ref(0)
const bsBrowseActive = ref(false)

async function browseCats(reset = true) {
  if (bsLoading.value) return
  bsLoading.value = true
  bsError.value = ''
  if (reset) { bsPage.value = 0; bsResults.value = [] }
  bsBrowseActive.value = true
  const tagLabel = BS_TAGS.find(t => t[0] === bsTag.value)?.[1] || '全部'
  bsSearchLabel.value = `${bsSort.value === 'Rating' ? '热门' : '最新'} · ${tagLabel}`
  try {
    const list = await browseBeatSaver(bsSort.value, bsPage.value, bsTag.value)
    bsResults.value = reset ? list : bsResults.value.concat(list)
    if (!bsResults.value.length) bsError.value = 'No results'
  } catch (e: any) { bsError.value = 'Browse failed: ' + e.message }
  bsLoading.value = false
}

function browseMore() { bsPage.value++; browseCats(false) }
function setSort(s: 'Rating' | 'Latest') { bsSort.value = s; browseCats(true) }
function setTag(t: string) { bsTag.value = t; browseCats(true) }

// ===== One-click Top10 batch download; each batch advances to the next 10 =====
const topBusy = ref(false)
const topNote = ref('')
const topOffset = ref(parseInt(localStorage.getItem('bs_top_offset') || '0', 10) || 0)

async function fetchTopSlice(offset: number) {
  const page = Math.floor(offset / 20)
  const list = await browseBeatSaver('Rating', page)
  let slice = list.slice(offset % 20, (offset % 20) + 10)
  if (slice.length < 10) {
    const next = await browseBeatSaver('Rating', page + 1)
    slice = slice.concat(next.slice(0, 10 - slice.length))
  }
  return slice
}

async function downloadTop10() {
  if (topBusy.value) return
  topBusy.value = true
  bsError.value = ''
  try {
    const batch = await fetchTopSlice(topOffset.value)
    for (let i = 0; i < batch.length; i++) {
      const r = batch[i]
      topNote.value = `批量下载 ${i + 1}/${batch.length} · ${r.songName || r.name}`
      try { await game.downloadSong(r) } catch (e) { /* skip failed map */ }
    }
    topNote.value = ''
    topOffset.value += 10
    localStorage.setItem('bs_top_offset', String(topOffset.value))
    // Show the NEXT batch so 再点一次继续下 10 首
    bsBrowseActive.value = false
    bsSearchLabel.value = `热门 · 已下载前 ${topOffset.value} 首,下一批 ↓`
    bsResults.value = await fetchTopSlice(topOffset.value)
  } catch (e: any) {
    bsError.value = '批量下载失败: ' + e.message
    topNote.value = ''
  }
  topBusy.value = false
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
  ;(window as any).__game = game

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
    <!-- Top-right external links -->
    <div id="ext-links">
      <a
        class="bili" href="https://www.bilibili.com/video/BV1LCK66oEYk/" target="_blank" rel="noopener"
        title="演示视频 · bilibili" @mouseenter="game.uiHover()" @click="game.uiClick()"
      >
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.573-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.387-.947.257-.257.573-.386.946-.386z"/></svg>
      </a>
      <a
        class="gh" href="https://github.com/lonelymeko/beat_saber" target="_blank" rel="noopener"
        title="源码 · GitHub" @mouseenter="game.uiHover()" @click="game.uiClick()"
      >
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
      </a>
    </div>

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
          <div class="quality-line" v-if="game.SONGS[selectedIdx].diffList && game.SONGS[selectedIdx].diffList.length > 1" :key="'d' + game.songListVersion.value">
            <span class="q-label">难度 DIFFICULTY</span>
            <button
              v-for="d in game.SONGS[selectedIdx].diffList"
              :key="d.key"
              class="q-pill"
              :class="{ on: game.SONGS[selectedIdx].internal && game.SONGS[selectedIdx].internal.currentDiff === d.key }"
              @click="game.setSongDifficulty(selectedIdx, d.key)"
              @mouseenter="game.uiHover()"
            >{{ d.label }}</button>
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
        <div class="quality-line">
          <span class="q-label">画质 GRAPHICS</span>
          <button
            v-for="q in [['high','高'],['medium','中'],['low','低']]"
            :key="q[0]"
            class="q-pill"
            :class="{ on: game.quality.value === q[0] }"
            @click="game.setQuality(q[0])"
            @mouseenter="game.uiHover()"
          >{{ q[1] }}</button>
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
          v-if="game.SONGS[selectedIdx] && game.SONGS[selectedIdx].id && game.SONGS[selectedIdx].id.startsWith('bs_') && !game.SONGS[selectedIdx].builtin"
          class="vr-btn del-btn"
          @click="game.uiClick(); game.deleteDownloadedSong(selectedIdx); selectedIdx = 0"
          @mouseenter="game.uiHover()"
        >
          删除此谱面 · DELETE
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
      <div class="bs-header">
        <div class="bs-title">
          <span class="bs-t-red">BEAT</span><span class="bs-t-blue">SAVER</span><span class="bs-t-cn"> · 社区谱面</span>
        </div>
        <div
          class="bs-close"
          @mouseenter="game.uiHover()"
          @click="game.uiClick(); bsShowSearch = false; bsResults = []; bsError = ''"
        >×</div>
      </div>
      <div class="bs-input-row">
        <input v-model="bsQuery" class="bs-input" placeholder="搜索 或 输入谱面ID（如 4f454）直接下载..." @keyup.enter="doSearch(bsQuery)" />
        <button
          class="bs-btn"
          @mouseenter="game.uiHover()"
          @click="game.uiClick(); doSearch(bsQuery)"
          :disabled="bsLoading || !bsQuery.trim()"
        >
          {{ bsLoading ? '...' : 'SEARCH' }}
        </button>
      </div>
      <div class="bs-browse-row">
        <button class="bs-pill sort" :class="{ on: bsSort === 'Rating' }" @mouseenter="game.uiHover()" @click="game.uiClick(); setSort('Rating')">热门</button>
        <button class="bs-pill sort" :class="{ on: bsSort === 'Latest' }" @mouseenter="game.uiHover()" @click="game.uiClick(); setSort('Latest')">最新</button>
        <span class="bs-sep"></span>
        <button
          v-for="t in BS_TAGS" :key="'t-' + t[0]"
          class="bs-pill"
          :class="{ on: bsBrowseActive && bsTag === t[0] }"
          @mouseenter="game.uiHover()"
          @click="game.uiClick(); setTag(t[0])"
        >{{ t[1] }}</button>
        <span class="bs-sep"></span>
        <button class="bs-pill top10" :disabled="topBusy" @mouseenter="game.uiHover()" @click="game.uiClick(); downloadTop10()">
          {{ topBusy ? '批量下载中…' : `一键下载 TOP10${topOffset ? ' (已下 ' + topOffset + ')' : ''}` }}
        </button>
      </div>
      <div v-if="topNote" class="bs-progress-label bs-top-note">{{ topNote }}</div>
      <div v-if="game.downloadProgress.value.pct > 0 && game.downloadProgress.value.stage !== 'done'" class="bs-progress">
        <div class="bs-progress-label">{{ game.downloadProgress.value.stage === 'resolving' ? 'Resolving...' : game.downloadProgress.value.stage === 'parsing' ? 'Parsing beatmap...' : 'Downloading... ' + game.downloadProgress.value.pct + '%' }}</div>
        <div class="bs-progress-bar"><div class="bs-progress-fill" :style="{ width: game.downloadProgress.value.pct + '%' }"></div></div>
      </div>
      <div v-if="bsError" class="bs-error">{{ bsError }}</div>
      <div class="bs-body">
        <div v-if="bsResults.length" class="bs-results">
          <div class="bs-section-label">{{ bsSearchLabel ? '结果 · ' + bsSearchLabel : 'RESULTS' }}</div>
          <div
            v-for="r in bsResults" :key="r.id"
            class="bs-result"
            :class="{ busy: bsDownloading === r.id }"
            @mouseenter="game.uiHover()"
            @click="bsDownloading ? null : (game.uiClick(), doDownload(r))"
          >
            <div class="bsr-cover" :style="r.coverUrl ? { backgroundImage: 'url(' + r.coverUrl + ')' } : {}"></div>
            <div class="bsr-info">
              <div class="bsr-name">{{ r.songName }}</div>
              <div class="bsr-author">{{ r.songAuthor || r.levelAuthor }}</div>
            </div>
            <div class="bsr-meta">
              <div class="bsr-bpm">{{ Math.round(r.bpm) }} <span>BPM</span></div>
              <div class="bsr-up">↑{{ r.upvotes }}</div>
            </div>
            <div class="bsr-dl">{{ bsDownloading === r.id ? '下载中…' : '下载 DOWNLOAD' }}</div>
          </div>
          <button
            v-if="bsBrowseActive"
            class="bs-more"
            :disabled="bsLoading"
            @mouseenter="game.uiHover()"
            @click="game.uiClick(); browseMore()"
          >{{ bsLoading ? '加载中…' : '加载更多 · MORE' }}</button>
        </div>
        <template v-else>
          <div class="bs-popular-section">
            <div class="bs-section-label">歌手</div>
            <div class="bs-pills">
              <button
                v-for="q in popularArtists" :key="'a-'+q"
                class="bs-pill artist"
                @mouseenter="game.uiHover()"
                @click="game.uiClick(); doQuickSearch(q)"
              >{{ q }}</button>
            </div>
          </div>
          <div class="bs-popular-section">
            <div class="bs-section-label">热门曲目</div>
            <div class="bs-pills">
              <button
                v-for="q in popularSongs" :key="'s-'+q"
                class="bs-pill"
                @mouseenter="game.uiHover()"
                @click="game.uiClick(); doQuickSearch(q)"
              >{{ q }}</button>
            </div>
          </div>
        </template>
      </div>
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
