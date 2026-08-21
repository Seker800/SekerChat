export type LabMetric = {
  label: string;
  value: string;
  detail: string;
};

export type LabFeature = {
  title: string;
  body: string;
  tag: string;
};

export type LabStep = {
  title: string;
  body: string;
};

export type LabSurface = {
  eyebrow: string;
  title: string;
  description: string;
  metrics: LabMetric[];
  features: LabFeature[];
  workflow: LabStep[];
  callouts: string[];
  loginMethods: {
    primary: {
      title: string;
      body: string;
      action: string;
      hint: string;
    };
    fallback: {
      title: string;
      body: string;
      email: string;
      code: string;
      action: string;
    };
  };
  workspacePreview: {
    sidebarActions: string[];
    folders: Array<{
      name: string;
      count: string;
      collapsed: boolean;
      items: Array<{
        name: string;
        activity: string;
        state?: 'active' | 'archived';
        active?: boolean;
      }>;
    }>;
    threadHeader: {
      name: string;
      status: string;
      memberCount: string;
      realtime: string;
      identity: string;
    };
    messages: Array<{
      author: string;
      role: 'self' | 'peer' | 'system';
      time: string;
      body: string;
      detail?: string;
    }>;
    management: {
      groupStats: Array<{ label: string; value: string }>;
      memberRoles: Array<{ name: string; role: string; detail: string }>;
      discovery: Array<{ name: string; state: string; detail: string }>;
    };
  };
  discoveryPreview: {
    scope: string[];
    search: string;
    results: Array<{
      name: string;
      state: string;
      memberCount: string;
      owner: string;
      activity: string;
      reason: string;
      actions: string[];
    }>;
  };
  managePreview: {
    summary: Array<{ label: string; value: string }>;
    members: Array<{ name: string; role: string; email: string }>;
    actions: Array<{ label: string; value: string }>;
  };
  loginPreview: {
    title: string;
    description: string;
    primaryNote: string;
  };
};

