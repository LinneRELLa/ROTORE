/*
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-14 08:36:44
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-04-11 08:39:06
 * @FilePath: \ElectronTorrent\src\renderer\src\http\index.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
/*
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-14 08:36:44
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-03-19 08:41:47
 * @FilePath: \ElectronTorrent\src\renderer\src\http\index.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import axios from 'axios'

import type { IPathConfig } from '@Type/index'
// import path from 'path'

const PathConfig: IPathConfig = {
  base: 'https://www.rellal.com/acginfo',
  proxy: 'https://tv.rellal.com:9099/acg',
  source: 'https://acg.rip',
  downloadPath: 'C:/Downloads',
  playerPath: '',
  useProxy: false,
  proxyPath: 'socks5://127.0.0.1:7890',
  homePath: 'local'
}

const http = axios.create({
  baseURL: PathConfig.base,
  timeout: 0,
  method: 'post'
})

const geturl = axios.create({
  timeout: 0,
  method: 'get'
})

// const addurl = axios.create({
//   baseURL: 'http://127.0.0.1:6800/jsonrpc',
//   timeout: 0,
//   method: 'post'
// })

// /*http.interceptors.request.use(config => {
//   let url = config.url.split('/')[2];
//   let RORELTOKEN=localStorage.getItem('RORELTOKEN')
//   let token=RORELTOKEN==null?'':JSON.parse(RORELTOKEN).token
//   if(url=='ac'){

//     config.headers.Token=token
//   }
//   return config;
// },);

// http.interceptors.request.use(
//     config=>{

// config.headers.axios=true;
//   return config;
//     }

//   )*/

const normal = (data): Promise<object> => {
  return http({
    url: '/api/iniInfo',
    data
  })
}

const back = (data): Promise<object> => {
  return http({
    url: '/api/backups',
    data
  })
}

const getInfo = (key: string, page: number): Promise<{ data: string }> => {
  //   if (!proxy) {

  //   } else {
  //     return geturl({
  //       url: `${res.source}/page/${page}.xml?term=${key}`
  //     })
  //   }
  return geturl({
    url: `${PathConfig.proxy}/page/${page}.xml?term=${key}`
  })
}
// const add = (key = '', url = '', path) => {
//   console.log(
//     JSON.stringify({
//       jsonrpc: '2.0',
//       method: 'aria2.addUri',
//       params: [
//         [url],
//         {
//           dir: path ? path : `../Download/${key}`
//         }
//       ],
//       id: 'add'
//     })
//   )
//   return addurl({
//     data: JSON.stringify({
//       jsonrpc: '2.0',
//       method: 'aria2.addUri',
//       params: [
//         [url],
//         {
//           dir: path ? path : `../Download/${key}`
//         }
//       ],

//       id: 'add'
//     })
//   })
// }

export { normal, back, getInfo }
