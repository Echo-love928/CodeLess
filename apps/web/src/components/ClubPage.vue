<script setup lang="ts">
withDefaults(defineProps<{
  interactive?: boolean
  compact?: boolean
  title?: string
  buttonLabel?: string
  selected?: 'title' | 'button' | null
}>(), {
  interactive: false,
  compact: false,
  title: '把热爱，\n聚在一起。',
  buttonLabel: '了解这次活动',
  selected: null,
})

const emit = defineEmits<{ select: [element: 'title' | 'button'] }>()
</script>

<template>
  <article class="club-page" :class="{ 'club-page--compact': compact }" aria-label="社团活动页示例">
    <nav class="club-page__nav" aria-label="示例页面导航">
      <div class="club-page__logo">WAVE CLUB<small>校园创作者社群</small></div>
      <span class="club-page__links">关于我们 &nbsp; / &nbsp; 本次活动</span>
    </nav>
    <div class="club-page__hero">
      <div class="club-page__copy">
        <span class="club-page__kicker">秋日见面计划 · 2026</span>
        <component :is="interactive ? 'button' : 'h2'" class="club-page__title" :class="{ 'club-page__editable': interactive, 'is-selected': selected === 'title' }" :type="interactive ? 'button' : undefined" :aria-label="interactive ? '选择活动标题并编辑' : undefined" @click="interactive && emit('select', 'title')">{{ title }}</component>
        <p>带上你的好奇心，来认识一些新朋友。<br />一个属于校园创作者的周末。</p>
        <component :is="interactive ? 'button' : 'span'" class="club-page__action" :class="{ 'club-page__editable': interactive, 'is-selected': selected === 'button' }" :type="interactive ? 'button' : undefined" :aria-label="interactive ? '选择活动按钮并编辑' : undefined" @click="interactive && emit('select', 'button')">{{ buttonLabel }} <span aria-hidden="true">↗</span></component>
      </div>
      <svg class="club-page__art" viewBox="0 0 280 270" fill="none" aria-hidden="true">
        <path d="M24 235h235" stroke="#b9c6aa" />
        <g transform="rotate(9 165 127)"><path d="m82 45 131 7 25 168-139-4Z" fill="#b8c99d" stroke="#859a69" /><path d="m82 45 50 71-33 100M132 116l106 104M132 116l81-64" stroke="#859a69" /><path d="m95 71 68 4" stroke="#e6ecd9" stroke-width="2" /></g>
        <g transform="rotate(-13 125 138)"><rect x="48" y="53" width="139" height="177" rx="2" fill="#f6f8ed" stroke="#82936c" /><path d="M61 69h114M61 214h114" stroke="#c5cfb8" /><text x="63" y="94" fill="#526844" font-family="Georgia,serif" font-size="9">LET’S MAKE</text><text x="60" y="133" fill="#3e5837" font-family="Georgia,serif" font-size="37" font-style="italic">a little</text><text x="61" y="169" fill="#3e5837" font-family="Georgia,serif" font-size="38" font-style="italic">wave.</text><text x="63" y="199" fill="#526844" font-family="Consolas,monospace" font-size="8">09.27 / SEE YOU THERE</text></g>
        <path d="M164 49v-15c0-12 15-12 15 0v30c0 8-10 8-10 0V36" stroke="#77866b" stroke-width="2.5" stroke-linecap="round" /><path d="M225 91v22m-11-11h22" stroke="#82936c" stroke-width="1.5" />
      </svg>
    </div>
    <footer class="club-page__meta"><div><strong>09.27 <span>星期日</span></strong><small>14:00 — 17:00</small></div><div><strong>校园活动中心</strong><small>一层共享空间 · 期待见面</small></div><span class="club-page__meta-arrow" aria-hidden="true">↗</span></footer>
    <div class="club-page__detail"><span>Hello, friend.</span><p><strong>不必准备得很完美，来就好。</strong>分享最近在做的小事，也听听别人的新想法。<br />摄影、设计、文字，或只是一个还没开始的计划。</p></div>
  </article>
</template>
