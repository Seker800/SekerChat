export const WORK_STATUS_VALUES = [
  '初始',
  '优先',
  '打包',
  'ing',
  '阻塞',
  '暂停',
  '完成',
  '取消',
] as const;

export type WorkStatusValue = (typeof WORK_STATUS_VALUES)[number];

export const WORK_STATUS_PRIORITY_ORDER = [
  '优先',
  '阻塞',
  'ing',
  '打包',
  '初始',
  '暂停',
  '完成',
  '取消',
] as const satisfies readonly WorkStatusValue[];

const rawToDisplayMap: Record<string, WorkStatusValue> = {
  初始: '初始',
  DISCOVERY: '初始',
  优先: '优先',
  WAITING_OWNER: '优先',
  打包: '打包',
  WAITING_ADMIN: '打包',
  ing: 'ing',
  IN_PROGRESS: 'ing',
  阻塞: '阻塞',
  BLOCKED: '阻塞',
  暂停: '暂停',
  PAUSED: '暂停',
  完成: '完成',
  DONE: '完成',
  取消: '取消',
  CANCELLED: '取消',
};

const workStatusPriorityMap = new Map<WorkStatusValue, number>(
  WORK_STATUS_PRIORITY_ORDER.map((status, index) => [status, index]),
);

export function normalizeGroupWorkStatus(
  value: string | null | undefined,
  defs?: WorkStatusDef[],
): string {
  if (!value) {
    return '';
  }
  return rawToDisplayMap[value] ?? value;
}

export function getWorkStatusPriority(
  value: string | null | undefined,
  defs?: WorkStatusDef[],
): number {
  const normalized = normalizeGroupWorkStatus(value, defs);
  if (defs?.length) {
    const idx = defs.findIndex((d) => d.name === normalized);
    return idx >= 0 ? idx : defs.length;
  }
  const idx = WORK_STATUS_PRIORITY_ORDER.indexOf(normalized as WorkStatusValue);
  return idx >= 0 ? idx : WORK_STATUS_PRIORITY_ORDER.length;
}

export function compareWorkStatusPriority(
  left: string | null | undefined,
  right: string | null | undefined,
  defs?: WorkStatusDef[],
): number {
  return getWorkStatusPriority(left, defs) - getWorkStatusPriority(right, defs);
}

export interface WorkStatusDef {
  name: string;
  tone: string;
  textTone: string;
  isPackaging?: boolean;
  isArchive?: boolean;
}

export const DEFAULT_WORK_STATUS_DEFS: WorkStatusDef[] = [
  { name: '初始', tone: '#6c757d', textTone: '#ffffff' },
  { name: '优先', tone: '#ff6b6b', textTone: '#ffffff' },
  { name: '打包', tone: '#ffd93d', textTone: '#1e1f22', isPackaging: true },
  { name: 'ing', tone: '#4ecdc4', textTone: '#1e1f22' },
  { name: '阻塞', tone: '#dc3545', textTone: '#ffffff' },
  { name: '暂停', tone: '#ffa500', textTone: '#1e1f22' },
  { name: '完成', tone: '#6c757d', textTone: '#ffffff' },
  { name: '取消', tone: '#6c757d', textTone: '#ffffff' },
];

export function normalizeWorkStatusDef(definition: WorkStatusDef): WorkStatusDef {
  return {
    ...definition,
    isPackaging: !definition.isArchive && (definition.isPackaging ?? definition.name === '打包'),
  };
}

export function isPackagingWorkStatus(
  status: string | null | undefined,
  defs?: WorkStatusDef[],
): boolean {
  if (!status) return false;
  const list = defs?.length ? defs : DEFAULT_WORK_STATUS_DEFS;
  const definition = list.find((candidate) => candidate.name === status);
  return definition ? Boolean(normalizeWorkStatusDef(definition).isPackaging) : false;
}

