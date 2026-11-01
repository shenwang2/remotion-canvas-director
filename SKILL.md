---
name: remotion-canvas-director
description: 节目化口播导演。把中文口播录制剪成“人物镜头 ⇄ 信息画布”交替的节目：逐句判断观众的理解需求，前景在需要的那一刻接住观众；画布是一张贯穿全片的记忆地图，镜头逐站讲解、能飞回前面讲过的地方，人物在画布段缩成右下圆形头像。横屏、竖屏都支持，可选预处理（剪停顿/口误/语气词），直接出片。用户提到“画布导演”“节目化剪辑”“把口播剪成节目”时使用。
---

# Remotion Canvas Director

旧版的决策单位是“一句话配一个组件”，同一时刻画面元素没有上限，越补越乱。
本版的决策单位是**观众的理解需求**：逐句读口播，判断观众在这一句会卡在哪（记不住名字、看不到“这里”、想不出样子、忘了“刚才那个”……），
再决定前景怎么接住他、在哪个词上出现。没有需要的地方就让人物自己说。组件、排法、结构提示都只是回应手段。

**先读 `references/editing-logic.md`**：需求 → 回应的对照、排法工具箱、记忆地图、跟着说话呼吸的做法、自动检查的底线。
视觉系统和镜头语法（下面两节）是固定的；每条视频的画面内容由它自己的口播决定，所以不会千篇一律。

## 画面语法（必须遵守）

1. **只有三种镜头**，同一时刻只有一种：
   - `presenter`：人物实拍全屏。前景默认是**一行一张的小卡片**：一个要点一条 `tag`（左对齐的胶囊，宽度跟着字走），章节点、结论用带图标的 `card`；同一段的几条逐条冒出、排成一列（editing-logic.md A2b）。文字永远在玻璃上。
     **只有要装一个小画面时才用大卡片**：`glass(state(..., kicker, title, visual=vis_swap/vis_phone/vis_flow/vis_bars/vis_frame/vis_poll/vis_stamp(...)))`，一张大卡片只装这一段（一个状态），高度贴着内容；不要把一整段话的几个状态塞进同一块面板——面板按最高的状态撑高，字少时空出一大块、还会挡住头（A2d）。
     竖屏卡片优先排在头顶上方的墙面、贴着那块区域的上沿（离头远一点），左对齐；放不下才去下巴下方。左上角章节标已经写了的话（如“02 人物画面”），不要再放一张同样内容的卡片。
     景别变化（`snap` / `punch` / `back` / `push`）只留给最重的那一下和大转折，宁少勿多（editing-logic.md A2c）。
   - `canvas`：统一深色点阵画布（无文字纹理），人物缩成右下圆形头像继续说话。事实、数据、步骤、截图、录屏都只在这里出现。
   - `source`：素材全屏（竖屏素材居中成卡片），左上角一张引语卡。
   切换由人物画面在全屏与圆形头像之间形变完成（Presenter.tsx 的 MORPH），这就是转场，不另加转场特效。
2. **节奏**：讲观点、情绪、转折、号召 → presenter；讲“是什么、怎么做、证据” → canvas / source。一条视频人物镜头约占 30–60%。
   一段话可以同时是情绪和过程：痛点常常就是“老办法有多折腾”（回去改、重新跑、干等、耗额度），观众需要看到这个过程，他的态度可以叠在画面上，而不是只留在人物镜头的文字里。
3. **画布是一张贯穿全片的记忆地图**：画布镜头默认放在同一张地图上依次铺开，元素在说到时长出来并留在原地；回到画布时镜头从上次的位置飞过去；说到前面的东西时飞回那一站并重新点亮（`look_back` / `recall`）。
4. **结构提示是“定位”需求的一种回应**：清单（`hud: "agenda"`）、章节角标、回顾（`hud: "recap"`）只在观众需要知道“讲到哪了”时用，条目在说到时出现（`agenda[].atMs`）；不替整条视频预先总结一个清单贴上去。
5. **点睛克制**：`bigWord` 全片 3–5 个，只给钩子、品牌名、号召；身后大字（A2e）只给揭晓，一条一两次；音效只跟随镜头切换、标签/高亮、数字落定、章节标题。
6. **一套视觉语言**：只用 theme.ts 的颜色与字体（深灰底、黄色强调、青蓝辅助、红色警示、绿色正向）。不要为单个元素发明新样式。
   **人物实拍上不用黄色/琥珀**（在暖光房间里发脏、显土）：人物旁的小卡片用实拍专用色 `VTONE`（elements1.tsx：天蓝 `cyan`、薄荷绿 `green`、珊瑚红 `red`、淡紫 `purple`、雾蓝 `accent`/`blue`、少量珊瑚橙 `orange`）——字是白的，颜色只落在图标的圆底和 `{关键词}` 上，一张卡一种颜色。
   颜色跟着意思走：以前/问题/代价 → `red`；现在/好的变化 → `green`；信息、结论、操作 → `cyan`；章节、概念名 → `purple`；一般要点 → `accent`（雾蓝）；品牌（如 Claude）→ `orange`。

