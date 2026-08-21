import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResolvedAccessToken } from '../../auth/AuthContext';
import { createOrGetDM } from '../../lib/dm-api';
import type { GroupResponse, UserOptionResponse } from '../../lib/groups-api';
import type { GroupArtifactResponse } from '../../lib/messages-files-api';
import { useWorkspaceStore } from '../../store/workspace-store';
import { apiBaseUrl, downloadFile } from '../../lib/api-core';
import { hasSystemPermission, getDefaultRolePermissions, type RolePermissions } from '@sekerchat/shared';
import { Avatar } from '../shared/Avatar';
import { userDisplayName } from '../../lib/users-api';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { TaskSection } from './TaskSection';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import styles from './RightSidebar.module.css';

interface ArtifactsPanelModel {
  items: Array<GroupArtifactResponse & { isOptimistic?: boolean; optimisticLabel?: string }>;
  confirmation: {
    isConfirmed: boolean;
    confirmedAt: string | null;
    confirmedByUserId: string | null;
    confirmedByDisplayName: string | null;
  };
  canConfirm: boolean;
  hasArtifacts: boolean;
  isConfirming: boolean;
  isLocked: boolean;
  isUploading: boolean;
  pendingDeleteArtifactId: string;
  pendingDeleteArtifactName: string;
  onDelete: (artifactId: string) => void;
  onPick: (files: File[]) => void;
  onRefresh: () => void;
  onToggleConfirmation: () => void;
}

interface RightSidebarProps {
  group: GroupResponse;
  currentUserId: string;
  accessToken?: string;
  isOverlay: boolean;
  isOpen: boolean;
  isArtifactDropActive?: boolean;
  onArtifactDropHandled?: () => void;
  artifacts: ArtifactsPanelModel;
  invitableUsers: UserOptionResponse[];
  isInvitableUsersLoading: boolean;
  isInvitableUsersRefreshing?: boolean;
  invitableUsersError?: string | null;
  onRequestInvitableUsers?: () => void;
  onRefreshInvitableUsers?: () => void;
  onOpenMemberProfile: (memberUserId: string) => void;
  onMentionMember: (memberUserId: string) => void;
  onRequestRemoveMember: (memberUserId: string) => void;
  onLeaveGroup?: () => void;
  onJoinGroup?: () => void;
  onInviteByEmail: (email: string) => void;
  onClose: () => void;
  onShowNotice?: (tone: 'success' | 'error', text: string) => void;
  rolePermissions?: RolePermissions | null;
  currentUserRole: string;
}

function memberLabel(member: GroupResponse['members'][number], currentUserId: string): string {
  if (member.userId === currentUserId) return '你';
  return userDisplayName(member);
}

