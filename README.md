# 画布导演 · remotion-canvas-director

一个给 [Claude Code](https://claude.com/claude-code) 用的口播视频自动剪辑 skill。把一条中文口播录制，剪成「人物镜头 ⇄ 信息画布」交替的节目，直接出片。

它不是「一句话配一个模板组件」，而是逐句判断**观众此刻会卡在哪**（记不住名字、看不到“这里”、想不出样子、忘了“刚才那个”……），在需要的那一刻让前景接住观众；没有需要的地方，就让人自己说。

## 能做什么

- **两种镜头交替**：人物镜头（旁边配一行一行的小卡片，要演一个意思时用带小画面的大卡片）和信息画布（人物缩成右下角圆形头像继续讲）。
- **画布是一张贯穿全片的记忆地图**：讲过的东西留在原地，说到“刚才那个”时镜头会飞回去。
- **解释动画**：讲到一个过程、手上又没素材时，自己判断要不要画一个动画（检索、流水线、来回成本……），让过程里的那个东西真的走一遍。
- **身后大字**：揭晓关键词时，字立在人物身后的房间里，头发挡住字的下沿（AI 抠像）。
- **竖屏适配平台**：字幕默认在距底部 20%，避开抖音等平台底部的描述和评论；横屏、竖屏都支持。
- **可选预处理**：剪掉长停顿、口误重说、嗯/呃，生成原分辨率的干净版。
- **配乐**：用你自己的曲库，自动分析节拍和段落，转场落在拍子上；换曲用「试配样片」凭耳朵挑。
- **编辑台**：剪完后打开一个本地网页，左边预览、右边改字幕、画面元素、镜头切点、音乐、每个音效，点画面上的东西右边就跳到对应的项；改动单独保存，AI 重新生成也不会覆盖；一键导出，画质和直接出片一样。

## 需要准备

- **Claude Code**：这个 skill 由 Claude 读 `SKILL.md` 来执行，在其他工具里不一定能直接用。
- **Node.js 18+** 和 **ffmpeg**（命令行里能直接调用）。
- **Python 3.10+**，装好：
  ```bash
  pip install faster-whisper jieba pypinyin numpy pillow opencv-python mediapipe librosa transparent-background
  ```
  转写（faster-whisper large-v3）和抠像（transparent-background）强烈建议用 **NVIDIA 显卡 + CUDA 版 PyTorch**，CPU 也能跑但很慢。
- 可选：`funasr`（另一种中文转写后端）。

## 安装

1. 把整个文件夹放到 `~/.claude/skills/remotion-canvas-director/`。
2. 第一次用之前装渲染运行时（会在 `~/canvas-director-runtime` 里 `npm install`，可用环境变量 `CANVAS_RUNTIME` 改位置）：
   ```bash
   bash ~/.claude/skills/remotion-canvas-director/scripts/sync_runtime.sh
   ```
3. （可选）建自己的曲库：把曲子按情绪分文件夹放进 `~/canvas-director-music`（或用 `CANVAS_MUSIC_ROOT` 指定位置），然后跑：
   ```bash
   python ~/.claude/skills/remotion-canvas-director/scripts/analyze_music.py ~/canvas-director-music
   ```
   skill **不带任何音乐**。没有曲库时照常出片，只是不配乐。想指定默认曲，在曲库里写一个 `偏好.json`：`{"default": "燃/某首曲子.mp3"}`。

## 怎么用

在 Claude Code 里说：

> 用画布导演帮我剪这条口播：`<口播视频路径>`，逐字稿是 `<逐字稿.docx>`

Claude 会先问要不要预处理，然后转写、对齐字幕、逐句判断观众需求、写节目脚本、自动检查、渲染。剪完想自己改，说「打开编辑台」。

详细流程和剪辑逻辑见 [`SKILL.md`](SKILL.md) 和 [`references/editing-logic.md`](references/editing-logic.md)。

## 第三方许可

- 渲染基于 [Remotion](https://www.remotion.dev)。**Remotion 有自己的许可**：个人和小团队可以免费用，达到一定规模的公司需要购买授权，详见 [remotion.dev/license](https://www.remotion.dev/license)。
- 图标：[Lucide](https://lucide.dev)（ISC）、[Simple Icons](https://simpleicons.org)（CC0，品牌标志归各自所有者）。
- 转写：[faster-whisper](https://github.com/SYSTRAN/faster-whisper)（MIT）；抠像：[transparent-background](https://github.com/plemeri/transparent-background)（MIT）；人脸：[MediaPipe](https://github.com/google-ai-edge/mediapipe)（Apache-2.0）。
- `assets/sfx/` 里的音效由 `scripts/make_sfx.py` 合成。

## 协议

本仓库代码以 [MIT](LICENSE) 协议开源。
