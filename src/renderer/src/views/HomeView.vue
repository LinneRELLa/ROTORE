<template>
  <div class="home">
    <iniInfo />
  </div>
</template>

<script setup lang="ts">
// @ is an alias to /src
import iniInfo from '@renderer/components/iniInfo.vue'

// export default {
//   name: 'HomeView',
//   components: {
//     iniInfo
//   }
// }
</script>
<style lang="less" scoped>
.home {
  flex: 1;
  max-width: 100%;
  overflow-y: scroll;
  &::-webkit-scrollbar {
    display: none;
  }
}
</style>
