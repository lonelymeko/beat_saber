# 社区谱格式支持明细

以实际解析器行为为准(`src/audio/beatsaver.ts`),更新于 2026-07。

## 包结构(BeatSaver .zip)

| 内容 | 支持情况 |
|---|---|
| Info.dat v2.0 / v2.1 | ✅ 曲名/作者/BPM/音频文件名/封面 |
| 多难度 | ✅ `_difficultyBeatmapSets` 权威映射,优先 Standard 特征集,自定义难度标签(如 "Only Wall Show") |
| 音频 | ✅ `.egg` / `.ogg`(解码后以真实音频时长为关卡终点) |
| 封面 | ✅ 下载源 URL 优先,zip 内图兜底 |
| SongCore 配色 | ✅ `_colorLeft/_colorRight/_envColorLeft/_envColorRight/_obstacleColor` |
| 官方 colorSchemes(v2.1) | ✅ `_colorSchemes` + `_beatmapColorSchemeIdx`,saberA/B → 方块、environmentColor0/1 → 灯光分开取色 |

配色优先级:逐物件 Chroma > SongCore customColors > colorSchemes > 默认红蓝。

## v2 谱面(`_notes` / `_obstacles` / `_events`)

modchart / 观赏谱生态的主体格式,支持最深。

### 音符
- 9 切割方向(含四斜向;8 = 圆点),炸弹
- customData:`_position` 精确坐标、`_color`(Chroma)、`_fake`(剔除)、`_interactable: false`(幽灵音符:显示不判定)、`_track`、`_animation`

### 墙体
- 全高墙 / 蹲墙、宽度、时长
- customData:`_position` / `_scale`(墙体艺术真实坐标渲染)、`_color`、静态 `_rotation`(世界偏航)/ `_localRotation`(三轴欧拉)、`_track` / `_animation`
- Mapping Extensions 型 `_type ≥ 1000` 的墙:靠 NE 坐标覆盖兼容

### 灯光事件
- 类型:0 背景辉光 / 1 隧道霓虹 / 2·3 左右激光 / 4 地板 / 5 boost / 8 环旋转 / 9 环缩放 / 12·13 激光转速
- 值 0-12 全语义(红 / 蓝 / 白 × on / flash / fade)
- 逐事件 Chroma 颜色(`_customData._color`)

### Noodle Extensions 自定义事件
- `_pointDefinitions` 关键帧库(命名引用 / 常量自动归一)
- `AnimateTrack`(实时轨道动画)、`AssignPathAnimation`(生命周期路径动画)
- `AssignTrackParent`(轨道父子链,≤5 层传递)
- `AssignPlayerToTrack`(镜头飞行,桌面端;光剑视觉随镜头)
- 动画属性:`_position` / `_rotation` / `_localRotation` / `_scale` / `_dissolve` / `_definitePosition`,18 种缓动函数

## v3 谱面(`colorNotes` / …)

基础对象全支持:

- 彩色音符、炸弹、墙体
- **滑条**(`sliders` → 弧线引导)、**链条**(`burstSliders` → 贝塞尔链节)
- `basicBeatmapEvents` + `colorBoostBeatmapEvents`;组灯 `lightColorEventBoxGroups` 平铺兜底
- 逐物件 / 逐事件 Chroma(`customData.color`)

注:v3 命名的 Noodle 字段(`coordinates` / `track` / `animation`)暂未覆盖——现存 modchart 绝大多数使用 v2 格式。

## 明确不支持(诚实边界)

| 缺口 | 影响 | 状态 |
|---|---|---|
| **v4 格式**(1.34+ 索引化结构) | 新谱占比在涨,解析不完整 | 规划中 |
| **BPM 变更**(v2 `_BPMChanges` / v3 `bpmEvents`) | 变速谱时间轴漂移 | 规划中 |
| 90° / 360° 旋转谱(`rotationEvents`) | 该类谱不可玩 | 待评估 |
| ME 精确格编码(lineIndex 1000+) | 极少数纯 ME 谱错位 | 低优先 |
| `AssignFogTrack`、`_dissolveArrow` 单独箭头溶解 | 个别视觉细节缺失 | 低优先 |
| **Vivify**(Unity 资产包) | 网页原理性无法加载 | 无解(以主题环境近似,如 Reply 神社) |
