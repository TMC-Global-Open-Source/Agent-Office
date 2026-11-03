export function prepareInstallation(
  root: string,
  environment?: NodeJS.ProcessEnv,
): Promise<{
  dataDirectory: string;
  installationRoot: string;
  nodePath: string;
  initialized: boolean;
}>;
export function assertPortAvailable(
  settings: Record<string, string>,
  environment?: NodeJS.ProcessEnv,
): Promise<void>;
