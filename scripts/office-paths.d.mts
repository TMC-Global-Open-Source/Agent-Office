export interface OfficePaths {
  dataDirectory: string;
  envPath: string;
  databaseDirectory: string;
  manifestPath: string;
  legacy: boolean;
  installation?: {
    dataDirectory: string;
    nodePath?: string;
    installationRoot?: string;
    initialized?: boolean;
  };
}
export function resolveOfficePaths(root: string, environment?: NodeJS.ProcessEnv): OfficePaths;
export function defaultDataDirectory(environment?: NodeJS.ProcessEnv): string;
export function resolveDatabaseUrl(url: string, databaseDirectory: string): string;
export function loadOfficeEnvironment(root: string): OfficePaths;