## 画布元件（elements1/2.tsx、motion.tsx）

`clip`（视频/截图卡，可带 kicker、黄框原话字幕、序号） · `entity`（图标+标题+副标题，`on` 时刻点亮） · `stat`（数字滚动） · `tag`（状态胶囊） · `highlight`（截图上框选并压暗其余区域） · `arrow` · `timeline` · `list` · `heading` · `note`。
截图里的关键设置项必须用 `highlight` 框出，并让镜头推近到该区域（camera stop 用 `rect`）。

### 图标与卡片样式

- **禁止用单个汉字当图标。** `icon` 一律写图标名：通用概念用 Lucide 名称（PascalCase，如 `FileText`、`Clapperboard`、`Mic`、`Captions`、`Search`、`Bot`、`Rocket`、`ShieldCheck`），品牌用 `brand:<simple-icons 名>`（如 `brand:github`、`brand:tiktok`）。写之前用 `node -e "console.log(!!require('lucide-react').icons.Name)"` 确认存在。
- 图标选“这句话讲的那个东西”，不是装饰：配音→`Mic`，字幕→`Captions`，检索→`Search`，矩阵号→`Layers`，卖工具→`PackageOpen`。
- 可带图标的位置：`entity.icon`、`heading.icon`、`stat.icon`、`tag.icon`（默认按色调：红 `TriangleAlert`、绿 `CircleCheck`、青 `Info`、黄 `Sparkles`）、`highlight.icon`、`timeline` 节点 `icon`、`clip.kickerIcon`、议程 `agenda[].icon`。
- 卡片是纯 iOS 风格（theme.ts 的 `card()` / `iconTile()` / `toneOn()`）：深色画布上用 iOS 深色模式表面（#1C1C1E、白字、灰色副字），人物实拍上用水晶玻璃、白字，配色用 `VTONE`（见上面第 6 条）；画布上只用系统色；图标块是“设置”里那种纯色圆角方块配白色图形；没有描边和发光，阴影小而柔；被讲到的卡片用一圈系统色描边表示选中。
- 画布背景（CanvasScene.tsx 的 `Backdrop`）必须能看出来：远景彩色光晕（随镜头 35% 视差移动）+ 细网格 + 交点亮点 + 胶片颗粒 + 暗角，全部无文字。毛玻璃卡片靠背后的光晕才显得出层次，不要把背景改回纯黑。

### 频道角标

`program.brand` 显示在每个镜头的右上角：`{"name": "<你的账号名>", "meta": ["<栏目名>", "EP <录制日期>"]}`。第一次用时问用户的自媒体账号名，`meta` 每期按日期更新。
样式是纯文字一行（名称 · meta · meta）：不加卡片底板、不加图标，所有文字统一用灰色 `T.sub`，名称只加粗，靠轻微文字阴影保证在实拍画面上可读。

## 流程

本 Skill 流程完全独立：转写、字幕、音效、人脸跟踪、渲染全部用本目录下的脚本和资源，不调用其他 Skill。
不得读取同一视频的旧剪辑结果。横屏（16:9）和竖屏（9:16）都支持，按口播原片的方向自动决定。

0. **先问用户要不要预处理**（剪掉长停顿、口误重说、嗯/呃）：「要」或「不要」。用户已经说过就不再问。

1. **准备工作目录**（work 一般是 `<视频目录>\canvas-director-work`）：
   `python scripts/prepare_work.py <work> --presenter <口播原片> --media demo.mp4=<素材路径> --media github.png=<截图路径> ...`
   素材用短的英文名，节目脚本里按这个名字引用。
2. **转写**（语音 → 每个字带毫秒时间的文字）。用装了 faster-whisper 的那个 Python：
   `python scripts/transcribe.py --input <口播原片> --output <work>/analysis/transcript.raw.words.json`
