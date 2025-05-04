/*
 * @Author: Linne Rella 3223961933@qq.com
 * @Date: 2025-05-04 10:58:43
 * @LastEditors: Linne Rella 3223961933@qq.com
 * @LastEditTime: 2025-05-04 10:58:59
 * @FilePath: \electronTorrent\src\renderer\src\store\navigation.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
// src/renderer/src/stores/navigation.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useNavigationStore = defineStore('navigation', () => {
  // State: 存储最后访问的详情页路径和名称
  const lastDetailPath = ref<string | null>(null)
  const lastDetailName = ref<string | null>(null) // 可以存储番剧名或关键字

  // Getter: 判断是否存在最后访问的详情页记录
  const hasLastDetail = computed(() => !!lastDetailPath.value)

  // Action: 设置最后访问的详情页信息
  function setLastDetail(path: string, name: string) {
    lastDetailPath.value = path
    lastDetailName.value = name
    console.log('Last detail updated:', path, name); // 调试信息
  }

  // Action: 清除记录 (可选)
  function clearLastDetail() {
    lastDetailPath.value = null
    lastDetailName.value = null
  }

  return {
    lastDetailPath,
    lastDetailName,
    hasLastDetail,
    setLastDetail,
    clearLastDetail,
  }
})