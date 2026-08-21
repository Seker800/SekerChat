import { useEffect, useMemo, useRef, useState } from 'react';
import { useResolvedAccessToken } from '../../auth/AuthContext';
import {
  buildBotAvatarUrl,
  createBot,
  deleteBot,
  fetchBots,
  updateBot,
  uploadBotAvatar,
  type BotConfig,
  type BotSummary,
} from '../../lib/bots-api';
import type { UserSummary } from '../../lib/users-api';
import { fetchUsers } from '../../lib/users-api';
import { Avatar } from '../shared/Avatar';
import { LazyAvatarCropDialog } from '../shared/LazyAvatarCropDialog';
import styles from './AdminPage.module.css';

interface BotSectionProps {
  accessToken?: string;
}

type Notice = { type: 'success' | 'error'; message: string };

function defaultConfig(): BotConfig {
  return { gatewayUrl: 'http://127.0.0.1:18789', authToken: '', openclawAgentId: 'main', chatEnabled: true, systemPrompt: '' };
}

function resolveConfig(bot: BotSummary): BotConfig {
  return {
    gatewayUrl: bot.botConfig?.gatewayUrl || 'http://127.0.0.1:18789',
    authToken: bot.botConfig?.authToken || '—',
    openclawAgentId: bot.botConfig?.openclawAgentId || 'main',
    allowedUserIds: bot.botConfig?.allowedUserIds ?? [],
    chatEnabled: bot.botConfig?.chatEnabled ?? true,
    systemPrompt: bot.botConfig?.systemPrompt ?? '',
  };
}

