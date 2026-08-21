<script setup lang="ts">
import type { LabSurface } from '../fixtures/home-content';

defineProps<{
  content: LabSurface;
}>();
</script>

<template>
  <section class="variant variant-codex">
    <div class="variant-backdrop variant-backdrop-codex"></div>

    <header class="codex-topbar">
      <div class="codex-brand">
        <span class="codex-brand-dot"></span>
        <span>Codex Control Surface</span>
      </div>
      <div class="codex-statusbar">
        <span>agent queue: 03</span>
        <span>sync: local</span>
        <span>mode: inspect</span>
      </div>
    </header>

    <div class="codex-layout">
      <aside class="codex-sidebar">
        <p class="variant-eyebrow">{{ content.eyebrow }}</p>
        <h1 class="variant-title">{{ content.title }}</h1>
        <p class="variant-description">{{ content.description }}</p>

        <div class="codex-sidebar-list">
          <div v-for="callout in content.callouts" :key="callout" class="codex-chip">
            {{ callout }}
          </div>
        </div>

        <div class="codex-console">
          <div class="codex-console-line">/brief active</div>
          <div class="codex-console-line">/variants codex apple claude-cli</div>
          <div class="codex-console-line">/handoff after final selection</div>
        </div>
      </aside>

      <main class="codex-main">
        <section class="codex-panel codex-panel-hero">
          <div class="codex-panel-header">
            <span>system overview</span>
            <span>read only</span>
          </div>
          <div class="codex-metrics">
            <article v-for="metric in content.metrics" :key="metric.label" class="metric-card">
              <p class="metric-label">{{ metric.label }}</p>
              <strong class="metric-value">{{ metric.value }}</strong>
              <p class="metric-detail">{{ metric.detail }}</p>
            </article>
          </div>
        </section>

        <section class="codex-grid">
          <article v-for="feature in content.features" :key="feature.title" class="codex-panel">
            <div class="codex-panel-header">
              <span>{{ feature.tag }}</span>
              <span>spec</span>
            </div>
            <h2>{{ feature.title }}</h2>
            <p>{{ feature.body }}</p>
          </article>
        </section>

        <section class="codex-panel codex-panel-workflow">
          <div class="codex-panel-header">
            <span>migration track</span>
            <span>3 stages</span>
          </div>
          <div class="workflow-list">
            <article v-for="step in content.workflow" :key="step.title" class="workflow-card">
              <strong>{{ step.title }}</strong>
              <p>{{ step.body }}</p>
            </article>
          </div>
        </section>
      </main>
    </div>
  </section>
</template>
