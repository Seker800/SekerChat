<script setup lang="ts">
import type { LabSurface } from '../fixtures/home-content';

defineProps<{
  content: LabSurface;
}>();
</script>

<template>
  <section class="variant variant-cli">
    <div class="variant-backdrop variant-backdrop-cli"></div>

    <div class="cli-shell">
      <header class="cli-titlebar">
        <span>SekerChat UI Lab</span>
        <span>tty / experimental</span>
      </header>

      <div class="cli-grid">
        <section class="cli-pane cli-pane-command">
          <p class="cli-prompt">$ design-lab run --preset claude-cli</p>
          <p class="cli-output">{{ content.title }}</p>
          <p class="cli-output cli-output-muted">{{ content.description }}</p>
        </section>

        <section class="cli-pane cli-pane-timeline">
          <div class="cli-section-label">status stream</div>
          <div v-for="metric in content.metrics" :key="metric.label" class="cli-log-row">
            <span class="cli-log-key">{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
            <span>{{ metric.detail }}</span>
          </div>
        </section>

        <section class="cli-pane cli-pane-features">
          <div class="cli-section-label">modules</div>
          <article v-for="feature in content.features" :key="feature.title" class="cli-feature-row">
            <span class="cli-feature-tag">{{ feature.tag }}</span>
            <div>
              <strong>{{ feature.title }}</strong>
              <p>{{ feature.body }}</p>
            </div>
          </article>
        </section>

        <section class="cli-pane cli-pane-workflow">
          <div class="cli-section-label">handoff plan</div>
          <article v-for="step in content.workflow" :key="step.title" class="cli-step-row">
            <span>&gt; {{ step.title }}</span>
            <p>{{ step.body }}</p>
          </article>
        </section>
      </div>
    </div>
  </section>
</template>
