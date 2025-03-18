/*
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-14 08:36:44
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-03-18 15:01:24
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
import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
const publicPath = app.isPackaged ? process.resourcesPath : app.getAppPath()
import * as fs from 'fs'

const configPath = join(publicPath, 'config/config.json')

// console.log(__dirname,configPath)

ipcMain.handle('getPath', async () => {
  return configPath
})

const DownloadStore = fs.readFileSync(join(publicPath, 'config/DownloadStore.json'), 'utf-8')

ipcMain.handle('getDownloadStore', async () => {
  console.log(DownloadStore, 'DownloadStore')
  return DownloadStore
})

function writeDownloadStore(data: object): void {
  const filePath = join(publicPath, 'config/DownloadStore.json')
  const fileContent = JSON.stringify(data, null, 2) // 格式化 JSON
  fs.writeFileSync(filePath, fileContent, 'utf-8')
}

ipcMain.handle('setDownloadStore', async (event, data) => {
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

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    frame: false,
    autoHideMenuBar: false,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
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
      await new Promise((resolve, reject) => {
        // 在 Node 环境下运行的 WebTorrent 客户端会使用 TCP/UDP 协议进行数据交换
        const client = new WebTorrent()

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
              files: x.files.map((y, index) => {
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
                  size
                }
              })
            }
          })

          mainWindow.webContents.send('update-clients', tosend)
        }

        setInterval(() => {
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
          console.log('error', err)
        })

        function addTorrent(magURL): void {
          client.add(
            magURL,
            { path: 'E:/Download', announce: trackerlist, paused: false },
            (torrent) => {
              torrent.pause()
              torrent.initURL = magURL
              console.log('add done', torrent)
              torrent.deselect(0, torrent.pieces.length - 1, false)
              client.torrents.map((x) => {
                x.files.map((y, index) => {
                  // if (index == 0) {
                    y.select()
                
                  // }
                })
              })
              torrent.resume()

              torrent.on('download', (bytes) => {
                console.log('just downloaded: ' + bytes)
                console.log('total downloaded: ' + torrent.downloaded)
                console.log('download speed: ' + torrent.downloadSpeed)
                console.log('progress: ' + torrent.progress)
              })

              // torrent.on('metadata', () => {
              //   mainWindow.webContents.send('update-counter', 'metadata')
              //   console.log('metadata', torrent)
              // })
              torrent.on('error', (err: Error) => {
                console.log(err, 'error')
                reject(err.message)
              })
            }
          )
        }

        ipcMain.on('addTorrent', (event, url: string) => {
          console.log('addTorrent', url)
          addTorrent(url)
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

  ipcMain.on('window-min', function () {
    console.log('minimize')
    mainWindow?.minimize()
  })
  ipcMain.on('window-close', async function () {
    clearTimeout(timesignal)
    app.quit()
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('close', (e) => {
    // 阻止默认关闭，进行异步操作
    e.preventDefault()
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
