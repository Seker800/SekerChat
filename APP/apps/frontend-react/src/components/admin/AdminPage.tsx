import { useEffect, useMemo, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { getDefaultRolePermissions, hasSystemPermission, type RolePermissions } from '@sekerchat/shared';
import { fetchSystemConfig } from '../../lib/system-config-api';
import { AccessControlSection } from './AccessControlSection';
import { ArtifactsAdminSection } from './ArtifactsAdminSection';
import { BanManagementSection } from './BanManagementSection';
import { MessageRetentionSection } from './MessageRetentionSection';
import { PermissionSection } from './PermissionSection';
import { QuietHoursSection } from './QuietHoursSection';
import { UserManagementSection } from './UserManagementSection';
import { WorkStatusSection } from './WorkStatusSection';
import { AttendanceSection } from './AttendanceSection';
import { BotSection } from './BotSection';
import styles from './AdminPage.module.css';
import { BROWSER_COOKIE_CREDENTIAL } from '../../lib/api-core';

type Tab =
  | 'quiet-hours'
  | 'work-statuses'
  | 'message-storage'
  | 'access-control'
  | 'permissions'
  | 'bots'
  | 'users'
  | 'attendance'
  | 'artifacts'
  | 'bans';

type AdminNavItem = {
  key: Tab;
  label: string;
  permission: boolean;
};

type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

export function AdminPage() {
  const { currentUser } = useAuth();
  const accessToken = BROWSER_COOKIE_CREDENTIAL;
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>(getDefaultRolePermissions());
  const [configLoaded, setConfigLoaded] = useState(currentUser.role === 'SUPER_ADMIN');
  const [tab, setTab] = useState<Tab>('users');

  useEffect(() => {
    if (currentUser.role === 'SUPER_ADMIN') {
      setConfigLoaded(true);
      return;
    }

    let cancelled = false;
    fetchSystemConfig(accessToken)
      .then((cfg) => {
        if (cancelled) return;
        setRolePermissions(cfg.rolePermissions ?? getDefaultRolePermissions());
        setConfigLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setRolePermissions(getDefaultRolePermissions());
        setConfigLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, currentUser.role]);

  const canAccessAdmin = hasSystemPermission(rolePermissions, currentUser.role, 'access_admin_page');
  const canManageSystemConfig = hasSystemPermission(rolePermissions, currentUser.role, 'manage_system_config');
  const canViewUsers = hasSystemPermission(rolePermissions, currentUser.role, 'view_user_directory');
  const canManageRoles = hasSystemPermission(rolePermissions, currentUser.role, 'manage_user_roles');
  const canViewAttendance = hasSystemPermission(rolePermissions, currentUser.role, 'view_presence_logs');
  const canViewArtifacts = hasSystemPermission(rolePermissions, currentUser.role, 'view_admin_artifacts');
  const canDeleteArtifacts = hasSystemPermission(rolePermissions, currentUser.role, 'manage_artifacts');
  const canManageBans = hasSystemPermission(rolePermissions, currentUser.role, 'manage_bans');

  const navGroups = useMemo<AdminNavGroup[]>(() => {
    const groups: AdminNavGroup[] = [
      {
        label: '运营',
        items: [
          { key: 'users', label: '用户', permission: canViewUsers },
          { key: 'attendance', label: '出勤', permission: canViewAttendance },
          { key: 'artifacts', label: '产出文件', permission: canViewArtifacts },
        ],
      },
      {
        label: '权限',
        items: [
          { key: 'permissions', label: '权限矩阵', permission: canManageSystemConfig },
          { key: 'access-control', label: '访问控制', permission: canManageSystemConfig },
          { key: 'bans', label: '封禁', permission: canManageBans },
        ],
      },
      {
        label: '系统',
        items: [
          { key: 'quiet-hours', label: '通知时段', permission: canManageSystemConfig },
          { key: 'work-statuses', label: '工作状态', permission: canManageSystemConfig },
          { key: 'message-storage', label: '消息与附件', permission: canManageSystemConfig },
          { key: 'bots', label: 'Bot', permission: canManageSystemConfig },
        ],
      },
    ];

    return groups.map((group) => ({
      ...group,
      items: group.items.filter((item) => item.permission),
    })).filter((group) => group.items.length > 0);
  }, [
    canManageSystemConfig,
    canViewUsers,
    canViewAttendance,
    canViewArtifacts,
    canManageBans,
  ]);

  const availableTabs = useMemo(
    () => navGroups.flatMap((group) => group.items.map(({ key, label }) => ({ key, label }))),
    [navGroups],
  );

  function renderActiveSection() {
    switch (tab) {
      case 'quiet-hours':
        return <QuietHoursSection />;
      case 'work-statuses':
        return <WorkStatusSection />;
      case 'message-storage':
        return <MessageRetentionSection />;
      case 'access-control':
        return <AccessControlSection />;
      case 'permissions':
        return <PermissionSection />;
      case 'users':
        return <UserManagementSection currentUser={currentUser} canManageRoles={canManageRoles} />;
      case 'artifacts':
        return <ArtifactsAdminSection canDeleteArtifacts={canDeleteArtifacts} />;
      case 'bots':
        return <BotSection />;
      case 'bans':
        return <BanManagementSection />;
      case 'attendance':
        return <AttendanceSection />;
      default:
        return null;
    }
  }

  useEffect(() => {
    if (!availableTabs.some((item) => item.key === tab)) {
      setTab(availableTabs[0]?.key ?? 'quiet-hours');
    }
  }, [availableTabs, tab]);

  if (!configLoaded) {
    return <main>正在加载管理权限...</main>;
  }

  if (!canAccessAdmin) {
    return <Navigate to="/groups" replace />;
  }

  return (
    <div className={styles.adminPage}>
      <header className={styles.header}>
        <h2 className={styles.headerTitle}>管理</h2>
        <Link to="/groups" className={styles.backLink}>返回频道</Link>
      </header>
      <div className={styles.adminBody}>
        <nav className={styles.sidebar} aria-label="管理导航">
          {navGroups.map((group) => (
            <div key={group.label} className={styles.navGroup}>
              <div className={styles.navGroupLabel}>{group.label}</div>
              <div className={styles.navItems}>
                {group.items.map((item) => (
                  <button
                    key={item.key}
                    className={tab === item.key ? styles.navItemActive : styles.navItem}
                    type="button"
                    aria-current={tab === item.key ? 'page' : undefined}
                    onClick={() => setTab(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <main className={styles.content}>{renderActiveSection()}</main>
      </div>
    </div>
  );
}