export function RightSidebar({
  group,
  currentUserId,
  accessToken,
  isOverlay,
  isOpen,
  isArtifactDropActive = false,
  onArtifactDropHandled,
  artifacts,
  invitableUsers,
  isInvitableUsersLoading,
  isInvitableUsersRefreshing = false,
  invitableUsersError = null,
  onRequestInvitableUsers,
  onRefreshInvitableUsers,
  onOpenMemberProfile,
  onMentionMember,
  onRequestRemoveMember,
  onLeaveGroup,
  onJoinGroup,
  onInviteByEmail,
  onClose,
  onShowNotice,
  rolePermissions,
  currentUserRole,
}: RightSidebarProps) {
  const resolvedAccessToken = useResolvedAccessToken(accessToken);
  const rp = rolePermissions ?? getDefaultRolePermissions();
  const canManageArtifacts = hasSystemPermission(rp, currentUserRole, 'manage_artifacts');
  const isNarrowViewport = useMediaQuery('(max-width: 880px)');
  const isEdgeAndroid = typeof navigator !== 'undefined' && /EdgA\//.test(navigator.userAgent);
  const [menuState, setMenuState] = useState<{ memberUserId: string; x: number; y: number } | null>(null);
  const [inviteAnchor, setInviteAnchor] = useState<{ x: number; y: number } | null>(null);
  const [pendingDmUserId, setPendingDmUserId] = useState('');
  const navigate = useNavigate();
  const setWorkspaceMode = useWorkspaceStore((store) => store.setWorkspaceMode);
  const mediaInputId = `artifact-media-upload-${group.id}`;
  const fileInputId = `artifact-file-upload-${group.id}`;
  const fileInputAccept = isEdgeAndroid
    ? 'application/*,text/*,.zip,.rar,.7z,.csv,.json,.xml,.md'
    : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z,.txt,.md,.csv,.json,.xml,.apk,.ipa,.psd,.ai,.sketch';
  const fileInputMultiple = !isEdgeAndroid;

  async function handleDownloadArtifact(artifact: GroupArtifactResponse) {
    const downloadUrl = `${apiBaseUrl}/groups/${artifact.groupId}/artifacts/${artifact.id}/content`;
    try {
      await downloadFile(downloadUrl, artifact.originalName, resolvedAccessToken);
    } catch {
      artifacts.onRefresh();
    }
  }
  const handleCloseMenu = useCallback(() => setMenuState(null), []);
  const activeMember = menuState ? group.members.find((m) => m.userId === menuState.memberUserId) ?? null : null;

  const memberMenuItems: ContextMenuItem[] = activeMember
    ? [
        { key: 'profile', label: '查看资料', onSelect: () => onOpenMemberProfile(activeMember.userId) },
        { key: 'mention', label: '@ 提及', onSelect: () => onMentionMember(activeMember.userId) },
        ...(activeMember.userId !== currentUserId
          ? [{ key: 'dm', label: '私聊', onSelect: () => { void startDM(activeMember.userId); } }]
          : []),
        {
          key: 'remove', label: '移出频道', danger: true,
          disabled: !hasSystemPermission(rp, currentUserRole, 'remove_members') || activeMember.userId === currentUserId,
          separatorBefore: true,
          onSelect: () => onRequestRemoveMember(activeMember.userId),
        },
      ]
    : [];

  const inviteItems: ContextMenuItem[] = isInvitableUsersLoading
    ? [{ key: 'loading', label: '加载中...', disabled: true, onSelect: () => {} }]
    : invitableUsersError
      ? [{
          key: 'reload',
          label: '加载失败，点击重试',
          hint: invitableUsersError,
          onSelect: () => onRefreshInvitableUsers?.(),
        }]
      : invitableUsers.length > 0
        ? invitableUsers.map((user) => ({
            key: `invite-${user.id}`,
            label: userDisplayName(user),
            hint: user.email,
            onSelect: () => onInviteByEmail(user.email),
          }))
        : [{ key: 'empty', label: '暂无可邀请成员', disabled: true, onSelect: () => {} }];

  async function startDM(memberUserId: string) {
    try {
      setPendingDmUserId(memberUserId);
      const dmGroup = await createOrGetDM(resolvedAccessToken, memberUserId);
      setWorkspaceMode('dm');
      void navigate(`/dm/${dmGroup.id}`);
    } catch (error) {
      onShowNotice?.('error', error instanceof Error ? error.message : '打开私聊失败。');
    } finally {
      setPendingDmUserId('');
    }
  }

  function handleArtifactDrop(event: React.DragEvent<HTMLDivElement>) {
    const hasFiles = Array.from(event.dataTransfer?.types ?? []).includes('Files');
    if (!hasFiles) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onArtifactDropHandled?.();
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 0 && !artifacts.isLocked && !artifacts.isUploading && !artifacts.pendingDeleteArtifactId) {
      artifacts.onPick(files);
    }
  }

  return (
    <aside
      className={`${styles.sidebar} ${isOverlay ? styles.sidebarOverlay : ''} ${isOverlay && isOpen ? styles.sidebarOverlayOpen : ''}`}
      data-testid="members-surface"
    >
      {isOverlay ? (
        <div className={styles.header}>
          <button className={styles.closeButton} data-testid="right-sidebar-close-button" type="button" onClick={onClose}>
            关闭
          </button>
        </div>
      ) : null}

      <div className={styles.content}>
        {group.isDM ? (
          (() => {
            const partner = group.members.find((m) => m.userId !== currentUserId);
            if (!partner) return null;
            return (
              <>
                <div className={styles.dmPartnerCard}>
                  <Avatar avatarUrl={partner.avatarUrl} name={userDisplayName(partner)} size={64} accessToken={resolvedAccessToken} />
                  <div className={styles.dmPartnerName}>{userDisplayName(partner)}</div>
                  <div className={styles.dmPartnerEmail}>{partner.email}</div>
                </div>
                <div className={styles.divider} />
              </>
            );
          })()
        ) : null}

        {!group.isDM ? (
          <>
            <TaskSection
              group={group}
              accessToken={resolvedAccessToken}
              currentUserId={currentUserId}
            />
            <div className={styles.divider} />
          </>
        ) : null}

        {currentUserRole === 'SUPER_ADMIN' && !group.members.some((m) => m.userId === currentUserId) ? (
          <button
            className={styles.joinBtn}
            type="button"
            onClick={(e) => { e.stopPropagation(); onJoinGroup?.(); }}
          >
            加入频道
          </button>
        ) : null}

        <div className={styles.sectionFlat}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionLabel}>成员</span>
            {!group.isDM && hasSystemPermission(rp, currentUserRole, 'invite_members') ? (
              <button
                className={styles.addBtn}
                data-testid="invite-members-button"
                type="button"
                onClick={(e) => {
                  onRequestInvitableUsers?.();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setInviteAnchor({ x: rect.right, y: rect.bottom });
                }}
                title={isInvitableUsersRefreshing ? '邀请成员（刷新中）' : '邀请成员'}
              >
                {isInvitableUsersRefreshing ? '…' : '+'}
              </button>
            ) : null}
          </div>
          <div className={styles.memberList}>
            {group.members.map((member) => (
              <div
                key={member.userId}
                className={styles.member}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenuState({ memberUserId: member.userId, x: event.clientX, y: event.clientY });
                }}
              >
                <div className={styles.memberAvatar}>
                  <Avatar
                    avatarUrl={member.avatarUrl}
                    name={memberLabel(member, currentUserId)}
                    size={32}
                    accessToken={resolvedAccessToken}
                    isOnline={member.isOnline}
                    isDnd={member.isDnd}
                  />
                </div>
                <span className={styles.memberName}>{memberLabel(member, currentUserId)}</span>
                {member.userId !== currentUserId ? (
                  <button
                    className={styles.dmBtn}
                    type="button"
                    disabled={pendingDmUserId === member.userId}
                    onClick={(e) => {
                      e.stopPropagation();
                      void startDM(member.userId);
                    }}
                  >
                    {pendingDmUserId === member.userId ? '...' : '私聊'}
                  </button>
                ) : null}
                {member.userId === currentUserId ? (
                  <button
                    className={styles.removeBtn}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onLeaveGroup?.(); }}
                    title="退出频道"
                  >
                    ✕
                  </button>
                ) : hasSystemPermission(rp, currentUserRole, 'manage_user_roles') ? (
                  <button
                    className={styles.removeBtn}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRequestRemoveMember(member.userId); }}
                    title="移出频道"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {!group.isDM ? (
          <>
            <div className={styles.divider} />

            <div className={styles.sectionFlat}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionLabel}>产出</span>
                <div className={styles.sectionActions}>
                  <button
                    className={styles.addBtn}
                    type="button"
                    disabled={artifacts.isUploading || Boolean(artifacts.pendingDeleteArtifactId)}
                    onClick={() => artifacts.onRefresh()}
                    title="刷新文件状态"
                  >
                    {artifacts.isUploading || artifacts.pendingDeleteArtifactId ? '…' : '↻'}
                  </button>
                  <label
                    className={styles.addBtn}
                    aria-disabled={artifacts.isLocked || artifacts.isUploading || Boolean(artifacts.pendingDeleteArtifactId)}
                    data-disabled={artifacts.isLocked || artifacts.isUploading || Boolean(artifacts.pendingDeleteArtifactId)}
                    htmlFor={
                      artifacts.isLocked || artifacts.isUploading || Boolean(artifacts.pendingDeleteArtifactId)
                        ? undefined
                        : mediaInputId
                    }
                    onClick={(event) => {
                      if (artifacts.isLocked || artifacts.isUploading || Boolean(artifacts.pendingDeleteArtifactId)) {
                        event.preventDefault();
                      }
                    }}
                    title={
                      artifacts.isLocked
                        ? '当前产出已确认，请先解除确认'
                        : artifacts.isUploading
                          ? '产出文件上传中'
                          : isNarrowViewport
                            ? '上传图片或视频'
                            : '上传产出文件'
                    }
                  >
                    {artifacts.isUploading ? '…' : '+'}
                  </label>
                  {isNarrowViewport ? (
                    <label
                      className={styles.filePill}
                      aria-disabled={artifacts.isLocked || artifacts.isUploading || Boolean(artifacts.pendingDeleteArtifactId)}
                      data-disabled={artifacts.isLocked || artifacts.isUploading || Boolean(artifacts.pendingDeleteArtifactId)}
                      htmlFor={
                        artifacts.isLocked || artifacts.isUploading || Boolean(artifacts.pendingDeleteArtifactId)
                          ? undefined
                          : fileInputId
                      }
                      onClick={(event) => {
                        if (artifacts.isLocked || artifacts.isUploading || Boolean(artifacts.pendingDeleteArtifactId)) {
                          event.preventDefault();
                        }
                      }}
                      title={
                        artifacts.isLocked
                          ? '当前产出已确认，请先解除确认'
                          : artifacts.isUploading
                            ? '产出文件上传中'
                            : '上传文件'
                      }
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true" className={styles.fileIcon}>
                        <path
                          d="M5 2.5h4.25L12.5 5.75V13a1 1 0 0 1-1 1h-6A1.5 1.5 0 0 1 4 12.5v-8A2 2 0 0 1 6 2.5Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.25"
                          strokeLinejoin="round"
                        />
                        <path d="M9.25 2.5v3h3" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
                        <path d="M6.5 9.25h3.5M6.5 11h3.5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                      </svg>
                    </label>
                  ) : null}
                </div>
              </div>
              <p className={styles.sectionHint}>频道相关的最终交付物和打包文件。</p>
              {artifacts.isLocked ? (
                <p className={styles.confirmMeta}>
                  {artifacts.confirmation.confirmedByDisplayName || '某位成员'} 已确认当前产出
                  {artifacts.confirmation.confirmedAt ? ` · ${new Date(artifacts.confirmation.confirmedAt).toLocaleString()}` : ''}
                </p>
              ) : null}
              <input
                id={mediaInputId}
                type="file"
                multiple
                accept="image/*,video/*"
                className={styles.fileInput}
                disabled={artifacts.isLocked || artifacts.isUploading || Boolean(artifacts.pendingDeleteArtifactId)}
                onChange={(event) => {
                  artifacts.onPick(Array.from(event.target.files ?? []));
                  event.currentTarget.value = '';
                }}
              />
              <input
                id={fileInputId}
                type="file"
                multiple={fileInputMultiple}
                accept={fileInputAccept}
                className={styles.fileInput}
                disabled={artifacts.isLocked || artifacts.isUploading || Boolean(artifacts.pendingDeleteArtifactId)}
                onChange={(event) => {
                  artifacts.onPick(Array.from(event.target.files ?? []));
                  event.currentTarget.value = '';
                }}
              />
              <div
                className={`${styles.artifactDropZone} ${isArtifactDropActive ? styles.artifactDropZoneActive : ''} ${artifacts.isLocked ? styles.artifactDropZoneDisabled : ''}`}
                onDragOver={(event) => {
                  const hasFiles = Array.from(event.dataTransfer?.types ?? []).includes('Files');
                  if (!hasFiles) {
                    return;
                  }
                  event.preventDefault();
                  event.dataTransfer.dropEffect = artifacts.isLocked ? 'none' : 'copy';
                }}
                onDrop={handleArtifactDrop}
                data-testid="artifact-drop-zone"
              >
                {artifacts.isLocked ? '当前产出已确认，先解除确认后才能拖拽上传' : '拖拽到产出区上传交付文件'}
              </div>
              {artifacts.isUploading ? <p className={styles.pendingNotice}>产出文件上传中，新文件已先加入列表...</p> : null}
              {artifacts.pendingDeleteArtifactId ? (
                <p className={styles.pendingNotice}>
                  正在删除产出文件{artifacts.pendingDeleteArtifactName ? `「${artifacts.pendingDeleteArtifactName}」` : ''}...
                </p>
              ) : null}
              {artifacts.items.length > 0 ? (
                <div className={styles.artifactList}>
                  {artifacts.items.map((artifact) => (
                    <div
                      key={artifact.id}
                      className={`${styles.artifactRow} ${artifact.isOptimistic ? styles.artifactRowPending : ''}`}
                    >
                      {(() => {
                        const isBroken = artifact.fileExists === false;
                        return (
                          <div className={styles.artifactCopy}>
                        <button
                          className={`${styles.artifactNameBtn} ${isBroken ? styles.artifactNameBroken : ''}`}
                          type="button"
                          onClick={() => handleDownloadArtifact(artifact)}
                          disabled={artifact.isOptimistic}
                        >
                          {artifact.originalName}
                        </button>
                        <span>{artifact.isOptimistic ? `${artifact.optimisticLabel || '处理中'} · ${artifact.mimeType}` : artifact.mimeType}</span>
                          </div>
                        );
                      })()}
                      <button
                        className={styles.artifactDeleteBtn}
                        type="button"
                        disabled={
                          artifact.isOptimistic ||
                          !canManageArtifacts ||
                          artifacts.isLocked ||
                          artifacts.isUploading ||
                          Boolean(artifacts.pendingDeleteArtifactId)
                        }
                        onClick={() => artifacts.onDelete(artifact.id)}
                        title={
                          artifact.isOptimistic
                            ? '上传完成前无法删除'
                            :
                          artifacts.isLocked
                            ? '当前产出已确认，请先解除确认'
                            : artifacts.pendingDeleteArtifactId === artifact.id
                              ? '正在删除该产出文件'
                            : canManageArtifacts
                              ? '删除'
                              : '无删除权限'
                        }
                      >
                        {artifacts.pendingDeleteArtifactId === artifact.id ? '…' : '✕'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.subtle}>暂无产出文件</p>
              )}
              <div className={styles.confirmFooter}>
                <button
                  className={`${styles.confirmBtn} ${artifacts.isLocked ? styles.confirmBtnActive : ''}`}
                  type="button"
                  onClick={() => artifacts.onToggleConfirmation()}
                  disabled={artifacts.isConfirming || !artifacts.canConfirm}
                  title={
                    !artifacts.canConfirm
                      ? '暂无产出文件，无法确认'
                      : artifacts.isLocked
                        ? '解除当前产出确认'
                        : '确认当前产出已就绪'
                  }
                >
                  {artifacts.isConfirming ? '处理中' : artifacts.isLocked ? '解除确认' : '确认产出'}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <ContextMenu
        items={memberMenuItems}
        position={menuState ? { x: menuState.x, y: menuState.y } : null}
        onClose={handleCloseMenu}
      />
      <ContextMenu
        items={inviteItems}
        position={inviteAnchor}
        onClose={() => setInviteAnchor(null)}
      />
    </aside>
  );
}