export function BotSection({ accessToken: providedAccessToken }: BotSectionProps = {}) {
  const accessToken = useResolvedAccessToken(providedAccessToken);
  const [bots, setBots] = useState<BotSummary[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newConfig, setNewConfig] = useState<BotConfig>(defaultConfig());
  const [editingBotId, setEditingBotId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editConfig, setEditConfig] = useState<BotConfig>(defaultConfig());
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropBotId, setCropBotId] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<UserSummary[]>([]);

  useEffect(() => {
    void loadBots();
    void loadUsers();
  }, [accessToken]);

  async function loadUsers() {
    try {
      setAllUsers(await fetchUsers(accessToken));
    } catch {
      // ignore
    }
  }

  async function loadBots() {
    setNotice(null);
    try {
      const loadedBots = await fetchBots(accessToken);
      setBots(loadedBots.filter((bot) => bot.kind === 'AGENT_BOT'));
    } catch {
      setNotice({ type: 'error', message: '加载 Agent Bot 列表失败' });
    } finally {
      setLoaded(true);
    }
  }

  async function handleCreate() {
    if (!newEmail.trim() || !newName.trim()) {
      setNotice({ type: 'error', message: '邮箱和名称不能为空' });
      return;
    }
    setNotice(null);
    try {
      const bot = await createBot(accessToken, {
        email: newEmail.trim(),
        displayName: newName.trim(),
        botConfig: {
          gatewayUrl: newConfig.gatewayUrl?.trim() || undefined,
          authToken: newConfig.authToken?.trim() || undefined,
          openclawAgentId: newConfig.openclawAgentId?.trim() || undefined,
          allowedUserIds: newConfig.allowedUserIds?.length ? newConfig.allowedUserIds : undefined,
          chatEnabled: true,
          systemPrompt: newConfig.systemPrompt?.trim() || undefined,
        },
      });
      setBots((prev) => [...prev, bot].filter((item) => item.kind === 'AGENT_BOT'));
      setShowCreate(false);
      setNewEmail('');
      setNewName('');
      setNewConfig(defaultConfig());
      setNotice({ type: 'success', message: `Agent Bot "${bot.displayName}" 创建成功` });
    } catch (e) {
      setNotice({ type: 'error', message: e instanceof Error ? e.message : '创建失败' });
    }
  }

  function startEdit(bot: BotSummary) {
    setEditingBotId(bot.id);
    setEditName(bot.displayName ?? '');
    setEditConfig(resolveConfig(bot));
    setNotice(null);
  }

  async function handleUpdate(botId: string) {
    setNotice(null);
    try {
      const updated = await updateBot(accessToken, botId, {
        displayName: editName.trim() || undefined,
        botConfig: {
          gatewayUrl: editConfig.gatewayUrl?.trim() || undefined,
          authToken: editConfig.authToken?.trim() || undefined,
          openclawAgentId: editConfig.openclawAgentId?.trim() || undefined,
          allowedUserIds: editConfig.allowedUserIds?.length ? editConfig.allowedUserIds : undefined,
          chatEnabled: true,
          systemPrompt: editConfig.systemPrompt?.trim() || undefined,
        },
      });
      setBots((prev) => prev.map((bot) => (bot.id === botId ? updated : bot)).filter((bot) => bot.kind === 'AGENT_BOT'));
      setEditingBotId(null);
      setNotice({ type: 'success', message: 'Agent Bot 已更新' });
    } catch (e) {
      setNotice({ type: 'error', message: e instanceof Error ? e.message : '更新失败' });
    }
  }

  async function handleAvatarUpload(bot: BotSummary, file: File | Blob) {
    setNotice(null);
    try {
      await uploadBotAvatar(accessToken, bot.id, file);
      setNotice({ type: 'success', message: `Agent Bot "${bot.displayName}" 头像已更新` });
      await loadBots();
    } catch (e) {
      setNotice({ type: 'error', message: e instanceof Error ? e.message : '头像上传失败' });
    }
  }

  async function handleCropSave(blob: Blob) {
    const bot = bots.find((item) => item.id === cropBotId);
    setCropFile(null);
    setCropBotId(null);
    if (bot) {
      await handleAvatarUpload(bot, blob);
    }
  }

  async function handleDelete(bot: BotSummary) {
    if (!window.confirm(`确认删除 Agent Bot "${bot.displayName ?? bot.email}"？`)) return;
    setNotice(null);
    try {
      await deleteBot(accessToken, bot.id);
      setBots((prev) => prev.filter((item) => item.id !== bot.id));
      setNotice({ type: 'success', message: `Agent Bot "${bot.displayName ?? bot.email}" 已删除` });
    } catch (e) {
      setNotice({ type: 'error', message: e instanceof Error ? e.message : '删除失败' });
    }
  }

  if (!loaded) return null;

  return (
    <section>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Bot</h3>
        <button
          className={styles.buttonSecondary}
          type="button"
          onClick={() => { setShowCreate(true); setNotice(null); }}
        >
          创建 Agent Bot
        </button>
      </div>

      {notice ? (
        <div className={notice.type === 'success' ? styles.noticeSuccess : styles.noticeError} style={{ marginBottom: 10 }}>
          {notice.message}
        </div>
      ) : null}

      {showCreate ? (
        <ConfigForm
          email={newEmail}
          onEmailChange={setNewEmail}
          name={newName}
          onNameChange={setNewName}
          config={newConfig}
          onConfigChange={setNewConfig}
          onSave={() => void handleCreate()}
          onCancel={() => { setShowCreate(false); setNotice(null); }}
          saveLabel="创建"
          allUsers={allUsers}
        />
      ) : null}

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.avatarColumn}>头像</th>
            <th>Agent Bot</th>
            <th>Gateway URL</th>
            <th>Agent</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {bots.map((bot) => {
            const cfg = resolveConfig(bot);
            const avatarUrl = bot.avatarStorageKey ? buildBotAvatarUrl(bot.id) : null;

            return (
              <tr key={bot.id}>
                <td>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: 'none' }}
                    ref={(el) => { fileRefs.current[bot.id] = el; }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) { setCropFile(file); setCropBotId(bot.id); }
                      e.target.value = '';
                    }}
                  />
                  <div onClick={() => fileRefs.current[bot.id]?.click()} title="点击更换头像">
                    <Avatar avatarUrl={avatarUrl} name={bot.displayName ?? bot.email} size={36} accessToken={accessToken} />
                  </div>
                </td>
                <td>
                  <div className={styles.userIdentity}>
                    <div className={styles.userNameRow}>
                      <span className={styles.userName}>{bot.displayName ?? bot.email}</span>
                      <span className={styles.userDisabledTag}>Agent Bot</span>
                    </div>
                    <span className={styles.userEmail}>{bot.email}</span>
                  </div>
                </td>
                <td>
                  <span className={styles.compactMono}>{cfg.gatewayUrl}</span>
                </td>
                <td>
                  <span className={styles.mono}>{cfg.openclawAgentId}</span>
                </td>
                <td className={styles.mono}>
                  {new Date(bot.createdAt).toLocaleDateString('zh-CN')}
                </td>
                <td>
                  <div className={styles.rowActions}>
                    <button className={styles.buttonSecondary} type="button" onClick={() => startEdit(bot)}>
                      编辑
                    </button>
                    <button className={styles.buttonDanger} type="button" onClick={() => void handleDelete(bot)}>
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {bots.length === 0 && !showCreate ? (
            <tr><td colSpan={6} className={styles.empty}>暂无 Agent Bot，点击“创建 Agent Bot”按钮添加</td></tr>
          ) : null}
        </tbody>
      </table>

      {editingBotId ? (
        <div className={styles.editBlock}>
          <h4 className={styles.subsectionTitle}>编辑 Agent Bot</h4>
          <ConfigForm
            name={editName}
            onNameChange={setEditName}
            config={editConfig}
            onConfigChange={setEditConfig}
            onSave={() => void handleUpdate(editingBotId)}
            onCancel={() => { setEditingBotId(null); setNotice(null); }}
            saveLabel="保存修改"
            allUsers={allUsers}
          />
        </div>
      ) : null}

      {cropFile ? (
        <LazyAvatarCropDialog
          file={cropFile}
          onSave={handleCropSave}
          onCancel={() => { setCropFile(null); setCropBotId(null); }}
        />
      ) : null}
    </section>
  );
}

