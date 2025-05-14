/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * @Author: chengp 3223961933@qq.com / Linne Rella
 * @Date: 2025-03-14 08:36:44
 * @Last Modified time: 2025-04-21 14:36:00 +0800 // Updated timestamp for clarity
 * @Description: Electron 主进程文件，包含窗口管理、WebTorrent 客户端、IPC 通信和文件关联处理。 (Tracker 获取逻辑已修改)
 */
import { app, shell, BrowserWindow, ipcMain, Menu, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/x1.ico?asset' // 确保图标路径正确
import { execFile } from 'child_process'
import { networkInterfaces, tmpdir } from 'os'
import * as fs from 'fs'
import type WebTorrent from 'webtorrent' // 导入 WebTorrent 类型 (如果安装了 @types/webtorrent)
// import trackerlist from './trackerlist.json' // --- REMOVED:不再从本地文件读取 ---
import * as https from 'https' // --- ADDED: 用于发起 HTTPS 请求 ---
import { spawn } from 'child_process' // 导入 spawn 用于执行外部程序
import { fileURLToPath } from 'node:url'; 
import { dirname } from 'node:path';
import  WebTorrent from 'webtorrent'
const filenamex = fileURLToPath(import.meta.url);
const dirnamex = dirname(filenamex);
console.log(dirnamex,'dirnamex')
// --- 全局变量 ---
let mainWindow: BrowserWindow | null = null // 主窗口实例
let webtorrentClient: WebTorrent.Instance | null = null // WebTorrent 客户端实例 (使用类型或 any)
const pendingTorrentPaths: string[] = [] // 存储待处理的文件路径队列 (处理应用启动时客户端尚未初始化的情况)
let dynamicTrackerList: string[] = [] // --- ADDED: 存储动态获取的 Tracker 列表 ---

// --- 路径定义 ---
// 打包后资源路径为 process.resourcesPath，开发时为 app.getAppPath()
const publicPath = app.isPackaged ? process.resourcesPath : app.getAppPath()
const userDataPath = app.getPath('userData')
const userConfigDir = join(userDataPath, 'config')
const configPath = join(userConfigDir, 'config.json')
const downloadStorePath = join(userConfigDir, 'DownloadStore.json')

const FFPath = join(publicPath, 'ffmpeg') // FFmpeg 路径

function ensureUserDataConfig(): void {
  const userDataPath = app.getPath('userData')
  const userConfigDir = join(userDataPath, 'config')
  const userConfigPath = join(userConfigDir, 'config.json')
  const userDownloadStorePath = join(userConfigDir, 'DownloadStore.json')

  const defaultConfigPath = join(publicPath, 'config/config.json')
  const defaultDownloadStorePath = join(publicPath, 'config/DownloadStore.json')

  try {
    if (!fs.existsSync(userConfigDir)) {
      fs.mkdirSync(userConfigDir, { recursive: true })
      console.log(`首次运行：创建用户配置目录 ${userConfigDir}`)
    }

    if (!fs.existsSync(userConfigPath)) {
      if (fs.existsSync(defaultConfigPath)) {
        fs.copyFileSync(defaultConfigPath, userConfigPath)
        console.log(`首次运行：复制默认 config.json 到 ${userConfigPath}`)
      } else {
        console.error(`默认配置文件未找到: ${defaultConfigPath}，将创建最小配置。`)
        const minimalConfig = {
          downloadPath: app.getPath('downloads'),
          playerPath: '',
          useProxy: false,
          proxyPath: '',
          homePath: 'local'
        }
        fs.writeFileSync(userConfigPath, JSON.stringify(minimalConfig, null, 2), 'utf-8')
      }
    }

    if (!fs.existsSync(userDownloadStorePath)) {
      if (fs.existsSync(defaultDownloadStorePath)) {
        fs.copyFileSync(defaultDownloadStorePath, userDownloadStorePath)
        console.log(`首次运行：复制默认 DownloadStore.json 到 ${userDownloadStorePath}`)
      } else {
        fs.writeFileSync(userDownloadStorePath, '[]', 'utf-8')
        console.log(`首次运行：创建空的 DownloadStore.json 到 ${userDownloadStorePath}`)
      }
    }
  } catch (error: any) {
    console.error('初始化用户配置文件时出错:', error)
    dialog.showErrorBox('配置错误', `无法初始化用户配置文件：\n${error.message}`)
  }
}

// --- ADDED: 获取并更新 Tracker 列表的函数 ---
async function fetchAndUpdateTrackers(): Promise<void> {
  const url = 'https://cf.trackerslist.com/all.txt'
  console.log(`[Trackers] 开始从 ${url} 获取 Tracker 列表...`)
  return new Promise((resolve) => {
    const request = https.get(url, (response) => {
      let data = ''
      if (response.statusCode !== 200) {
        console.error(`[Trackers] 获取 Tracker 列表失败。状态码: ${response.statusCode}`)
        dynamicTrackerList = [] // Fallback to empty list
        resolve()
        response.resume()
        return
      }
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        data += chunk
      })
      response.on('end', () => {
        try {
          const lines = data.split('\n')
          // Basic parsing: split by newline, trim, filter empty lines
          const trackers = lines.map((line) => line.trim()).filter((line) => line !== '')
          dynamicTrackerList = trackers
          console.log('[Trackers] 成功获取并解析 Tracker 列表:')
          console.log(dynamicTrackerList) // --- DEBUG: 打印获取到的数组 ---
          resolve()
        } catch (parseError) {
          console.error('[Trackers] 解析 Tracker 列表时出错:', parseError)
          dynamicTrackerList = [] // Fallback to empty list
          resolve()
        }
      })
    })

    request.on('error', (error) => {
      console.error(`[Trackers] 从 ${url} 获取 Tracker 列表时发生网络错误:`, error)
      dynamicTrackerList = [] // Fallback to empty list
      resolve()
    })

    // Optional: Add timeout if needed
    // request.setTimeout(10000, () => { // 10 seconds timeout
    //   console.error(`[Trackers] 从 ${url} 获取 Tracker 列表超时。`);
    //   request.destroy(); // Destroy the request on timeout
    //   dynamicTrackerList = [];
    //   resolve();
    // });
  })
}

