<script setup lang="ts">
import type { LabSurface } from '../fixtures/home-content';
import ButtonShowcase from './ButtonShowcase.vue';

defineProps<{
  content: LabSurface;
  page: 'workspace' | 'discovery' | 'manage' | 'login' | 'buttons';
}>();
</script>

<template>
  <section class="variant variant-cli variant-cli-codex">
    <div class="variant-backdrop variant-backdrop-cli variant-backdrop-cli-codex"></div>

    <div class="cli-shell cli-shell-codex">
      <header class="cli-titlebar cli-titlebar-codex">
        <span>SekerChat UI Lab</span>
        <span>
          {{ content.workspacePreview.threadHeader.realtime }} ·
          {{ content.workspacePreview.threadHeader.identity }}
        </span>
      </header>

      <div class="cli-grid">
        <aside v-if="page !== 'login' && page !== 'buttons'" class="cli-pane cli-pane-sidebar">
          <div class="cli-sidebar-actions">
            <span
              v-for="action in content.workspacePreview.sidebarActions"
              :key="action"
              class="cli-sidebar-action"
            >
              {{ action }}
            </span>
          </div>
          <div class="cli-folder-list">
            <section
              v-for="folder in content.workspacePreview.folders"
              :key="folder.name"
              class="cli-folder"
            >
              <div class="cli-folder-header">
                <span class="cli-folder-name">{{ folder.name }}</span>
                <button class="cli-folder-toggle" type="button">
                  {{ folder.collapsed ? '展开' : '收起' }}
                </button>
              </div>

              <div v-if="!folder.collapsed" class="cli-thread-list">
                <article
                  v-for="thread in folder.items"
                  :key="thread.name"
                  class="cli-thread-item"
                  :class="{
                    'cli-thread-item-active': thread.active,
                    'cli-thread-item-archived': thread.state === 'archived',
                  }"
                >
                  <div class="cli-thread-row">
                    <strong>{{ thread.name }}</strong>
                    <span>{{ thread.activity }}</span>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </aside>

        <section
          class="cli-pane cli-pane-command cli-pane-command-real"
          :class="{ 'cli-pane-auth': page === 'login' || page === 'buttons' }"
        >
          <template v-if="page === 'workspace'">
          <div class="cli-thread-header">
            <div>
              <p class="cli-output">{{ content.workspacePreview.threadHeader.name }}</p>
            </div>
          </div>

          <div class="cli-message-stream">
            <article
              v-for="item in content.workspacePreview.messages"
              :key="`${item.author}-${item.time}`"
              class="cli-message-card"
              :class="{
                'cli-message-card-self': item.role === 'self',
                'cli-message-card-system': item.role === 'system',
              }"
            >
              <div v-if="item.role !== 'system'" class="cli-message-avatar">
                {{ item.author.slice(0, 1).toUpperCase() }}
              </div>
              <div class="cli-message-content">
                <div class="cli-message-meta">
                  <strong>{{ item.author }}</strong>
                  <span>{{ item.time }}</span>
                </div>
                <p>{{ item.body }}</p>
                <span v-if="item.detail" class="cli-message-detail">{{ item.detail }}</span>
              </div>
            </article>
          </div>

          <div class="cli-inline-panel cli-inline-panel-actions">
            <span class="cli-inline-label">操作</span>
            <span class="cli-inline-item">管理</span>
            <span class="cli-inline-item">邀请成员</span>
            <span class="cli-inline-item">归档线程</span>
            <span class="cli-inline-item">群组检索</span>
          </div>

          <div class="cli-composer-preview">
            <span class="cli-composer-placeholder">输入消息，或拖拽文件到这里</span>
            <div class="cli-composer-actions">
              <span class="cli-composer-upload">上传</span>
              <span class="cli-composer-send">发送</span>
            </div>
          </div>
          </template>

          <template v-else-if="page === 'discovery'">
            <div class="cli-thread-header">
              <div>
                <p class="cli-output">群组检索</p>
              </div>
            </div>

            <div class="cli-inline-panel cli-inline-panel-actions">
              <span class="cli-inline-label">范围</span>
              <span v-for="scope in content.discoveryPreview.scope" :key="scope" class="cli-inline-item">
                {{ scope }}
              </span>
            </div>

            <div class="cli-composer-preview">
              <span class="cli-composer-placeholder">搜索：{{ content.discoveryPreview.search }}</span>
              <div class="cli-composer-actions">
                <span class="cli-composer-send">检索</span>
              </div>
            </div>

            <div class="cli-table-list">
              <article v-for="item in content.discoveryPreview.results" :key="item.name" class="cli-table-row">
                <div>
                  <strong>{{ item.name }}</strong>
                  <p>{{ item.reason }}</p>
                </div>
                <span>{{ item.state }}</span>
                <span>{{ item.memberCount }} 人</span>
                <span>{{ item.owner }}</span>
                <span>{{ item.activity }}</span>
                <div class="cli-row-actions">
                  <span v-for="action in item.actions" :key="action" class="cli-row-action">{{ action }}</span>
                </div>
              </article>
            </div>
          </template>

          <template v-else-if="page === 'manage'">
            <div class="cli-thread-header">
              <div>
                <p class="cli-output">管理</p>
              </div>
            </div>

            <div class="cli-inline-panel cli-inline-panel-summary">
              <span
                v-for="item in content.managePreview.summary"
                :key="item.label"
                class="cli-inline-item"
              >
                {{ item.label }}: {{ item.value }}
              </span>
            </div>

            <div class="cli-table-list">
              <article v-for="member in content.managePreview.members" :key="member.email" class="cli-table-row">
                <div>
                  <strong>{{ member.name }}</strong>
                  <p>{{ member.email }}</p>
                </div>
                <span>{{ member.role }}</span>
                <span>设为管理员</span>
                <span>设为成员</span>
                <span>移除</span>
              </article>
            </div>

            <div class="cli-inline-panel cli-inline-panel-actions">
              <span
                v-for="action in content.managePreview.actions"
                :key="action.label"
                class="cli-inline-item"
              >
                {{ action.label }}: {{ action.value }}
              </span>
            </div>
          </template>

          <template v-else-if="page === 'login'">
            <div class="cli-auth-screen">
              <div class="cli-auth-copy">
                <p class="cli-output">{{ content.loginPreview.title }}</p>
                <p class="cli-auth-description">{{ content.loginPreview.description }}</p>
              </div>

              <div class="cli-auth-grid">
                <article class="cli-auth-card">
                  <span class="cli-inline-label">{{ content.loginPreview.primaryNote }}</span>
                  <strong>{{ content.loginMethods.primary.title }}</strong>
                  <p>{{ content.loginMethods.primary.hint }}</p>
                  <div class="cli-auth-action">{{ content.loginMethods.primary.action }}</div>
                </article>
              </div>
            </div>
          </template>

          <template v-else>
            <ButtonShowcase />
          </template>
        </section>
      </div>
    </div>
  </section>
</template>