3. **对齐逐字稿、生成字幕**：
   `python scripts/make_transcript.py <work>/analysis/transcript.raw.words.json <work>/analysis/transcript.words.json --script <逐字稿.docx>`
   字幕以**实际说的话**为准：识别结果是底稿，逐字稿只用来纠正识别错的字——一段和稿子不同、但读音相近（硬钞机/印钞机、化妆化/画中画），按稿子改；读音不同（你即兴换了说法：相当/很、控制一下/指定），保留实际说的。脚本会列出每处“按稿子改 / 保留实际说的”的决定：逐条看一遍“保留”的那些，其中读音差得远、但确实是识别错的（如账号名被听成了一个普通词），写进 `<work>/analysis/corrections.json` 的 `replace` 再跑一次（加 `--corrections`；替换在断句之前做，跨两行的词也能改，`word_at` 也能找到改后的词）。拿不准是不是听错时，把那几秒单独再识别一次对照（例：“高达斯”“克戴斯”其实都是 Codex）。没有逐字稿时只用识别结果，专有名词要人工核对。节目脚本里用 `word_at` 找时间时，要用实际说的词，不是稿子上的词。
   **选了「要」预处理时**，接着跑：
   `python scripts/make_cleanbase.py <口播原片> <work>/analysis/transcript.words.json <work> --dry-run`
   读一遍列出的每处剪切（pause / retake「…」/ filler「…」）。确认没有误剪后去掉 `--dry-run` 再跑：生成原分辨率的干净版 `public/media/presenter.mp4`，字幕和词时间自动换算到新时间线，剪切记录在 `analysis/cut-map.json`，原片不动。之后所有步骤都基于干净版时间线。
4. **人脸跟踪**（在预处理之后，对 `public/media/presenter.mp4` 跑）：`python scripts/face_track.py <work>/public/media/presenter.mp4 <work>/analysis/face-track.json`（每秒一次，平滑后决定圆形头像裁切与推近中心，人移动时头像会跟着）。
5. **逐句标注理解需求**：`python scripts/annotate_needs.py <work>/analysis/transcript.words.json` 生成 `analysis/needs.json` 和一张逐句表。带着整条口播的意思复核这张表（字面线索会漏也会误报），再写**创意简报**（`brief.core / remember / signature`，必要时 `exceptions`）。
   表的最后列出**在描述过程的段落**。逐段回答一次：有素材能直接展示这个过程吗？没有的话，解释动画能让观众看懂吗（先翻 `references/explainer-library.md`，按这段话的形状挑；没有合适的就按同一视觉规范现做）？确实不需要（比如一句带过、观众一听就懂）就写进 `brief.exceptions`。“这条素材很多”不等于每一段都有素材，按段判断。这些段落之外，自己读口播时发现的过程也一样处理。
   解释动画要让过程里的那个东西真的走一遍、被每一步处理（editing-logic.md B0b）。口播里有“动作/变化”、画面本身表达不出来的时刻，列成**特效候选**交给用户挑（B0c），不默认加。
6. **写节目脚本**（Python，放在 `<work>/scripts/`；可用的函数见 `scripts/canvaslib/` 里各函数的说明，人物旁卡片按 editing-logic.md A2b 写：一行一张小卡片，只有小画面才用大卡片）：
   - 竖屏视频在脚本开头调用 `canvaslib.configure(portrait=True)`：所有排法预设自动换成纵向排列（取景区接近正方形，镜头沿页面向下走）。画面尺寸和时长由 `presenter.mp4` 自动决定。
   - 用 `canvaslib` 的 `presenter / source / canvas / recall` 列镜头表，时间写绝对毫秒。每个元素的时间用 `word_at(transcript, "关键词", after_ms)` 取（默认提前 150ms），不要估；回指用 `recall(...)` 或在镜头里加 `look_back(...)`；人物镜头里的内容用 `presenter(..., beside=[[card(...), tag(...)], ...])`（editing-logic.md A2）。
   - 每个画布镜头按它要回应的需求选排法（editing-logic.md B 节）；预设自动算坐标、镜头路线并放到地图上。没有合适的就用 `el()` 手排并给一个新的 `layout` 名。
   - 揭晓核心概念、做出来的东西叫什么的那一刻，可以让这个词立在人物身后（`presenter(..., behind=[behind_word(...)])`，editing-logic.md A2e）：一条一两次，字立着时不放景别变化；抠像由 `finalize` 自动做（需要 GPU，每秒画面约 18 秒，做过的复用）。
   - 截图高亮的像素坐标要实际看图量出来。
   - `finalize()` 输出 `program.json`（含字幕与音效）。
   - **配乐**：`finalize(..., music=music())` 用用户选定的默认曲（曲库目录 `$CANVAS_MUSIC_ROOT`，默认 `~/canvas-director-music`，里面的 `偏好.json` 的 `default`）。曲库是用户自己放的曲子，skill 不带任何音乐；曲库还没建时这条视频不配乐。说话时自动压低，镜头切换和入场就近卡到拍子上，有起势点时对到揭晓（editing-logic.md G）。同时生成不带音乐的 `program.nomusic.json`。用户想换曲时先跑 `scripts/music_sampler.py` 出试配样片，让他按编号挑，不要凭数据替他选。曲库新加了曲子，先跑 `scripts/analyze_music.py`。