// --- 文件关联处理核心函数 ---
function handleTorrentFilePath(filePath: string): void {
  if (filePath && typeof filePath === 'string' && filePath.toLowerCase().endsWith('.torrent')) {
    console.log(`[文件关联] 准备处理 Torrent 文件: ${filePath}`)

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }

    if (!fs.existsSync(filePath)) {
      console.error(`[文件关联] 文件不存在: ${filePath}`)
      dialog.showErrorBox('文件错误', `无法打开种子文件，文件不存在：\n${filePath}`)
      return
    }

    if (webtorrentClient) {
      addTorrentToClient(filePath)
    } else {
      console.warn('WebTorrent 客户端尚未初始化，将文件路径加入待处理队列。')
      if (!pendingTorrentPaths.includes(filePath)) {
        pendingTorrentPaths.push(filePath)
      }
    }
  } else {
    console.warn(`[文件关联] 收到无效的文件路径或类型: ${filePath}`)
  }
}

// --- 内部添加 Torrent 的函数 (重构后) ---
function addTorrentToClient(identifier: string | Buffer, resume: boolean = false): void {
  if (!webtorrentClient) {
    console.error('[内部添加] WebTorrent 客户端未初始化! 无法添加:', identifier)
    if (typeof identifier === 'string' && !pendingTorrentPaths.includes(identifier)) {
      pendingTorrentPaths.push(identifier)
    }
    return
  }

  let downloadPath = ''
  try {
    const configContent = fs.readFileSync(configPath, 'utf-8')
    const configData = JSON.parse(configContent)
    downloadPath = configData.downloadPath
    if (!downloadPath) throw new Error('配置中 downloadPath 为空')
    console.log(`[内部添加] 从配置读取下载路径: ${downloadPath}`)
  } catch (err) {
    console.warn('读取或解析配置文件失败，将使用系统默认下载目录:', err)
    downloadPath = app.getPath('downloads')
  }

  if (!fs.existsSync(downloadPath)) {
    try {
      fs.mkdirSync(downloadPath, { recursive: true })
      console.log(`[内部添加] 创建了下载目录: ${downloadPath}`)
    } catch (mkdirErr) {
      console.error(`[内部添加] 创建下载目录失败: ${mkdirErr}`)
      const systemDownloads = app.getPath('downloads')
      if (downloadPath !== systemDownloads) {
        downloadPath = systemDownloads
        console.warn(`[内部添加] 回退到系统下载目录: ${downloadPath}`)
        if (!fs.existsSync(downloadPath)) {
          try {
            fs.mkdirSync(downloadPath, { recursive: true })
          } catch {
            console.error('创建目录失败')
          }
        }
      } else {
        dialog.showErrorBox(
          '错误',
          `无法创建下载目录: ${downloadPath}\n请检查权限或在设置中指定一个有效的目录。`
        )
        return
      }
    }
  }

  console.log(`[内部添加] 添加 Torrent: ${typeof identifier === 'string' ? identifier : 'Buffer'}`)
  console.log(`[内部添加] 下载路径: ${downloadPath}`)
  // --- MODIFIED: 使用动态获取的 Tracker 列表 ---
  console.log(`[内部添加] 使用的 Tracker 列表数量:`, dynamicTrackerList.length)
  const trackers = dynamicTrackerList // 直接使用全局变量中存储的列表

  try {
    console.log('identifier', identifier, typeof identifier === 'string')
    webtorrentClient.add(
      identifier,
      // --- MODIFIED: announce 使用获取到的 trackers ---
      { path: downloadPath, announce: trackers, paused: false },
      (torrent: any) => {
        torrent.pause()
        torrent.initURL =
          typeof identifier === 'string' ? identifier : torrent.magnetURI || identifier.toString()
        if (!resume) {
          console.log('[内部添加] 添加完成，初始暂停:', torrent.name || torrent.infoHash)
          torrent.deselect(0, torrent.pieces.length - 1, false)
        } else {
          torrent.resume()
        }
        setTimeout(() => {
          mainWindow?.webContents.send('request-downloadstore')
          ipcMain.once('exportDownloadStoreResponse', (_event, data) => {
            writeDownloadStore(data)
          })
        }, 1000)
      }
    )
  } catch (addError: any) {
    console.error('[内部添加] 调用 client.add 时出错:', addError)
    dialog.showErrorBox('添加任务失败', `无法添加 Torrent：\n${addError.message}`)
  }
}

