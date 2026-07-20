# Beat Saber WebXR — 开发路线图

## 已完成

### 基础玩法
- [x] Three.js 3D 渲染（桌面 + VR 双模式）
- [x] 方块生成与打击检测（切向判定、速度计分、bad cut / miss）
- [x] 墙壁 / 炸弹 / 蹲伏墙壁
- [x] 粒子爆发 + 碎片飞散 + 打击音效（三层合成 + 立体声 pan）
- [x] 计分系统：连击、倍率、血量、准确率
- [x] 无敌模式（No Fail：首轮扣 50% 总分后血条隐藏）

### UI
- [x] 桌面 DOM HUD（得分 / 连击 / 倍率 / 血量 / 进度 / 歌名）
- [x] VR 3D HUD（Canvas 纹理 Sprite + Plane 进度条，2m 镜头跟随）
- [x] 倒计时、暂停面板、结算面板、失败面板
- [x] VR 选歌菜单（多行卡片 + 激光射线 + 扳机点选）
- [x] VR 手柄暂停 / 重开 / 退出（左手菜单键暂停，左右扳机选择）

### 谱面系统
- [x] 内置 3 首合成歌曲（霓虹脉冲 / 墨影山河 / 星海远航）
- [x] 谱面生成器（方向交替流 + 墙壁 + 炸弹 + 难度分层）
- [x] BeatSaver API 搜索 + 下载（社区 12 万+ 曲库）
- [x] ZIP 解析（手动解析 Central Directory + async inflate）
- [x] BeatSaver v2 格式支持（`_notes`, `_obstacles`）
- [x] BeatSaver v3 格式支持（`colorNotes`, `bombNotes`, `obstacles`）
- [x] 音频解码（Ogg Vorbis → Web Audio API decodeAudioData）
- [x] 拍数→秒数转换（beats × 60/BPM）
- [x] 封面图下载与显示（Blob → IndexedDB 持久化）
- [x] IndexedDB 本地缓存（下载后自动保存，刷新恢复）
- [x] 删除已下载谱面
- [x] BeatSaver 谱面 ID 直输下载

### 场景
- [x] 3 个内置场景（Neon / Ink / Space）
- [x] Canvas 纹理粒子系统
- [x] 网格地面 + fog + 场景管理（BaseEnv 类）

### 工程
- [x] 全项目 TypeScript 化（tsconfig + 类字段声明 + `src/types.ts` 共享类型，`tsc --noEmit` 通过）
- [x] 官方式切块（两半沿挥剑平面分离 + 白热切面）替代碎渣粒子
- [x] 官方式方块面纹理（宽厚山形箭头 + 圆点）
- [x] 打击音效：Beat Saber 本体提取 hit1-10 随机变体 + LastHit 尾音（GameBanana 社区包），链节用降音量升调变体，无文件时回退合成音

---

## 待完成

### 1. 彩灯事件 ✅ 已完成
- [x] v2 `_events` 解析（`_time/_type/_value/_floatValue`）
- [x] v3 `basicBeatmapEvents` + `colorBoostBeatmapEvents` 解析
- [x] v3 纯灯组谱面降级：`lightColorEventBoxGroups` 展平为基础事件、`lightRotationEventBoxGroups` 映射为 ring spin
- [x] 官方默认舞台 `OfficialEnv`（env id `official`，BeatSaver 谱面默认）：
  - 跑道 + 轨道边缘灯带 + 远端光晕（type 4 中心灯）
  - 方形灯环隧道 ×12，支持 ring spin（type 8 级联旋转）/ ring zoom（type 9 间距缩放）
  - 背景激光扇（type 0）、左右旋转激光阵（type 2/3，type 12/13 控转速）
  - 官方事件语义：on/flash/fade/transition × 红/蓝/白，color boost（type 5）切换增强配色
- [x] 播放循环按秒派发事件（顺序指针 `G.lightIdx`）；IndexedDB 持久化 `lights`
- [x] 无灯光数据的谱面：内置节拍灯光秀兜底
- 后续可做：`lightColorEventBoxGroups` 按灯 id 精确 keyframe 渐变（当前为近似展平）、`lightTranslationEventBoxGroups` 平移

