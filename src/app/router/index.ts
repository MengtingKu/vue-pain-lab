import { createRouter, createWebHistory } from 'vue-router'

import DefaultLayout from '@/app/layouts/DefaultLayout.vue'
import DashboardPage from '@/app/pages/DashboardPage.vue'
import HomeLoadingPage from '@/scenarios/home-loading/HomeLoadingPage.vue'
import HugeTablePage from '@/scenarios/huge-table/HugeTablePage.vue'
import ComponentStormPage from '@/scenarios/component-storm/ComponentStormPage.vue'
import ComponentStormStagePage from '@/scenarios/component-storm/stage/ComponentStormStagePage.vue'
import ComposableChaosPage from '@/scenarios/composable-chaos/ComposableChaosPage.vue'
import LongRunningSpaPage from '@/scenarios/long-running-spa/LongRunningSpaPage.vue'
import ReactiveChainPage from '@/scenarios/reactive-chain/ReactiveChainPage.vue'
import ReactiveChainStagePage from '@/scenarios/reactive-chain/stage/ReactiveChainStagePage.vue'
import VDomStressPage from '@/scenarios/vdom-stress/VDomStressPage.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // 大會 Demo 視圖：全螢幕雙欄，不套 DefaultLayout
    {
      path: '/scenarios/component-storm/stage',
      name: 'component-storm-stage',
      component: ComponentStormStagePage,
    },
    // 互動探測視圖：全螢幕雙欄（右側 TTY），不套 DefaultLayout
    {
      path: '/scenarios/reactive-chain/stage',
      name: 'reactive-chain-stage',
      component: ReactiveChainStagePage,
    },
    {
      path: '/',
      component: DefaultLayout,
      children: [
        { path: '', name: 'dashboard', component: DashboardPage },
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
