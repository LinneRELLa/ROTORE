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
  initselected: boolean
}

export interface ITorrentRender {
  name: string
  magnetURI: string
  infoHash: string
  size?: number
  progress?: number
  downloadSpeed?: number
  path?: string
  uploadSpeed?: number
  timeRemaining?: number
  downloaded?: number
  ratio?: number
  numPeers?: number
  files: IFileRender[]
  initURL: string
  fileSelected: boolean
  selectedSize: number
  selectedTotal: number
  cleared: boolean
  error: string
}

export class ITorrent implements ITorrentRender {
  constructor(
    public name: string = '',
    public magnetURI: string = '',
    public infoHash: string = '',
    public files: IFileRender[] = [],
    public initURL: string = '',
    public fileSelected: boolean = false,
    public selectedSize: number = 0,
    public selectedTotal: number = 0,
    public cleared: boolean = false,
    public error: string = ''
  ) {
    this.name = name 
    this.magnetURI = magnetURI 
    this.infoHash = infoHash
    this.files = files 
    this.initURL = initURL 
    this.fileSelected = fileSelected 
    this.selectedSize = selectedSize 
    this.selectedTotal = selectedTotal 
    this.cleared = cleared 
    this.error = error 
  }
}
export interface IWebTorrentRender {
  torrents: ITorrentRender[]
}


export interface IPathConfig {
  base: string
  proxy: string
  source: string
  downloadPath: string
}
