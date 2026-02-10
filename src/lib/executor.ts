import { execSync, ExecSyncOptions } from 'child_process';

export interface ExecOptions {
  cwd?: string;
  encoding?: BufferEncoding;
}

/**
 * Interface for executing shell commands.
 * Can be mocked in tests to intercept external API calls.
 */
export interface CommandExecutor {
  exec(command: string, options?: ExecOptions): string;
}

/**
 * Real command executor that uses Node's execSync
 */
export class RealCommandExecutor implements CommandExecutor {
  exec(command: string, options: ExecOptions = {}): string {
    try {
      const execOptions: ExecSyncOptions = {
        encoding: options.encoding || 'utf-8',
        cwd: options.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      };

      return execSync(command, execOptions).toString().trim();
    } catch (error: any) {
      if (error.status !== 0) {
        throw new Error(`Command failed: ${command}\n${error.message}`);
      }
      return '';
    }
  }
}

/**
 * Global executor instance - can be replaced in tests
 */
let globalExecutor: CommandExecutor = new RealCommandExecutor();

/**
 * Get the current command executor
 */
export function getExecutor(): CommandExecutor {
  return globalExecutor;
}

/**
 * Set the command executor (for testing)
 */
export function setExecutor(executor: CommandExecutor): void {
  globalExecutor = executor;
}

/**
 * Reset to the real executor (for cleanup in tests)
 */
export function resetExecutor(): void {
  globalExecutor = new RealCommandExecutor();
}
