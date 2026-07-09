declare global {
  interface Window {
    electronAPI?: {
      getAppVersion(): Promise<string>;
      openExternal(url: string): Promise<void>;
      platform: string;
    };
  }
}
export {};
