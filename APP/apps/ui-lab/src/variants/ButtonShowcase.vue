<script setup lang="ts">
import { computed, ref } from 'vue';

const checked = ref(false);

const currentLabel = computed(() => (checked.value ? '签退' : '签到'));
</script>

<template>
  <section class="downloaded-stage downloaded-stage-bare">
    <label class="downloaded-switch downloaded-switch-bare">
      <input v-model="checked" type="checkbox" />
      <span class="downloaded-switch-track">
        <span class="downloaded-switch-slot downloaded-switch-slot-top">签到</span>
        <span class="downloaded-switch-slot downloaded-switch-slot-bottom">签退</span>
        <span class="downloaded-switch-thumb">
          <span class="downloaded-switch-thumb-core">
            <span class="downloaded-switch-thumb-bar"></span>
            <strong>{{ currentLabel }}</strong>
          </span>
        </span>
      </span>
    </label>
  </section>
</template>
