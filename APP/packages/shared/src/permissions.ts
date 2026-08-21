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
  {
    label: '频道',
    permissions: ['create_group', 'manage_group_settings', 'archive_group'],
  },
  {
    label: '可见性',
    permissions: ['view_archived_channels', 'view_all_groups', 'join_any_group'],
  },
  {
    label: '成员',
    permissions: ['invite_members', 'remove_members', 'manage_user_roles'],
  },
  {
    label: '工作状态 & 产出',
    permissions: ['manage_work_status', 'manage_artifacts'],
  },
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
  {
    label: '系统',
    permissions: ['manage_system_config', 'upload_server_avatar'],
  },
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
