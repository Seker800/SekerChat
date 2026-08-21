import { useRef, useState, type ReactNode } from 'react';
import { useResolvedAccessToken } from '../../auth/AuthContext';
import type { CurrentUserResponse } from '../../lib/auth-api';
import type {
  GroupMemberResponse,
  GroupResponse,
  ManageableCategoryResponse,
} from '../../lib/groups-api';
import { deleteServerAvatar, uploadServerAvatar } from '../../lib/groups-api';
import type { GroupWorkStatus } from '../../lib/ops-api';

import { Avatar } from '../shared/Avatar';
import { LazyAvatarCropDialog } from '../shared/LazyAvatarCropDialog';
import { ServerIconPickerDialog } from './ServerIconPickerDialog';
import { useUserSettingsDialogController } from './useUserSettingsDialogController';
import styles from './WorkspaceDialogs.module.css';

interface ChannelDialogModel {
  isOpen: boolean;
  onClose: () => void;
}

interface ManagePanelModel {
  canManageGroup: boolean;
  groupCategoryDirty: boolean;
  groupNameDirty: boolean;
  isInviting: boolean;
  isSavingGroup: boolean;
  isSavingWorkState: boolean;
  manageServerId: string;
  manageName: string;
  manageReason: string;
  manageStatus: GroupWorkStatus;
  workStateDirty: boolean;
  onArchiveToggle: () => void;
  onInviteByEmail: (email: string) => void;
  onManageServerChange: (value: string) => void;
  serverOptions: Array<{ id: string; name: string }>;
  onManageNameChange: (value: string) => void;
  onManageReasonChange: (value: string) => void;
  onManageStatusChange: (value: GroupWorkStatus) => void;
  onSaveGroup: () => void;
  onSaveWorkState: () => void;
  onRemoveMember: (memberUserId: string) => void;
}

interface ServerDialogState {
  mode: 'create' | 'settings';
  isOpen: boolean;
  currentServerId: string;
  currentCategoryName: string;
  categoryStats: ManageableCategoryResponse | null;
  createServerName: string;
  createChannelName: string;
  renameServerName: string;
  isSubmitting: boolean;
  onClose: () => void;
  onCreateServerNameChange: (value: string) => void;
  onCreateChannelNameChange: (value: string) => void;
  onRenameServerNameChange: (value: string) => void;
  onSubmitCreate: () => void;
  onSubmitRename: () => void;
}

interface MemberDialogState {
  isOpen: boolean;
  member: GroupMemberResponse | null;
  canRemove: boolean;
  canDM: boolean;
  onClose: () => void;
  onMention: () => void;
  onRemove: () => void;
  onStartDM: () => void;
}

interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  isDanger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

interface UserSettingsDialogState {
  isOpen: boolean;
  initialMode?: 'summary' | 'editDisplayName';
  onClose: () => void;
}

interface CreateChannelDialogState {
  isOpen: boolean;
  channelName: string;
  serverName: string;
  isSubmitting: boolean;
  onClose: () => void;
  onChannelNameChange: (value: string) => void;
  onSubmit: () => void;
}

interface WorkspaceDialogsProps {
  group?: GroupResponse | null;
  currentUserId: string;
  accessToken?: string;
  currentUser: CurrentUserResponse;
  manage: ManagePanelModel;
  channelDialog: ChannelDialogModel;
  serverDialog: ServerDialogState;
  memberDialog: MemberDialogState;
  confirmDialog: ConfirmDialogState;
  userSettingsDialog: UserSettingsDialogState;
  createChannelDialog: CreateChannelDialogState;
  isSuperAdmin?: boolean;
  onArchiveServer?: (serverId: string) => void;
  onServerAvatarUploaded?: () => void;
  onUserProfileUpdated?: () => void;
  onShowNotice?: (tone: 'success' | 'error', text: string) => void;
  onLogout?: () => void;
}