### 2. 滑条 & 连打 ✅ 已完成
- [x] `sliders`（arc 弧形滑条）：解析头/尾音符坐标+方向+mu/tmu，`CubicBezierCurve3` + `TubeGeometry` 发光光带，随传送带移动，尾部过判定面后回收——与官方一致为纯视觉引导（计分仍在头尾 colorNote）
- [x] `burstSliders`（chain 连打）：头音符保留谱面原 colorNote；沿头方向二次贝塞尔插值出 `sc-1` 个链节薄片（squish `s` 压缩系数），存 `wx/wy` 世界坐标
- [x] 链节判定：同色军刀触碰即得（无方向门槛、半速门槛），每节 20×倍率分、计连击但不进准度模型；异色=坏切断连击；漏掉断连击小扣血
- [x] 桌面/VR 两套判定路径 + 自动演示瞄准均支持链节；IndexedDB 持久化 `arcs`

### 3. 自定义场景材质 ← 参照正版
有些谱面自带场景模型和材质，需要 GLTF 加载。

**Beat Saber 官方场景要素**：
- 地面网格（发光线条）
- 两侧灯柱（发激光、变色）
- 背景光晕/粒子
- 中心舞台（发光环）
- 环境雾效

**参考仓库**：
| 仓库 | 说明 |
|------|------|
| [supermedium/beatsaver-viewer](https://github.com/supermedium/beatsaver-viewer) | A-Frame + Three.js，浏览器直接渲染 BS 谱面 |
| [Beat Saber 官方 Modding Wiki](https://bsmg.wiki/) | 社区 Mod 文档 |

**实现思路**：
- `BasicBeatmapEvents` → 环境灯光控制（DirectionalLight 颜色/强度）
- `LightColorEventBoxGroups` → 灯柱 Shader 材质颜色渐变（`ShaderMaterial` + uniforms）
- 自定义环境 → 解析 `Environment.dat` 文件 → `GLTFLoader` 加载模型
- Chroma 扩展 → `_customData._color` 按音符/墙壁独立着色

### 4. Noodle Extensions / Chroma 支持（Chroma 颜色部分 ✅）
- [x] 谱面级自定义颜色：Info.dat `_customData._colorLeft/_colorRight/_obstacleColor`(SongCore 约定,按选中难度匹配)→ 音符/军刀/舞台灯光整体换色
- [x] Chroma 逐音符颜色:v3 `customData.color` / v2 `_customData._color` → 按色缓存金属材质
- [x] Chroma 逐墙颜色 + 墙体官方观感(深红半透 + 加色亮边,bloom 辉光)
- [ ] Chroma 灯光事件颜色覆盖(`customData.color` on basicBeatmapEvents)
- [ ] Noodle Extensions:音符动画(`_customData._animation`)、墙壁穿透

### 5. UI 增强
- [x] VR 暂停/结算/失败面板**可视化卡片按钮**（激光指向 + 悬停放大 + 扳机点选；暂停=继续/重开/选歌，结算失败=重试/选歌；替代原"左右扳机"文字提示）
- [ ] 下载进度条更精细（解析 hash → 下载 → 解压 → 解码音频各阶段百分比）
- [ ] VR 内建键盘输入（搜索框输入歌名）

### 6. 多源聚合
| 源 | 状态 |
|------|------|
| [BeatSaver](https://beatsaver.com) | ✅ 已接入 |
| [BeatLeader](https://beatleader.com) | ⬜ 待接入（需研究 API） |
| [bs.wgzeyu.com](https://bs.wgzeyu.com) | ❌ 无搜索 API |

### 7. 性能优化
- [ ] 大量方块时启用 instanced rendering（`InstancedMesh`）
- [ ] 墙体合并渲染（`mergeGeometries`）
- [ ] 粒子系统用 `BufferGeometry` + `computeInAdvance` 减少 GC

---

## 技术参考清单

| 名称 | 类型 | 地址 |
|------|------|------|
| Beat Saber 正版场景 | 参考 | Steam/Quest 游戏本体 |
| beatsaver-viewer | 开源 Web 播放器 | https://github.com/supermedium/beatsaver-viewer |
| BSMG Modding Wiki | 社区文档 | https://bsmg.wiki/ |
| BeatSaver API | 谱面 API | https://api.beatsaver.com/docs/ |
| Beat Saber 谱面格式 v3 | 格式文档 | https://bsmg.wiki/mapping/map-format.html |
| BeatLeader API | 社区排行 | https://api.beatleader.com |
| Three.js | 3D 引擎 | https://threejs.org/ |
| WebXR Spec | VR 标准 | https://immersiveweb.dev/ |
