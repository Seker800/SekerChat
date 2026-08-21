import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { IconPaperclip, IconPinFilled } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { downloadFile } from '../../lib/api-core';
import { uploadFileViaMultipart } from '../../lib/multipart-upload';
import {
  createSubscriptionDraft,
  confirmSubscriptionPost,
  deleteSubscriptionPost,
  getSubscriptionConfirmations,
  getSubscriptionAttachmentViewUrl,
  getSubscriptionPost,
  listManageableSubscriptionPosts,
  listSubscriptionPosts,
  publishSubscriptionPost,
  setSubscriptionPostPinned,
  subscriptionAttachmentContentUrl,
  updateSubscriptionPost,
  withdrawSubscriptionPost,
  type SubscriptionAttachment,
  type SubscriptionPost,
  type SubscriptionPostInput,
  type SubscriptionPostSummary,
} from '../../lib/subscriptions-api';
import { SubscriptionMarkdown } from './SubscriptionMarkdown';
import { FileAttachmentCard } from './FileAttachmentCard';
import { parseSubscriptionTags } from './subscription-editor-utils';
import { SubscriptionDraftController } from './article-editor/SubscriptionDraftController';
import styles from './DmSubscriptionPage.module.css';

const SubscriptionArticleEditor = lazy(() => import('./article-editor/SubscriptionArticleEditor'));

const DEFAULT_ATTACHMENT_MAX_MB = 5 * 1024;
const ARTICLE_TAGS_ENABLED = false;
let editorSessionSequence = 0;

