/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * @Author: chengp 3223961933@qq.com / Linne Rella
 * @Date: 2025-03-14 08:36:44
 * @Last Modified time: 2025-04-18 16:37:00 +0800
 * @Description: Electron 主进程文件，包含窗口管理、WebTorrent 客户端、IPC 通信和文件关联处理。
 */
import { app, shell, BrowserWindow, ipcMain, Menu, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/x1.ico?asset' // 确保图标路径正确
import { execFile } from 'child_process'
import { networkInterfaces } from 'os'
import * as fs from 'fs'
import type WebTorrent from 'webtorrent' // 导入 WebTorrent 类型 (如果安装了 @types/webtorrent)
import trackerlist from './trackerlist.json' // 导入 Tracker 列表

// --- 全局变量 ---
let mainWindow: BrowserWindow | null = null // 主窗口实例
let webtorrentClient: WebTorrent.Instance | null = null // WebTorrent 客户端实例 (使用类型或 any)
const pendingTorrentPaths: string[] = [] // 存储待处理的文件路径队列 (处理应用启动时客户端尚未初始化的情况)

// --- 路径定义 ---
// 打包后资源路径为 process.resourcesPath，开发时为 app.getAppPath()
const publicPath = app.isPackaged ? process.resourcesPath : app.getAppPath() // 开发时路径可能需要调整以正确指向项目根目录下的 resources
const userDataPath = app.getPath('userData')
const userConfigDir = join(userDataPath, 'config')
const configPath = join(userConfigDir, 'config.json') // 新的 configPath 定义
const downloadStorePath = join(userConfigDir, 'DownloadStore.json') // 新的 downloadStorePath 定义

const FFPath = join(publicPath, 'ffmpeg') // FFmpeg 路径

function ensureUserDataConfig() {
  const userDataPath = app.getPath('userData')
  const userConfigDir = join(userDataPath, 'config')
  const userConfigPath = join(userConfigDir, 'config.json')
  const userDownloadStorePath = join(userConfigDir, 'DownloadStore.json')

  // 打包后，默认配置文件在 resources/app.asar 内或 resources 目录下
  // process.resourcesPath 指向 resources 目录
  const defaultConfigDir = join(process.resourcesPath, 'config') // 默认配置来源
  const defaultConfigPath = join(publicPath, 'config/config.json')
  const defaultDownloadStorePath = join(publicPath, 'config/DownloadStore.json') // 假设有个默认空模板

  try {
    // 确保用户配置目录存在
    if (!fs.existsSync(userConfigDir)) {
      fs.mkdirSync(userConfigDir, { recursive: true })
      console.log(`首次运行：创建用户配置目录 ${userConfigDir}`)
    }

    // 如果用户 config.json 不存在，从默认复制
    if (!fs.existsSync(userConfigPath)) {
      if (fs.existsSync(defaultConfigPath)) {
        fs.copyFileSync(defaultConfigPath, userConfigPath)
        console.log(`首次运行：复制默认 config.json 到 ${userConfigPath}`)
      } else {
        console.error(`默认配置文件未找到: ${defaultConfigPath}，将创建最小配置。`)
        // 创建一个最小化的默认配置，避免应用出错
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

    // 如果用户 DownloadStore.json 不存在，创建空文件或复制默认模板
    if (!fs.existsSync(userDownloadStorePath)) {
      if (fs.existsSync(defaultDownloadStorePath)) {
        fs.copyFileSync(defaultDownloadStorePath, userDownloadStorePath)
        console.log(`首次运行：复制默认 DownloadStore.json 到 ${userDownloadStorePath}`)
      } else {
        fs.writeFileSync(userDownloadStorePath, '[]', 'utf-8') // 创建空对象文件
        console.log(`首次运行：创建空的 DownloadStore.json 到 ${userDownloadStorePath}`)
      }
    }
  } catch (error: any) {
    console.error('初始化用户配置文件时出错:', error)
    dialog.showErrorBox('配置错误', `无法初始化用户配置文件：\n${error.message}`)
    // 可能需要考虑在这里退出应用，如果配置是关键的
  }
}

// --- 文件关联处理核心函数 ---
/**
 * 处理通过文件关联或命令行参数传递过来的 Torrent 文件路径
 * @param filePath 文件路径
 */
function handleTorrentFilePath(filePath: string) {
  if (filePath && typeof filePath === 'string' && filePath.toLowerCase().endsWith('.torrent')) {
    console.log(`[文件关联] 准备处理 Torrent 文件: ${filePath}`)

    // 尝试聚焦窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      console.error(`[文件关联] 文件不存在: ${filePath}`)
      dialog.showErrorBox('文件错误', `无法打开种子文件，文件不存在：\n${filePath}`)
      return
    }

    // 检查 WebTorrent 客户端是否已初始化
    if (webtorrentClient) {
      addTorrentToClient(filePath) // 直接调用添加逻辑
    } else {
      console.warn('WebTorrent 客户端尚未初始化，将文件路径加入待处理队列。')
      // 避免重复添加
      if (!pendingTorrentPaths.includes(filePath)) {
        pendingTorrentPaths.push(filePath) // 加入队列，等待客户端初始化后处理
      }
    }
  } else {
    console.warn(`[文件关联] 收到无效的文件路径或类型: ${filePath}`)
  }
}

// --- 内部添加 Torrent 的函数 (重构后) ---
/**
 * 将 Torrent 添加到 WebTorrent 客户端实例
 * @param identifier Magnet链接、HTTP URL、文件路径 或 Buffer
 */
function addTorrentToClient(identifier: string | Buffer): void {
  if (!webtorrentClient) {
    console.error('[内部添加] WebTorrent 客户端未初始化! 无法添加:', identifier)
    // 如果是字符串标识符，尝试加入待处理队列
    if (typeof identifier === 'string' && !pendingTorrentPaths.includes(identifier)) {
      pendingTorrentPaths.push(identifier)
    }
    // 可以考虑显示一个错误给用户
    // dialog.showErrorBox('错误', '下载客户端尚未准备就绪，请稍后再试。');
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
    downloadPath = app.getPath('downloads') // 获取系统下载目录作为后备
  }

  // 确保下载路径存在，如果不存在则尝试创建
  if (!fs.existsSync(downloadPath)) {
    try {
      fs.mkdirSync(downloadPath, { recursive: true })
      console.log(`[内部添加] 创建了下载目录: ${downloadPath}`)
    } catch (mkdirErr) {
      console.error(`[内部添加] 创建下载目录失败: ${mkdirErr}`)
      // 创建失败，再次回退到系统下载目录（如果刚才不是的话）
      const systemDownloads = app.getPath('downloads')
      if (downloadPath !== systemDownloads) {
        downloadPath = systemDownloads
        console.warn(`[内部添加] 回退到系统下载目录: ${downloadPath}`)
        // 再次尝试创建系统下载目录（通常它应该存在）
        if (!fs.existsSync(downloadPath)) {
          try {
            fs.mkdirSync(downloadPath, { recursive: true })
          } catch {}
        }
      } else {
        // 如果连系统下载目录都创建失败，显示错误
        dialog.showErrorBox(
          '错误',
          `无法创建下载目录: ${downloadPath}\n请检查权限或在设置中指定一个有效的目录。`
        )
        return // 无法继续
      }
    }
  }

  console.log(`[内部添加] 添加 Torrent: ${typeof identifier === 'string' ? identifier : 'Buffer'}`)
  console.log(`[内部添加] 下载路径: ${downloadPath}`)
  console.log(`[内部添加] Tracker 列表数量:`, trackerlist?.length || 0) // 确认 trackerlist 已加载

  // 确保 trackerlist 是数组
  const trackers = Array.isArray(trackerlist) ? trackerlist : []

  try {
    webtorrentClient.add(
      identifier,
      { path: downloadPath, announce: trackers, paused: false }, // 确保 announce 是数组
      (torrent: any) => {
        // 使用 any 或具体的 WebTorrent.Torrent 类型
        torrent.pause() // 添加后先暂停，等待用户选择文件（如果是种子）
        // 记录原始标识符，如果是 Buffer 或文件路径，则在元数据加载后获取 magnetURI
        torrent.initURL =
          typeof identifier === 'string' ? identifier : torrent.magnetURI || identifier.toString() // 存储原始标识符
        console.log('[内部添加] 添加完成，初始暂停:', torrent.name || torrent.infoHash)
        torrent.deselect(0, torrent.pieces.length - 1, false) // 默认不选中任何文件

        // 可以在元数据加载后自动弹出文件选择 (如果需要)
        // torrent.on('metadata', () => {
        //   mainWindow?.webContents.send('prompt-file-select', torrent.infoHash);
        // });

        // 可以在这里触发一次状态更新或等待定时器更新
        // updateclients(); // 如果 updateclients 逻辑允许被这样调用

        // 请求保存状态 (异步，可能需要确认添加成功后再保存)
        // 延迟保存，给点时间让状态稳定
        setTimeout(() => {
          mainWindow?.webContents.send('request-downloadstore')
          ipcMain.once('exportDownloadStoreResponse', (_event, data) => {
            writeDownloadStore(data)
          })
        }, 1000) // 延迟1秒保存
      }
    )
  } catch (addError) {
    console.error('[内部添加]调用 client.add 时出错:', addError)
    dialog.showErrorBox('添加任务失败', `无法添加 Torrent：\n${addError.message}`)
  }
}

// --- 创建浏览器窗口 ---
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 670,
    show: false, // 先隐藏，等待 ready-to-show
    frame: false, // 无边框窗口
    autoHideMenuBar: false, // 隐藏菜单栏（但 Alt 键仍可调出）
    icon: process.platform === 'darwin' ? undefined : icon, // 设置图标
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'), // 预加载脚本
      sandbox: false, // 关闭沙盒 (注意安全风险，如果可以，应开启)
      webSecurity: false, // 禁用同源策略 (注意安全风险，谨慎使用)
      plugins: true, // 启用 NPAPI 插件 (已废弃，通常不需要)
      webviewTag: true, // 启用 webview 标签
      nodeIntegration: false, // 禁用 Node.js 集成 (推荐)
      contextIsolation: true // 启用上下文隔离 (推荐)
    }
  })

  // 窗口准备好显示时再显示，避免白屏
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // 处理窗口关闭事件：保存状态后退出
  mainWindow.on('close', (e) => {
    e.preventDefault() // 阻止默认关闭行为
    if (timesignal) clearTimeout(timesignal) // 清除 WebTorrent 状态更新定时器
    console.log('窗口关闭事件触发，准备保存状态并退出...')
    mainWindow?.webContents.send('request-downloadstore') // 请求渲染进程提供下载状态
    ipcMain.once('exportDownloadStoreResponse', (_event, data) => {
      console.log('收到渲染进程状态，写入 DownloadStore...')
      writeDownloadStore(data)
      // 写入完成后再销毁窗口并退出应用
      mainWindow?.destroy() // 销毁窗口
      // app.quit(); // 通常 destroy 后应用会自动退出，除非有其他窗口或逻辑阻止
    })
    // 添加超时机制，防止渲染进程无响应导致无法退出
    setTimeout(() => {
      console.warn('等待渲染进程状态超时，强制退出...')
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.destroy()
      }
      // app.quit();
    }, 3000) // 等待3秒
  })

  // 处理在新窗口中打开链接的行为：使用系统默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url) // 在外部浏览器打开
    return { action: 'deny' } // 阻止 Electron 创建新窗口
  })

  // 加载渲染进程页面
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // --- WebTorrent 客户端初始化 ---
  let timesignal: NodeJS.Timeout | null = null // 定时器变量移到内部

  async function loadWebTorrent(): Promise<void> {
    // 动态导入 webtorrent
    const WebTorrent = (await import('webtorrent')).default

    async function createWebT(): Promise<void> {
      await new Promise<void>((_resolve, reject) => {
        // 添加 Promise 类型
        try {
          const client = new WebTorrent()
          webtorrentClient = client // <--- 赋值给全局变量
          console.log('[WebTorrent] 客户端实例已创建。')

          // 启动 WebSocket 服务器用于流式传输 (端口 7920)
          const instance = client.createServer({ ws: true, cors: true })
          instance.server.listen(7920, () => {
            console.log('[WebTorrent] 服务器监听在端口 7920')
          })
          instance.server.on('error', (err: Error) => {
            console.error('[WebTorrent] 服务器错误:', err)
            // 可以尝试监听其他端口或通知用户
            dialog.showErrorBox(
              '服务器错误',
              `无法监听端口 7920，流媒体功能可能不可用。\n错误: ${err.message}`
            )
          })

          // [新增] 处理应用启动时队列中的待处理路径
          if (pendingTorrentPaths.length > 0) {
            console.log(
              `[WebTorrent] 处理 ${pendingTorrentPaths.length} 个待处理的 Torrent 文件路径...`
            )
            // 稍微延迟处理，确保 client 完全就绪
            setTimeout(() => {
              pendingTorrentPaths.forEach((filePath) => addTorrentToClient(filePath))
              pendingTorrentPaths.length = 0 // 清空队列
            }, 500) // 延迟 500ms
          }

          // 定时向渲染进程发送客户端状态
          function updateclients(): void {
            if (!webtorrentClient) return // 检查客户端是否存在
            const tosend = webtorrentClient.torrents.map((x) => {
              return {
                /* ... (之前的数据结构) ... */ _selections: (x as any)._selections,
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
                  selected: false, // selected 状态由渲染进程管理？或者这里也同步？
                  downloaded: y.downloaded,
                  properties: Object.getOwnPropertyNames(y),
                  _startPiece: (y as any)._startPiece,
                  _endPiece: (y as any)._endPiece,
                  offset: y.offset,
                  size: y.length, // 注意是 length 不是 size
                  streamURL: `http://localhost:${instance.server.address()?.port || 7920}/webtorrent/${x.infoHash}/${y.path}` // 添加端口后备
                }))
              }
            })
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('update-clients', tosend)
            }
          }
          timesignal = setInterval(updateclients, 1200) // 启动定时器

          // WebTorrent 客户端事件监听
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

          _resolve() // 初始化完成
        } catch (clientError) {
          console.error('创建 WebTorrent 客户端失败:', clientError)
          dialog.showErrorBox('初始化失败', `无法启动下载客户端: ${clientError.message}`)
          reject(clientError)
        }
      })
    }
    createWebT()
  }
  loadWebTorrent() // 启动 WebTorrent 初始化

  // --- 应用菜单 (示例) ---
  const menu = Menu.buildFromTemplate([
    /* ... (可以保留或自定义菜单) ... */
  ])
  Menu.setApplicationMenu(menu) // 设为 null 则无菜单栏

  // --- 代理设置 ---
  try {
    const { proxyPath, useProxy } = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    if (useProxy && proxyPath) {
      console.log('应用启动时设置代理:', proxyPath)
      mainWindow?.webContents.session.setProxy({ proxyRules: proxyPath })
    }
  } catch (e) {
    console.log('读取或应用初始代理配置失败:', e.message)
  }
} // createWindow 结束

