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
import { useTranslation } from 'react-i18next';

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

function memberLabel(member: GroupResponse['members'][number], currentUserId: string, selfLabel: string): string {
  if (member.userId === currentUserId) return selfLabel;
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
  const { t } = useTranslation();
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
        { key: 'profile', label: t('rightSidebar.profile'), onSelect: () => onOpenMemberProfile(activeMember.userId) },
        { key: 'mention', label: t('rightSidebar.mention'), onSelect: () => onMentionMember(activeMember.userId) },
        ...(activeMember.userId !== currentUserId
          ? [{ key: 'dm', label: t('rightSidebar.dm'), onSelect: () => { void startDM(activeMember.userId); } }]
          : []),
        {
          key: 'remove', label: t('rightSidebar.remove'), danger: true,
          disabled: !hasSystemPermission(rp, currentUserRole, 'remove_members') || activeMember.userId === currentUserId,
          separatorBefore: true,
          onSelect: () => onRequestRemoveMember(activeMember.userId),
        },
      ]
    : [];

  const inviteItems: ContextMenuItem[] = isInvitableUsersLoading
    ? [{ key: 'loading', label: t('rightSidebar.loading'), disabled: true, onSelect: () => {} }]
    : invitableUsersError
      ? [{
          key: 'reload',
          label: t('rightSidebar.retryLoad'),
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
        : [{ key: 'empty', label: t('rightSidebar.noInvitable'), disabled: true, onSelect: () => {} }];

  async function startDM(memberUserId: string) {
    try {
      setPendingDmUserId(memberUserId);
      const dmGroup = await createOrGetDM(resolvedAccessToken, memberUserId);
      setWorkspaceMode('dm');
      void navigate(`/dm/${dmGroup.id}`);
    } catch (error) {
      onShowNotice?.('error', error instanceof Error ? error.message : t('rightSidebar.dmFailed'));
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
            {t('common.close')}
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
            {t('rightSidebar.join')}
          </button>
        ) : null}

        <div className={styles.sectionFlat}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionLabel}>{t('rightSidebar.members')}</span>
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
                title={isInvitableUsersRefreshing ? t('rightSidebar.inviteRefreshing') : t('rightSidebar.invite')}
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
                    name={memberLabel(member, currentUserId, t('rightSidebar.you'))}
                    size={32}
                    accessToken={resolvedAccessToken}
                    isOnline={member.isOnline}
                    isDnd={member.isDnd}
                  />
                </div>
                <span className={styles.memberName}>{memberLabel(member, currentUserId, t('rightSidebar.you'))}</span>
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
                    {pendingDmUserId === member.userId ? '...' : t('rightSidebar.dm')}
                  </button>
                ) : null}
                {member.userId === currentUserId ? (
                  <button
                    className={styles.removeBtn}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onLeaveGroup?.(); }}
                    title={t('rightSidebar.leave')}
                  >
                    ✕
                  </button>
                ) : hasSystemPermission(rp, currentUserRole, 'manage_user_roles') ? (
                  <button
                    className={styles.removeBtn}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRequestRemoveMember(member.userId); }}
                    title={t('rightSidebar.remove')}
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
                <span className={styles.sectionLabel}>{t('rightSidebar.artifacts')}</span>
                <div className={styles.sectionActions}>
                  <button
                    className={styles.addBtn}
                    type="button"
                    disabled={artifacts.isUploading || Boolean(artifacts.pendingDeleteArtifactId)}
                    onClick={() => artifacts.onRefresh()}
                    title={t('rightSidebar.refreshArtifacts')}
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
                        ? t('rightSidebar.locked')
                        : artifacts.isUploading
                          ? t('rightSidebar.uploading')
                          : isNarrowViewport
                            ? t('composer.uploadMedia')
                            : t('rightSidebar.uploadArtifact')
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
                          ? t('rightSidebar.locked')
                          : artifacts.isUploading
                            ? t('rightSidebar.uploading')
                            : t('composer.uploadFile')
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
              <p className={styles.sectionHint}>{t('rightSidebar.description')}</p>
              {artifacts.isLocked ? (
                <p className={styles.confirmMeta}>
                  {t('rightSidebar.confirmedBy', { name: artifacts.confirmation.confirmedByDisplayName || t('rightSidebar.someone') })}
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
                {artifacts.isLocked ? t('rightSidebar.dropLocked') : t('rightSidebar.drop')}
              </div>
              {artifacts.isUploading ? <p className={styles.pendingNotice}>{t('rightSidebar.uploadPending')}</p> : null}
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
                        <span>{artifact.isOptimistic ? `${artifact.optimisticLabel || t('rightSidebar.processing')} · ${artifact.mimeType}` : artifact.mimeType}</span>
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
                            ? t('rightSidebar.deleteBeforeUpload')
                            :
                          artifacts.isLocked
                            ? t('rightSidebar.locked')
                            : artifacts.pendingDeleteArtifactId === artifact.id
                              ? t('rightSidebar.deleting')
                            : canManageArtifacts
                              ? t('rightSidebar.delete')
                              : t('rightSidebar.noDeletePermission')
                        }
                      >
                        {artifacts.pendingDeleteArtifactId === artifact.id ? '…' : '✕'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.subtle}>{t('rightSidebar.empty')}</p>
              )}
              <div className={styles.confirmFooter}>
                <button
                  className={`${styles.confirmBtn} ${artifacts.isLocked ? styles.confirmBtnActive : ''}`}
                  type="button"
                  onClick={() => artifacts.onToggleConfirmation()}
                  disabled={artifacts.isConfirming || !artifacts.canConfirm}
                  title={
                    !artifacts.canConfirm
                      ? t('rightSidebar.cannotConfirmEmpty')
                      : artifacts.isLocked
                        ? t('rightSidebar.unlock')
                        : t('rightSidebar.confirmReady')
                  }
                >
                  {artifacts.isConfirming ? t('rightSidebar.processing') : artifacts.isLocked ? t('rightSidebar.unlockAction') : t('rightSidebar.confirmAction')}
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
