export const resources = {
  'zh-CN': {
    translation: {
      language: {
        label: '语言',
        chinese: '简体中文',
        english: 'English',
      },
      auth: {
        title: 'SekerChat',
        description: '登录 SekerChat。',
        loginTitle: '登录 SekerChat',
        registerTitle: '注册 SekerChat',
        email: '邮箱',
        password: '密码',
        displayName: '显示名称（选填）',
        login: '登录',
        register: '注册',
        waiting: '请稍候...',
        switchToRegister: '没有账号？注册',
        switchToLogin: '已有账号？登录',
        passwordRules: {
          minLength: '至少 8 个字符',
          uppercase: '至少包含一个大写字母',
          lowercase: '至少包含一个小写字母',
          digit: '至少包含一个数字',
        },
      },
    },
  },
  en: {
    translation: {
      language: {
        label: 'Language',
        chinese: '简体中文',
        english: 'English',
      },
      auth: {
        title: 'SekerChat',
        description: 'Sign in to SekerChat.',
        loginTitle: 'Sign in to SekerChat',
        registerTitle: 'Create an account',
        email: 'Email',
        password: 'Password',
        displayName: 'Display name (optional)',
        login: 'Sign in',
        register: 'Register',
        waiting: 'Please wait...',
        switchToRegister: 'Need an account? Register',
        switchToLogin: 'Already have an account? Sign in',
        passwordRules: {
          minLength: 'At least 8 characters',
          uppercase: 'One uppercase letter',
          lowercase: 'One lowercase letter',
          digit: 'One number',
        },
      },
    },
  },
} as const;