// --- IPC 通信处理 ---

// 修改：调用重构后的 addTorrentToClient
ipcMain.on('addTorrent', (_event, identifier: string | Buffer) => {
  console.log('[IPC] addTorrent 收到:', typeof identifier === 'string' ? identifier : 'Buffer')
  addTorrentToClient(identifier)
})

// 其他 IPC handlers (保持不变)
ipcMain.on('resumeTorrent', (_event, url: string, filesPath: string[]) => {
  console.log('[IPC] resumeTorrent:', url)
  const torrent = webtorrentClient?.torrents.find((t: any) => t.initURL === url)
  if (torrent) {
    torrent.files.forEach((file: any) => {
      if (filesPath.includes(file.path)) file.select()
      else file.deselect()
    })
    torrent.resume()
    ;(torrent as any).paused = false // 手动更新状态？
  } else {
    console.warn('尝试恢复一个不存在的 torrent:', url)
    // 可以考虑重新添加？但需要小心死循环
    // addTorrentToClient(url); // ?
  }
})

ipcMain.on('removeTorrent', (_event, initURL: string, removeFile: boolean = false) => {
  console.log(`[IPC] removeTorrent: ${initURL}, removeFile: ${removeFile}`)
  if (webtorrentClient) {
    const targetTorrent = webtorrentClient.torrents.find((t: any) => t.initURL === initURL)
    if (targetTorrent) {
      webtorrentClient.remove(
        targetTorrent.infoHash,
        { destroyStore: removeFile },
        (err?: Error | string) => {
          if (err) console.error('[IPC] removeTorrent error:', err)
          else console.log('[IPC] Torrent removed:', initURL)
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
  const targetTorrent = webtorrentClient.torrents.find((t: any) => t.initURL === torrentLink)
  if (targetTorrent) {
    targetTorrent.files.forEach((file: any) => {
      if (filesPath.includes(file.path)) file.select()
      else file.deselect()
    })
    // 选择文件后是否需要自动开始？目前是需要的，因为 resume 也会调用 select
    if (targetTorrent.paused) {
      targetTorrent.resume()
      ;(targetTorrent as any).paused = false
    }
  }
})

ipcMain.on('writeTorrent', () => {
  console.log('[IPC] writeTorrent 请求 (触发保存)')
  // 请求渲染进程发送数据来保存
  mainWindow?.webContents.send('request-downloadstore')
  ipcMain.once('exportDownloadStoreResponse', (_event, data) => {
    writeDownloadStore(data)
  })
})

ipcMain.on('toggle-proxy', (_, config) => {
  const focusedWindow = BrowserWindow.getFocusedWindow() // 或者直接用 mainWindow
  if (!mainWindow) return
  if (config.useProxy && config.proxyPath) {
    console.log('[IPC] 设置代理:', config.proxyPath)
    mainWindow.webContents.session.setProxy({ proxyRules: config.proxyPath })
  } else {
    console.log('[IPC] 清除代理设置')
    mainWindow.webContents.session.setProxy({ proxyRules: '' })
  }
})

ipcMain.on('window-min', () => mainWindow?.minimize())
ipcMain.on('window-close', async () => mainWindow?.close()) // 调用 close 事件，触发保存逻辑
ipcMain.on('toggle-devtools', () => BrowserWindow.getFocusedWindow()?.webContents.toggleDevTools())
ipcMain.on('ping', () => console.log('pong'))

// Handle an invoke call for paths
ipcMain.handle('getPath', async () => configPath)
ipcMain.handle('getFFPath', async () => FFPath)

// Handle Download Store persistence
ipcMain.handle('getDownloadStore', async () => {
  try {
    // 确保文件存在，如果不存在则返回空 JSON
    if (!fs.existsSync(downloadStorePath)) {
      console.log('DownloadStore.json 不存在，返回空对象。')
      return '{}'
    }
    return fs.readFileSync(downloadStorePath, 'utf-8')
  } catch (error) {
    console.error('读取 DownloadStore 失败:', error)
    return '{}' // 出错也返回空 JSON
  }
})

function writeDownloadStore(data: object): void {
  try {
    const fileContent = JSON.stringify(data || {}, null, 2) // 确保 data 有效，格式化 JSON
    fs.writeFileSync(downloadStorePath, fileContent, 'utf-8')
    console.log('DownloadStore.json 已更新。')
  } catch (error) {
    console.error('写入 DownloadStore 失败:', error)
    dialog.showErrorBox('保存失败', `无法写入下载记录文件：\n${error.message}`)
  }
}
ipcMain.handle('setDownloadStore', async (_event, data) => writeDownloadStore(data))

// Handle external player launch
ipcMain.handle('open-with-external-player', async (_event, encodedVideoPath, encodedPlayerPath) => {
  const videoPath = decodeURIComponent(encodedVideoPath)
  const playerPath = decodeURIComponent(encodedPlayerPath)
  if (!playerPath || !fs.existsSync(playerPath)) {
    throw new Error('未设置有效或存在的外部播放器路径')
  }
  if (!fs.existsSync(videoPath)) {
    throw new Error(`视频文件不存在: ${videoPath}`)
  }
  console.log(`尝试用外部播放器 "${playerPath}" 打开 "${videoPath}"`)
  return new Promise((resolve, reject) => {
    // Windows 下路径可能需要特殊处理？ 但通常 execFile 能处理
    execFile(playerPath, [videoPath], (error) => {
      // 移除 replaceAll('\\', '/')
      if (error) {
        console.error('打开外部播放器失败:', error)
        reject(`无法打开播放器: ${error.message}`)
      } else {
        resolve(true)
      }
    })
  })
})

// Handle IPv6 check
ipcMain.handle('check-ipv6-support', () => {
  const interfaces = networkInterfaces()
  const globalUnicastIPv6Regex = /^[2-3][0-9a-f]{3}:/i
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

// Handle file/directory dialogs
ipcMain.handle('open-directory-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] }) // 关联到主窗口
  return result.filePaths[0]
})

// 修改: 移除特定过滤器，使其更通用，或按需传递过滤器
ipcMain.handle('open-file-dialog', async (_event, options?: Electron.OpenDialogOptions) => {
  const defaultOptions: Electron.OpenDialogOptions = {
    properties: ['openFile'],
    filters: [{ name: '所有文件', extensions: ['*'] }] // 默认过滤器
  }
  const dialogOptions = { ...defaultOptions, ...(options || {}) } // 合并传入的选项
  const result = await dialog.showOpenDialog(mainWindow!, dialogOptions) // 关联到主窗口
  return result.filePaths[0]
})

// 新增: 用于选择 Torrent 文件的特定 Handler
ipcMain.handle('open-torrent-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    // 关联到主窗口
    title: '选择 Torrent 文件',
    properties: ['openFile'],
    filters: [
      { name: 'Torrent 文件', extensions: ['torrent'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  return result.filePaths[0]
})

// --- 应用生命周期事件 ---

// 设置应用名称
app.setName('ROTORE')
if (process.platform === 'win32') {
  process.env.ELECTRON_DEFAULT_NAME = 'ROTORE'
}

// 处理单一实例逻辑
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  console.log('获取实例锁失败，应用已在运行，退出当前实例。')
  app.quit() // 如果获取锁失败，说明已有实例在运行，退出当前实例
} else {
  // 第一个实例监听 'second-instance' 事件
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('[Second Instance] 尝试启动第二个实例，命令行:', commandLine)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    // 解析命令行参数查找 .torrent 文件
    // 注意：commandLine[0] 是可执行文件路径，后续才是参数
    const filePath = commandLine
      .slice(1)
      .find((arg) => !arg.startsWith('--') && arg.toLowerCase().endsWith('.torrent'))
    if (filePath) {
      console.log(`[Second Instance] 发现 Torrent 文件参数: ${filePath}`)
      // 在下一个 tick 处理，给窗口响应时间
      process.nextTick(() => handleTorrentFilePath(filePath))
    } else {
      console.log('[Second Instance] 未发现 Torrent 文件参数。')
    }
  })

  // 应用就绪后创建窗口等
  app.whenReady().then(() => {
    ensureUserDataConfig();
    electronApp.setAppUserModelId('com.example.rotore') // 使用你的 App ID

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    createWindow()

    // 处理首次启动时的命令行参数
    const argv = process.argv
    console.log('[Startup] 启动参数:', argv)
    // 打包后的应用，参数通常从 argv[1] 开始；开发模式下可能不同
    const startIndex = app.isPackaged ? 1 : 2 // 开发模式下参数索引通常靠后
    const filePathArg = argv
      .slice(startIndex)
      .find((arg) => !arg.startsWith('--') && arg.toLowerCase().endsWith('.torrent'))
    if (filePathArg) {
      console.log(`[Startup] 发现启动参数中的 Torrent 文件: ${filePathArg}`)
      // 此时客户端可能未就绪，handleTorrentFilePath 会处理队列
      handleTorrentFilePath(filePathArg)
    } else {
      console.log('[Startup] 未在启动参数中发现 Torrent 文件。')
    }

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

// 处理 macOS 上的 open-file 事件
app.on('open-file', (event, path) => {
  event.preventDefault() // 阻止默认行为（如打开新窗口）
  console.log(`[macOS open-file] 收到文件: ${path}`)
  // 应用可能还未就绪，当应用就绪后再处理
  if (app.isReady()) {
    handleTorrentFilePath(path)
  } else {
    // 如果应用未就绪，将路径存入待处理队列
    if (!pendingTorrentPaths.includes(path)) {
      pendingTorrentPaths.push(path)
    }
    // whenReady 里的逻辑会处理队列
  }
})

// 所有窗口关闭时退出应用（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 应用退出前的清理 (可选)
app.on('before-quit', () => {
  console.log('应用即将退出...')
  // 可以在这里执行一些最终的清理工作，但注意关闭事件里已经有保存逻辑了
  // if (timesignal) clearTimeout(timesignal) // 确保定时器清除
})
