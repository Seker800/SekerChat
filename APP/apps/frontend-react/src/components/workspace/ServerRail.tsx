import { useCallback, useState } from 'react';
import { Avatar } from '../shared/Avatar';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { useSecondaryClickGuard } from './useSecondaryClickGuard';
import type { CategoryRailItem } from './useServerCategories';
import styles from './ServerRail.module.css';

interface ServerRailProps {
  categories: CategoryRailItem[];
  archivedCategories: CategoryRailItem[];
  selectedServerId: string;
  accessToken?: string;
  isOverlay?: boolean;
  isOverlayOpen?: boolean;
  isDMMode: boolean;
  dmUnreadCount: number;
  canManageServers?: boolean;
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
  canManageServers = true,
  onOpenDM,
  onSelect,
  onOpenCreateServer,
  onOpenCategorySettings,
}: ServerRailProps) {
  const [menuState, setMenuState] = useState<{
    server: CategoryRailItem;
    x: number;
    y: number;
  } | null>(null);
  const [archiveExpanded, setArchiveExpanded] = useState(false);
  const { markSecondaryClick, shouldSuppressClick } = useSecondaryClickGuard();
  const handleCloseMenu = useCallback(() => {
    setMenuState(null);
  }, []);

  const menuItems: ContextMenuItem[] = menuState
    ? [
        {
          key: 'create-server',
          label: '新建 server',
          disabled: !canManageServers,
          onSelect: onOpenCreateServer,
        },
        {
          key: 'open-server-settings',
          label: '打开 server 设置',
          disabled: !canManageServers,
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
          title="收件箱"
          aria-label="私聊/收件箱"
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
            title={`${category.name} · ${category.activeCount} 个活跃频道`}
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

        {archivedCategories.length > 0 ? (
          <>
            <div className={styles.divider} />
            <button
              className={styles.archiveToggle}
              type="button"
              onClick={() => setArchiveExpanded((v) => !v)}
              title={archiveExpanded ? '收起已归档 Server' : '展开已归档 Server'}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 10 10"
                style={{
                  transform: archiveExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
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
            {archiveExpanded ? (
              <div className={styles.archiveList}>
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
                    title={`${category.name} · 已归档`}
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
          </>
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
