import { useEffect, useState } from 'react';
import { bridgeApi, type BridgeBinding, type BridgeOverview } from '../../../lib/qq-bridge-api';
import styles from './QqBridgeSection.module.css';

const taskLabels: Record<string, string> = {
  sent: '已发送',
  pending: '等待发送',
  claimed: '准备发送',
  started: '正在发送',
  uncertain: '发送结果待确认',
  failed: '发送失败',
  cancelled: '已放弃',
};

export function QqBridgeSection() {
  const [data, setData] = useState<BridgeOverview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('QQ 连接器');
  const [token, setToken] = useState('');
  const [connectorId, setConnectorId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [qqGroupId, setQqGroupId] = useState('');
  const [edit, setEdit] = useState<BridgeBinding | null>(null);
  const [backlog, setBacklog] = useState('keep-paused');

  async function load() {
    try {
      setData(await bridgeApi<BridgeOverview>());
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '加载扩展失败');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function mutate(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  if (!data)
    return (
      <section className={styles.section}>
        <h2>扩展 · QQ 群同步</h2>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button onClick={() => void load()}>重试</button>
          </>
        ) : (
          <p>正在加载扩展…</p>
        )}
      </section>
    );
  const selectedConnector = data.connectors.find((c) => c.id === connectorId);
  const tasks = data.deliveries.filter((t) => !['cancelled'].includes(t.status));
  return (
    <section className={styles.section}>
      <h2>扩展 · QQ 群同步</h2>
      <p>把指定 QQ 群同步到指定 Chat 群。消息由 NapCat 接入，AI 机器人与同步独立运行。</p>
      <p className={styles.hint}>
        新连接器与绑定默认关闭，只接收启用后的新消息。开启双向后，群里的普通成员消息将通过桥接 QQ
        账号发出。
      </p>
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={busy} onClick={() => void load()}>
        刷新状态
      </button>
      <h3>连接器</h3>
      {data.connectors.length === 0 && (
        <p>还没有连接器。先创建凭据，再在 NapCat 所在主机配置连接器程序。</p>
      )}
      {data.connectors.map((c) => {
        const fresh = c.lastSeenAt && Date.now() - new Date(c.lastSeenAt).getTime() < 45000;
        return (
          <article key={c.id} className={styles.card}>
            <strong>{c.name}</strong>
            <span>
              {c.revokedAt
                ? '凭据已撤销'
                : !c.enabled
                  ? '已停用'
                  : fresh && c.connected
                    ? '已连接 NapCat'
                    : '连接已断开'}
            </span>
            {c.lastSeenAt && <small>最近联系：{new Date(c.lastSeenAt).toLocaleString()}</small>}
            {!c.revokedAt && (
              <div className={styles.actions}>
                <button
                  disabled={busy}
                  onClick={() =>
                    void mutate(() =>
                      bridgeApi(`/connectors/${c.id}`, 'PATCH', { enabled: !c.enabled }),
                    )
                  }
                >
                  {c.enabled ? '停用连接器' : '启用连接器'}
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm('撤销后该凭据永久失效。已有消息保留，恢复需要创建新连接器。')
                    )
                      void mutate(() => bridgeApi(`/connectors/${c.id}/revoke`, 'POST'));
                  }}
                >
                  撤销凭据
                </button>
              </div>
            )}
          </article>
        );
      })}
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void mutate(async () => {
            const result = await bridgeApi<{ id: string; token: string }>('/connectors', 'POST', {
              name,
            });
            setToken(result.token);
            setConnectorId(result.id);
          });
        }}
      >
        <label>
          连接器名称
          <input value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} />
        </label>
        <button disabled={busy}>创建连接器凭据</button>
      </form>
      {token && (
        <div className={styles.secret} role="region" aria-label="新连接器凭据">
          <p>凭据只显示这一次。请保存到连接器的私有环境配置，关闭后无法再次查看。</p>
          <textarea aria-label="连接器凭据" readOnly value={token} />
          <div className={styles.actions}>
            <button
              onClick={() =>
                void navigator.clipboard
                  .writeText(token)
                  .catch(() => setError('自动复制失败，请手动复制凭据。'))
              }
            >
              复制凭据
            </button>
            <button onClick={() => setToken('')}>已保存，关闭</button>
          </div>
        </div>
      )}
      <h3>群绑定</h3>
      {data.bindings.map((b) => (
        <article key={b.id} className={styles.card}>
          <strong>
            {data.groups.find((g) => g.id === b.groupId)?.name ?? '不可用的 Chat 群'} ↔ QQ 群{' '}
            {b.qqGroupId}
          </strong>
          <span>
            {b.enabled ? '已启用' : '已暂停'} · {b.bidirectional ? '双向同步' : 'QQ → Chat'}
          </span>
          <button
            disabled={busy}
            onClick={() => {
              setEdit({ ...b });
              setBacklog('keep-paused');
            }}
          >
            设置绑定
          </button>
          {!b.enabled && (
            <button
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm('解除后保留已有消息，放弃未发送任务。之后可以重新绑定到其他群。')
                )
                  void mutate(() => bridgeApi(`/bindings/${b.id}/archive`, 'POST'));
              }}
            >
              解除绑定
            </button>
          )}
        </article>
      ))}
      {edit && (
        <form
          className={styles.card}
          onSubmit={(event) => {
            event.preventDefault();
            void mutate(async () => {
              await bridgeApi(`/bindings/${edit.id}`, 'PATCH', {
                enabled: edit.enabled,
                bidirectional: edit.bidirectional,
                backlog,
              });
              setEdit(null);
            });
          }}
        >
          <h4>绑定设置</h4>
          <label>
            <input
              type="checkbox"
              checked={edit.enabled}
              onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })}
            />
            启用同步
          </label>
          <label>
            <input
              type="checkbox"
              checked={edit.bidirectional}
              onChange={(e) => setEdit({ ...edit, bidirectional: e.target.checked })}
            />
            允许 Chat 普通成员消息发回 QQ
          </label>
          <label>
            暂停前的积压任务
            <select value={backlog} onChange={(e) => setBacklog(e.target.value)}>
              <option value="keep-paused">保留暂停，不补发</option>
              <option value="resume">继续发送旧任务</option>
              <option value="discard">放弃未发送的旧任务</option>
            </select>
          </label>
          <p>已同步消息会保留。暂停会停止新任务，已经发出的请求可能仍会完成。</p>
          <div className={styles.actions}>
            <button disabled={busy}>保存绑定</button>
            <button type="button" onClick={() => setEdit(null)}>
              取消
            </button>
          </div>
        </form>
      )}
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void mutate(() =>
            bridgeApi('/bindings', 'POST', { connectorId, groupId, accountId, qqGroupId }),
          );
        }}
      >
        <label>
          连接器
          <select required value={connectorId} onChange={(e) => setConnectorId(e.target.value)}>
            <option value="">请选择</option>
            {data.connectors
              .filter((c) => !c.revokedAt)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          登录 QQ 号
          <input
            required
            inputMode="numeric"
            pattern="[0-9]{1,20}"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          />
        </label>
        <label>
          QQ 群号
          <input
            required
            inputMode="numeric"
            pattern="[0-9]{1,20}"
            list="qq-bridge-groups"
            value={qqGroupId}
            onChange={(e) => setQqGroupId(e.target.value)}
          />
          <datalist id="qq-bridge-groups">
            {selectedConnector?.catalog.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </datalist>
        </label>
        <label>
          Chat 目标群
          <select required value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">请选择</option>
            {data.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.category} / {g.name}
              </option>
            ))}
          </select>
        </label>
        <p>目标 Chat 群中有阅读权限的人都能看到同步内容。新绑定创建后为关闭状态。</p>
        <button disabled={busy}>创建绑定</button>
      </form>
      <h3>待处理任务</h3>
      {!tasks.length && <p>没有等待或异常任务。</p>}
      {tasks.map((t) => (
        <article key={t.id} className={styles.card}>
          <strong>{taskLabels[t.status] ?? t.status}</strong>
          <small>
            {t.action === 'revoke' ? '撤回' : '发消息'} · {new Date(t.createdAt).toLocaleString()}
          </small>
          {t.errorCode === 'edited-after-dispatch' && (
            <p>Chat 消息已编辑，QQ 原消息不会同步修改。</p>
          )}
          {['uncertain', 'failed'].includes(t.status) && (
            <div className={styles.actions}>
              <button
                disabled={busy}
                onClick={() => {
                  const messageId = window.prompt(
                    '先在 QQ 核对消息确实已发送，再填写 QQ 消息标识：',
                  );
                  if (messageId)
                    void mutate(() =>
                      bridgeApi(`/deliveries/${t.id}/resolve`, 'POST', {
                        status: 'sent',
                        messageId,
                      }),
                    );
                }}
              >
                核对后标为已发送
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  if (window.confirm('放弃此任务，不再补发。若 QQ 已发送，原消息会保留。'))
                    void mutate(() =>
                      bridgeApi(`/deliveries/${t.id}/resolve`, 'POST', { status: 'cancelled' }),
                    );
                }}
              >
                放弃任务
              </button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