export const homeContent: LabSurface = {
  eyebrow: 'SekerChat / ui-lab',
  title: '先把真实界面的视觉语言定稿，再迁回业务前端。',
  description:
    '这个沙盒现在不再展示抽象概念页，而是直接映射你的真实产品结构：登录入口、线程列表、消息区、权限和群组检索。',
  metrics: [
    {
      label: '登录入口',
      value: 'SSO + 邮箱 fallback',
      detail: '群晖单点登录是主链路，验证码是备用入口。',
    },
    {
      label: '工作区结构',
      value: '线程 / 消息 / 管理',
      detail: '信息架构直接贴近当前业务前端。',
    },
    {
      label: '迁移方式',
      value: '还原 + 接状态',
      detail: '定稿后只做真实组件还原和业务接入。',
    },
  ],
  features: [
    {
      tag: 'Auth',
      title: '登录页保留双入口，但主次关系明确',
      body: '群晖单点登录作为正式入口，邮箱验证码只作为开发和故障时的 fallback，不与 SSO 等权。',
    },
    {
      tag: 'Workspace',
      title: '主体不是官网，而是线程工作台',
      body: '左侧线程列表，中间消息流和输入区，右侧是成员角色、归档和群组检索等管理视图。',
    },
    {
      tag: 'Admin',
      title: '权限和群组检索从消息流里抽离',
      body: '系统级权限、群管理和发现式检索保留独立的后台感，不再挤进同一个会话区。',
    },
  ],
  workflow: [
    {
      title: '并行出 3 个方向',
      body: 'Codex 风、Apple 风、CLI 极客风都基于同一份内容模型生成。',
    },
    {
      title: '选一版并收敛',
      body: '确定视觉方向后，收紧排版、控件层级和组件边界。',
    },
    {
      title: '迁回真实项目',
      body: '把选中的模块迁到业务前端，只接登录和工作台跳转，不再重做设计探索。',
    },
  ],
  callouts: ['静态展示优先', '风格差异要大', '组件结构可迁移'],
  loginMethods: {
    primary: {
      title: '群晖单点登录',
      body: '正式使用优先走 Synology SSO Server，完成认证后直接回到线程工作台。',
      action: '使用群晖账号登录',
      hint: '使用已绑定或在白名单中的账号。',
    },
    fallback: {
      title: '邮箱验证码',
      body: '本地开发、联调或 SSO 异常时进入系统的备用入口。',
      email: 'alice@example.com',
      code: '123456',
      action: '进入工作台',
    },
  },
  workspacePreview: {
    sidebarActions: ['群组检索', '权限', '刷新', '新建'],
    folders: [
      {
        name: '排查中',
        count: '3',
        collapsed: false,
        items: [
          { name: '产品运营同步', activity: '1小时', state: 'active' },
          { name: '提醒投递异常排查', activity: '3小时', active: true, state: 'active' },
          { name: '群晖 OIDC 接入', activity: '1天', state: 'active' },
        ],
      },
      {
        name: '已归档',
        count: '1',
        collapsed: false,
        items: [{ name: '历史迁移讨论', activity: '1周', state: 'archived' }],
      },
    ],
    threadHeader: {
      name: '提醒投递异常排查',
      status: '活跃',
      memberCount: '6 位成员',
      realtime: '已连接',
      identity: '已登录 · alice@example.com',
    },
    messages: [
      {
        author: 'Mia',
        role: 'peer',
        time: '10:14',
        body: '昨晚 02:00 之后提醒延迟明显增大，怀疑是 worker 堵住了。',
      },
      {
        author: '你',
        role: 'self',
        time: '10:16',
        body: '我先查投递链路和重试堆积，再看是不是某个群组附件下载把队列拖慢了。',
        detail: '回复 Mia',
      },
      {
        author: 'system',
        role: 'system',
        time: '10:18',
        body: 'realtime status: connected · 2 个新事件 · 群管理员可打开群组检索面板',
      },
    ],
    management: {
      groupStats: [
        { label: '线程状态', value: '活跃' },
        { label: '成员总数', value: '6' },
        { label: '管理员 / 成员', value: '2 / 4' },
        { label: '当前身份', value: '管理员' },
      ],
      memberRoles: [
        { name: 'Alice', role: '管理员', detail: '当前登录账号' },
        { name: 'Mia', role: '管理员', detail: '产品 owner' },
        { name: 'Ken', role: '成员', detail: '提醒投递维护' },
      ],
      discovery: [
        { name: '历史迁移讨论', state: '已归档', detail: '管理员可见 · 你当前不在群内' },
        { name: '提醒策略实验', state: '活跃', detail: '你仍是成员 · 管理员可发现' },
      ],
    },
  },
  discoveryPreview: {
    scope: ['已归档', '我已不在', '全部'],
    search: '提醒',
    results: [
      {
        name: '历史迁移讨论',
        state: '已归档',
        memberCount: '4',
        owner: 'Mia',
        activity: '1周',
        reason: '管理员可见 · 你当前不在群内',
        actions: ['打开', '加入', '取消归档'],
      },
      {
        name: '提醒策略实验',
        state: '活跃',
        memberCount: '6',
        owner: 'Alice',
        activity: '3天',
        reason: '你仍是成员 · 管理员可发现',
        actions: ['打开', '退出', '归档'],
      },
    ],
  },
  managePreview: {
    summary: [
      { label: '当前身份', value: '管理员' },
      { label: '管理员数量', value: '2' },
      { label: '普通成员数量', value: '4' },
    ],
    members: [
      { name: 'Alice', role: '管理员', email: 'alice@example.com' },
      { name: 'Mia', role: '管理员', email: 'mia@example.com' },
      { name: 'Ken', role: '成员', email: 'ken@example.com' },
      { name: 'Luna', role: '成员', email: 'luna@example.com' },
    ],
    actions: [
      { label: '线程名称', value: '提醒投递异常排查' },
      { label: '邀请成员', value: '选择要加入群组的账号' },
      { label: '归档状态', value: '活跃' },
    ],
  },
  loginPreview: {
    title: '登录',
    description: '使用群晖账号登录。',
    primaryNote: 'Synology SSO Server',
  },
};