function ConfigForm({
  email,
  onEmailChange,
  name,
  onNameChange,
  config,
  onConfigChange,
  onSave,
  onCancel,
  saveLabel,
  allUsers,
}: {
  email?: string;
  onEmailChange?: (v: string) => void;
  name: string;
  onNameChange: (v: string) => void;
  config: BotConfig;
  onConfigChange: (c: BotConfig) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
  allUsers: UserSummary[];
}) {
  const [userQuery, setUserQuery] = useState('');

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return allUsers.filter((u) => !u.disabledAt);
    return allUsers.filter(
      (u) =>
        !u.disabledAt &&
        ((u.displayName?.toLowerCase().includes(q)) || u.email.toLowerCase().includes(q)),
    );
  }, [allUsers, userQuery]);

  const allowed = config.allowedUserIds ?? [];

  function toggleUser(userId: string) {
    const next = allowed.includes(userId)
      ? allowed.filter((id) => id !== userId)
      : [...allowed, userId];
    onConfigChange({ ...config, allowedUserIds: next });
  }

  return (
    <div className={styles.configForm}>
      {email !== undefined && onEmailChange ? (
        <div className={styles.inlineField}>
          <label>邮箱</label>
          <input className={styles.textInput} value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder="bot@example.com" />
        </div>
      ) : null}
      <div className={styles.inlineField}>
        <label>名称</label>
        <input className={styles.textInput} value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="Bot 显示名称" />
      </div>
      <div className={styles.inlineField}>
        <label>类型</label>
        <input className={styles.textInput} value="Agent Bot" readOnly />
      </div>
      <div className={styles.inlineField}>
        <label>Gateway</label>
        <input
          className={styles.textInput}
          value={config.gatewayUrl ?? ''}
          onChange={(e) => onConfigChange({ ...config, gatewayUrl: e.target.value })}
          placeholder="http://127.0.0.1:18789"
        />
      </div>
      <div className={styles.inlineField}>
        <label>Token</label>
        <input
          className={styles.textInput}
          value={config.authToken ?? ''}
          onChange={(e) => onConfigChange({ ...config, authToken: e.target.value })}
          placeholder="OpenClaw gateway auth token（留空则使用服务端默认值）"
        />
      </div>
      <div className={styles.inlineField}>
        <label>Agent</label>
        <input
          className={styles.nameInput}
          value={config.openclawAgentId ?? ''}
          onChange={(e) => onConfigChange({ ...config, openclawAgentId: e.target.value })}
          placeholder="main"
        />
      </div>
      <div className={styles.inlineField}>
        <label>System Prompt</label>
        <textarea
          className={styles.textInput}
          value={config.systemPrompt ?? ''}
          onChange={(e) => onConfigChange({ ...config, systemPrompt: e.target.value })}
          placeholder="可选：为这个 Agent Bot 设定固定人格、职责和行为约束"
          rows={5}
        />
      </div>
      <div className={styles.botAccessBlock}>
        <label className={styles.formLabel}>允许使用此 Bot 的用户</label>
        <input
          className={styles.textInput}
          type="text"
          placeholder="搜索用户..."
          value={userQuery}
          onChange={(e) => setUserQuery(e.target.value)}
        />
        <div className={styles.botAccessList}>
          {filteredUsers.length === 0 ? (
            <div className={styles.botAccessEmpty}>无匹配用户</div>
          ) : (
            filteredUsers.slice(0, 50).map((user) => (
              <label
                key={user.id}
                className={styles.botAccessRow}
              >
                <input
                  type="checkbox"
                  checked={allowed.includes(user.id)}
                  onChange={() => toggleUser(user.id)}
                />
                <span className={styles.botAccessName}>
                  {user.displayName || user.email}
                  {user.displayName ? <span className={styles.botAccessEmail}>{user.email}</span> : null}
                </span>
              </label>
            ))
          )}
        </div>
        {allowed.length > 0 ? (
          <div className={styles.fieldHint}>已选 {allowed.length} 人</div>
        ) : (
          <div className={styles.fieldHint}>未限制，所有人可私聊并 @ 此 Bot</div>
        )}
      </div>
      <div className={styles.buttonRow}>
        <button className={styles.button} type="button" onClick={onSave}>{saveLabel}</button>
        <button className={styles.buttonSecondary} type="button" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}