// --- 创建浏览器窗口 ---
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 670,
    show: false,
    frame: false,
    autoHideMenuBar: false, // Keep original value
    icon: process.platform === 'darwin' ? undefined : icon,
    webPreferences: {
      preload: join(dirnamex, '../preload/index.mjs'),
      sandbox: false,
      webSecurity: false,
      plugins: true,
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (e) => {
    e.preventDefault()
    if (timesignal) clearTimeout(timesignal)
    console.log('窗口关闭事件触发，准备保存状态并退出...')
    mainWindow?.webContents.send('request-downloadstore')
    ipcMain.once('exportDownloadStoreResponse', (_event, data) => {
      console.log('收到渲染进程状态，写入 DownloadStore...')
      writeDownloadStore(data)
      mainWindow?.destroy()
    })
    setTimeout(() => {
      console.warn('等待渲染进程状态超时，强制退出...')
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.destroy()
      }
    }, 3000)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // --- WebTorrent 客户端初始化 ---
  let timesignal: NodeJS.Timeout | null = null

  async function loadWebTorrent(): Promise<void> {


    async function createWebT(): Promise<void> {
      await new Promise<void>(async (resolve, reject) => {
        // Mark inner function as async
        try {
          const client = new WebTorrent()
          webtorrentClient = client
          console.log('[WebTorrent] 客户端实例已创建。')

          // --- ADDED: 获取 Tracker 列表 ---
          await fetchAndUpdateTrackers() // 在客户端创建后，服务器监听前获取

          const instance = client.createServer({ ws: true, cors: true })
          instance.server.listen(7920, () => {
            const address = instance.server.address() // Get address info
            const port = typeof address === 'string' ? address : address?.port // Extract port
            console.log(`[WebTorrent] 服务器监听在端口 ${port || 7920}`) // Log the actual port or default
          })
          instance.server.on('error', (err: Error) => {
            console.error('[WebTorrent] 服务器错误:', err)
            dialog.showErrorBox(
              '服务器错误',
              `无法监听端口 7920，流媒体功能可能不可用。\n错误: ${err.message}`
            )
          })

          if (pendingTorrentPaths.length > 0) {
            console.log(
              `[WebTorrent] 处理 ${pendingTorrentPaths.length} 个待处理的 Torrent 文件路径...`
            )
            setTimeout(() => {
              pendingTorrentPaths.forEach((filePath) => addTorrentToClient(filePath))
              pendingTorrentPaths.length = 0
            }, 500)
          }

          function updateclients(): void {
            if (!webtorrentClient || !mainWindow || mainWindow.isDestroyed()) {
              // Add window check
              if (timesignal) clearTimeout(timesignal) // Stop timer if window/client gone
              timesignal = null
              return
            }
            const serverAddress = (webtorrentClient as any)?.server?.address() // Get server address safely
            const streamPort =
              typeof serverAddress === 'string' ? 7920 : serverAddress?.port || 7920 // Determine stream port safely

            const tosend = webtorrentClient.torrents.map((x) => {
              return {
                _selections: (x as any)._selections,
                name: x.name,
                length: x.length,
                announce: x.announce,
                path: x.path,
                paused: x.paused,
                progress: x.progress,
                magnetURI: x.magnetURI,
                downloadSpeed: x.downloadSpeed,
                downloaded: x.downloaded,
                initURL: (x as any).initURL,
                infoHash: x.infoHash,
                numPeers: x.numPeers,
                files: x.files.map((y) => ({
                  name: y.name,
                  path: y.path,
                  type: y.type,
                  progress: y.progress,
                  selected: false, // Keep original simple logic here
                  downloaded: y.downloaded,
                  properties: Object.getOwnPropertyNames(y), // Keep original
                  _startPiece: (y as any)._startPiece,
                  _endPiece: (y as any)._endPiece,
                  offset: y.offset,
                  size: y.length,
                  streamURL: `http://localhost:${streamPort}/webtorrent/${x.infoHash}/${y.path}` // Use determined port
                }))
              }
            })

            if (mainWindow && !mainWindow.isDestroyed()) {
              // Check again before sending
              mainWindow.webContents.send('update-clients', tosend)
            }
          }
          timesignal = setInterval(updateclients, 1200)

          client.on('add', () => {
            console.log('[WebTorrent] event: add')
            updateclients()
          })
          client.on('torrent', () => {
            console.log('[WebTorrent] event: torrent (metadata ready)')
            updateclients()
          })
          client.on('remove', () => {
            console.log('[WebTorrent] event: remove')
            updateclients()
          })
          client.on('error', (err) => {
            console.error('[WebTorrent] client error:', err)
          })

          resolve()
        } catch (clientError: any) {
          console.error('创建 WebTorrent 客户端失败:', clientError)
          dialog.showErrorBox('初始化失败', `无法启动下载客户端: ${clientError.message}`)
          reject(clientError)
        }
      })
    }
    createWebT()
  }
  loadWebTorrent()

  // --- 应用菜单 (保持原始设置) ---
  const menu = Menu.buildFromTemplate([
    /* ... (可以保留或自定义菜单) ... */
  ])
  Menu.setApplicationMenu(menu) // Keep original menu setting

  // --- 代理设置 (保持原始逻辑) ---
  try {
    const configContent = fs.readFileSync(configPath, 'utf-8') // Read first
    const { proxyPath, useProxy } = JSON.parse(configContent) // Then parse
    if (useProxy && proxyPath) {
      console.log('应用启动时设置代理:', proxyPath)
      // Use mainWindow directly as context for session is better
      mainWindow?.webContents.session
        .setProxy({ proxyRules: proxyPath })
        .catch((err) => console.error('设置初始代理失败:', err)) // Add catch
    }
  } catch (e: any) {
    console.log('读取或应用初始代理配置失败:', e.message)
  }
} // createWindow 结束

