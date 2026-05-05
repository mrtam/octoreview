declare const chrome: {
  runtime: {
    openOptionsPage(): void;
  };
  storage: {
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
