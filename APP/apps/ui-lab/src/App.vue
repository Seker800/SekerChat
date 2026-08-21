<script setup lang="ts">
import { computed, ref } from 'vue';
import { homeContent } from './fixtures/home-content';
import HomeApple from './variants/HomeApple.vue';
import HomeCli from './variants/HomeCli.vue';
import HomeCliCodex from './variants/HomeCliCodex.vue';
import HomeCodex from './variants/HomeCodex.vue';

type VariantId = 'codex' | 'apple' | 'cli' | 'cliCodex';
type LabPageId = 'workspace' | 'discovery' | 'manage' | 'login' | 'buttons';

const currentVariant = ref<VariantId>('cliCodex');
const currentPage = ref<LabPageId>('workspace');

const variantMeta: Record<VariantId, { label: string; tone: string }> = {
  codex: {
    label: 'Codex',
    tone: '深色工作台，克制、稠密、像 agent command center。',
  },
  apple: {
    label: 'Apple',
    tone: '轻材质、强留白、当前代 Apple 式秩序感。',
  },
  cli: {
    label: 'Claude CLI',
    tone: '终端 pane、等宽字和状态流驱动的极客工具感。',
  },
  cliCodex: {
    label: 'CLI x Codex',
    tone: 'Claude CLI 的终端结构，切到 Codex 式冷静蓝灰配色。',
  },
};

const CurrentVariant = computed(() => {
  if (currentVariant.value === 'apple') return HomeApple;
  if (currentVariant.value === 'cli') return HomeCli;
  if (currentVariant.value === 'cliCodex') return HomeCliCodex;
  return HomeCodex;
});

const pageMeta: Record<LabPageId, string> = {
  workspace: '工作台',
  discovery: '群组检索',
  manage: '管理',
  login: '登录',
  buttons: '动态按钮',
};
</script>

<template>
  <div class="lab-shell">
    <header class="lab-header">
      <div>
        <p class="lab-kicker">Independent UI Sandbox</p>
        <h1>首页方向实验室</h1>
      </div>

      <div class="lab-switcher">
        <button
          v-for="(meta, key) in variantMeta"
          :key="key"
          class="lab-switcher-button"
          :class="{ 'lab-switcher-button-active': currentVariant === key }"
          @click="currentVariant = key as VariantId"
        >
          <strong>{{ meta.label }}</strong>
          <span>{{ meta.tone }}</span>
        </button>
      </div>

      <div v-if="currentVariant === 'cliCodex'" class="lab-page-switcher">
        <button
          v-for="(label, key) in pageMeta"
          :key="key"
          class="lab-page-button"
          :class="{ 'lab-page-button-active': currentPage === key }"
          @click="currentPage = key as LabPageId"
        >
          {{ label }}
        </button>
      </div>
    </header>

    <component :is="CurrentVariant" :content="homeContent" :page="currentPage" />
  </div>
</template>
