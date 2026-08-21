import { useEffect, useMemo, useState } from 'react';
import { useResolvedAccessToken } from '../../auth/AuthContext';
import {
  fetchAttendanceUsersAverages,
  type UserAttendanceAveragesItem,
} from '../../lib/attendance-api';
import styles from './AdminPage.module.css';

interface Props {
  accessToken?: string;
}

type SortKey = 'name' | 'role' | 'todayMinutes' | 'monthAverageMinutes' | 'totalAverageMinutes';
type SortDirection = 'asc' | 'desc';
type DataKey = 'todayMinutes' | 'monthAverageMinutes' | 'totalAverageMinutes';

const AVERAGE_COLUMNS: Array<{ key: DataKey; label: string }> = [
  { key: 'todayMinutes', label: '今日时长' },
  { key: 'monthAverageMinutes', label: '月平均' },
  { key: 'totalAverageMinutes', label: '总平均' },
];

function formatMinutes(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours}小时${String(minutes).padStart(2, '0')}分`;
}

function toggleDirection(current: SortDirection): SortDirection {
  return current === 'asc' ? 'desc' : 'asc';
}

export function AttendanceSection({ accessToken: providedAccessToken }: Props = {}) {
  const accessToken = useResolvedAccessToken(providedAccessToken);
  const [averagesItems, setAveragesItems] = useState<UserAttendanceAveragesItem[]>([]);
  const [averagesError, setAveragesError] = useState('');
  const [reloading, setReloading] = useState(false);

  const [checkInSortKey, setCheckInSortKey] = useState<SortKey>('name');
  const [checkInSortDir, setCheckInSortDir] = useState<SortDirection>('asc');
  const [onlineSortKey, setOnlineSortKey] = useState<SortKey>('name');
  const [onlineSortDir, setOnlineSortDir] = useState<SortDirection>('asc');

  const sortedCheckIn = useMemo(
    () => sortItems(averagesItems, 'checkIn', checkInSortKey, checkInSortDir),
    [averagesItems, checkInSortKey, checkInSortDir],
  );
  const sortedOnline = useMemo(
    () => sortItems(averagesItems, 'online', onlineSortKey, onlineSortDir),
    [averagesItems, onlineSortKey, onlineSortDir],
  );

  async function loadAverages() {
    setAveragesError('');
    setReloading(true);
    try {
      const response = await fetchAttendanceUsersAverages(accessToken);
      setAveragesItems(response.items);
    } catch (error) {
      setAveragesItems([]);
      setAveragesError(error instanceof Error ? error.message : '加载出勤数据失败');
    } finally {
      setReloading(false);
    }
  }

  useEffect(() => {
    void loadAverages();
  }, [accessToken]);

  function renderSortHeader(
    label: string,
    sortKey: SortKey,
    activeKey: SortKey,
    direction: SortDirection,
    onToggle: (_: SortKey) => void,
  ) {
    const arrow = sortKey === activeKey ? (direction === 'asc' ? ' ↑' : ' ↓') : '';
    return (
      <th>
        <button className={styles.sortHeaderButton} type="button" onClick={() => onToggle(sortKey)}>
          {label}{arrow}
        </button>
      </th>
    );
  }

  function renderTable(
    title: string,
    dataKey: 'checkIn' | 'online',
    sorted: UserAttendanceAveragesItem[],
    sortKey: SortKey,
    sortDir: SortDirection,
    onSort: (_: SortKey) => void,
  ) {
    return (
      <>
        <h4 className={styles.subsectionTitle}>{title}</h4>
        <table className={styles.table} data-testid={`attendance-${dataKey}-table`}>
          <thead>
            <tr>
              {renderSortHeader('成员', 'name', sortKey, sortDir, onSort)}
              {renderSortHeader('角色', 'role', sortKey, sortDir, onSort)}
              {AVERAGE_COLUMNS.map((col) =>
                renderSortHeader(col.label, col.key, sortKey, sortDir, onSort),
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ user, [dataKey]: data }) => (
              <tr key={user.id}>
                <td>
                  <div className={styles.userIdentity}>
                    <div className={styles.userNameRow}>
                      <span className={styles.userName}>{user.displayName || user.email}</span>
                    </div>
                    <span className={styles.userEmail}>{user.email}</span>
                  </div>
                </td>
                <td>{user.role}</td>
                {AVERAGE_COLUMNS.map((col) => (
                  <td key={col.key} className={styles.mono}>
                    {formatMinutes(data[col.key])}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr><td colSpan={5} className={styles.empty}>暂无数据</td></tr>
            ) : null}
          </tbody>
        </table>
      </>
    );
  }

  return (
    <section>
      <div className={styles.activityHeader}>
        <div>
          <h3 className={styles.activityTitle}>出勤</h3>
          <p className={styles.activityCopy}>查看所有成员签到与在线时长统计。在线时长以"在线且未开启消息免打扰"为准。</p>
        </div>
      </div>

      {averagesError ? <p className={styles.errorText}>{averagesError}</p> : null}
      {reloading ? <p className={styles.subtle}>正在刷新出勤数据...</p> : null}

      {renderTable('签到', 'checkIn', sortedCheckIn, checkInSortKey, checkInSortDir, (key) => {
        if (key === checkInSortKey) {
          setCheckInSortDir(toggleDirection(checkInSortDir));
        } else {
          setCheckInSortKey(key);
          setCheckInSortDir(key === 'name' || key === 'role' ? 'asc' : 'desc');
        }
      })}
      {renderTable('在线', 'online', sortedOnline, onlineSortKey, onlineSortDir, (key) => {
        if (key === onlineSortKey) {
          setOnlineSortDir(toggleDirection(onlineSortDir));
        } else {
          setOnlineSortKey(key);
          setOnlineSortDir(key === 'name' || key === 'role' ? 'asc' : 'desc');
        }
      })}
    </section>
  );
}

function sortItems(
  items: UserAttendanceAveragesItem[],
  dataKey: 'checkIn' | 'online',
  sortKey: SortKey,
  direction: SortDirection,
): UserAttendanceAveragesItem[] {
  return [...items].sort((a, b) => {
    let comparison: number;
    if (sortKey === 'name') {
      const nameA = a.user.displayName || a.user.email;
      const nameB = b.user.displayName || b.user.email;
      comparison = nameA.localeCompare(nameB, 'zh-CN');
    } else if (sortKey === 'role') {
      comparison = a.user.role.localeCompare(b.user.role);
    } else {
      comparison = a[dataKey][sortKey] - b[dataKey][sortKey];
    }
    return direction === 'asc' ? comparison : -comparison;
  });
}
