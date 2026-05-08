declare const chrome: {
  action: {
    setBadgeBackgroundColor(details: { color: string }): Promise<void>;
    setBadgeText(details: { text: string }): Promise<void>;
    setIcon(details: { path: string | Record<number, string> | Record<string, string> }): Promise<void>;
  };
  alarms: {
    create(name: string, alarmInfo: { delayInMinutes?: number; periodInMinutes?: number }): Promise<void>;
    clear(name: string): Promise<boolean>;
    onAlarm: {
      addListener(listener: (alarm: { name: string }) => void): void;
    };
  };
  runtime: {
    openOptionsPage(): void;
    onInstalled: {
      addListener(listener: () => void): void;
    };
    onStartup: {
      addListener(listener: () => void): void;
    };
  };
  storage: {
    onChanged: {
      addListener(listener: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => void): void;
    };
    local: {
      get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    };
  };
  tabs: {
    create(options: { url: string; active?: boolean }): Promise<unknown>;
    update(options: { url: string }): Promise<unknown>;
  };
};
