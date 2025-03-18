export interface IFileRender {
  name: string
  path: string
  type: string
  progress: number
  selected: boolean
  downloaded: number
  properties: string[]
  _startPiece: number
  _endPiece: number
  offset: number
  size: number
}

export interface ITorrentRender {
  name: string
  magnetURI: string
  infoHash: string
  size?: number
  progress?: number
  downloadSpeed?: number
  uploadSpeed?: number
  timeRemaining?: number
  downloaded?: number
  ratio?: number
  numPeers?: number
  files: IFileRender[]
  initURL: string
}

export interface IWebTorrentRender {
  torrents: ITorrentRender[]
}
