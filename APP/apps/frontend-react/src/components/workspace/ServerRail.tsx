import { useCallback, useState } from 'react';
import { Avatar } from '../shared/Avatar';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { useSecondaryClickGuard } from './useSecondaryClickGuard';
import type { CategoryRailItem } from './useServerCategories';
import styles from './ServerRail.module.css';
import { useTranslation } from 'react-i18next';

interface ServerRailProps {
  categories: CategoryRailItem[];
  archivedCategories: CategoryRailItem[];
  selectedServerId: string;
  accessToken?: string;
  isOverlay?: boolean;
  isOverlayOpen?: boolean;
  isDMMode: boolean;
  dmUnreadCount: number;
  canCreateServers?: boolean;
  canManageServerSettings?: boolean;
  onOpenDM: () => void;
  onSelect: (serverId: string) => void;
  onOpenCreateServer: () => void;
  onOpenCategorySettings: (server: CategoryRailItem) => void;
}

export function ServerRail({
  categories,
  archivedCategories,
  selectedServerId,
  accessToken,
  isOverlay,
  isOverlayOpen,
  isDMMode,
  dmUnreadCount,
  canCreateServers = true,
  canManageServerSettings = true,
  onOpenDM,
  onSelect,
  onOpenCreateServer,
  onOpenCategorySettings,
}: ServerRailProps) {
  const { t } = useTranslation();
  const [menuState, setMenuState] = useState<{
    server: CategoryRailItem;
    x: number;
    y: number;
  } | null>(null);
  const [serverActionsExpanded, setServerActionsExpanded] = useState(false);
  const { markSecondaryClick, shouldSuppressClick } = useSecondaryClickGuard();
  const handleCloseMenu = useCallback(() => {
    setMenuState(null);
  }, []);

  const menuItems: ContextMenuItem[] = menuState
    ? [
        {
          key: 'create-server',
          label: t('serverRail.createMenu'),
          disabled: !canCreateServers,
          onSelect: onOpenCreateServer,
        },
        {
          key: 'open-server-settings',
          label: t('serverRail.openSettings'),
          disabled: !canManageServerSettings,
          onSelect: () => onOpenCategorySettings(menuState.server),
        },
      ]
    : [];

  return (
    <aside
      className={`${styles.rail} ${isOverlay ? styles.railOverlay : ''} ${isOverlay && isOverlayOpen ? styles.railOverlayVisible : ''}`}
    >
      <div className={styles.railMain}>
        <button
          className={`${styles.home} ${isDMMode ? styles.buttonActive : ''}`}
          type="button"
          onClick={onOpenDM}
          title={t('navigation.inbox')}
          aria-label={t('navigation.dmInbox')}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {dmUnreadCount > 0 ? (
            <span className={styles.badge}>{dmUnreadCount > 99 ? '99+' : dmUnreadCount}</span>
          ) : null}
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            className={`${styles.button} ${category.id === selectedServerId ? styles.buttonActive : ''}`}
            data-testid="server-rail-category"
            onMouseDown={(event) => {
              if (!event.ctrlKey || event.button !== 0) {
                return;
              }

              event.preventDefault();
              markSecondaryClick();
              setMenuState({ server: category, x: event.clientX, y: event.clientY });
            }}
            onClick={(event) => {
              if (shouldSuppressClick()) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }

              onSelect(category.id);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              markSecondaryClick();
              setMenuState({ server: category, x: event.clientX, y: event.clientY });
            }}
            title={`${category.name} · ${t('serverRail.activeChannels', { count: category.activeCount })}`}
          >
            <Avatar
              avatarUrl={category.avatarUrl}
              name={category.name}
              size={48}
              accessToken={accessToken}
            />
            {category.unreadCount > 0 ? (
              <span className={styles.badge}>{category.unreadCount}</span>
            ) : null}
          </button>
        ))}

        <div className={styles.divider} />
        <button
          className={styles.archiveToggle}
          type="button"
          aria-controls="server-rail-actions"
          aria-expanded={serverActionsExpanded}
          aria-label={serverActionsExpanded ? t('serverRail.collapseActions') : t('serverRail.expandActions')}
          onClick={() => setServerActionsExpanded((expanded) => !expanded)}
          title={serverActionsExpanded ? t('serverRail.collapseActions') : t('serverRail.expandActions')}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 10 10"
            aria-hidden="true"
            style={{
              transform: serverActionsExpanded ? 'rotate(-90deg)' : 'rotate(90deg)',
              transition: 'transform 0.15s',
            }}
          >
            <path
              d="M3 1L8 5L3 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {serverActionsExpanded ? (
          <div id="server-rail-actions" className={styles.archiveList}>
            <button
              className={styles.addButton}
              type="button"
              aria-label={t('serverRail.create')}
              title={canCreateServers ? t('serverRail.create') : t('serverRail.noCreatePermission')}
              disabled={!canCreateServers}
              onClick={onOpenCreateServer}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            {archivedCategories.map((category) => (
              <button
                key={category.id}
                className={`${styles.button} ${styles.buttonArchived} ${category.id === selectedServerId ? styles.buttonActive : ''}`}
                onMouseDown={(event) => {
                  if (!event.ctrlKey || event.button !== 0) return;
                  event.preventDefault();
                  markSecondaryClick();
                  setMenuState({ server: category, x: event.clientX, y: event.clientY });
                }}
                onClick={(event) => {
                  if (shouldSuppressClick()) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                  }
                  onSelect(category.id);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  markSecondaryClick();
                  setMenuState({ server: category, x: event.clientX, y: event.clientY });
                }}
                title={`${category.name} · ${t('serverRail.archived')}`}
              >
                <Avatar
                  avatarUrl={category.avatarUrl}
                  name={category.name}
                  size={40}
                  accessToken={accessToken}
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <ContextMenu
        items={menuItems}
        position={menuState ? { x: menuState.x, y: menuState.y } : null}
        onClose={handleCloseMenu}
      />
    </aside>
  );
}