// --- IPC 通信处理 ---

ipcMain.on('addTorrent', (_event, identifier: string | Buffer) => {
  console.log('[IPC] addTorrent 收到:', typeof identifier === 'string' ? identifier : 'Buffer')
  addTorrentToClient(identifier)
})

ipcMain.on('resumeTorrent', (_event, url: string, filesPath: string[]) => {
  console.log('[IPC] resumeTorrent:', url)
  const torrent = webtorrentClient?.torrents.find((t: any) => t.initURL === url) // Keep original find logic
  if (torrent) {
    torrent.files.forEach((file: any) => {
      if (filesPath.includes(file.path)) file.select()
      else file.deselect()
    })
    torrent.resume()
    ;(torrent as any).paused = false
  } else {
    addTorrentToClient(url, true)
  }
})

ipcMain.on('removeTorrent', (_event, initURL: string, removeFile: boolean = false) => {
  console.log(`[IPC] removeTorrent: ${initURL}, removeFile: ${removeFile}`)
  if (webtorrentClient) {
    const targetTorrent = webtorrentClient.torrents.find((t: any) => t.initURL === initURL) // Keep original find logic
    if (targetTorrent) {
      webtorrentClient.remove(
        targetTorrent.infoHash, // Use infoHash which is the correct identifier
        { destroyStore: removeFile },
        (err?: Error | string) => {
          if (err) console.error('[IPC] removeTorrent error:', err)
          else console.log('[IPC] Torrent removed:', initURL)
          // Trigger save after removal? Original code didn't, let's keep it that way.
        }
      )
    } else {
      console.log('[IPC] Torrent not found for removal:', initURL)
    }
  }
})

