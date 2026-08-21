import { useEffect, useState } from 'react';
import { useResolvedAccessToken } from '../../auth/AuthContext';
import { apiBaseUrl, downloadFile } from '../../lib/api-core';
import {
  deleteAdminArtifact,
  listAdminArtifacts,
  type AdminArtifactResponse,
} from '../../lib/messages-files-api';
import { getWorkStatusTextTone, getWorkStatusTone, normalizeGroupWorkStatus } from '../../lib/work-status';
import {
  useArtifactFilters,
  useArtifactSelection,
  useArtifactSort,
  useArtifactTree,
  type ArtifactFilters,
  type ArtifactSortKey,
} from './use-artifact-admin';
import styles from './AdminPage.module.css';

interface ArtifactsAdminSectionProps {
  accessToken?: string;
  canDeleteArtifacts: boolean;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN');
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size < 1024 * 1024 * 1024 * 1024) return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${(size / (1024 * 1024 * 1024 * 1024)).toFixed(1)} TB`;
}

function getUploaderNickname(artifact: Pick<AdminArtifactResponse, 'uploaderDisplayName'>): string {
  return artifact.uploaderDisplayName?.trim() || '未设置';
}

function WorkStatusBadge({ value, compact = false }: { value: string | null; compact?: boolean }) {
  const workStatus = normalizeGroupWorkStatus(value);
  if (!workStatus) {
    return <span className={styles.mutedInline}>未设置</span>;
  }
  return (
    <span
      className={compact ? styles.folderStatusBadge : styles.groupStatusBadge}
      style={{ backgroundColor: getWorkStatusTone(workStatus), color: getWorkStatusTextTone(workStatus) }}
    >
      {workStatus}
    </span>
  );
}

function GroupDisplayMeta({ groupName, groupWorkStatus }: { groupName: string; groupWorkStatus: string | null }) {
  return (
    <div className={styles.groupFolderLabel}>
      <div className={styles.groupFolderName}>{groupName}</div>
      <div className={styles.groupFolderMeta}>
        <WorkStatusBadge value={groupWorkStatus} compact />
      </div>
    </div>
  );
}

export function ArtifactsAdminSection({ accessToken: providedAccessToken, canDeleteArtifacts }: ArtifactsAdminSectionProps) {
  const accessToken = useResolvedAccessToken(providedAccessToken);
  const [items, setItems] = useState<AdminArtifactResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const { filters, setFilters } = useArtifactFilters();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      setNotice(null);
      try {
        const data = await listAdminArtifacts(accessToken, {
          query: filters.query || undefined,
          groupWorkStatus: filters.groupWorkStatus || undefined,
          packedState: filters.packedState || undefined,
        });
        if (cancelled) return;
        setItems(data);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : '加载产出文件失败');
        setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [accessToken, filters]);

  const { tree, expandedServers, setExpandedServers, groupNodes } = useArtifactTree(items);
  const {
    selectedGroupId,
    setSelectedGroupId,
    selectedArtifactId,
    setSelectedArtifactId,
    currentGroup,
    currentServerName,
  } = useArtifactSelection(groupNodes, tree);
  const { sortedArtifacts, toggleSort, sortArrow } = useArtifactSort(currentGroup);

  const selectedArtifact =
    currentGroup?.items.find((item) => item.id === selectedArtifactId) ?? sortedArtifacts[0] ?? null;
  const totalSize = items.reduce((sum, item) => sum + item.size, 0);

  async function handleDownload(artifact: AdminArtifactResponse) {
    try {
      await downloadFile(`${apiBaseUrl}/admin/artifacts/${artifact.id}/content`, artifact.originalName, accessToken);
    } catch {
      setNotice({ type: 'error', message: '下载失败，请稍后重试' });
    }
  }

  async function handleDelete(artifact: AdminArtifactResponse) {
    const confirmed = window.confirm(`确认删除产出「${artifact.originalName}」吗？`);
    if (!confirmed) return;
    try {
      await deleteAdminArtifact(accessToken, artifact.id);
      setItems((current) => current.filter((item) => item.id !== artifact.id));
      setNotice({ type: 'success', message: `已删除 ${artifact.originalName}` });
    } catch (deleteError) {
      setNotice({ type: 'error', message: deleteError instanceof Error ? deleteError.message : '删除失败' });
    }
  }

  return (
    <section>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>产出文件</h3>
        {!loading && !error ? (
          <span className={styles.sectionSummary}>总大小 {formatBytes(totalSize)}</span>
        ) : null}
      </div>

      <div className={styles.artifactQueryBar}>
        <input
          className={styles.textInput}
          type="text"
          value={filters.query}
          placeholder="搜频道名、文件名或上传人"
          onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
        />
        <select
          className={styles.select}
          value={filters.groupWorkStatus}
          onChange={(event) => setFilters((current) => ({ ...current, groupWorkStatus: event.target.value }))}
        >
          <option value="">全部工作状态</option>
          <option value="初始">初始</option>
          <option value="优先">优先</option>
          <option value="打包">打包</option>
          <option value="ing">ing</option>
          <option value="阻塞">阻塞</option>
          <option value="暂停">暂停</option>
          <option value="完成">完成</option>
          <option value="取消">取消</option>
        </select>
        <select
          className={styles.select}
          value={filters.packedState}
          onChange={(event) =>
            setFilters((current) => ({ ...current, packedState: event.target.value as ArtifactFilters['packedState'] }))
          }
        >
          <option value="">全部打包状态</option>
          <option value="packed">仅已打包</option>
          <option value="unpacked">仅未打包</option>
        </select>
      </div>

      {notice ? (
        <div className={notice.type === 'success' ? styles.noticeSuccess : styles.noticeError}>
          {notice.message}
        </div>
      ) : null}
      {error ? <div className={styles.noticeError}>{error}</div> : null}

      <div className={styles.artifactsBrowserLayout}>
        <aside className={styles.artifactsTree}>
          <div className={styles.rootFolderLabel}>产出文件</div>
          {loading ? (
            <p className={styles.subtle}>正在加载文件夹...</p>
          ) : tree.length === 0 ? (
            <p className={styles.empty}>没有匹配的产出文件</p>
          ) : (
            tree.map((server) => (
              <div key={server.serverName} className={styles.serverFolder}>
                <button
                  type="button"
                  className={styles.serverFolderToggle}
                  onClick={() =>
                    setExpandedServers((current) => ({
                      ...current,
                      [server.serverName]: !current[server.serverName],
                    }))
                  }
                >
                  <span>{expandedServers[server.serverName] ? '▾' : '▸'} {server.serverName}</span>
                  <span className={styles.groupFolderCount}>{server.groups.length}</span>
                </button>
                {expandedServers[server.serverName] ? (
                  <div className={styles.groupFolderList}>
                    {server.groups.map((group) => (
                      <button
                        key={group.groupId}
                        type="button"
                        className={`${styles.groupFolderButton} ${group.groupId === selectedGroupId ? styles.groupFolderButtonActive : ''}`}
                        onClick={() => {
                          setSelectedGroupId(group.groupId);
                          setSelectedArtifactId(group.items[0]?.id ?? '');
                        }}
                      >
                        <GroupDisplayMeta groupName={group.groupName} groupWorkStatus={group.groupWorkStatus} />
                        <span className={styles.groupFolderCount}>{group.items.length}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </aside>

        <div className={styles.artifactsTableWrap}>
          {currentGroup ? (
            <div className={styles.artifactPanel}>
              <div className={styles.folderPathBar}>
                <div className={styles.folderPath}>
                  <span>产出文件</span>
                  {currentServerName ? <span>{currentServerName}</span> : null}
                  <span>{currentGroup.groupName}</span>
                </div>
                <div className={styles.groupStatsRow}>{currentGroup.items.length} 个项目</div>
              </div>
              <table className={styles.artifactTable}>
                <thead>
                  <tr>
                    <ThSort label="名称" sortKey="name" toggleSort={toggleSort} sortArrow={sortArrow} />
                    <ThSort label="上传人" sortKey="uploader" toggleSort={toggleSort} sortArrow={sortArrow} />
                    <ThSort label="大小" sortKey="size" toggleSort={toggleSort} sortArrow={sortArrow} />
                    <ThSort label="修改日期" sortKey="createdAt" toggleSort={toggleSort} sortArrow={sortArrow} />
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedArtifacts.map((artifact) => (
                    <tr
                      key={artifact.id}
                      className={artifact.id === selectedArtifact?.id ? styles.tableRowActive : ''}
                      onClick={() => setSelectedArtifactId(artifact.id)}
                    >
                      <td>
                        <button
                          className={styles.fileNameButton}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedArtifactId(artifact.id);
                          }}
                        >
                          <span>{artifact.originalName}</span>
                        </button>
                      </td>
                      <td>
                        <span className={styles.artifactUploaderName}>{getUploaderNickname(artifact)}</span>
                      </td>
                      <td className={styles.mono}>{formatBytes(artifact.size)}</td>
                      <td className={styles.mono}>{formatDate(artifact.createdAt)}</td>
                      <td>
                        <div className={styles.fileRowActions}>
                          <button
                            className={styles.iconAction}
                            type="button"
                            title="下载"
                            aria-label={`下载 ${artifact.originalName}`}
                            onClick={(event) => { event.stopPropagation(); void handleDownload(artifact); }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" />
                            </svg>
                          </button>
                          <button
                            className={styles.iconActionDanger}
                            type="button"
                            disabled={!canDeleteArtifacts}
                            title={canDeleteArtifacts ? undefined : '当前角色没有删除产出文件权限'}
                            aria-label={`删除 ${artifact.originalName}`}
                            onClick={(event) => { event.stopPropagation(); void handleDelete(artifact); }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.empty}>先从左侧选择一个频道文件夹</p>
          )}
        </div>
      </div>
    </section>
  );
}

function ThSort({
  label,
  sortKey,
  toggleSort,
  sortArrow,
}: {
  label: string;
  sortKey: ArtifactSortKey;
  toggleSort: (key: ArtifactSortKey) => void;
  sortArrow: (key: ArtifactSortKey) => string;
}) {
  return (
    <th>
      <button className={styles.artifactSortHeaderButton} type="button" onClick={() => toggleSort(sortKey)}>
        {label} {sortArrow(sortKey)}
      </button>
    </th>
  );
}
