<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'

const fps = ref(60)
let lastTime = performance.now()
let frames = 0
let animationId: number | null = null

const calcFps = () => {
  frames++
  const now = performance.now()
  if (now >= lastTime + 1000) {
    fps.value = Math.round((frames * 1000) / (now - lastTime))
    frames = 0
    lastTime = now
  }
  animationId = requestAnimationFrame(calcFps)
}

onMounted(() => {
  animationId = requestAnimationFrame(calcFps)
})

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
})

// > 54 順暢、> 29 吃力、其餘視為掉幀
const health = computed(() => {
  if (fps.value > 54) return 'good'
  if (fps.value > 29) return 'warn'
  return 'bad'
})
</script>

<template>
  <div class="fps" :class="`fps--${health}`">
    <!-- 背景裝飾掃描線 -->
    <div class="fps__scanlines" aria-hidden="true"></div>

    <div class="fps__body">
      <div>
        <p class="fps__eyebrow">System Performance</p>
        <h4 class="fps__title">FPS MONITOR</h4>
      </div>

      <!-- 狀態指示燈與巨型數字 -->
      <div class="fps__readout">
        <span class="fps__dot" aria-hidden="true"></span>
        <span class="fps__value">{{ fps }}</span>
        <span class="fps__unit">HZ</span>
      </div>
    </div>

    <!-- 底部光柵條（隨著 FPS 降低而縮短/變色） -->
    <div class="fps__bar">
      <div class="fps__bar-fill" :style="{ width: `${Math.min((fps / 60) * 100, 100)}%` }"></div>
    </div>
  </div>
</template>

<style scoped>
.fps {
  --fps-tone: #34d399;
  --fps-fill: #10b981;

  position: relative;
  overflow: hidden;
  padding: 1rem;
  border: 1px solid rgb(6 95 70 / 0.4);
  border-radius: 8px;
  background: rgb(2 44 34 / 0.2);
  box-shadow: 0 0 15px rgb(16 185 129 / 0.05);
  transition:
    background-color 300ms ease,
    border-color 300ms ease,
    box-shadow 300ms ease;
}

.fps--warn {
  --fps-tone: #fbbf24;
  --fps-fill: #f59e0b;

  border-color: rgb(146 64 14 / 0.4);
  background: rgb(69 26 3 / 0.2);
  box-shadow: 0 0 15px rgb(245 158 11 / 0.05);
}

.fps--bad {
  --fps-tone: #f87171;
  --fps-fill: #ef4444;

  border-color: rgb(239 68 68 / 0.5);
  background: rgb(69 10 10 / 0.3);
  box-shadow: 0 0 25px rgb(239 68 68 / 0.2);
  animation: fps-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.fps__scanlines {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(to bottom, rgb(255 255 255 / 0.02) 1px, transparent 1px);
  background-size: 100% 4px;
}

.fps__body {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.fps__eyebrow {
  margin: 0;
  font-family: var(--lab-font-mono, ui-monospace, monospace);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #a1a1aa;
}

.fps__title {
  margin: 0.125rem 0 0;
  font-family: var(--lab-font-mono, ui-monospace, monospace);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.025em;
  color: var(--fps-tone);
}

.fps__readout {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.fps__dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--fps-fill);
  animation: fps-ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
}

.fps__value {
  font-family: var(--lab-font-mono, ui-monospace, monospace);
  font-size: 2.25rem;
  font-weight: 900;
  line-height: 1;
  letter-spacing: -0.05em;
  font-variant-numeric: tabular-nums;
  color: var(--fps-tone);
}

.fps__unit {
  font-family: var(--lab-font-mono, ui-monospace, monospace);
  font-size: 10px;
  font-weight: 700;
  color: #a1a1aa;
}

.fps__bar {
  position: relative;
  height: 6px;
  margin-top: 0.75rem;
  padding: 1px;
  overflow: hidden;
  border: 1px solid rgb(39 39 42 / 0.4);
  border-radius: 999px;
  background: #18181b;
  box-sizing: border-box;
}

.fps__bar-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--fps-fill);
  transition: width 150ms ease-out;
}

@keyframes fps-ping {
  75%,
  100% {
    transform: scale(2);
    opacity: 0;
  }
}

@keyframes fps-pulse {
  50% {
    opacity: 0.5;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fps--bad,
  .fps__dot {
    animation: none;
  }
}
</style>