ipcMain.on('fileSelect', (_event, torrentLink: string, filesPath: string[]) => {
  console.log(`[IPC] fileSelect: ${torrentLink}`)
  if (!webtorrentClient) return
  const targetTorrent = webtorrentClient.torrents.find((t: any) => t.initURL === torrentLink) // Keep original find logic
  if (targetTorrent) {
    targetTorrent.files.forEach((file: any) => {
      if (filesPath.includes(file.path)) file.select()
      else file.deselect()
    })
    if (targetTorrent.paused) {
      targetTorrent.resume()
      ;(targetTorrent as any).paused = false
    }
  }
})

ipcMain.on('writeTorrent', () => {
  console.log('[IPC] writeTorrent 请求 (触发保存)')
  mainWindow?.webContents.send('request-downloadstore')
  ipcMain.once('exportDownloadStoreResponse', (_event, data) => {
    writeDownloadStore(data)
  })
})

ipcMain.on('toggle-proxy', (_, config) => {
  //   const focusedWindow = BrowserWindow.getFocusedWindow() // Use mainWindow is more reliable
  if (!mainWindow) return
  const session = mainWindow.webContents.session // Get session from mainWindow
  if (config.useProxy && config.proxyPath) {
    console.log('[IPC] 设置代理:', config.proxyPath)
    session
      .setProxy({ proxyRules: config.proxyPath })
      .catch((err) => console.error('IPC 设置代理失败:', err)) // Add catch
  } else {
    console.log('[IPC] 清除代理设置')
    session.setProxy({ proxyRules: '' }).catch((err) => console.error('IPC 清除代理失败:', err)) // Add catch
  }
})

ipcMain.on('window-min', () => mainWindow?.minimize())
ipcMain.on('window-close', async () => mainWindow?.close())
ipcMain.on('toggle-devtools', () => BrowserWindow.getFocusedWindow()?.webContents.toggleDevTools()) // Keep original logic
ipcMain.on('ping', () => console.log('pong'))

ipcMain.handle('getPath', async () => configPath)
// ipcMain.handle('getFFPath', async () => FFPath)

ipcMain.handle('getDownloadStore', async () => {
  try {
    if (!fs.existsSync(downloadStorePath)) {
      console.log('DownloadStore.json 不存在，返回空对象字符串。') // Keep original message/return
      return '{}'
    }
    // Read and return content, keep original simple error handling
    return fs.readFileSync(downloadStorePath, 'utf-8')
  } catch (error) {
    console.error('读取 DownloadStore 失败:', error)
    return '{}' // Keep original return
  }
})

function writeDownloadStore(data: object): void {
  // Keep original type constraint
  try {
    const fileContent = JSON.stringify(data || {}, null, 2)
    fs.writeFileSync(downloadStorePath, fileContent, 'utf-8')
    console.log('DownloadStore.json 已更新。')
  } catch (error: any) {
    console.error('写入 DownloadStore 失败:', error)
    dialog.showErrorBox('保存失败', `无法写入下载记录文件：\n${error.message}`)
  }
}
ipcMain.handle('setDownloadStore', async (_event, data) => writeDownloadStore(data))

ipcMain.handle('open-with-external-player', async (_event, encodedVideoPath, encodedPlayerPath) => {
  const videoPath = decodeURIComponent(encodedVideoPath)
  const playerPath = decodeURIComponent(encodedPlayerPath)
  if (!playerPath || !fs.existsSync(playerPath)) {
    // Keep original error message
    throw new Error('未设置有效或存在的外部播放器路径')
  }
  // Keep original logic (no video file check)
  console.log(`尝试用外部播放器 "${playerPath}" 打开 "${videoPath}"`)
  return new Promise((resolve, reject) => {
    execFile(playerPath, [videoPath], (error) => {
      if (error) {
        console.error('打开外部播放器失败:', error)
        reject(`无法打开播放器: ${error.message}`) // Keep original reject message
      } else {
        resolve(true)
      }
    })
  })
})

ipcMain.handle('check-ipv6-support', () => {
  // Keep sync
  const interfaces = networkInterfaces()
  const globalUnicastIPv6Regex = /^[2-3][0-9a-f]{3}:/i // Keep original regex
  for (const details of Object.values(interfaces)) {
    for (const detail of details || []) {
      if (
        detail.family === 'IPv6' &&
        !detail.internal &&
        globalUnicastIPv6Regex.test(detail.address) &&
        !detail.address.startsWith('fe80:') &&
        !detail.address.startsWith('fc') &&
        !detail.address.startsWith('fd')
      ) {
        console.log('检测到公网 IPv6 地址:', detail.address)
        return true
      }
    }
  }
  console.log('未检测到公网 IPv6 地址。')
  return false
})

