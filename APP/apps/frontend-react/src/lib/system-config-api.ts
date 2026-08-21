import {
  DEFAULT_CHAT_ATTACHMENT_MAX_MB,
  DEFAULT_SUBSCRIPTION_ATTACHMENT_MAX_MB,
  DEFAULT_WORK_STATUS_DEFS,
  MAX_CHAT_ATTACHMENT_MAX_MB,
  MIN_CHAT_ATTACHMENT_MAX_MB,
  type RolePermissions,
  getDefaultRolePermissions,
  normalizeWorkStatusDef,
  type WorkStatusDef,
} from '@sekerchat/shared';
import { fetchApi,  apiBaseUrl, authHeaders, bearerHeader, parseResponse } from './api-core';

export interface SystemConfig {
  attendanceTimezone: string;
  attendanceClockInStart: string;
  attendanceClockInEnd: string;
  attendanceClockOutStart: string;
  attendanceClockOutEnd: string;
  attendanceWorkDays: string;
  attendanceScheduledBreakMinutes: number;
  attendanceActiveWindowMinutes: number;
  dndOn1: string;
  dndOff1: string;
  dndOn2: string;
  dndOff2: string;
  dndDaysOfWeek: string;
  workStatusDefs: WorkStatusDef[];
  messageRetentionDays: number;
  messageRetentionSizeGB: number;
  textRetentionDays: number;
  imageRetentionDays: number;
  imageRetentionSizeGB: number;
  fileRetentionDays: number;
  fileRetentionSizeGB: number;
  chatAttachmentMaxMB: number;
  subscriptionAttachmentMaxMB: number;
  retentionSchedule: 'daily' | 'weekly' | 'manual';
  registrationOpen: boolean;
  emailWhitelist: string;
  rolePermissions: RolePermissions | null;
}

export interface StorageStats {
  textMessageCount: number;
  imageStorageBytes: string;
  imageCount: number;
  fileStorageBytes: string;
  fileCount: number;
  artifactStorageBytes: string;
  artifactCount: number;
  totalAttachmentCount: number;
  totalAttachmentStorageBytes: string;
  totalStorageBytes: string;
}

const DEFAULT_CONFIG: SystemConfig = {
  attendanceTimezone: 'Asia/Shanghai',
  attendanceClockInStart: '08:00',
  attendanceClockInEnd: '10:00',
  attendanceClockOutStart: '16:00',
  attendanceClockOutEnd: '19:00',
  attendanceWorkDays: '1,2,3,4,5',
  attendanceScheduledBreakMinutes: 60,
  attendanceActiveWindowMinutes: 120,
  dndOn1: '08:30',
  dndOff1: '12:00',
  dndOn2: '13:30',
  dndOff2: '18:00',
  dndDaysOfWeek: '1,2,3,4,5',
  workStatusDefs: DEFAULT_WORK_STATUS_DEFS,
  messageRetentionDays: 0,
  messageRetentionSizeGB: 0,
  textRetentionDays: 0,
  imageRetentionDays: 0,
  imageRetentionSizeGB: 0,
  fileRetentionDays: 0,
  fileRetentionSizeGB: 0,
  chatAttachmentMaxMB: DEFAULT_CHAT_ATTACHMENT_MAX_MB,
  subscriptionAttachmentMaxMB: DEFAULT_SUBSCRIPTION_ATTACHMENT_MAX_MB,
  retentionSchedule: 'daily' as const,
  registrationOpen: false,
  emailWhitelist: '',
  rolePermissions: null,
};

function parseWorkStatusDefs(raw: string | undefined): WorkStatusDef[] {
  if (!raw) return DEFAULT_WORK_STATUS_DEFS;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed as WorkStatusDef[]).map(normalizeWorkStatusDef)
      : DEFAULT_WORK_STATUS_DEFS;
  } catch {
    return DEFAULT_WORK_STATUS_DEFS;
  }
}

function parseRolePermissions(raw: string | undefined): RolePermissions | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as RolePermissions;
  } catch {
    return null;
  }
}

function parseChatAttachmentMaxMB(raw: string | undefined): number {
  const parsed = Number.parseInt(raw || '', 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_CONFIG.chatAttachmentMaxMB;
  }

  return Math.min(MAX_CHAT_ATTACHMENT_MAX_MB, Math.max(MIN_CHAT_ATTACHMENT_MAX_MB, parsed));
}

function parseConfigInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeConfig(data: Record<string, string>): SystemConfig {
  return {
    ...DEFAULT_CONFIG,
    attendanceTimezone: data.attendanceTimezone !== undefined ? data.attendanceTimezone : DEFAULT_CONFIG.attendanceTimezone,
    attendanceClockInStart: data.attendanceClockInStart !== undefined ? data.attendanceClockInStart : DEFAULT_CONFIG.attendanceClockInStart,
    attendanceClockInEnd: data.attendanceClockInEnd !== undefined ? data.attendanceClockInEnd : DEFAULT_CONFIG.attendanceClockInEnd,
    attendanceClockOutStart: data.attendanceClockOutStart !== undefined ? data.attendanceClockOutStart : DEFAULT_CONFIG.attendanceClockOutStart,
    attendanceClockOutEnd: data.attendanceClockOutEnd !== undefined ? data.attendanceClockOutEnd : DEFAULT_CONFIG.attendanceClockOutEnd,
    attendanceWorkDays: data.attendanceWorkDays !== undefined ? data.attendanceWorkDays : DEFAULT_CONFIG.attendanceWorkDays,
    attendanceScheduledBreakMinutes: parseConfigInt(data.attendanceScheduledBreakMinutes, DEFAULT_CONFIG.attendanceScheduledBreakMinutes),
    attendanceActiveWindowMinutes: parseConfigInt(data.attendanceActiveWindowMinutes, DEFAULT_CONFIG.attendanceActiveWindowMinutes),
    dndOn1: data.dndOn1 !== undefined ? data.dndOn1 : DEFAULT_CONFIG.dndOn1,
    dndOff1: data.dndOff1 !== undefined ? data.dndOff1 : DEFAULT_CONFIG.dndOff1,
    dndOn2: data.dndOn2 !== undefined ? data.dndOn2 : DEFAULT_CONFIG.dndOn2,
    dndOff2: data.dndOff2 !== undefined ? data.dndOff2 : DEFAULT_CONFIG.dndOff2,
    dndDaysOfWeek: data.dndDaysOfWeek !== undefined ? data.dndDaysOfWeek : DEFAULT_CONFIG.dndDaysOfWeek,
    workStatusDefs: parseWorkStatusDefs(data.workStatusDefs),
    messageRetentionDays: parseInt(data.messageRetentionDays || '0', 10) || 0,
    messageRetentionSizeGB: parseInt(data.messageRetentionSizeGB || '0', 10) || 0,
    textRetentionDays: parseInt(data.textRetentionDays || data.messageRetentionDays || '0', 10) || 0,
    imageRetentionDays: parseInt(data.imageRetentionDays || data.messageRetentionDays || '0', 10) || 0,
    imageRetentionSizeGB: parseInt(data.imageRetentionSizeGB || data.messageRetentionSizeGB || '0', 10) || 0,
    fileRetentionDays: parseInt(data.fileRetentionDays || data.messageRetentionDays || '0', 10) || 0,
    fileRetentionSizeGB: parseInt(data.fileRetentionSizeGB || data.messageRetentionSizeGB || '0', 10) || 0,
    chatAttachmentMaxMB: parseChatAttachmentMaxMB(data.chatAttachmentMaxMB),
    subscriptionAttachmentMaxMB: parseConfigInt(
      data.subscriptionAttachmentMaxMB,
      DEFAULT_CONFIG.subscriptionAttachmentMaxMB,
    ),
    retentionSchedule: (data.retentionSchedule === 'weekly' || data.retentionSchedule === 'manual' ? data.retentionSchedule : 'daily') as 'daily' | 'weekly' | 'manual',
    registrationOpen: data.registrationOpen === 'true',
    emailWhitelist: data.emailWhitelist || '',
    rolePermissions: parseRolePermissions(data.rolePermissions),
  };
}

export async function fetchSystemConfig(accessToken: string): Promise<SystemConfig> {
  const response = await fetchApi(`${apiBaseUrl}/system-config`, {
    headers: bearerHeader(accessToken),
  });
  return normalizeConfig(await parseResponse<Record<string, string>>(response));
}

export async function fetchStorageStats(accessToken: string): Promise<StorageStats> {
  const response = await fetchApi(`${apiBaseUrl}/system-config/storage-stats`, {
    headers: bearerHeader(accessToken),
  });
  return parseResponse<StorageStats>(response);
}

export async function updateSystemConfig(
  accessToken: string,
  config: Partial<SystemConfig>,
): Promise<SystemConfig> {
  const response = await fetchApi(`${apiBaseUrl}/system-config`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(config),
  });
  return normalizeConfig(await parseResponse<Record<string, string>>(response));
}
