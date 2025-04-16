/*
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-14 08:36:44
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-04-16 16:31:58
 * @FilePath: \ElectronTorrent\src\preload\index.ts
 * @Description: 预加载脚本，用于安全地将 Node.js 和 Electron API 暴露给渲染进程。
 */
import { contextBridge, shell  } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import * as fs from 'fs' // 保持导入整个 fs 模块
import * as path from 'path'

// Custom APIs for renderer (保持为空，除非你有自定义 API)
const api = {}

// 使用 `contextBridge` API 安全地暴露 Electron API 给渲染进程
// 仅当上下文隔离 (contextIsolation) 启用时（推荐）
if (process.contextIsolated) {
  try {
    // 暴露 Electron Toolkit 提供的 API (例如 ipcRenderer.invoke 等)
    contextBridge.exposeInMainWorld('electron', electronAPI)

    // 暴露你的自定义 API (如果需要)
    contextBridge.exposeInMainWorld('api', api)

    // 暴露特定的 Node.js API 给渲染进程
    contextBridge.exposeInMainWorld('nodeAPI', {
      fs: {
        ...fs,
        // 只暴露需要的方法，增强安全性
        // 异步读取文件内容，返回 Buffer (MSE 方案需要)
        readFile: (filePath: string): Promise<Buffer> => fs.promises.readFile(filePath),
        // 检查文件是否存在 (外部播放器逻辑需要)
        existsSync: (filePath: string): boolean => fs.existsSync(filePath)
        // 如果还需要 fs 的其他方法，在此处显式添加，例如：
        // stat: (filePath: string) => fs.promises.stat(filePath)
      },
      path: {
        // 暴露 path.join (如果需要)
        join: (...paths: string[]): string => path.join(...paths)
        // 如果还需要 path 的其他方法，在此处显式添加
      },
      shell: {
        // 显式暴露需要的 shell 方法，例如打开文件或链接
        openPath: (filePath: string): Promise<string> => shell.openPath(filePath),
        openExternal: (url: string): Promise<void> => shell.openExternal(url)
        // 根据需要添加其他 shell 方法
      }
    })
  } catch (error) {
    console.error('暴露 API 到渲染进程时出错:', error)
  }
} else {
  // 如果上下文隔离未启用 (不推荐)，则直接挂载到 window 对象
  // @ts-ignore (需要 d.ts 文件来定义类型)
  window.electron = electronAPI
  // @ts-ignore (需要 d.ts 文件来定义类型)
  window.api = api
  // @ts-ignore (需要 d.ts 文件来定义类型)
  // 注意：这种方式安全性较低
  window.nodeAPI = {
      fs: {
        readFile: fs.promises.readFile,
        existsSync: fs.existsSync
        // ... 其他需要的方法
      },
      path: path, // 可以暴露整个 path 对象，或者像 fs 一样只暴露方法
      shell: shell // 暴露整个 shell 对象
  }
}

// 可选：如果你在 Vue 组件中还需要使用 ipcRenderer.on, send 等，
// 也需要通过 contextBridge 暴露它们。electronAPI 通常包含了 invoke/handle 的封装。
// 例如，如果你需要 'on'：
/*
if (process.contextIsolated) {
    contextBridge.exposeInMainWorld('myIpcRenderer', {
        send: (channel, data) => ipcRenderer.send(channel, data),
        on: (channel, func) => {
            const validChannels = ["channel-from-main1", "channel-from-main2"]; // 定义允许监听的频道
            if (validChannels.includes(channel)) {
                // Deliberately strip event as it includes `sender`
                ipcRenderer.on(channel, (event, ...args) => func(...args));
            }
        },
        removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel) // 清理监听器很重要
    });
} else {
     // @ts-ignore
    window.myIpcRenderer = { send: ipcRenderer.send, on: ipcRenderer.on, removeAllListeners: ipcRenderer.removeAllListeners };
}
*/