function formatBytes(value: number): string {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function formatDate(value: string | null): string {
  if (!value) return '尚未发布';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatStatus(status: SubscriptionPost['status']): string {
  if (status === 'PUBLISHED') return '已发布';
  if (status === 'WITHDRAWN') return '已撤回';
  return '草稿';
}

function attachmentKey(attachment: SubscriptionAttachment): string {
  return attachment.id;
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

interface EditorState {
  sessionKey: string;
  post: SubscriptionPost | null;
  input: SubscriptionPostInput;
  draftId: string;
  files: File[];
  attachments: SubscriptionAttachment[];
  uploadedFileKeys: Set<string>;
  progress: Record<string, number>;
  tagDraft: string;
  isBusy: boolean;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  error: string;
}

function createEditorState(post?: SubscriptionPost | null): EditorState {
  return {
    sessionKey: `${post?.id ?? 'new'}-${(editorSessionSequence += 1)}`,
    post: post ?? null,
    input: post
      ? { title: post.title, body: post.body, tags: [...post.tags] }
      : { title: '', body: '', tags: [] },
    draftId: post?.id ?? '',
    files: [],
    attachments: [...(post?.attachments ?? [])],
    uploadedFileKeys: new Set(),
    progress: {},
    tagDraft: '',
    isBusy: false,
    saveStatus: 'idle',
    error: '',
  };
}

function uniqueAttachments(attachments: SubscriptionAttachment[]): SubscriptionAttachment[] {
  return [...new Map(attachments.map((attachment) => [attachment.id, attachment])).values()];
}

function isDownloadableAttachment(attachment: SubscriptionAttachment): boolean {
  return attachment.usage === 'DOWNLOADABLE_FILE';
}

interface DmSubscriptionPageProps {
  accessToken: string;
  canManage: boolean;
  attachmentMaxMB?: number;
}

export function DmSubscriptionPage({
  accessToken,
  canManage,
  attachmentMaxMB = DEFAULT_ATTACHMENT_MAX_MB,
}: DmSubscriptionPageProps) {
  const queryClient = useQueryClient();
  const progressDialogRef = useRef<HTMLElement>(null);
  const progressTriggerRef = useRef<HTMLButtonElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<EditorState | null>(null);
  const draftControllerRef = useRef<SubscriptionDraftController | null>(null);
  const lastSavedSnapshotRef = useRef('');
  const imageUploadReservationsRef = useRef(0);
  const [selectedPostId, setSelectedPostId] = useState('');
  const [progressPostId, setProgressPostId] = useState('');
  const [confirmationAnnouncement, setConfirmationAnnouncement] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [showManage, setShowManage] = useState(false);
  const [isDownloadAttachmentDragActive, setIsDownloadAttachmentDragActive] = useState(false);

  const postsQuery = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => listSubscriptionPosts(accessToken),
    staleTime: 15_000,
  });
  const detailQuery = useQuery({
    queryKey: ['subscriptions', 'detail', selectedPostId],
    queryFn: () => getSubscriptionPost(accessToken, selectedPostId),
    enabled: Boolean(selectedPostId),
    staleTime: 5_000,
  });
  const manageQuery = useQuery({
    queryKey: ['subscriptions', 'manage'],
    queryFn: () => listManageableSubscriptionPosts(accessToken),
    enabled: canManage && showManage,
    staleTime: 5_000,
  });
  const confirmationsQuery = useQuery({
    queryKey: ['subscriptions', 'confirmations', progressPostId],
    queryFn: () => getSubscriptionConfirmations(accessToken, progressPostId),
    enabled: canManage && Boolean(progressPostId),
    staleTime: 5_000,
  });

  useEffect(() => {
    if (!progressPostId) return;
    progressDialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [progressPostId]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] }),
      queryClient.invalidateQueries({ queryKey: ['subscription-summary'] }),
    ]);
  };

  const orderedPosts = useMemo(() => {
    const posts = [...(postsQuery.data?.items ?? [])];
    return posts.sort((left, right) => {
      const confirmationOrder =
        Number(left.isConfirmed || !left.isRecipient) -
        Number(right.isConfirmed || !right.isRecipient);
      if (confirmationOrder !== 0) return confirmationOrder;
      const pinnedOrder = Number(right.isPinned) - Number(left.isPinned);
      if (pinnedOrder !== 0) return pinnedOrder;
      const leftTime = new Date(left.publishedAt ?? left.updatedAt).getTime();
      const rightTime = new Date(right.publishedAt ?? right.updatedAt).getTime();
      return rightTime - leftTime;
    });
  }, [postsQuery.data?.items]);

  const manageItems = manageQuery.data?.items ?? [];
  const selectedPost = detailQuery.data ?? null;
  const attachmentMaxBytes = attachmentMaxMB * 1024 * 1024;
  editorRef.current = editor;

  const confirmationMutation = useMutation({
    mutationFn: (postId: string) => confirmSubscriptionPost(accessToken, postId),
    onSuccess: (result, postId) => {
      queryClient.setQueryData<SubscriptionPost>(['subscriptions', 'detail', postId], (current) =>
        current
          ? {
              ...current,
              isConfirmed: true,
              confirmedAt: result.confirmedAt,
            }
          : current,
      );
      queryClient.setQueryData<{
        items: SubscriptionPostSummary[];
        pendingConfirmationCount: number;
      }>(['subscriptions'], (current) =>
        current
          ? {
              ...current,
              pendingConfirmationCount: result.pendingConfirmationCount,
              items: current.items.map((item) =>
                item.id === postId
                  ? {
                      ...item,
                      isConfirmed: true,
                      confirmedAt: result.confirmedAt,
                    }
                  : item,
              ),
            }
          : current,
      );
      queryClient.setQueryData(['subscription-summary'], {
        pendingConfirmationCount: result.pendingConfirmationCount,
      });
      setConfirmationAnnouncement('文章已确认已读。');
    },
  });
  const postActionMutation = useMutation({
    mutationFn: async (action: { kind: 'pin' | 'withdraw' | 'delete'; post: SubscriptionPost }) => {
      if (action.kind === 'pin') {
        return setSubscriptionPostPinned(accessToken, action.post.id, !action.post.isPinned);
      }
      if (action.kind === 'withdraw') {
        return withdrawSubscriptionPost(accessToken, action.post.id);
      }
      return deleteSubscriptionPost(accessToken, action.post.id);
    },
    onSuccess: async (_result, action) => {
      if (action.kind !== 'pin') setSelectedPostId('');
      await refresh();
    },
  });

  const requestDelete = (post: SubscriptionPost) => {
    if (!window.confirm(`确定永久删除“${post.title}”吗？此操作无法撤销。`)) return;
    postActionMutation.mutate({ kind: 'delete', post });
  };

  const closeConfirmationProgress = () => {
    setProgressPostId('');
    queueMicrotask(() => progressTriggerRef.current?.focus());
  };

  const snapshotKey = (input: SubscriptionPostInput) => JSON.stringify(input);

  const openEditor = (post?: SubscriptionPost | null) => {
    const initialState = createEditorState(post);
    const controller = new SubscriptionDraftController({
      draftId: initialState.draftId,
      create: (input) => createSubscriptionDraft(accessToken, input),
      update: (draftId, input) => updateSubscriptionPost(accessToken, draftId, input),
      onSaved: (savedPost) => {
        if (draftControllerRef.current !== controller) return;
        setEditor((current) =>
          current
            ? {
                ...current,
                post: savedPost,
                draftId: savedPost.id,
                attachments: uniqueAttachments([...current.attachments, ...savedPost.attachments]),
              }
            : current,
        );
      },
    });
    draftControllerRef.current = controller;
    lastSavedSnapshotRef.current = snapshotKey(initialState.input);
    imageUploadReservationsRef.current = 0;
    setIsDownloadAttachmentDragActive(false);
    setEditor(initialState);
  };

  const queueDownloadAttachments = (incomingFiles: File[]) => {
    setEditor((current) => {
      if (!current || current.isBusy || incomingFiles.length === 0) return current;
      const availableSlots = Math.max(0, 5 - current.attachments.length);
      const queuedFiles = new Map(current.files.map((file) => [fileKey(file), file]));
      for (const file of incomingFiles) queuedFiles.set(fileKey(file), file);
      return {
        ...current,
        files: [...queuedFiles.values()].slice(0, availableSlots),
        error: '',
      };
    });
  };

  const persistEditorInput = async (input: SubscriptionPostInput): Promise<string> => {
    const controller = draftControllerRef.current;
    if (!controller) throw new Error('文章编辑会话已结束。');
    const key = snapshotKey(input);
    setEditor((current) => (current ? { ...current, saveStatus: 'saving' } : current));
    try {
      const draftId = await controller.ensureDraft(input);
      lastSavedSnapshotRef.current = key;
      setEditor((current) =>
        current
          ? {
              ...current,
              saveStatus: snapshotKey(current.input) === key ? 'saved' : 'idle',
            }
          : current,
      );
      return draftId;
    } catch (error) {
      setEditor((current) =>
        current
          ? {
              ...current,
              saveStatus: 'error',
              error: error instanceof Error ? error.message : '草稿保存失败。',
            }
          : current,
      );
      throw error;
    }
  };

  const closeEditor = async () => {
    const current = editorRef.current;
    if (!current || current.isBusy) return;
    if (snapshotKey(current.input) !== lastSavedSnapshotRef.current) {
      try {
        await persistEditorInput(current.input);
      } catch {
        return;
      }
    }
    draftControllerRef.current = null;
    setIsDownloadAttachmentDragActive(false);
    setEditor(null);
  };

  useEffect(() => {
    if (!editor) return undefined;
    const input = editor.input;
    if (snapshotKey(input) === lastSavedSnapshotRef.current) return undefined;
    const timeout = window.setTimeout(() => {
      void persistEditorInput(input).catch(() => undefined);
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [editor?.input]);

  const commitTagDraft = () => {
    setEditor((current) => {
      if (!current || !current.tagDraft.trim()) return current;
      return {
        ...current,
        input: {
          ...current.input,
          tags: parseSubscriptionTags(current.tagDraft, current.input.tags),
        },
        tagDraft: '',
      };
    });
  };

  const uploadEditorFile = async (
    targetId: string,
    file: File,
    usage: SubscriptionAttachment['usage'],
  ): Promise<SubscriptionAttachment> => {
    const key = fileKey(file);
    const result = await uploadFileViaMultipart(
      accessToken,
      'SUBSCRIPTION_ATTACHMENT',
      targetId,
      file,
      (progress) => {
        setEditor((latest) =>
          latest
            ? { ...latest, progress: { ...latest.progress, [key]: progress.percent } }
            : latest,
        );
      },
      undefined,
      { subscriptionUsage: usage },
    );
    if (result.finalized.kind !== 'SUBSCRIPTION_ATTACHMENT') {
      throw new Error('附件上传结果不正确。');
    }
    const attachment = result.finalized.attachment;
    setEditor((latest) => {
      if (!latest) return latest;
      const uploadedFileKeys = new Set(latest.uploadedFileKeys);
      uploadedFileKeys.add(key);
      return {
        ...latest,
        uploadedFileKeys,
        attachments: uniqueAttachments([...latest.attachments, attachment]),
      };
    });
    return attachment;
  };

  const uploadEditorImage = async (file: File): Promise<string> => {
    const current = editorRef.current;
    if (!current) throw new Error('文章编辑会话已结束。');
    if (!file.type.startsWith('image/')) {
      throw new Error('请选择图片文件。');
    }
    if (file.size > attachmentMaxBytes) {
      throw new Error(`“${file.name}”超过 ${formatBytes(attachmentMaxBytes)} 限制。`);
    }
    if (
      current.attachments.length + current.files.length + imageUploadReservationsRef.current >=
      5
    ) {
      throw new Error('每篇内容最多 5 个附件。');
    }
    imageUploadReservationsRef.current += 1;
    setEditor((latest) => (latest ? { ...latest, isBusy: true, error: '' } : latest));
    try {
      const targetId = await persistEditorInput(current.input);
      const attachment = await uploadEditorFile(targetId, file, 'INLINE_IMAGE');
      return `attachment://${attachment.id}`;
    } catch (error) {
      setEditor((latest) =>
        latest
          ? {
              ...latest,
              error: error instanceof Error ? error.message : '图片上传失败。',
            }
          : latest,
      );
      throw error;
    } finally {
      imageUploadReservationsRef.current -= 1;
      setEditor((latest) =>
        latest
          ? {
              ...latest,
              isBusy: imageUploadReservationsRef.current > 0,
            }
          : latest,
      );
    }
  };

  const submitEditor = async () => {
    if (!editor || editor.isBusy) return;
    const title = editor.input.title.trim();
    if (!title) {
      setEditor({ ...editor, error: '请填写标题。' });
      return;
    }
    const oversized = editor.files.find((file) => file.size > attachmentMaxBytes);
    if (oversized) {
      setEditor({
        ...editor,
        error: `“${oversized.name}”超过 ${formatBytes(attachmentMaxBytes)} 限制。`,
      });
      return;
    }
    if (editor.files.length + editor.attachments.length > 5) {
      setEditor({ ...editor, error: '每篇内容最多 5 个附件。' });
      return;
    }

    setEditor({ ...editor, isBusy: true, error: '' });
    try {
      const targetId = await persistEditorInput(editor.input);
      for (const file of editor.files) {
        if (editor.uploadedFileKeys.has(fileKey(file))) continue;
        await uploadEditorFile(targetId, file, 'DOWNLOADABLE_FILE');
      }
      if (!editor.post || editor.post.status === 'DRAFT') {
        await publishSubscriptionPost(accessToken, targetId);
      }
      draftControllerRef.current = null;
      setIsDownloadAttachmentDragActive(false);
      setEditor(null);
      await refresh();
      if (editor.post?.status === 'PUBLISHED') {
        setSelectedPostId(targetId);
      }
    } catch (error) {
      setEditor((current) =>
        current
          ? {
              ...current,
              isBusy: false,
              error: error instanceof Error ? error.message : '发布失败，请重试。',
            }
          : current,
      );
    }
  };

  if (editor) {
    return (
      <section className={styles.page} data-testid="article-page">
        {renderEditor()}
      </section>
    );
  }

  if (selectedPostId) {
    return (
      <section className={styles.page} data-testid="article-page">
        <button type="button" className={styles.backButton} onClick={() => setSelectedPostId('')}>
          返回文章列表
        </button>
        {detailQuery.isLoading ? <div className={styles.empty}>正在加载正文…</div> : null}
        {detailQuery.error ? (
          <div className={styles.errorPanel}>
            <span>
              {detailQuery.error instanceof Error ? detailQuery.error.message : '正文加载失败。'}
            </span>
            <button type="button" onClick={() => void detailQuery.refetch()}>
              重试
            </button>
          </div>
        ) : null}
        {selectedPost ? (
          <article className={styles.detail} data-testid="subscription-reading-view">
            <header className={styles.detailHeader}>
              <div className={styles.detailTitle}>
                <h1>{selectedPost.title}</h1>
                {selectedPost.isPinned ? (
                  <IconPinFilled size={13} className={styles.pinnedIcon} aria-label="置顶" />
                ) : null}
              </div>
              <div className={styles.detailMeta}>
                <span>{selectedPost.author.displayName || selectedPost.author.email}</span>
                <time>{formatDate(selectedPost.publishedAt)}</time>
              </div>
            </header>
            <SubscriptionMarkdown
              accessToken={accessToken}
              body={selectedPost.body}
              attachments={selectedPost.attachments}
            />
            {selectedPost.attachments.some(isDownloadableAttachment) ? (
              <section className={styles.attachments}>
                <h2>附件</h2>
                <div className={styles.attachmentList}>
                  {selectedPost.attachments.filter(isDownloadableAttachment).map((attachment) => (
                    <FileAttachmentCard
                      key={attachment.id}
                      filename={attachment.originalName}
                      size={attachment.size}
                      canShare={false}
                      onShare={() => undefined}
                      onDownload={() =>
                        void downloadFile(
                          subscriptionAttachmentContentUrl(attachment.id),
                          attachment.originalName,
                          accessToken,
                        )
                      }
                    />
                  ))}
                </div>
              </section>
            ) : null}
            {selectedPost.isRecipient ? (
              <section className={styles.confirmationSection} aria-label="阅读确认">
                {selectedPost.isConfirmed && selectedPost.confirmedAt ? (
                  <p>已于 {formatDate(selectedPost.confirmedAt)} 确认已读</p>
                ) : (
                  <>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      disabled={confirmationMutation.isPending}
                      onClick={() => confirmationMutation.mutate(selectedPost.id)}
                    >
                      {confirmationMutation.isPending ? '正在确认…' : '确认已读'}
                    </button>
                    {confirmationMutation.error ? (
                      <span className={styles.error}>
                        {confirmationMutation.error instanceof Error
                          ? confirmationMutation.error.message
                          : '确认失败，请重试。'}
                      </span>
                    ) : null}
                  </>
                )}
              </section>
            ) : null}
            <div className={styles.srStatus} aria-live="polite">
              {confirmationAnnouncement}
            </div>
            {canManage ? (
              <footer className={styles.detailAdminActions}>
                <button type="button" onClick={() => openEditor(selectedPost)}>
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void postActionMutation.mutateAsync({ kind: 'pin', post: selectedPost })
                  }
                >
                  {selectedPost.isPinned ? '取消置顶' : '置顶'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void postActionMutation.mutateAsync({ kind: 'withdraw', post: selectedPost })
                  }
                >
                  撤回
                </button>
              </footer>
            ) : null}
          </article>
        ) : null}
      </section>
    );
  }

  function renderEditor() {
    if (!editor) return null;
    const submitLabel = editor.post && editor.post.status !== 'DRAFT' ? '保存修改' : '发布文章';
    return (
      <section className={styles.editorPanel} aria-label="文章编辑器">
        <header className={styles.editorTopbar} data-testid="article-editor-action-bar">
          <div className={styles.editorIdentity}>
            <button
              type="button"
              className={styles.editorBackButton}
              onClick={() => void closeEditor()}
            >
              ← 返回
            </button>
            <div>
              <span>{editor.post ? formatStatus(editor.post.status) : '草稿'}</span>
              <h2>{editor.post ? '编辑文章' : '新建文章'}</h2>
            </div>
          </div>
          <div className={styles.editorHeaderActions}>
            <span aria-live="polite">
              {editor.saveStatus === 'saving' ? '正在保存…' : null}
              {editor.saveStatus === 'saved' ? '草稿已保存' : null}
              {editor.saveStatus === 'error' ? '保存失败' : null}
            </span>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={editor.isBusy}
              onClick={() => void submitEditor()}
            >
              {editor.isBusy ? '处理中…' : submitLabel}
            </button>
          </div>
        </header>
        <div className={styles.editorWorkspace}>
          <main className={styles.editorDocument}>
            <label className={styles.documentTitleField}>
              <span>标题</span>
              <input
                value={editor.input.title}
                placeholder="输入文章标题"
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    input: { ...editor.input, title: event.target.value },
                  })
                }
                maxLength={160}
              />
            </label>
            <div className={styles.articleEditorField}>
              <Suspense fallback={<div className={styles.editorLoading}>正在加载编辑器…</div>}>
                <SubscriptionArticleEditor
                  documentKey={editor.sessionKey}
                  initialMarkdown={editor.input.body}
                  disabled={editor.isBusy}
                  onMarkdownChange={(body) =>
                    setEditor((current) =>
                      current
                        ? {
                            ...current,
                            input: { ...current.input, body },
                          }
                        : current,
                    )
                  }
                  uploadImage={uploadEditorImage}
                  resolveImageUrl={async (attachmentId) => {
                    const result = await getSubscriptionAttachmentViewUrl(
                      accessToken,
                      attachmentId,
                    );
                    return result.url;
                  }}
                />
              </Suspense>
            </div>
          </main>

          <aside className={styles.publishSettings} role="region" aria-label="发布设置">
            {ARTICLE_TAGS_ENABLED ? (
              <section>
                <h3>标签</h3>
                <div className={styles.tagEditor}>
                  {editor.input.tags.map((tag) => (
                    <span key={tag}>
                      {tag}
                      <button
                        type="button"
                        aria-label={`删除标签 ${tag}`}
                        onClick={() =>
                          setEditor({
                            ...editor,
                            input: {
                              ...editor.input,
                              tags: editor.input.tags.filter((item) => item !== tag),
                            },
                          })
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    aria-label="标签"
                    value={editor.tagDraft}
                    placeholder="输入标签后回车"
                    onChange={(event) => {
                      const value = event.target.value;
                      if (/[\s,，]/u.test(value)) {
                        setEditor({
                          ...editor,
                          input: {
                            ...editor.input,
                            tags: parseSubscriptionTags(value, editor.input.tags),
                          },
                          tagDraft: '',
                        });
                      } else {
                        setEditor({ ...editor, tagDraft: value });
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
                        event.preventDefault();
                        commitTagDraft();
                      }
                    }}
                    onBlur={commitTagDraft}
                  />
                </div>
              </section>
            ) : null}
            <section>
              <h3>下载附件</h3>
              <p>
                提供给读者单独下载的文件，最多 5 个，单文件最大 {formatBytes(attachmentMaxBytes)}。
              </p>
              <button
                type="button"
                className={`${styles.addAttachmentButton} ${
                  isDownloadAttachmentDragActive ? styles.addAttachmentButtonDragActive : ''
                }`}
                data-workspace-file-drop="local"
                onClick={() => attachmentInputRef.current?.click()}
                onDragEnter={(event) => {
                  if (!Array.from(event.dataTransfer.types).includes('Files')) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setIsDownloadAttachmentDragActive(true);
                }}
                onDragOver={(event) => {
                  if (!Array.from(event.dataTransfer.types).includes('Files')) return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = 'copy';
                  setIsDownloadAttachmentDragActive(true);
                }}
                onDragLeave={(event) => {
                  if (!Array.from(event.dataTransfer.types).includes('Files')) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const nextTarget = event.relatedTarget;
                  if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
                  setIsDownloadAttachmentDragActive(false);
                }}
                onDrop={(event) => {
                  if (!Array.from(event.dataTransfer.types).includes('Files')) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setIsDownloadAttachmentDragActive(false);
                  queueDownloadAttachments(Array.from(event.dataTransfer.files));
                }}
              >
                <IconPaperclip size={16} aria-hidden="true" />
                {isDownloadAttachmentDragActive ? '松开添加为下载附件' : '选择下载附件'}
              </button>
              <input
                ref={attachmentInputRef}
                className={styles.hiddenFileInput}
                type="file"
                multiple
                onChange={(event) => {
                  queueDownloadAttachments(Array.from(event.target.files ?? []));
                  event.currentTarget.value = '';
                }}
              />
              <small>正文图片请粘贴或拖入左侧正文；这里选择的文件会作为下载附件。</small>
              {editor.attachments.filter(isDownloadableAttachment).map((attachment) => (
                <div key={attachmentKey(attachment)} className={styles.uploadRow}>
                  <span>{attachment.originalName}</span>
                  <span>已上传</span>
                </div>
              ))}
              {editor.files.map((file) => (
                <div key={fileKey(file)} className={styles.uploadRow}>
                  <span>{file.name}</span>
                  <span>{editor.progress[fileKey(file)] ?? 0}%</span>
                </div>
              ))}
            </section>
            {editor.error ? <div className={styles.error}>{editor.error}</div> : null}
          </aside>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.page} data-testid="article-page">
      {canManage ? (
        <div className={styles.adminTextActions}>
          <button type="button" onClick={() => setShowManage((value) => !value)}>
            {showManage ? '返回' : '管理'}
          </button>
          <button type="button" onClick={() => openEditor()}>
            发布
          </button>
        </div>
      ) : null}

      {postsQuery.isLoading ? <div className={styles.empty}>正在加载文章…</div> : null}
      {postsQuery.error ? (
        <div className={styles.errorPanel}>
          <span>
            {postsQuery.error instanceof Error ? postsQuery.error.message : '文章加载失败。'}
          </span>
          <button type="button" onClick={() => void postsQuery.refetch()}>
            重试
          </button>
        </div>
      ) : null}

      {showManage ? (
        <section className={styles.managePanel}>
          <h2>内容管理</h2>
          {manageQuery.isLoading ? <div className={styles.empty}>正在加载可管理内容…</div> : null}
          {manageQuery.error ? (
            <div className={styles.errorPanel}>
              <span>
                {manageQuery.error instanceof Error
                  ? manageQuery.error.message
                  : '可管理内容加载失败。'}
              </span>
              <button type="button" onClick={() => void manageQuery.refetch()}>
                重试
              </button>
            </div>
          ) : null}
          {!manageQuery.isLoading && !manageQuery.error && manageItems.length === 0 ? (
            <div className={styles.empty}>暂无可管理内容。</div>
          ) : (
            manageItems.map((post) => (
              <div key={post.id} className={styles.manageRow}>
                <div>
                  <strong>{post.title}</strong>
                  <span>
                    {formatStatus(post.status)} · {formatDate(post.updatedAt)}
                  </span>
                </div>
                <div className={styles.manageRowActions}>
                  <button
                    type="button"
                    aria-label={`编辑 ${post.title}`}
                    onClick={() => openEditor(post)}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    aria-label={`删除 ${post.title}`}
                    onClick={() => requestDelete(post)}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
      ) : (
        <div className={styles.feed} data-testid="article-feed">
          {orderedPosts.map((post: SubscriptionPostSummary) => (
            <article
              key={post.id}
              data-testid={`subscription-card-${post.id}`}
              className={`${styles.card} ${post.isConfirmed ? '' : styles.cardPending}`}
            >
              <button
                type="button"
                className={styles.cardOpen}
                aria-label={`打开${post.isConfirmed ? '已确认' : post.isRecipient ? '未确认' : ''}文章 ${post.title}`}
                onClick={() => setSelectedPostId(post.id)}
              >
                <div
                  className={styles.cardTitleRow}
                  data-testid={`subscription-card-title-row-${post.id}`}
                >
                  <div className={styles.cardTitle}>
                    <h2>{post.title}</h2>
                    {post.isRecipient && !post.isConfirmed ? (
                      <span className={styles.pendingLabel}>未确认</span>
                    ) : null}
                    {post.isPinned ? (
                      <IconPinFilled className={styles.pinnedIcon} size={12} aria-label="置顶" />
                    ) : null}
                  </div>
                  <div className={styles.cardMeta}>
                    <time>{formatDate(post.publishedAt)}</time>
                  </div>
                </div>
                <p className={styles.summary}>{post.bodyPreview}</p>
                {post.hasAttachments ? (
                  <span className={styles.attachmentMeta}>
                    <IconPaperclip size={13} aria-hidden="true" />
                    {post.attachmentCount} 个附件
                  </span>
                ) : null}
              </button>
              {post.confirmationProgress ? (
                <button
                  type="button"
                  className={styles.progressButton}
                  aria-label={`${post.confirmationProgress.confirmedCount}/${post.confirmationProgress.recipientCount} 已确认已读，查看名单`}
                  ref={(element) => {
                    if (progressPostId === post.id) progressTriggerRef.current = element;
                  }}
                  onClick={() => {
                    progressTriggerRef.current = document.activeElement as HTMLButtonElement;
                    setProgressPostId(post.id);
                  }}
                >
                  {post.confirmationProgress.confirmedCount}/
                  {post.confirmationProgress.recipientCount} 已确认已读
                </button>
              ) : null}
            </article>
          ))}
          {!postsQuery.isLoading && !postsQuery.error && orderedPosts.length === 0 ? (
            <div className={styles.empty}>暂无文章。</div>
          ) : null}
        </div>
      )}
      {editor ? renderEditor() : null}
      {progressPostId ? (
        <div className={styles.dialogBackdrop} role="presentation">
          <section
            ref={progressDialogRef}
            className={`${styles.dialog} ${styles.confirmationDialog}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmation-dialog-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeConfirmationProgress();
                return;
              }
              if (event.key !== 'Tab') return;
              const focusable = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(
                  'button, [href], [tabindex]:not([tabindex="-1"])',
                ),
              ).filter((element) => !element.hasAttribute('disabled'));
              if (focusable.length === 0) return;
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
          >
            <header>
              <h2 id="confirmation-dialog-title">确认已读名单</h2>
              <button type="button" onClick={closeConfirmationProgress} aria-label="关闭">
                ×
              </button>
            </header>
            {confirmationsQuery.isLoading ? (
              <div className={styles.empty}>正在加载确认名单…</div>
            ) : null}
            {confirmationsQuery.error ? (
              <div className={styles.errorPanel}>
                <span>
                  {confirmationsQuery.error instanceof Error
                    ? confirmationsQuery.error.message
                    : '确认名单加载失败。'}
                </span>
                <button type="button" onClick={() => void confirmationsQuery.refetch()}>
                  重试
                </button>
              </div>
            ) : null}
            {confirmationsQuery.data ? (
              <div className={styles.confirmationLists}>
                <p>
                  {confirmationsQuery.data.confirmedCount}/{confirmationsQuery.data.recipientCount}{' '}
                  已确认
                </p>
                <section>
                  <h3>已确认</h3>
                  {confirmationsQuery.data.confirmed.length === 0 ? (
                    <span>暂无</span>
                  ) : (
                    <ul>
                      {confirmationsQuery.data.confirmed.map((member) => (
                        <li key={member.userId}>
                          <span>{member.displayName || member.email}</span>
                          <time>{member.confirmedAt ? formatDate(member.confirmedAt) : ''}</time>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section>
                  <h3>未确认</h3>
                  {confirmationsQuery.data.pending.length === 0 ? (
                    <span>暂无</span>
                  ) : (
                    <ul>
                      {confirmationsQuery.data.pending.map((member) => (
                        <li key={member.userId}>{member.displayName || member.email}</li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}
