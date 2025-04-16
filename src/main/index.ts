/*
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-14 08:36:44
 * @LastEditors: Linne Rella 3223961933@qq.com
 * @LastEditTime: 2025-04-16 20:42:54
 * @FilePath: \ElectronTorrent\src\main\index.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
/*
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-14 08:36:44
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-03-17 09:31:22
 * @FilePath: \ElectronTorrent\src\main\index.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
/*
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-11 13:33:14
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-03-14 13:05:47
 * @FilePath: \srce:\new\torrent\torrent\src\main\index.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { app, shell, BrowserWindow, ipcMain, Menu, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/x1.ico?asset'
import { execFile } from 'child_process'
import { networkInterfaces } from 'os'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 670,
    show: false,
    frame: false,
    autoHideMenuBar: false,
    // ...(process.platform === 'linux' ? { icon } : {}),
    icon: process.platform === 'darwin' ? undefined : icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false, // 禁用同源策略
      plugins: true,
      webviewTag: true, // 启用 webview 标签
      // nodeIntegration: true,
      // contextIsolation: false
    }
  })

  // process.env.HTTP_PROXY = 'http://127.0.0.1:7890';
  // process.env.HTTPS_PROXY = 'https://127.0.0.1:7890';
  // mainWindow.webContents.session.setProxy({
  //   proxyRules: 'socks5://127.0.0.1:7890'
  // })

  let timesignal
  // let readyToSend=false;
  async function loadWebTorrent(): Promise<void> {
    const WebTorrent = (await import('webtorrent')).default

    async function createWebT(): Promise<void> {
      await new Promise((_resolve, reject) => {
        // 在 Node 环境下运行的 WebTorrent 客户端会使用 TCP/UDP 协议进行数据交换
        const client = new WebTorrent()
        const instance = client.createServer({
          ws: true, // 启用WebSocket
          cors: true
        })
        instance.server.listen(7920)

        function storeTorrents(): void {
          mainWindow.webContents.send('request-downloadstore')
          ipcMain.once('exportDownloadStoreResponse', (_event, data) => {
            console.log('exportDownloadStoreResponse')
            writeDownloadStore(data)
          })
        }

        function updateclients(): void {
          const tosend = client.torrents.map((x) => {
            return {
              _selections: x._selections,
              name: x.name,
              length: x.length,
              announce: x.announce,
              path: x.path,
              paused: x.paused,
              progress: x.progress,
              magnetURI: x.magnetURI,
              downloadSpeed: x.downloadSpeed,
              downloaded: x.downloaded,
              initURL: x.initURL,
              infoHash: x.infoHash,
              numPeers: x.numPeers,
              files: x.files.map((y) => {
                // y.deselect();
                const {
                  name,
                  path,
                  type,
                  progress,
                  downloaded,
                  _startPiece,
                  _endPiece,
                  offset,
                  size
                } = y

                return {
                  name,
                  path,
                  type,
                  progress,
                  selected: false,
                  downloaded,
                  properties: Object.getOwnPropertyNames(y),
                  _startPiece,
                  _endPiece,
                  offset,
                  size,
                  streamURL: `http://localhost:${instance.server.address().port}/webtorrent/${x.infoHash}/${y.path}`
                }
              })
            }
          })

          mainWindow.webContents.send('update-clients', tosend)
        }

        timesignal = setInterval(() => {
          updateclients()
        }, 1200)

        client.on('add', function () {
          console.log('add')
          updateclients()
        })
        client.on('torrent', function () {
          console.log('torrent')
          updateclients()
        })

        client.on('remove', function () {
          console.log('remove')
        })

        client.on('error', function (err) {
          console.log('clienterror', err)
        })

        function addTorrent(magURL): void {
          let DownloadPath = join(publicPath, '../Downloads')
          try {
            DownloadPath = JSON.parse(
              fs.readFileSync(join(publicPath, 'config/config.json'), 'utf-8')
            ).downloadPath
          } catch (err) {
            console.log('获取下载路径失败', err)
          }
          client.add(
            magURL,
            { path: DownloadPath, announce: trackerlist, paused: false },
            (torrent) => {
              torrent.pause()
              torrent.initURL = magURL
              console.log('add done', torrent)
              torrent.deselect(0, torrent.pieces.length - 1, false)

              // const url = torrent.files[0].streamURL
              // console.log(url)
              // client.torrents.map((x) => {
              //   x.files.map((y) => {
              //     // if (index == 0) {
              //       y.select()

              //     // }
              //   })
              // })
              // torrent.resume()

              // torrent.on('download', (bytes) => {
              //   // console.log('just downloaded: ' + bytes)
              //   // console.log('total downloaded: ' + torrent.downloaded)
              //   // console.log('download speed: ' + torrent.downloadSpeed)
              //   // console.log('progress: ' + torrent.progress)
              // })

              // torrent.on('metadata', () => {
              //   mainWindow.webContents.send('update-counter', 'metadata')
              //   console.log('metadata', torrent)
              // })
              torrent.on('error', (err: Error) => {
                console.log(err, 'torrenterror')
                reject(err.message)
              })
            }
          )
        }

        function resumeTorrent(initURL, filesPath): void {
          console.log('resume', initURL, filesPath)
          const torrent = client.torrents.find((t) => t.initURL === initURL)
          if (!torrent) {
            // 重新添加中断的任务
            client.add(
              initURL,
              {
                path: 'E:/Downloads',
                announce: trackerlist
              },
              (newTorrent) => {
                newTorrent.initURL = initURL
                newTorrent.pause()
                newTorrent.deselect(0, newTorrent.pieces.length - 1, false)
                newTorrent.files.forEach((file) => {
                  if (filesPath.includes(file.path)) {
                    file.select()
                  }
                })
                newTorrent.resume()
              }
            )
          } else {
            // 如果已存在但暂停，直接恢复
            torrent.resume()
            torrent.paused = false
          }
        }

        ipcMain.on('resumeTorrent', (_event, url: string, filesPath: string[]) => {
          console.log('resumeTorrent', url)
          resumeTorrent(url, filesPath)
        })
        ipcMain.on('addTorrent', (_event, url: string) => {
          console.log('addTorrent', url)
          addTorrent(url)
        })

        ipcMain.on('removeTorrent', (_event, initURL: string, removeFile: boolean = false) => {
          console.log('removeTorrent')
          if (client) {
            const targetTorrent = client.torrents.find((t) => t.initURL === initURL)
            if (targetTorrent) {
              client.remove(targetTorrent.infoHash, { destroyStore: removeFile }, (err: Error) => {
                if (err) {
                  console.error('removeTorrent error:', err)
                } else {
                  console.log('Torrent removed:', initURL)
                }
              })
            } else {
              console.log('Torrent not found:', initURL)
            }
          }
        })

        ipcMain.on('fileSelect', (_event, torrentLink: string, filesPath: string[]) => {
          if (!client) return
          const targetTorrent = client.torrents.find((t) => t.initURL === torrentLink)
          if (targetTorrent) {
            targetTorrent.files.forEach((file) => {
              if (filesPath.includes(file.path)) {
                file.select()
              }
            })
            targetTorrent.resume()
          }
        })

        ipcMain.on('writeTorrent', () => {
          console.log('writeTorrent')
          storeTorrents()
        })
      })
    }
    createWebT()
  }

  loadWebTorrent()

  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        {
          click: (): void => mainWindow.webContents.toggleDevTools(),
          label: 'Decrement'
        }
      ]
    }
  ])
  Menu.setApplicationMenu(menu)
  try {
    const { proxyPath, useProxy } = JSON.parse(
      fs.readFileSync(join(publicPath, 'config/config.json'), 'utf-8')
    )
    if (useProxy && proxyPath) {
      console.log('设置代理' + proxyPath)
      mainWindow.webContents.session.setProxy({
        proxyRules: proxyPath
      })
    }
  } catch {
    console.log('代理读取失败')
  }

  // 在createWindow函数后添加代理处理
  ipcMain.on('toggle-proxy', (_, config) => {
    const mainWindow = BrowserWindow.getFocusedWindow()
    if (!mainWindow) return

    if (config.useProxy && config.proxyPath) {
      mainWindow.webContents.session.setProxy({
        proxyRules: config.proxyPath
      })
    } else {
      // 清除代理设置
      mainWindow.webContents.session.setProxy({ proxyRules: '' })
    }
  })

  ipcMain.on('window-min', function () {
    console.log('minimize')
    mainWindow?.minimize()
  })
  ipcMain.on('window-close', async function () {
    app.quit()
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('close', (e) => {
    // 阻止默认关闭，进行异步操作
    e.preventDefault()
    clearTimeout(timesignal)
    console.log('close')
    mainWindow.webContents.send('request-downloadstore')
    ipcMain.once('exportDownloadStoreResponse', (_event, data) => {
      console.log('exportDownloadStoreResponse')
      writeDownloadStore(data)

      // 销毁窗口后退出，防止递归触发 close 事件
      mainWindow.destroy()
      app.quit()
    })
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const publicPath = app.isPackaged ? process.resourcesPath : app.getAppPath()
import * as fs from 'fs'

const configPath = join(publicPath, 'config/config.json')
const FFPath = join(publicPath, 'ffmpeg')
process.title = 'ROTORE'

app.setName('ROTORE')
if (process.platform === 'win32') {
  process.env.ELECTRON_DEFAULT_NAME = 'ROTORE'
}
// console.log(__dirname,configPath)

ipcMain.handle('getPath', async () => {
  return configPath
})

ipcMain.handle('getFFPath', async () => {
  return FFPath
})


//读取本地下载记录
const DownloadStore = fs.readFileSync(join(publicPath, 'config/DownloadStore.json'), 'utf-8')

ipcMain.handle('getDownloadStore', async () => {
  console.log(DownloadStore, 'DownloadStore')
  return DownloadStore
})
//写入本地下载记录
function writeDownloadStore(data: object): void {
  const filePath = join(publicPath, 'config/DownloadStore.json')
  const fileContent = JSON.stringify(data, null, 2) // 格式化 JSON
  fs.writeFileSync(filePath, fileContent, 'utf-8')
}

ipcMain.handle('setDownloadStore', async (_event, data) => {
  writeDownloadStore(data)
  console.log('DownloadStore updated')
})

ipcMain.on('toggle-devtools', () => {
  const win = BrowserWindow.getFocusedWindow()
  if (win) {
    win.webContents.toggleDevTools()
  }
})
import trackerlist from './trackerlist.json'

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
ipcMain.handle('open-with-external-player', async (_event, videoPath, playerPath) => {
  if (!playerPath) {
    throw new Error('未设置外部播放器路径')
  }
  const decodedPlayerPath = decodeURIComponent(playerPath)
  const decodedVideoPath = decodeURIComponent(videoPath)

  console.log(decodedVideoPath, decodedVideoPath.replaceAll('\\', '/'), 'props.videoUrl')
  return new Promise((resolve, reject) => {
    execFile(decodedPlayerPath, [decodedVideoPath.replaceAll('\\', '/')], (error) => {
      if (error) {
        reject(`无法打开播放器: ${error.message}`)
      } else {
        resolve(true)
      }
    })
  })
})

ipcMain.handle('check-ipv6-support', () => {
  const interfaces = networkInterfaces()

  // 公网IPv6地址范围 (2000::/3)
  const globalUnicastIPv6Regex = /^[2-3][0-9a-f]{3}:/i

  for (const details of Object.values(interfaces)) {
    for (const detail of details || []) {
      // 检查条件:
      // 1. 是IPv6地址
      // 2. 不是内网地址
      // 3. 是全球单播地址
      // 4. 排除特殊地址
      if (
        detail.family === 'IPv6' &&
        !detail.internal &&
        globalUnicastIPv6Regex.test(detail.address) &&
        !detail.address.startsWith('fe80:') && // 排除链路本地
        !detail.address.startsWith('fc') && // 排除唯一本地
        !detail.address.startsWith('fd')
      ) {
        // 排除唯一本地
        return true
      }
    }
  }
  return false
})

// 在现有IPC处理后面添加：
ipcMain.handle('open-directory-dialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  return result.filePaths[0]
})

ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Executable Files', extensions: ['exe'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  return result.filePaths[0]
})
