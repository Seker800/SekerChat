import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { WorkStatusDef } from '@sekerchat/shared';
import { DEFAULT_WORK_STATUS_DEFS, normalizeWorkStatusDef } from '@sekerchat/shared';
import { useResolvedAccessToken } from '../../auth/AuthContext';
import { fetchSystemConfig, updateSystemConfig } from '../../lib/system-config-api';
import styles from './AdminPage.module.css';

interface WorkStatusSectionProps {
  accessToken?: string;
}

interface EditableDef extends WorkStatusDef {
  _key: string;
}

let _nextId = 0;
function nextKey(): string {
  return `_${++_nextId}`;
}

function toEditable(defs: WorkStatusDef[]): EditableDef[] {
  return defs.map((d) => ({ ...normalizeWorkStatusDef(d), _key: nextKey() }));
}

function Badge({ def }: { def: EditableDef }) {
  const name = def.name || '预览';
  return (
    <span
      className={styles.previewBadge}
      style={{ backgroundColor: def.tone, color: def.textTone }}
    >
      {name}
    </span>
  );
}

export function WorkStatusSection({ accessToken: providedAccessToken }: WorkStatusSectionProps = {}) {
  const accessToken = useResolvedAccessToken(providedAccessToken);
  const queryClient = useQueryClient();
  const [defs, setDefs] = useState<EditableDef[]>(() => toEditable(DEFAULT_WORK_STATUS_DEFS));
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    fetchSystemConfig(accessToken).then((cfg) => {
      if (cancelled) return;
      if (cfg.workStatusDefs?.length) {
        setDefs(toEditable(cfg.workStatusDefs));
      }
    }).catch(() => {
      if (cancelled) return;
    });
    return () => { cancelled = true; };
  }, [accessToken]);

  function edit(key: string, patch: Partial<EditableDef>) {
    setDefs((prev) => prev.map((d) => (d._key === key ? { ...d, ...patch } : d)));
    setErrors({});
  }

  function add() {
    setDefs((prev) => [...prev, { name: '', tone: '#5865f2', textTone: '#ffffff', _key: nextKey() }]);
    setErrors({});
  }

  function moveUp(key: string) {
    setDefs((prev) => {
      const idx = prev.findIndex((d) => d._key === key);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
    setErrors({});
  }

  function moveDown(key: string) {
    setDefs((prev) => {
      const idx = prev.findIndex((d) => d._key === key);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
    setErrors({});
  }

  function remove(key: string) {
    setDefs((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((d) => d._key !== key);
    });
    setErrors({});
  }

  function validate() {
    const newErrors: Record<string, string> = {};
    const seen = new Set<string>();
    for (const d of defs) {
      if (!d.name.trim()) {
        newErrors[d._key] = '名称不能为空';
      } else if (seen.has(d.name.trim())) {
        newErrors[d._key] = '重复';
      }
      seen.add(d.name.trim());
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setIsSaving(true);
    setNotice(null);
    try {
      const payload: WorkStatusDef[] = defs.map(({ _key, ...rest }) => ({
        name: rest.name.trim(),
        tone: rest.tone,
        textTone: rest.textTone,
        isPackaging: Boolean(rest.isPackaging),
        isArchive: rest.isArchive,
      }));
      await updateSystemConfig(accessToken, { workStatusDefs: payload });
      queryClient.invalidateQueries({ queryKey: ['system-config'] });
      setDefs(toEditable(payload));
      setNotice({ type: 'success', message: '工作状态已保存' });
    } catch {
      setNotice({ type: 'error', message: '保存失败，请重试' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section>
      <h3 className={styles.sectionTitle}>工作状态</h3>

      <div className={styles.statusList}>
        {defs.map((d, idx) => (
          <div key={d._key} className={styles.statusRow} data-testid="work-status-row">
            <div className={styles.reorderButtons}>
              <button
                className={styles.reorderBtn}
                type="button"
                disabled={idx === 0}
                onClick={() => moveUp(d._key)}
                title="上移"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M5 2L2 6h6L5 2z"/></svg>
              </button>
              <button
                className={styles.reorderBtn}
                type="button"
                disabled={idx === defs.length - 1}
                onClick={() => moveDown(d._key)}
                title="下移"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M5 8L2 4h6l-3 4z"/></svg>
              </button>
            </div>
            <Badge def={d} />
            <input
              className={styles.nameInput}
              style={errors[d._key] ? { boxShadow: '0 0 0 2px var(--danger)' } : undefined}
              value={d.name}
              placeholder="名称"
              onChange={(e) => edit(d._key, { name: e.target.value })}
            />
            <span className={styles.colorLabel}>BG</span>
            <input
              className={styles.colorInput}
              type="color"
              value={d.tone}
              onChange={(e) => edit(d._key, { tone: e.target.value })}
            />
            <span className={styles.colorLabel}>T</span>
            <input
              className={styles.colorInput}
              type="color"
              value={d.textTone}
              onChange={(e) => edit(d._key, { textTone: e.target.value })}
            />
            <label className={styles.capabilityToggle} title="在此状态下允许将消息附件添加到产出">
              <input
                type="checkbox"
                aria-label="打包能力"
                checked={Boolean(d.isPackaging)}
                onChange={(event) => edit(d._key, {
                  isPackaging: event.target.checked,
                  ...(event.target.checked ? { isArchive: false } : {}),
                })}
              />
              <span>打包</span>
            </label>
            <label className={styles.capabilityToggle} title="进入此状态时自动归档频道">
              <input
                type="checkbox"
                aria-label="归档能力"
                checked={!!d.isArchive}
                onChange={(event) => edit(d._key, {
                  isArchive: event.target.checked,
                  ...(event.target.checked ? { isPackaging: false } : {}),
                })}
              />
              <span>归档</span>
            </label>
            <div className={styles.rowActions}>
              <button
                className={styles.buttonDanger}
                type="button"
                disabled={defs.length <= 1}
                onClick={() => remove(d._key)}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.buttonRow}>
        <button className={styles.buttonSecondary} type="button" onClick={add}>
          新增状态
        </button>
        <button className={styles.button} type="button" disabled={isSaving} onClick={save}>
          {isSaving ? '保存中...' : '保存'}
        </button>
      </div>

      {notice ? (
        <div className={notice.type === 'success' ? styles.noticeSuccess : styles.noticeError}>
          {notice.message}
        </div>
      ) : null}
    </section>
  );
}
