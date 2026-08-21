<script setup lang="ts">
import type { LabSurface } from '../fixtures/home-content';

defineProps<{
  content: LabSurface;
}>();
</script>

<template>
  <section class="variant variant-apple">
    <div class="variant-backdrop variant-backdrop-apple"></div>

    <header class="apple-nav">
      <span class="apple-nav-mark">UI Lab</span>
      <nav class="apple-nav-links">
        <a href="#approach">Approach</a>
        <a href="#modules">Modules</a>
        <a href="#handoff">Handoff</a>
      </nav>
    </header>

    <section class="apple-hero" id="approach">
      <div class="apple-hero-copy">
        <p class="variant-eyebrow">{{ content.eyebrow }}</p>
        <h1 class="variant-title apple-title">{{ content.title }}</h1>
        <p class="variant-description apple-description">{{ content.description }}</p>
      </div>

      <div class="apple-glass-card">
        <div class="apple-glass-orb"></div>
        <p class="apple-glass-label">Design Exploration</p>
        <strong>Static first. Migration ready.</strong>
        <span>Focus on calm hierarchy, material depth, and restrained motion.</span>
      </div>
    </section>

    <section class="apple-metrics">
      <article v-for="metric in content.metrics" :key="metric.label" class="apple-metric-card">
        <p>{{ metric.label }}</p>
        <strong>{{ metric.value }}</strong>
        <span>{{ metric.detail }}</span>
      </article>
    </section>

    <section class="apple-feature-showcase" id="modules">
      <article v-for="feature in content.features" :key="feature.title" class="apple-feature-card">
        <span class="apple-feature-tag">{{ feature.tag }}</span>
        <h2>{{ feature.title }}</h2>
        <p>{{ feature.body }}</p>
      </article>
    </section>

    <section class="apple-workflow" id="handoff">
      <article v-for="step in content.workflow" :key="step.title" class="apple-workflow-card">
        <span class="apple-step-index">0{{ content.workflow.indexOf(step) + 1 }}</span>
        <strong>{{ step.title }}</strong>
        <p>{{ step.body }}</p>
      </article>
    </section>
  </section>
</template>
