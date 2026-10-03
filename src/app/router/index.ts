import { createRouter, createWebHashHistory } from 'vue-router'

import DefaultLayout from '@/app/layouts/DefaultLayout.vue'
import StageLayout from '@/app/layouts/StageLayout.vue'
import CdpComparePage from '@/app/pages/CdpComparePage.vue'
import DashboardPage from '@/app/pages/DashboardPage.vue'
import HomeLoadingPage from '@/scenarios/home-loading/HomeLoadingPage.vue'
import HugeTablePage from '@/scenarios/huge-table/HugeTablePage.vue'
import ComponentStormPage from '@/scenarios/component-storm/ComponentStormPage.vue'
import ComponentStormStagePage from '@/scenarios/component-storm/stage/ComponentStormStagePage.vue'
import ComposableChaosPage from '@/scenarios/composable-chaos/ComposableChaosPage.vue'
import ComposableChaosStagePage from '@/scenarios/composable-chaos/stage/ComposableChaosStagePage.vue'
import LongRunningSpaPage from '@/scenarios/long-running-spa/LongRunningSpaPage.vue'
import ReactiveChainPage from '@/scenarios/reactive-chain/ReactiveChainPage.vue'
import ReactiveChainStagePage from '@/scenarios/reactive-chain/stage/ReactiveChainStagePage.vue'
import VDomStressPage from '@/scenarios/vdom-stress/VDomStressPage.vue'
import VDomStressStagePage from '@/scenarios/vdom-stress/stage/VDomStressStagePage.vue'

const router = createRouter({
  // 使用 hash 模式避免 GitHub Pages 直接訪問子路徑時 404
  history: createWebHashHistory(),
  routes: [
    // 互動探測視圖：全站導覽列 + 全螢幕內容（StageLayout），不套 DefaultLayout 的 960px 內容欄
    {
      path: '/scenarios',
      component: StageLayout,
      children: [
        // 大會 Demo 視圖：雙欄，左側操控、右側燈號矩陣
        {
          path: 'component-storm/stage',
          name: 'component-storm-stage',
          component: ComponentStormStagePage,
        },
        // 雙欄：右側 TTY
        {
          path: 'reactive-chain/stage',
          name: 'reactive-chain-stage',
          component: ReactiveChainStagePage,
        },
        // 操作引導 + chain 方塊圖 + 即時診斷
        {
          path: 'composable-chaos/stage',
          name: 'composable-chaos-stage',
          component: ComposableChaosStagePage,
        },
        // Mass Control + 實測判定 + 方格矩陣
        {
          path: 'vdom-stress/stage',
          name: 'vdom-stress-stage',
          component: VDomStressStagePage,
        },
      ],
    },
    {
      path: '/',
      component: DefaultLayout,
      children: [
        { path: '', name: 'dashboard', component: DashboardPage },
        { path: 'compare', name: 'cdp-compare', component: CdpComparePage },
        { path: 'scenarios/home-loading', name: 'home-loading', component: HomeLoadingPage },
        { path: 'scenarios/huge-table', name: 'huge-table', component: HugeTablePage },
        {
          path: 'scenarios/component-storm',
          name: 'component-storm',
          component: ComponentStormPage,
        },
        {
          path: 'scenarios/composable-chaos',
          name: 'composable-chaos',
          component: ComposableChaosPage,
        },
        {
          path: 'scenarios/long-running-spa',
          name: 'long-running-spa',
          component: LongRunningSpaPage,
        },
        {
          path: 'scenarios/reactive-chain',
          name: 'reactive-chain',
          component: ReactiveChainPage,
        },
        {
          path: 'scenarios/vdom-stress',
          name: 'vdom-stress',
          component: VDomStressPage,
        },
      ],
    },
  ],
})

export default router
