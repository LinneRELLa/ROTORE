/*
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-12 11:56:43
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-03-17 16:54:49
 * @FilePath: \torrent\src\renderer\src\router\index.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { createRouter, createWebHashHistory } from 'vue-router'
import type { Component } from 'vue'

const HomeView = (): Promise<Component> => import('@renderer/views/HomeView.vue')

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/home'
    },
    {
      path: '/home',
      name: 'home',
      component: HomeView
    },
    {
      path: '/detail',
      name: 'detail',
      // route level code-splitting
      // this generates a separate chunk (about.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: (): Promise<Component> =>
        import(/* webpackChunkName: "about" */ '@renderer/views/Detail.vue')
    },
    {
      path: '/download',
      name: 'download',
      component: (): Promise<Component> => import('@renderer/views/Download.vue')
    }
  ]
})

export default router
