<!--
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-14 08:36:44
 * @LastEditors: Linne Rella 3223961933@qq.com
 * @LastEditTime: 2025-04-19 23:06:20
 * @FilePath: \ElectronTorrent\README.md
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->

# ROTORE

<div align=center>
	<img src="https://github.com/LinneRELLa/ElectronTorrent/blob/main/resources/Xlogo2.png" style="width:256px;height:256px;"/>
</div>

基于 Electron + VUE3 + WEBTORRENT 的磁力下载工具，支持在线视频播放（附带新番磁力库）

更美观、简洁、易用  
## 展示
- 输入链接获取文件信息
<div>
	<img src="https://github.com/LinneRELLa/ElectronTorrent/blob/main/resources/d1.png" />
</div>
- 选择文件
<div>
	<img src="https://github.com/LinneRELLa/ElectronTorrent/blob/main/resources/d2.png" />
</div>
- 任务详情
 <div>
	<img src="https://github.com/LinneRELLa/ElectronTorrent/blob/main/resources/d3.png" />
</div>
- 追番/在线播放
<div>
	<img src="https://github.com/LinneRELLa/ElectronTorrent/blob/main/resources/a1.png" />
</div>
 <div>
	<img src="https://github.com/LinneRELLa/ElectronTorrent/blob/main/resources/a2.png" />
</div>
 <div>
	<img src="https://github.com/LinneRELLa/ElectronTorrent/blob/main/resources/l1.png" />
</div>
- 新增公网ipv6检测
  建议开启Ipv6,ipv6对于下载速度的提升显著

## 计划中的功能

- ~在线播放~ 已实现
  
- 拖拽种子文件以下载

- 侧边栏功能自定义

- 内嵌字幕播放处理（已在测试分支实现，需要进一步测试）
<div>
	<img src="https://github.com/LinneRELLa/ElectronTorrent/blob/main/resources/l2.png" />
</div>

## 开发环境

- Nodejs v22.14.0

- python3.x (部分python版本打包时需要pip install --upgrade setuptools)

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) + [TypeScript Vue Plugin (Volar)](https://marketplace.visualstudio.com/items?itemName=Vue.vscode-typescript-vue-plugin)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
## 许可证 (License)

本项目基于 GNU 通用公共许可证 v3.0 (GPLv3) 进行许可。
详细内容请查看 [LICENSE](LICENSE) 文件。

## 依赖项 (Dependencies)

本项目使用了以下主要的开源库：
* **WebTorrent** ([https://webtorrent.io/](https://webtorrent.io/)) - Licensed under the MIT License
* **FFmpeg** ([https://ffmpeg.org/](https://ffmpeg.org/)) - Licensed under the GNU LGPLv2.1 or later / GNU GPLv2 or later
