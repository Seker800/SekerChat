import { useEffect, useState } from 'react';
import {
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  getDefaultRolePermissions,
  type SystemPermission,
  type RolePermissions,
} from '@sekerchat/shared';
import { useResolvedAccessToken } from '../../auth/AuthContext';
import { fetchSystemConfig, updateSystemConfig } from '../../lib/system-config-api';
import styles from './AdminPage.module.css';

const ROLES = ['MEMBER', 'CLI_BOT', 'ADMIN'] as const;
const ROLE_LABELS: Record<string, string> = {
  MEMBER: '成员',
  CLI_BOT: 'Bot',
  ADMIN: '管理员',
};

export function PermissionSection({ accessToken: providedAccessToken }: { accessToken?: string } = {}) {
  const accessToken = useResolvedAccessToken(providedAccessToken);
  const [permissions, setPermissions] = useState<RolePermissions>(getDefaultRolePermissions());
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSystemConfig(accessToken).then((cfg) => {
      if (cancelled) return;
      setPermissions(cfg.rolePermissions ?? getDefaultRolePermissions());
      setLoaded(true);
    }).catch(() => {
      if (cancelled) return;
      setPermissions(getDefaultRolePermissions());
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [accessToken]);

  function togglePermission(role: string, permission: SystemPermission) {
    setPermissions((prev) => {
      const current = prev[role] ?? [];
      return {
        ...prev,
        [role]: current.includes(permission)
          ? current.filter((p) => p !== permission)
          : [...current, permission],
      };
    });
  }

  async function save() {
    setIsSaving(true);
    setNotice(null);
    try {
      await updateSystemConfig(accessToken, { rolePermissions: permissions });
      setNotice({ type: 'success', message: '已保存' });
    } catch {
      setNotice({ type: 'error', message: '保存失败，请重试' });
    } finally {
      setIsSaving(false);
    }
  }

  if (!loaded) return null;

  return (
    <section>
      <h3 className={styles.sectionTitle}>权限矩阵</h3>

      <p className={styles.fieldHint} style={{ marginTop: -4, marginBottom: 8 }}>
        超级管理员拥有全部权限，无需配置。
      </p>

      {PERMISSION_GROUPS.map((group) => (
        <div key={group.label} className={styles.permGroup}>
          <h4 className={styles.permGroupTitle}>{group.label}</h4>
          {group.permissions.map((perm) => (
            <div key={perm} className={styles.permRow}>
              <span className={styles.permLabel} title={perm}>
                {PERMISSION_LABELS[perm]}
              </span>
              <div className={styles.permChecks}>
                {ROLES.map((role) => {
                  const checked = (permissions[role] ?? []).includes(perm);
                  return (
                    <label key={role} className={styles.permCheck}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePermission(role, perm)}
                        disabled={isSaving}
                      />
                      <span>{ROLE_LABELS[role]}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}

      <div className={styles.separator} />

      <div className={styles.inlineField}>
        <label />
        <button className={styles.button} type="button" disabled={isSaving} onClick={save}>
          {isSaving ? '保存中…' : '保存'}
        </button>
        {notice ? (
          <span className={notice.type === 'success' ? styles.fieldHint : styles.noticeError} style={notice.type === 'error' ? { marginTop: 0 } : undefined}>
            {notice.message}
          </span>
        ) : null}
      </div>
    </section>
  );
}
