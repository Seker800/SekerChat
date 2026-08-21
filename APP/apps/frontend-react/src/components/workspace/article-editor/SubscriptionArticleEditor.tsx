import { useEffect, useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import { CrepeBuilder } from '@milkdown/crepe/builder';
import { serializerCtx } from '@milkdown/kit/core';
import { Plugin } from '@milkdown/kit/prose/state';
import { $prose } from '@milkdown/kit/utils';
import { blockEdit } from '@milkdown/crepe/feature/block-edit';
import { imageBlock } from '@milkdown/crepe/feature/image-block';
import { linkTooltip } from '@milkdown/crepe/feature/link-tooltip';
import { listItem } from '@milkdown/crepe/feature/list-item';
import { placeholder } from '@milkdown/crepe/feature/placeholder';
import { table } from '@milkdown/crepe/feature/table';
import { toolbar } from '@milkdown/crepe/feature/toolbar';
import { topBar } from '@milkdown/crepe/feature/top-bar';
import '@milkdown/crepe/theme/common/prosemirror.css';
import '@milkdown/crepe/theme/common/reset.css';
import '@milkdown/crepe/theme/common/block-edit.css';
import '@milkdown/crepe/theme/common/image-block.css';
import '@milkdown/crepe/theme/common/link-tooltip.css';
import '@milkdown/crepe/theme/common/list-item.css';
import '@milkdown/crepe/theme/common/placeholder.css';
import '@milkdown/crepe/theme/common/table.css';
import '@milkdown/crepe/theme/common/toolbar.css';
import '@milkdown/crepe/theme/common/top-bar.css';
import '@milkdown/crepe/theme/frame-dark.css';
import { getSubscriptionAttachmentId, normalizePastedImageFile } from './subscription-image';
import styles from './SubscriptionArticleEditor.module.css';

export interface SubscriptionArticleEditorProps {
  documentKey: string;
  initialMarkdown: string;
  disabled?: boolean;
  onMarkdownChange: (markdown: string) => void;
  uploadImage: (file: File) => Promise<string>;
  resolveImageUrl: (attachmentId: string) => Promise<string>;
}

function hasDraggedImage(event: ReactDragEvent<HTMLElement>): boolean {
  if (
    event.dataTransfer.items &&
    Array.from(event.dataTransfer.items).some(
      (item) => item.kind === 'file' && item.type.startsWith('image/'),
    )
  ) {
    return true;
  }
  return Array.from(event.dataTransfer.files).some((file) => file.type.startsWith('image/'));
}

export function SubscriptionArticleEditor(props: SubscriptionArticleEditorProps) {
  const callbacks = useRef(props);
  const crepeRef = useRef<CrepeBuilder | null>(null);
  const lifecycleRef = useRef<Promise<void>>(Promise.resolve());
  const editorRootRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [isImageDragActive, setImageDragActive] = useState(false);
  callbacks.current = props;

  useEffect(() => {
    const root = editorRootRef.current;
    if (!root) return undefined;

    let active = true;
    const crepe = new CrepeBuilder({
      root,
      defaultValue: props.initialMarkdown,
    })
      .addFeature(listItem)
      .addFeature(linkTooltip)
      .addFeature(imageBlock, {
        onUpload: async (file) => callbacks.current.uploadImage(normalizePastedImageFile(file)),
        proxyDomURL: async (url) => {
          const attachmentId = getSubscriptionAttachmentId(url);
          return attachmentId ? callbacks.current.resolveImageUrl(attachmentId) : url;
        },
        blockUploadButton: '上传图片',
        blockConfirmButton: '确认',
        blockCaptionPlaceholderText: '添加图片说明',
        blockUploadPlaceholderText: '或粘贴图片地址',
        inlineUploadButton: '上传图片',
        inlineConfirmButton: '确认',
        inlineUploadPlaceholderText: '或粘贴图片地址',
      })
      .addFeature(blockEdit)
      .addFeature(placeholder, {
        text: '输入正文，输入 / 插入内容，或直接粘贴图片…',
        mode: 'doc',
      })
      .addFeature(toolbar)
      .addFeature(table)
      .addFeature(topBar);
    let markdownNotificationTimer: number | undefined;
    let latestMarkdown = props.initialMarkdown;
    crepe.editor.use(
      $prose(
        (ctx) =>
          new Plugin({
            view: () => ({
              update: (view, previousState) => {
                if (view.state.doc.eq(previousState.doc)) return;
                latestMarkdown = ctx.get(serializerCtx)(view.state.doc);
                window.clearTimeout(markdownNotificationTimer);
                markdownNotificationTimer = window.setTimeout(() => {
                  if (active) callbacks.current.onMarkdownChange(latestMarkdown);
                }, 120);
              },
              destroy: () => window.clearTimeout(markdownNotificationTimer),
            }),
          }),
      ),
    );

    setLoading(true);
    let didCreate = false;
    const creation = lifecycleRef.current.then(async () => {
      if (!active) return;
      crepe.setReadonly(Boolean(props.disabled));
      crepeRef.current = crepe;
      try {
        await crepe.create();
        didCreate = true;
        if (!active) return;
        const editorElement = root.querySelector<HTMLElement>('[contenteditable]');
        editorElement?.classList.add(styles.editor);
        editorElement?.setAttribute('aria-label', '文章正文');
        setLoading(false);
      } catch (error) {
        console.error(error);
        if (active) setLoading(false);
      }
    });
    lifecycleRef.current = creation;

    return () => {
      active = false;
      lifecycleRef.current = creation.then(async () => {
        if (crepeRef.current === crepe) crepeRef.current = null;
        if (didCreate) await crepe.destroy();
      });
    };
  }, [props.documentKey]);

  useEffect(() => {
    crepeRef.current?.setReadonly(Boolean(props.disabled));
  }, [props.disabled]);

  return (
    <div
      className={styles.root}
      data-testid="subscription-article-editor"
      data-editor-engine="crepe"
      data-workspace-file-drop="local"
      onDragEnter={(event) => {
        if (props.disabled || !hasDraggedImage(event)) return;
        const previousTarget = event.relatedTarget;
        if (!(previousTarget instanceof Node) || !event.currentTarget.contains(previousTarget)) {
          setImageDragActive(true);
        }
      }}
      onDragOver={(event) => {
        if (props.disabled || !hasDraggedImage(event)) return;
        event.preventDefault();
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setImageDragActive(false);
        }
      }}
      onDrop={() => setImageDragActive(false)}
    >
      <div className={styles.editorFrame}>
        {loading ? <div className={styles.loading}>正在加载编辑器…</div> : null}
        {isImageDragActive ? (
          <div className={styles.imageDropTarget} role="status">
            松开即可插入正文图片
          </div>
        ) : null}
        <div ref={editorRootRef} />
      </div>
    </div>
  );
}

export default SubscriptionArticleEditor;
