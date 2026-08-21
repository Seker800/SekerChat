import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useResolvedAccessToken } from '../../auth/AuthContext';
import {
  createTask,
  deleteTask,
  listTasks,
  updateTask,
  type TaskResponse,
} from '../../lib/tasks-api';
import type { GroupResponse } from '../../lib/groups-api';
import styles from './TaskSection.module.css';

interface TaskSectionProps {
  group: GroupResponse;
  accessToken?: string;
  currentUserId: string;
}

function displayName(task: TaskResponse, field: 'createdBy' | 'completedBy'): string {
  const user = task[field];
  if (!user) return '';
  return user.displayName || user.email;
}

export function TaskSection({ group, accessToken, currentUserId }: TaskSectionProps) {
  const resolvedAccessToken = useResolvedAccessToken(accessToken);
  const queryClient = useQueryClient();
  const [newContent, setNewContent] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isFormOpen) {
      inputRef.current?.focus();
    }
  }, [isFormOpen]);

  const tasksQuery = useQuery({
    queryKey: ['tasks', group.id],
    queryFn: () => listTasks(resolvedAccessToken, group.id),
    enabled: !group.archivedAt,
  });

  const createMutation = useMutation({
    mutationFn: (content: string) => createTask(resolvedAccessToken, group.id, content),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks', group.id] });
      setNewContent('');
      setIsFormOpen(false);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ taskId, completed }: { taskId: string; completed: boolean }) =>
      updateTask(resolvedAccessToken, group.id, taskId, { completed }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks', group.id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => deleteTask(resolvedAccessToken, group.id, taskId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks', group.id] });
    },
  });

  const handleCreate = useCallback(() => {
    const trimmed = newContent.trim();
    if (!trimmed || createMutation.isPending) return;
    createMutation.mutate(trimmed);
  }, [newContent, createMutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCreate();
      }
    },
    [handleCreate],
  );

  const tasks = tasksQuery.data ?? [];

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionLabel}>任务</span>
        {!group.archivedAt ? (
          <button
            className={styles.addBtn}
            type="button"
            onClick={() => setIsFormOpen((prev) => !prev)}
            title="添加任务"
          >
            +
          </button>
        ) : null}
      </div>

      {isFormOpen && !group.archivedAt ? (
        <div className={styles.createRow}>
          <input
            ref={inputRef}
            className={styles.createInput}
            type="text"
            placeholder="添加任务..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setIsFormOpen(false);
                return;
              }
              handleKeyDown(e);
            }}
            maxLength={500}
          />
          <button
            className={styles.createBtn}
            type="button"
            disabled={!newContent.trim() || createMutation.isPending}
            onClick={handleCreate}
          >
            添加
          </button>
        </div>
      ) : null}

      {tasksQuery.isLoading ? (
        <p className={styles.subtle}>加载中...</p>
      ) : tasksQuery.isError ? (
        <p className={styles.subtle}>加载失败</p>
      ) : tasks.length === 0 ? (
        <p className={styles.subtle}>暂无任务</p>
      ) : (
        <div className={styles.taskList}>
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`${styles.taskRow} ${task.completed ? styles.taskCompleted : ''}`}
            >
              <button
                className={styles.checkbox}
                type="button"
                title={task.completed ? '取消完成' : '标记完成'}
                onClick={() =>
                  toggleMutation.mutate({ taskId: task.id, completed: !task.completed })
                }
              >
                {task.completed ? '✓' : ''}
              </button>
              <div className={styles.taskBody}>
                <span className={styles.taskContent}>{task.content}</span>
                <span className={styles.taskMeta}>
                  {displayName(task, 'createdBy')}
                  {task.completed && task.completedBy
                    ? ` · 已完成: ${displayName(task, 'completedBy')}`
                    : ''}
                </span>
              </div>
              {task.createdBy.id === currentUserId ? (
                <button
                  className={styles.deleteBtn}
                  type="button"
                  title="删除任务"
                  onClick={() => {
                    if (window.confirm('确定删除这条任务吗？')) {
                      deleteMutation.mutate(task.id);
                    }
                  }}
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