function DialogFrame({
  children,
  compact,
  title,
  description,
  onClose,
  footer,
  testId,
}: {
  children: ReactNode;
  compact?: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  footer?: ReactNode;
  testId?: string;
}) {
  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={`${styles.dialog} ${compact ? styles.compact : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <div className={styles.headerCopy}>
            <h3 className={styles.title}>{title}</h3>
            {description ? <p className={styles.description}>{description}</p> : null}
          </div>
          <button
            className={styles.closeButton}
            type="button"
            onClick={onClose}
            aria-label="关闭"
            title="关闭"
          >
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>
  );
}

function formatJoinedAt(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatActiveMinutes(value: number | null): string {
  if (value === null) return '--';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours}小时${String(minutes).padStart(2, '0')}分`;
}

export function WorkspaceDialogs({
  group,
  currentUserId,
  accessToken,
  currentUser,
  manage,
  channelDialog,
  serverDialog,
  memberDialog,
  confirmDialog,
  userSettingsDialog,
  createChannelDialog,
  isSuperAdmin = false,
  onArchiveServer,
  onServerAvatarUploaded,
  onUserProfileUpdated,
  onShowNotice,
  onLogout,
}: WorkspaceDialogsProps) {
  const resolvedAccessToken = useResolvedAccessToken(accessToken);
  const serverAvatarFileRef = useRef<HTMLInputElement | null>(null);
  const [serverCropFile, setServerCropFile] = useState<File | null>(null);
  const [isServerIconPickerOpen, setIsServerIconPickerOpen] = useState(false);
  const [isSavingServerIcon, setIsSavingServerIcon] = useState(false);
  const [isDeletingServerIcon, setIsDeletingServerIcon] = useState(false);
  const [isEditingServerName, setIsEditingServerName] = useState(false);
  const isArchived = Boolean(group?.categoryArchivedAt);
  const userSettings = useUserSettingsDialogController({
    accessToken: resolvedAccessToken,
    currentUser,
    dialog: {
      isOpen: userSettingsDialog.isOpen,
      initialMode: userSettingsDialog.initialMode ?? 'summary',
    },
    onProfileUpdated: onUserProfileUpdated,
    onShowNotice,
  });
  const {
    avatarFileRef: userAvatarFileRef,
    cropFile: userCropFile,
    setCropFile: setUserCropFile,
    displayName: userDisplayName,
    setDisplayName: setUserDisplayName,
    isEditingDisplayName,
    setIsEditingDisplayName,
    isSavingDisplayName,
    activityStats: ownActivityStats,
    activityError: ownActivityError,
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    passwordNotice,
    isChangingPassword,
    changePassword: handleChangePassword,
    saveAvatar: handleUserCropSave,
    saveDisplayName: handleSaveDisplayName,
  } = userSettings;

  const handleServerCropSave = async (blob: Blob) => {
    setServerCropFile(null);
    try {
      await uploadServerAvatar(resolvedAccessToken, serverDialog.currentServerId, blob);
      onServerAvatarUploaded?.();
      onShowNotice?.('success', 'Server 头像已更新。');
    } catch (e) {
      onShowNotice?.('error', e instanceof Error ? e.message : 'Server 头像上传失败。');
    }
  };

  const handleServerIconSave = async (blob: Blob) => {
    setIsSavingServerIcon(true);
    try {
      await uploadServerAvatar(resolvedAccessToken, serverDialog.currentServerId, blob);
      setIsServerIconPickerOpen(false);
      onServerAvatarUploaded?.();
      onShowNotice?.('success', 'Server 图标已更新。');
    } catch (e) {
      onShowNotice?.('error', e instanceof Error ? e.message : 'Server 图标保存失败。');
    } finally {
      setIsSavingServerIcon(false);
    }
  };

  const handleDeleteServerIcon = async () => {
    setIsDeletingServerIcon(true);
    try {
      await deleteServerAvatar(resolvedAccessToken, serverDialog.currentServerId);
      onServerAvatarUploaded?.();
      onShowNotice?.('success', 'Server 图标已删除。');
    } catch (e) {
      onShowNotice?.('error', e instanceof Error ? e.message : 'Server 图标删除失败。');
    } finally {
      setIsDeletingServerIcon(false);
    }
  };

  return (
    <>
      {channelDialog.isOpen ? (
        <DialogFrame
          title={`频道设置 · ${group?.name ?? ''}`}
          description="所有设置独立保存，修改后点击对应的保存按钮。"
          onClose={channelDialog.onClose}
          testId="channel-settings-dialog"
        >
          <div className={styles.sectionFlat}>
            <h4 className={styles.sectionTitle}>频道名称</h4>
            <div className={styles.inlineField}>
              <input
                value={manage.manageName}
                disabled={!manage.canManageGroup}
                data-testid="rename-group-field"
                onChange={(event) => manage.onManageNameChange(event.target.value)}
              />
              <button
                className={styles.button}
                type="button"
                disabled={!manage.canManageGroup || !manage.groupNameDirty || manage.isSavingGroup}
                onClick={manage.onSaveGroup}
              >
                {manage.isSavingGroup ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
          <div className={styles.sectionFlat}>
            <h4 className={styles.sectionTitle}>所属分类</h4>
            <div className={styles.inlineField}>
              <select
                value={manage.manageServerId}
                disabled={!manage.canManageGroup}
                data-testid="rename-category-field"
                onChange={(event) => manage.onManageServerChange(event.target.value)}
              >
                {manage.serverOptions.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name}
                  </option>
                ))}
              </select>
              <button
                className={styles.button}
                type="button"
                disabled={
                  !manage.canManageGroup || !manage.groupCategoryDirty || manage.isSavingGroup
                }
                onClick={manage.onSaveGroup}
              >
                {manage.isSavingGroup ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
          <div className={styles.sectionFlat}>
            <h4 className={styles.sectionTitle}>工作状态</h4>
            <div className={styles.field}>
              <label htmlFor="group-work-state-field">状态</label>
              <input
                id="group-work-state-field"
                data-testid="group-work-state-field"
                value={manage.manageStatus}
                disabled={!manage.canManageGroup}
                onChange={(event) => manage.onManageStatusChange(event.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="group-work-state-reason-field">原因</label>
              <textarea
                id="group-work-state-reason-field"
                data-testid="group-work-state-reason-field"
                value={manage.manageReason}
                disabled={!manage.canManageGroup}
                rows={3}
                onChange={(event) => manage.onManageReasonChange(event.target.value)}
              />
            </div>
            <div className={styles.footerActions}>
              <button
                className={styles.button}
                type="button"
                disabled={
                  !manage.canManageGroup || !manage.workStateDirty || manage.isSavingWorkState
                }
                onClick={manage.onSaveWorkState}
              >
                {manage.isSavingWorkState ? '保存中...' : '保存频道设置'}
              </button>
            </div>
          </div>
        </DialogFrame>
      ) : null}

      {serverDialog.isOpen ? (
        <DialogFrame
          title={serverDialog.mode === 'create' ? '新建 Server' : serverDialog.currentCategoryName}
          description={
            serverDialog.mode === 'create'
              ? undefined
              : `${serverDialog.categoryStats?.activeGroupCount ?? 0} 个活跃频道 · ${serverDialog.categoryStats?.archivedGroupCount ?? 0} 个归档`
          }
          onClose={() => {
            setIsEditingServerName(false);
            serverDialog.onClose();
          }}
          testId="server-settings-dialog"
          footer={
            serverDialog.mode === 'create' ? (
              <>
                <button
                  className={`${styles.button} ${styles.buttonGhost}`}
                  type="button"
                  onClick={serverDialog.onClose}
                >
                  取消
                </button>
                <div className={styles.footerActions}>
                  <button
                    className={styles.button}
                    type="button"
                    disabled={serverDialog.isSubmitting}
                    onClick={serverDialog.onSubmitCreate}
                  >
                    {serverDialog.isSubmitting ? '创建中...' : '创建 Server'}
                  </button>
                </div>
              </>
            ) : null
          }
        >
          {serverDialog.mode === 'create' ? (
            <div className={styles.section}>
              <div className={styles.field}>
                <label>Server 名称</label>
                <input
                  value={serverDialog.createServerName}
                  placeholder="例如：研发"
                  onChange={(event) => serverDialog.onCreateServerNameChange(event.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label>首个频道名称</label>
                <input
                  value={serverDialog.createChannelName}
                  placeholder="例如：需求讨论"
                  onChange={(event) => serverDialog.onCreateChannelNameChange(event.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className={styles.serverPreview}>
              <div className={styles.accountSummary}>
                <button
                  className={styles.accountAvatarButton}
                  type="button"
                  title="点击更换图标"
                  aria-label="更换 Server 图标"
                  onClick={() => setIsServerIconPickerOpen(true)}
                >
                  <Avatar
                    avatarUrl={group?.serverAvatarUrl ?? null}
                    name={serverDialog.currentCategoryName}
                    size={68}
                    accessToken={resolvedAccessToken}
                  />
                </button>
                <input
                  ref={serverAvatarFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className={styles.fileInput}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    if (file) setServerCropFile(file);
                    if (serverAvatarFileRef.current) serverAvatarFileRef.current.value = '';
                  }}
                />

                <div className={styles.accountIdentity}>
                  {isEditingServerName ? (
                    <form
                      className={styles.displayNameEditor}
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (
                          serverDialog.renameServerName.trim() &&
                          serverDialog.renameServerName !== serverDialog.currentCategoryName
                        ) {
                          serverDialog.onSubmitRename();
                        }
                        setIsEditingServerName(false);
                      }}
                    >
                      <input
                        value={serverDialog.renameServerName}
                        autoFocus
                        placeholder="Server 名称"
                        disabled={serverDialog.isSubmitting}
                        onChange={(event) =>
                          serverDialog.onRenameServerNameChange(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            serverDialog.onRenameServerNameChange(serverDialog.currentCategoryName);
                            setIsEditingServerName(false);
                          }
                        }}
                      />
                      <button
                        className={styles.textAction}
                        type="submit"
                        disabled={serverDialog.isSubmitting}
                      >
                        保存
                      </button>
                    </form>
                  ) : (
                    <button
                      className={styles.displayNameButton}
                      type="button"
                      onClick={() => {
                        serverDialog.onRenameServerNameChange(serverDialog.currentCategoryName);
                        setIsEditingServerName(true);
                      }}
                    >
                      <span className={styles.displayNameText}>
                        {serverDialog.currentCategoryName}
                      </span>
                    </button>
                  )}
                  <div className={styles.serverIconActions}>
                    <button
                      className={styles.textAction}
                      type="button"
                      onClick={() => serverAvatarFileRef.current?.click()}
                    >
                      上传头像
                    </button>
                    {group?.serverAvatarUrl ? (
                      <>
                        <span className={styles.actionSep}>·</span>
                        <button
                          className={styles.textAction}
                          type="button"
                          disabled={isDeletingServerIcon}
                          onClick={handleDeleteServerIcon}
                        >
                          {isDeletingServerIcon ? '删除中...' : '移除'}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className={styles.divider} />

              <div className={styles.statsGrid}>
                <div className={styles.statItem}>
                  <span className={styles.statValue}>
                    {serverDialog.categoryStats?.activeGroupCount ?? 0}
                  </span>
                  <span className={styles.statLabel}>活跃</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statValue}>
                    {serverDialog.categoryStats?.archivedGroupCount ?? 0}
                  </span>
                  <span className={styles.statLabel}>归档</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statValue}>
                    {serverDialog.categoryStats?.groupCount ?? 0}
                  </span>
                  <span className={styles.statLabel}>总数</span>
                </div>
              </div>

              {isSuperAdmin ? (
                <>
                  <div className={styles.divider} />
                  <button
                    className={`${styles.button} ${isArchived ? styles.buttonGhost : styles.buttonDanger}`}
                    type="button"
                    onClick={() => onArchiveServer?.(serverDialog.currentServerId)}
                  >
                    {isArchived ? '取消归档 Server' : '归档此 Server'}
                  </button>
                </>
              ) : null}
            </div>
          )}
        </DialogFrame>
      ) : null}

      {createChannelDialog.isOpen ? (
        <DialogFrame
          compact
          title={`在「${createChannelDialog.serverName}」中新建频道`}
          description="在当前 server 下创建一个新的协作频道。"
          onClose={createChannelDialog.onClose}
          testId="create-channel-dialog"
          footer={
            <>
              <button
                className={`${styles.button} ${styles.buttonGhost}`}
                type="button"
                onClick={createChannelDialog.onClose}
              >
                取消
              </button>
              <div className={styles.footerActions}>
                <button
                  className={styles.button}
                  type="button"
                  disabled={createChannelDialog.isSubmitting}
                  onClick={createChannelDialog.onSubmit}
                >
                  {createChannelDialog.isSubmitting ? '创建中...' : '创建频道'}
                </button>
              </div>
            </>
          }
        >
          <div className={styles.section}>
            <div className={styles.field}>
              <label>频道名称</label>
              <input
                value={createChannelDialog.channelName}
                autoFocus
                placeholder="例如：需求讨论"
                onChange={(event) => createChannelDialog.onChannelNameChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') createChannelDialog.onSubmit();
                }}
              />
            </div>
          </div>
        </DialogFrame>
      ) : null}

      {memberDialog.isOpen && memberDialog.member ? (
        <DialogFrame
          compact
          title="成员资料"
          description="成员资料和管理动作从信息栏独立出来，右键可以直接到这里。"
          onClose={memberDialog.onClose}
          testId="member-profile-dialog"
          footer={
            <>
              <button
                className={`${styles.button} ${styles.buttonGhost}`}
                type="button"
                onClick={memberDialog.onClose}
              >
                关闭
              </button>
              <div className={styles.footerActions}>
                <button
                  className={`${styles.button} ${styles.buttonGhost}`}
                  type="button"
                  onClick={memberDialog.onMention}
                >
                  @ 提及
                </button>
                {memberDialog.canDM ? (
                  <button
                    className={`${styles.button} ${styles.buttonGhost}`}
                    type="button"
                    onClick={memberDialog.onStartDM}
                  >
                    私聊
                  </button>
                ) : null}
                {memberDialog.canRemove ? (
                  <button
                    className={`${styles.button} ${styles.buttonDanger}`}
                    type="button"
                    onClick={memberDialog.onRemove}
                  >
                    移出频道
                  </button>
                ) : null}
              </div>
            </>
          }
        >
          <div className={styles.memberCard}>
            <div className={styles.memberHeader}>
              <div className={styles.memberAvatar}>
                <Avatar
                  avatarUrl={memberDialog.member.avatarUrl}
                  name={memberDialog.member.displayName || memberDialog.member.email}
                  size={48}
                  accessToken={resolvedAccessToken}
                />
              </div>
              <div className={styles.memberMeta}>
                <strong>{memberDialog.member.displayName || memberDialog.member.email}</strong>
                <span>{memberDialog.member.email}</span>
                <span>{memberDialog.member.role === 'ADMIN' ? '管理员' : '成员'}</span>
              </div>
            </div>
            <div className={styles.field}>
              <label>加入时间</label>
              <div className={styles.readonlyValue}>
                {formatJoinedAt(memberDialog.member.joinedAt)}
              </div>
            </div>
          </div>
        </DialogFrame>
      ) : null}

      {confirmDialog.isOpen ? (
        <DialogFrame
          compact
          title={confirmDialog.title}
          description={confirmDialog.description}
          onClose={confirmDialog.onClose}
          testId="confirm-dialog"
          footer={
            <>
              <button
                className={`${styles.button} ${styles.buttonGhost}`}
                type="button"
                onClick={confirmDialog.onClose}
              >
                取消
              </button>
              <div className={styles.footerActions}>
                <button
                  className={`${styles.button} ${confirmDialog.isDanger ? styles.buttonDanger : ''}`}
                  type="button"
                  onClick={confirmDialog.onConfirm}
                >
                  {confirmDialog.confirmLabel}
                </button>
              </div>
            </>
          }
        >
          <div className={styles.section}>
            <p className={styles.sectionCopy}>
              危险操作会继续保留确认层，避免把真正执行直接塞进右键菜单。
            </p>
            {confirmDialog.isDanger ? (
              <p className={styles.dangerNote}>确认后会立即生效。</p>
            ) : null}
          </div>
        </DialogFrame>
      ) : null}

      {userSettingsDialog.isOpen ? (
        <DialogFrame
          title="个人设置"
          description=""
          onClose={userSettingsDialog.onClose}
          testId="user-settings-dialog"
        >
          <div className={styles.userAccountPanel}>
            <section className={styles.accountSummary}>
              <button
                className={styles.accountAvatarButton}
                type="button"
                data-tooltip="点击修改头像"
                aria-label="修改头像"
                onClick={() => userAvatarFileRef.current?.click()}
              >
                <Avatar
                  avatarUrl={currentUser.avatarUrl}
                  name={currentUser.displayName || currentUser.email}
                  size={68}
                  accessToken={resolvedAccessToken}
                />
                <span className={styles.tooltipBubble}>点击修改头像</span>
              </button>
              <input
                ref={userAvatarFileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className={styles.fileInput}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (file) setUserCropFile(file);
                  if (userAvatarFileRef.current) userAvatarFileRef.current.value = '';
                }}
              />

              <div className={styles.accountIdentity}>
                {isEditingDisplayName ? (
                  <form
                    className={styles.displayNameEditor}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleSaveDisplayName();
                    }}
                  >
                    <input
                      value={userDisplayName}
                      autoFocus
                      placeholder="输入昵称"
                      disabled={isSavingDisplayName}
                      onChange={(event) => setUserDisplayName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          setUserDisplayName(currentUser.displayName || '');
                          setIsEditingDisplayName(false);
                        }
                      }}
                    />
                    <button
                      className={styles.textAction}
                      type="submit"
                      disabled={isSavingDisplayName}
                    >
                      {isSavingDisplayName ? '保存中' : '保存'}
                    </button>
                  </form>
                ) : (
                  <button
                    className={styles.displayNameButton}
                    type="button"
                    data-tooltip="点击修改昵称 / ID"
                    onClick={() => setIsEditingDisplayName(true)}
                  >
                    <span className={styles.displayNameText}>
                      {currentUser.displayName || currentUser.email}
                    </span>
                    <span className={styles.tooltipBubble}>点击修改昵称 / ID</span>
                  </button>
                )}
                <span className={styles.accountId} data-tooltip="点击上方昵称可修改昵称 / ID">
                  <span className={styles.accountIdText}>{currentUser.email}</span>
                  <span className={styles.tooltipBubble}>点击上方昵称可修改昵称 / ID</span>
                </span>
              </div>

              <button className={styles.logoutLink} type="button" onClick={onLogout}>
                退出登录
              </button>
            </section>

            <section className={styles.passwordSection} aria-labelledby="change-password-title">
              <div>
                <h4 id="change-password-title">修改密码</h4>
                <p>修改成功后，其他网页会话和提醒设备需要重新登录。</p>
              </div>
              <form
                className={styles.passwordForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleChangePassword();
                }}
              >
                <div className={styles.passwordFields}>
                  <label className={styles.field}>
                    <span>当前密码</span>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      required
                    />
                  </label>
                  <label className={styles.field}>
                    <span>新密码</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      required
                      minLength={8}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>确认新密码</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                      minLength={8}
                    />
                  </label>
                </div>
                <div className={styles.passwordFooter}>
                  <span>至少 8 位，包含大小写字母和数字。</span>
                  <button className={styles.button} type="submit" disabled={isChangingPassword}>
                    {isChangingPassword ? '修改中…' : '修改密码'}
                  </button>
                </div>
                {passwordNotice ? (
                  <p
                    className={
                      passwordNotice.tone === 'error' ? styles.dangerNote : styles.successNote
                    }
                  >
                    {passwordNotice.text}
                  </p>
                ) : null}
              </form>
            </section>

            <section className={styles.compactActivity} aria-label="我的在线时长">
              <div className={styles.compactActivityTitle}>我的在线时长</div>
              {ownActivityError ? (
                <p className={styles.dangerNote}>{ownActivityError}</p>
              ) : (
                <dl className={styles.activityList}>
                  <div>
                    <dt>今日在线时长</dt>
                    <dd>{formatActiveMinutes(ownActivityStats?.dayWorkedMinutes ?? null)}</dd>
                  </div>
                  <div>
                    <dt>上一日在线时长</dt>
                    <dd>
                      {formatActiveMinutes(ownActivityStats?.previousDayWorkedMinutes ?? null)}
                    </dd>
                  </div>
                  <div>
                    <dt>周平均在线时长</dt>
                    <dd>
                      {formatActiveMinutes(ownActivityStats?.weekAverageDailyWorkedMinutes ?? null)}
                    </dd>
                  </div>
                  <div>
                    <dt>月平均在线时长</dt>
                    <dd>
                      {formatActiveMinutes(
                        ownActivityStats?.monthAverageDailyWorkedMinutes ?? null,
                      )}
                    </dd>
                  </div>
                </dl>
              )}
            </section>
          </div>
        </DialogFrame>
      ) : null}

      {serverCropFile ? (
        <LazyAvatarCropDialog
          file={serverCropFile}
          onSave={handleServerCropSave}
          onCancel={() => setServerCropFile(null)}
        />
      ) : null}

      {isServerIconPickerOpen ? (
        <ServerIconPickerDialog
          serverName={serverDialog.currentCategoryName}
          isSaving={isSavingServerIcon}
          onCancel={() => setIsServerIconPickerOpen(false)}
          onSave={handleServerIconSave}
        />
      ) : null}

      {userCropFile ? (
        <LazyAvatarCropDialog
          file={userCropFile}
          onSave={handleUserCropSave}
          onCancel={() => setUserCropFile(null)}
        />
      ) : null}
    </>
  );
}
