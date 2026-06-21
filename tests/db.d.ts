export function setupTestDb(): void;
export function withTx(fn: () => Promise<void>): Promise<void>;