7. `python scripts/check_program.py <work>/program.json`：除了可读性和节奏，它双向核对前景与口播——对不上口播的卡片（装饰/编出来的总结）、口播里需要画面却没回应的地方（名字数字没上屏、“看一下”时还是人物、回指没飞回去）。ERROR 必须改；WARN 要么改，要么写进 `brief.exceptions`。
8. `bash scripts/sync_runtime.sh`（运行时默认在 `~/canvas-director-runtime`，可用 `$CANVAS_RUNTIME` 改，首次会 npm install）。
9. 抽 6–10 帧，按 editing-logic.md 的 F 节自检（`npx remotion still ... --scale=0.4`）。用户不需要看这些自检图。
10. 渲染：`npx remotion render src/index.ts Main <out>.mp4 --props=<work>/program.json --public-dir=<work>/public --codec=h264 --crf=18`。只改 Skill 细节时不要自动重渲染整条视频，等用户要求。
11. **编辑台**（成片之后想自己改，用户说“打开编辑台”时由我来开）：`bash scripts/open_desk.sh <work>`，先打包约 20 秒，从 5180 起自动找一个能用的端口（Windows 重启后常会保留一段端口），地址以输出的「编辑台已打开：…」为准（在桌面版里用 `.claude/launch.json` 跑 `node <runtime>/desk/start.mjs <work>`，不写死端口，再 `preview_start`）。编辑台的代码在 `template/desk/`，随 `sync_runtime.sh` 一起装到运行时。
   左边预览，右边按时间列出可改的内容：字幕文字和时间、画面上的文字、隐藏某个元素或让它早/晚出现、镜头切入点前后挪、关掉某次景别变化、
   音乐开关/音量/转场重音/换曲（换曲会重新生成，卡点按新曲子重算）、每个音效换成音效库里的另一个或关掉、音效整体音量，最后一键导出（带音乐或不带）。
   修改单独存在 `<work>/overrides.json`，AI 重新生成 program.json 也不会丢；导出用同一个渲染程序、原分辨率、同样画质（`<work>/out/`）。
   音效库：`assets/sfx/` 共 24 个，按用途分类（转场、揭晓、出现、计数/打字、提示、落定/强调、标题），`assets/sfx/sfx.json` 是索引；
   新合成的由 `scripts/make_sfx.py` 生成，用户下载的真实音效也可以放进来并在索引里登记用途。
12. **沉淀**：这条里现做了解释动画的，判断它讲的是不是一类会反复出现的过程；是就参数化、横竖都能排、登记进组件库，并在 `references/explainer-library.md` 加一行和一张预览图（步骤见该文件文末）。只属于这一句的特例留在节目脚本里。

## 取景安全区

camera.ts 的 `SAFE` 让画布内容落在左上角标下方、字幕带上方。排画布时同一停靠点里的元素宽高比尽量接近 16:9；横向排太宽会把录屏挤小——录屏为主时把步骤卡排在录屏下方一行。

竖屏以字幕位置为准往上排：字幕默认距底部 20%（抖音底部的描述文字、评论会挡住更低的位置），带圆角半透明黑底（`captionStyle`，编辑台可改位置、开关底色、透明度、圆角）；
头像紧贴在字幕上方（右侧），画布取景区 `SAFE_PORT`（上 13% 到头像上沿，左右各留 5%）随之收紧，都在运行时由 `layout.ts` 从字幕位置算出。镜头最多放大 2 倍，小高亮框不会被推成模糊特写。
竖屏人物镜头的小卡片（`tag` / `card`）优先放在头顶上方：从画面高度 10%（左上角章节标下面）到头顶，贴着这块区域的上沿、左对齐排，一组放不下才回到下巴和字幕之间（`_layout_beside`）。
装小画面的大卡片也优先用头顶上方，贴上沿；空间不够时整体等比缩小（最多到 70%），再不够才提示把状态写紧凑（一行标题 + 小画面）。
地图上的录屏从它出现的那一刻开始播放（`video(src, trim)` 的 trim 是素材内的起点），所以按口播对齐素材时间：先量出素材里那个操作在第几秒，再让它出现的时刻 + (操作秒数 − trim) 落在说到它的词上；一段长录屏讲到不同部分时，可以在同一位置叠放几个不同 trim 的 clip。
