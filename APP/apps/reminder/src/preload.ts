import { contextBridge, ipcRenderer } from 'electron';

interface DesktopConfigInput {
  apiBaseUrl?: string;
  webBaseUrl?: string;
  email?: string;
  deviceName?: string;
  openAtLogin?: boolean;
  autoStartOnLaunch?: boolean;
}

contextBridge.exposeInMainWorld('reminderDesktop', {
  bootstrap: () => ipcRenderer.invoke('desktop:bootstrap'),
  saveConfig: (input: DesktopConfigInput) => ipcRenderer.invoke('desktop:save-config', input),
  requestCode: (input: { apiBaseUrl: string; email: string; deviceName: string }) =>
    ipcRenderer.invoke('desktop:request-code', input),
  login: (input: {
    apiBaseUrl: string;
    webBaseUrl: string;
    email: string;
    code: string;
    deviceName: string;
    openAtLogin: boolean;
    autoStartOnLaunch: boolean;
  }) => ipcRenderer.invoke('desktop:login', input),
  startRuntime: () => ipcRenderer.invoke('desktop:start-runtime'),
  stopRuntime: () => ipcRenderer.invoke('desktop:stop-runtime'),
  logout: () => ipcRenderer.invoke('desktop:logout'),
  openDataDir: () => ipcRenderer.invoke('desktop:open-data-dir'),
  onRuntimeEvent: (listener: (payload: Record<string, unknown>) => void) => {
    const handler = (_event: unknown, payload: Record<string, unknown>) => {
      listener(payload);
    };

    ipcRenderer.on('desktop:runtime-event', handler);
    return () => {
      ipcRenderer.removeListener('desktop:runtime-event', handler);
    };
  },
});