export function resolveWorkStatusTone(name: string, defs?: WorkStatusDef[]): string {
  const list = defs?.length ? defs : DEFAULT_WORK_STATUS_DEFS;
  const def = list.find((d) => d.name === name);
  return def?.tone ?? '#6c757d';
}

export function resolveWorkStatusTextTone(name: string, defs?: WorkStatusDef[]): string {
  const list = defs?.length ? defs : DEFAULT_WORK_STATUS_DEFS;
  const def = list.find((d) => d.name === name);
  return def?.textTone ?? '#ffffff';
}

export function getWorkStatusNames(defs?: WorkStatusDef[]): string[] {
  return (defs?.length ? defs : DEFAULT_WORK_STATUS_DEFS).map((d) => d.name);
}

export const DEFAULT_CHAT_ATTACHMENT_MAX_MB = 10 * 1024;
export const MIN_CHAT_ATTACHMENT_MAX_MB = 1;
export const MAX_CHAT_ATTACHMENT_MAX_MB = 10 * 1024;

/** Chunk size for multipart uploads (32 MB). */
export const DEFAULT_UPLOAD_PART_SIZE_BYTES = 32 * 1024 * 1024;
export const DEFAULT_SUBSCRIPTION_ATTACHMENT_MAX_MB = 5 * 1024;
export const MIN_SUBSCRIPTION_ATTACHMENT_MAX_MB = 1;
export const MAX_SUBSCRIPTION_ATTACHMENT_MAX_MB = 10 * 1024;
export const ALBUM_VIDEO_MAX_MB = 100;
export const WORKSPACE_BOOTSTRAP_MODES = ['server', 'dm'] as const;
export type WorkspaceBootstrapMode = (typeof WORKSPACE_BOOTSTRAP_MODES)[number];
export const DEFAULT_WORKSPACE_BOOTSTRAP_MESSAGE_LIMIT = 50;
export const MAX_WORKSPACE_BOOTSTRAP_MESSAGE_LIMIT = 200;

export function chatAttachmentMbToBytes(mb: number): number {
  return Math.max(0, Math.floor(mb)) * 1024 * 1024;
}

// ── DnD ──

export const NOTIFICATION_DISABLED_UNTIL_ISO = '9999-12-31T23:59:59.999Z';

export function isDndActive(
  dndUntil: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!dndUntil) {
    return false;
  }

  const parsed = dndUntil instanceof Date ? dndUntil : new Date(dndUntil);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed > now;
}

// ── Permissions ──

export const SYSTEM_PERMISSIONS = [
  'create_group',
  'manage_group_settings',
  'invite_members',
  'remove_members',
  'manage_work_status',
  'manage_artifacts',
  'archive_group',
  'manage_user_roles',
  'manage_system_config',
  'upload_server_avatar',
  'view_archived_channels',
  'view_all_groups',
  'join_any_group',
  'access_admin_page',
  'view_admin_artifacts',
  'view_presence_logs',
  'view_user_directory',
  'manage_bans',
  'manage_subscription_posts',
  'manage_album',
] as const;

