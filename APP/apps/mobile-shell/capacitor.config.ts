import type { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'com.sekerchat.android',
  appName: 'sekerchatForAndroid',

  webDir: 'src',

  server: {
    allowNavigation: ['*'],
  },

  // 不设 server.url — 首次启动加载本地 setup.html，用户输入线上地址后跳转

  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_launcher',
      iconColor: '#4880ff',
    },
    BackgroundRunner: {
      label: 'com.sekerchat.android.background',
      src: 'background.js',
      event: 'backgroundFetch',
      repeat: true,
      interval: 15,
      autoStart: true,
    },
  },

  android: {
    allowMixedContent: true,
  },
};

export default config;
