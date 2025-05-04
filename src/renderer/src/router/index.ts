/*
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-12 11:56:43
 * @LastEditors: Linne Rella 3223961933@qq.com
 * @LastEditTime: 2025-05-04 11:00:50
 * @FilePath: \torrent\src\renderer\src\router\index.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { createRouter, createWebHashHistory } from 'vue-router'
import type { Component } from 'vue'
import { useNavigationStore } from '@renderer/store/navigation'

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
        import(/* webpackChunkName: "about" */ '@renderer/views/detail.vue')
    },
    {
      path: '/download',
      name: 'download',
      component: (): Promise<Component> => import('@renderer/views/Download.vue')
    },
    {
      path: '/option',
      name: 'option',
      component: (): Promise<Component> => import('@renderer/views/option.vue')
    },

  ]
})

// 全局后置导航守卫
router.afterEach((to, from) => {
  // 获取 Pinia store 实例 (注意：通常在组件外使用 store 需要特殊处理，
  // 但在 router setup 后，pinia 实例应已挂载到 app，这种方式通常可行。
  // 如果遇到问题，可能需要将 pinia 实例传递给 router 设置函数)
   // 或者确保 pinia 实例在路由守卫被调用时可用
  const navigationStore = useNavigationStore()

  // 检查是否导航到了 'detail' 路由
  if (to.name === 'detail' && to.fullPath) {
    // 从查询参数获取 key 作为临时名称，或者你可以传递更友好的名称
    const key = to.query.key as string || '未知详情';
    // 更新 Store 中的最后访问记录
    navigationStore.setLastDetail(to.fullPath, `详情: ${key}`) // 使用 fullPath 保留查询参数
  }
})


export default router