export type SystemPermission = (typeof SYSTEM_PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<SystemPermission, string> = {
  create_group: '创建频道',
  manage_group_settings: '修改频道 / Server 设置',
  invite_members: '邀请成员进频道',
  remove_members: '移除频道成员',
  manage_work_status: '修改工作状态',
  manage_artifacts: '删除产出文件',
  archive_group: '归档频道',
  manage_user_roles: '修改他人角色',
  manage_system_config: '修改系统设置',
  upload_server_avatar: '上传分类头像',
  view_archived_channels: '查看已归档频道',
  view_all_groups: '查看全部频道',
  join_any_group: '加入任意频道',
  access_admin_page: '进入管理后台',
  view_admin_artifacts: '查看产出文件后台',
  view_presence_logs: '查看活跃度记录',
  view_user_directory: '查看用户管理',
  manage_bans: '管理封禁名单',
  manage_subscription_posts: '管理文章',
  manage_album: '管理相册',
};

export const PERMISSION_DESCRIPTIONS: Record<SystemPermission, string> = {
  create_group: '可以新建讨论频道',
  manage_group_settings: '可以修改频道名称、所属 server 分类以及 server 设置',
  invite_members: '可以邀请新成员加入任意频道',
  remove_members: '可以将成员移出任意频道',
  manage_work_status: '可以修改任意频道的工作状态，如进行中/阻塞/完成',
  manage_artifacts: '可以删除频道中的产出文件',
  archive_group: '可以将任意频道归档或取消归档',
  manage_user_roles: '可以将其他用户设为管理员或撤销其管理员身份',
  manage_system_config: '可以修改通知免打扰、消息与附件、注册开关等全局设置',
  upload_server_avatar: '可以为服务器分类上传自定义头像',
  view_archived_channels: '可以查看自己加入的已归档频道和对应的 server 分类',
  view_all_groups: '可以查看所有频道，包括已归档的（否则只能看到活跃频道）',
  join_any_group: '可以加入任意频道',
  access_admin_page: '可以进入 /admin 管理后台',
  view_admin_artifacts: '可以进入管理后台中的产出文件页面，查看并下载全局产出文件',
  view_presence_logs: '可以查看所有用户的活跃度记录',
  view_user_directory: '可以进入管理后台中的用户管理页面并查看全量用户列表',
  manage_bans: '可以查看和管理因暴力破解被自动封禁的 IP/邮箱',
  manage_subscription_posts: '可以创建、编辑、发布、撤回、置顶和删除文章',
  manage_album: '可以上传照片、修改相册标签和删除照片',
};

export type RolePermissions = Record<string, SystemPermission[]>;

export const PERMISSION_GROUPS: { label: string; permissions: SystemPermission[] }[] = [
  { label: '频道', permissions: ['create_group', 'manage_group_settings', 'archive_group'] },
  { label: '可见性', permissions: ['view_archived_channels', 'view_all_groups', 'join_any_group'] },
  { label: '成员', permissions: ['invite_members', 'remove_members', 'manage_user_roles'] },
  { label: '工作状态 & 产出', permissions: ['manage_work_status', 'manage_artifacts'] },
  {
    label: '管理后台',
    permissions: [
      'access_admin_page',
      'view_user_directory',
      'view_presence_logs',
      'view_admin_artifacts',
      'manage_bans',
      'manage_subscription_posts',
      'manage_album',
    ],
  },
  { label: '系统', permissions: ['manage_system_config', 'upload_server_avatar'] },
];

export function hasSystemPermission(
  rolePermissions: RolePermissions | null,
  role: string,
  permission: SystemPermission,
): boolean {
  if (role === 'SUPER_ADMIN') return true;
  if (!rolePermissions) return false;
  const perms = rolePermissions[role];
  if (!perms) return false;
  return perms.includes(permission);
}

export function getDefaultRolePermissions(): RolePermissions {
  return {
    MEMBER: [
      'create_group',
      'invite_members',
      'remove_members',
      'archive_group',
      'view_archived_channels',
    ],
    CLI_BOT: [
      'create_group',
      'invite_members',
      'remove_members',
      'manage_work_status',
      'manage_artifacts',
      'archive_group',
      'view_archived_channels',
    ],
    ADMIN: [
      'create_group',
      'manage_group_settings',
      'invite_members',
      'remove_members',
      'manage_work_status',
      'manage_artifacts',
      'archive_group',
      'manage_user_roles',
      'upload_server_avatar',
      'view_all_groups',
      'join_any_group',
      'view_archived_channels',
      'access_admin_page',
      'view_admin_artifacts',
      'view_presence_logs',
      'view_user_directory',
      'manage_bans',
      'manage_subscription_posts',
      'manage_album',
    ],
    SUPER_ADMIN: [...SYSTEM_PERMISSIONS],
  };
}
