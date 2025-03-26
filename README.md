<!--
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-14 08:36:44
 * @LastEditors: Linne Rella 3223961933@qq.com
 * @LastEditTime: 2025-03-26 21:01:18
 * @FilePath: \ElectronTorrent\README.md
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->

# ROTORE

<div align=center>
	<img src="https://github.com/LinneRELLa/ElectronTorrent/blob/main/resources/Xlogo2.png" style="width:256px;height:256px;"/>
</div>

基于 Electron + VUE3 + WEBTORRENT 的磁力下载工具，支持在线p2p播放（附带新番磁力库）

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

## 计划中的功能

- <span style="text-decoration-line: line-through;">在线播放</span> 已实现
  
- 拖拽种子文件以下载

- 侧边栏功能自定义

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
