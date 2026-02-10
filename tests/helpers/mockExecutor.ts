import { CommandExecutor } from '../../src/lib/executor';
import { execSync } from 'child_process';

export interface CommandMock {
  pattern: string | RegExp;
  response: string | ((cmd: string) => string);
}

/**
 * Mock executor for testing that allows selective command mocking
 * Falls back to real execution for unmocked commands
 */
export class MockExecutor implements CommandExecutor {
  private mocks: CommandMock[] = [];
  private calls: string[] = [];

  /**
   * Register a command mock
   */
  onCommand(pattern: string | RegExp): CommandMockBuilder {
    return new CommandMockBuilder(this, pattern);
  }

  /**
   * Add a mock (used internally by CommandMockBuilder)
   */
  addMock(mock: CommandMock): void {
    this.mocks.push(mock);
  }

  /**
   * Execute a command - uses mock if available, otherwise falls back to real execution
   */
  exec(command: string, options?: { cwd?: string }): string {
    this.calls.push(command);

    // Check if command matches any mock
    for (const mock of this.mocks) {
      const matches =
        typeof mock.pattern === 'string'
          ? command.includes(mock.pattern)
          : mock.pattern.test(command);

      if (matches) {
        const response =
          typeof mock.response === 'function'
            ? mock.response(command)
            : mock.response;
        return response;
      }
    }

    // Fall back to real execution for unmocked commands (like git)
    try {
      return execSync(command, {
        encoding: 'utf-8',
        cwd: options?.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
        .toString()
        .trim();
    } catch (error: any) {
      throw new Error(`Command failed: ${command}\n${error.message}`);
    }
  }

  /**
   * Get all executed commands
   */
  getCalls(): string[] {
    return [...this.calls];
  }

  /**
   * Get calls matching a pattern
   */
  getCallsMatching(pattern: string | RegExp): string[] {
    return this.calls.filter(cmd =>
      typeof pattern === 'string' ? cmd.includes(pattern) : pattern.test(cmd)
    );
  }

  /**
   * Clear call history
   */
  clearCalls(): void {
    this.calls = [];
  }

  /**
   * Reset all mocks and calls
   */
  reset(): void {
    this.mocks = [];
    this.calls = [];
  }
}

/**
 * Builder for command mocks
 */
class CommandMockBuilder {
  constructor(
    private executor: MockExecutor,
    private pattern: string | RegExp
  ) {}

  returns(response: string | ((cmd: string) => string)): void {
    this.executor.addMock({
      pattern: this.pattern,
      response,
    });
  }
}