ipcMain.handle('open-directory-dialog', async () => {
  // Keep original dialog properties
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
  return result.filePaths[0] // Keep original return
})

ipcMain.handle('open-file-dialog', async (_event, options?: Electron.OpenDialogOptions) => {
  const defaultOptions: Electron.OpenDialogOptions = {
    properties: ['openFile'],
    filters: [{ name: '所有文件', extensions: ['*'] }]
  }
  const dialogOptions = { ...defaultOptions, ...(options || {}) }
  const result = await dialog.showOpenDialog(mainWindow!, dialogOptions)
  return result.filePaths[0] // Keep original return
})

ipcMain.handle('open-torrent-file-dialog', async () => {
  // Keep original properties (no multiSelections)
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '选择 Torrent 文件',
    properties: ['openFile'],
    filters: [
      { name: 'Torrent 文件', extensions: ['torrent'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  return result.filePaths[0] // Keep original return (single path)
})

// --- 应用生命周期事件 ---

app.setName('ROTORE')
if (process.platform === 'win32') {
  process.env.ELECTRON_DEFAULT_NAME = 'ROTORE'
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  console.log('获取实例锁失败，应用已在运行，退出当前实例。')
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('[Second Instance] 尝试启动第二个实例，命令行:', commandLine)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    // Keep original argument parsing logic
    const filePath = commandLine
      .slice(1)
      .find((arg) => !arg.startsWith('--') && arg.toLowerCase().endsWith('.torrent'))
    if (filePath) {
      console.log(`[Second Instance] 发现 Torrent 文件参数: ${filePath}`)
      // Keep original process.nextTick
      process.nextTick(() => handleTorrentFilePath(filePath))
    } else {
      console.log('[Second Instance] 未发现 Torrent 文件参数。')
    }
  })

  app.whenReady().then(() => {
    ensureUserDataConfig()
    // Keep original AppUserModelId setting logic
    electronApp.setAppUserModelId('com.example.rotore')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })
    registerIpcHandlers()
    createWindow()

    // Keep original startup argument parsing logic
    const argv = process.argv
    console.log('[Startup] 启动参数:', argv)
    const startIndex = app.isPackaged ? 1 : 2
    const filePathArg = argv
      .slice(startIndex)
      .find((arg) => !arg.startsWith('--') && arg.toLowerCase().endsWith('.torrent'))
    if (filePathArg) {
      console.log(`[Startup] 发现启动参数中的 Torrent 文件: ${filePathArg}`)
      handleTorrentFilePath(filePathArg)
    } else {
      console.log('[Startup] 未在启动参数中发现 Torrent 文件。')
    }

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('open-file', (event, path) => {
  event.preventDefault()
  console.log(`[macOS open-file] 收到文件: ${path}`)
  if (app.isReady()) {
    handleTorrentFilePath(path)
  } else {
    if (!pendingTorrentPaths.includes(path)) {
      pendingTorrentPaths.push(path)
    }
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  console.log('应用即将退出...')
  // Keep original logic (only clearing timer)
  // if (timesignal) clearTimeout(timesignal)
})

// 用于注册 IPC 处理程序的函数
function registerIpcHandlers() {
  console.log('[主进程] 正在注册 IPC 处理程序...')

  // 获取 FFmpeg 路径的处理程序 (Vue 组件中已使用)
  // 你可能已经有此逻辑或以不同方式获取路径。请按需调整。
  ipcMain.handle('getFFPath', async () => {
    // 示例：假设 ffmpeg.exe 在打包后应用的 resources 目录下的 'ffmpeg' 文件夹中
    // 请根据你打包时实际放置 ffmpeg.exe 的位置调整此路径。
    // 开发环境下路径可能不同，考虑使用环境变量或配置设置。
    let basePath
    if (app.isPackaged) {
      // 打包后的应用中 ffmpeg 的示例路径
      basePath = join(process.resourcesPath, 'ffmpeg')
    } else {
      // 开发环境下的示例路径 - 根据你的项目结构调整
      basePath = join(app.getAppPath(), 'ffmpeg')
      // 或者: basePath = path.resolve(__dirname, '../../extraResources/ffmpeg');
    }
    console.log(`[主进程] 确定的 FFmpeg 基础路径: ${basePath}`)
    // 基本检查目录和文件是否存在
    try {
      fs.accessSync(basePath) // 检查目录是否存在
      const exePath = join(basePath, 'ffmpeg.exe')
      fs.accessSync(exePath) // 检查 ffmpeg.exe 是否在目录内
      console.log(`[主进程] 在以下位置找到 FFmpeg 可执行文件: ${exePath}`)
      return basePath // 返回包含 ffmpeg.exe 的目录路径
    } catch (error) {
      console.error(`[主进程] FFmpeg 路径检查失败于 ${basePath}:`, error)
      // 这里可以抛出错误或返回 null/undefined，取决于渲染进程应如何处理
      // 抛出错误会使 invoke 调用被 reject
      throw new Error(`在预期位置未找到 FFmpeg 目录或可执行文件: ${basePath}`)
    }
  })

  // --- 用于原生 FFMPEG 的新处理程序 ---

  // 使用原生 ffmpeg 发现字幕轨道的处理程序
  ipcMain.handle('discover-subtitles', async (_, videoPath, ffmpegExePath) => {
    console.log(`[主进程] 正在为 ${videoPath} 使用 ${ffmpegExePath} 发现字幕`)
    return new Promise((resolve, reject) => {
      // ffmpeg 探测文件的参数。'-hide_banner' 可以减少不必要的输出。
      const args = ['-i', videoPath, '-hide_banner']
      let stderrOutput = '' // 用于累积 stderr 输出
      const subs: { index: number; language?: string; codec?: string; label: string }[] = []
      let subtitleCounter = 0 // 使用计数器作为我们传递给 -map 的索引

      try {
        // 启动 ffmpeg 进程。windowsHide: true 可防止在 Windows 上弹出控制台窗口。
        const ffmpegProcess = spawn(ffmpegExePath, args, { windowsHide: true })

        // 监听 stderr 输出
        ffmpegProcess.stderr.on('data', (data) => {
          stderrOutput += data.toString()
          // 可选：可以在这里尝试实时解析，但关闭时解析更简单。
        })

        // 监听进程关闭事件
        ffmpegProcess.on('close', (code) => {
          console.log(`[主进程] FFmpeg 发现进程退出，退出码: ${code}`)

          // 解析累积的 stderr 输出
          // 正则表达式解释见上一个英文回答
          const streamRegex = /^\s*Stream #\d+:(\d+)(?:\((\w+)\))?:\s+Subtitle:\s+([\w-]+)/gm
          let match

          console.log('[主进程] 正在解析 FFmpeg stderr 以查找字幕...')
          // console.log('--- FFmpeg stderr ---');
          // console.log(stderrOutput); // 取消注释以查看完整 stderr 输出
          // console.log('---------------------');

          // 循环匹配所有字幕流
          while ((match = streamRegex.exec(stderrOutput)) !== null) {
            // const ffmpegIndex = parseInt(match[1], 10); // FFmpeg 内部流索引
            const language = match[2] || undefined // 语言代码 (可选)
            const codec = match[3] || undefined // 字幕编码 (可选)
            // 重要：使用我们自己的计数器作为索引，因为这是 `-map 0:s:X` 所期望的
            const ourIndex = subtitleCounter
            const label = `轨道 ${ourIndex}${language ? ` (${language})` : ''}${codec ? `: ${codec}` : ''}`

            subs.push({ index: ourIndex, language, codec, label })
            console.log(
              `[主进程] 发现字幕轨道: Index=${ourIndex}, Lang=${language}, Codec=${codec}`
            )
            subtitleCounter++ // 仅在找到字幕流时增加计数器
          }

          console.log(`[主进程] 发现完成。找到 ${subs.length} 条字幕轨道。`)
          resolve({ subtitles: subs }) // 用找到的轨道数组来 resolve Promise
        })

        // 监听进程启动错误
        ffmpegProcess.on('error', (err) => {
          console.error('[主进程] 启动 FFmpeg 发现进程失败:', err)
          reject(new Error(`无法启动 FFmpeg 进行扫描: ${err.message}`))
        })
      } catch (error) {
        console.error('[主进程] 设置 FFmpeg 发现时出错:', error)
        reject(error) // 捕获 spawn 本身的同步错误
      }
    })
  })

  // 使用原生 ffmpeg 提取特定字幕轨道的处理程序
  ipcMain.handle('extract-subtitle', async (_, videoPath, ffmpegExePath, subtitleIndex) => {
    console.log(`[主进程] 正在从 ${videoPath} 提取字幕索引 ${subtitleIndex}`)
    const tempDir = tmpdir() // 获取系统临时目录
    const tempVttFileName = `extracted-subtitle-${Date.now()}.vtt` // 生成唯一的临时文件名
    const tempVttFilePath = join(tempDir, tempVttFileName) // 构造完整临时文件路径
    console.log(`[主进程] 将 VTT 输出到临时路径: ${tempVttFilePath}`)

    // ffmpeg 提取参数
    const args = [
      '-y', // 无需询问即覆盖输出文件
      '-i',
      videoPath, // 输入文件
      '-map',
      `0:s:${subtitleIndex}`, // 选择指定的字幕流 (0基索引)
      '-c:s',
      'webvtt', // 将字幕编码转换为 WebVTT
      tempVttFilePath // 输出文件路径
    ]

    return new Promise((resolve, reject) => {
      try {
        console.log(`[主进程] 正在启动 FFmpeg: ${ffmpegExePath} ${args.join(' ')}`)
        const ffmpegProcess = spawn(ffmpegExePath, args, { windowsHide: true })

        let stderrOutput = '' // 收集 stderr 用于调试
        ffmpegProcess.stderr.on('data', (data) => {
          stderrOutput += data.toString()
          // console.log(`[FFmpeg stderr]: ${data}`); // 取消注释以获取详细日志
        })

        ffmpegProcess.stdout.on('data', (data) => {
          // console.log(`[FFmpeg stdout]: ${data}`); // 字幕提取通常没有 stdout 输出
        })

        // 监听进程关闭
        ffmpegProcess.on('close', async (code) => {
          console.log(`[主进程] FFmpeg 提取进程退出，退出码: ${code}`)
          if (code === 0) {
            // 成功退出，但在 resolve 前验证文件是否存在且可读
            try {
              fs.accessSync(tempVttFilePath, fs.constants.R_OK) // 检查文件是否可读
              console.log(`[主进程] VTT 文件成功创建: ${tempVttFilePath}`)
              resolve({ vttFilePath: tempVttFilePath }) // Resolve Promise，并包含文件路径
            } catch (fileError) {
              console.error(
                `[主进程] FFmpeg 成功退出(code 0)，但在 ${tempVttFilePath} 未找到 VTT 文件或文件不可读`,
                fileError
              )
              console.error('[主进程] FFmpeg stderr 输出为:\n', stderrOutput) // 打印 stderr 以帮助诊断
              reject(new Error('FFmpeg 运行成功，但无法访问生成的字幕文件。'))
            }
          } else {
            // 执行失败
            console.error(`[主进程] FFmpeg 提取失败，退出码: ${code}.`)
            console.error('[主进程] FFmpeg stderr 输出为:\n', stderrOutput) // 打印 stderr
            // 尝试删除可能生成的不完整或空文件
            try {
              fs.unlinkSync(tempVttFilePath)
            } catch (e) {
              /* 忽略清理错误 */
            }
            reject(new Error(`FFmpeg 提取字幕失败，退出码: ${code}. 查看主进程日志获取详细信息。`))
          }
        })

        // 监听进程启动错误
        ffmpegProcess.on('error', (err) => {
          console.error('[主进程] 启动 FFmpeg 提取进程失败:', err)
          reject(new Error(`无法启动 FFmpeg 进行提取: ${err.message}`))
        })
      } catch (error) {
        console.error('[主进程] 设置 FFmpeg 提取时出错:', error)
        reject(error) // 捕获 spawn 的同步错误
      }
    })
  })

  // 清理临时 VTT 文件的处理程序
  ipcMain.handle('cleanup-temp-file', async (_, filePath) => {
    console.log(`[主进程] 收到清理临时文件的请求: ${filePath}`)
    if (!filePath || typeof filePath !== 'string') {
      console.warn('[主进程] 收到无效的文件路径进行清理。')
      // 返回 success:false 可能比抛出错误更好，允许渲染进程继续
      return { success: false, message: '无效的文件路径' }
    }

    // 可选的安全检查：确保文件确实在临时目录中
    const tempDir = tmpdir()
    if (!filePath.startsWith(tempDir)) {
      console.warn(`[主进程] 尝试清理临时目录之外的文件: ${filePath}。拒绝请求。`)
      return { success: false, message: '不允许清理临时目录之外的文件' }
    }

    try {
      fs.unlinkSync(filePath) // 删除文件
      console.log(`[主进程] 成功清理临时文件: ${filePath}`)
      return { success: true }
    } catch (error: any) {
      // 如果文件已经不存在，也算清理成功（幂等性）
      if (error.code === 'ENOENT') {
        console.log(`[主进程] 临时文件已删除或从未存在: ${filePath}`)
        return { success: true, message: '文件已不存在' }
      }
      // 对于其他错误，报告失败
      console.error(`[主进程] 清理临时文件 ${filePath} 失败:`, error)
      return { success: false, message: `清理失败: ${error.message}` }
    }
  })
}
