import { fetchApi,  apiBaseUrl, authHeaders, parseResponse } from './api-core';

export interface TaskUserBrief {
  id: string;
  displayName: string | null;
  email: string;
}

export interface TaskResponse {
  id: string;
  groupId: string;
  content: string;
  completed: boolean;
  createdAt: string;
  completedAt: string | null;
  createdBy: TaskUserBrief;
  completedBy: TaskUserBrief | null;
}

export async function listTasks(
  accessToken: string,
  groupId: string,
): Promise<TaskResponse[]> {
  const response = await fetchApi(
    `${apiBaseUrl}/groups/${encodeURIComponent(groupId)}/tasks`,
    { headers: authHeaders(accessToken) },
  );
  return parseResponse<TaskResponse[]>(response);
}

export async function createTask(
  accessToken: string,
  groupId: string,
  content: string,
): Promise<TaskResponse> {
  const response = await fetchApi(
    `${apiBaseUrl}/groups/${encodeURIComponent(groupId)}/tasks`,
    {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ content }),
    },
  );
  return parseResponse<TaskResponse>(response);
}

export async function updateTask(
  accessToken: string,
  groupId: string,
  taskId: string,
  data: { content?: string; completed?: boolean },
): Promise<TaskResponse> {
  const response = await fetchApi(
    `${apiBaseUrl}/groups/${encodeURIComponent(groupId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'PATCH',
      headers: authHeaders(accessToken),
      body: JSON.stringify(data),
    },
  );
  return parseResponse<TaskResponse>(response);
}

export async function deleteTask(
  accessToken: string,
  groupId: string,
  taskId: string,
): Promise<void> {
  const response = await fetchApi(
    `${apiBaseUrl}/groups/${encodeURIComponent(groupId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(accessToken),
    },
  );
  await parseResponse<unknown>(response);
}
