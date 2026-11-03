export function backupOffice(root: string, environment?: NodeJS.ProcessEnv): Promise<string | null>;
export function restoreOffice(
  root: string,
  snapshot: string,
  environment?: NodeJS.ProcessEnv,
): Promise<void>;
export function diagnoseOffice(
  root: string,
  environment?: NodeJS.ProcessEnv,
): Promise<Record<string, unknown>>;
export function unregisterHooks(root: string, environment?: NodeJS.ProcessEnv): Promise<boolean>;
