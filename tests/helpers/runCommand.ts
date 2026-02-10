import * as inquirerPrompts from '@inquirer/prompts';
import { TestRepository } from './testRepo';

/**
 * Options for running a command in tests
 */
export interface RunCommandOptions {
  cwd?: string;
  prompts?: Record<string, any>;
}

/**
 * Mock inquirer prompts with predetermined answers
 */
export function mockPrompts(answers: Record<string, any>): void {
  const mock = inquirerPrompts as any;
  if (mock.setMockAnswers) {
    mock.setMockAnswers(answers);
  }
}

/**
 * Clear all prompt mocks
 */
export function clearPromptMocks(): void {
  const mock = inquirerPrompts as any;
  if (mock.clearMockAnswers) {
    mock.clearMockAnswers();
  }
}

/**
 * Run a CLI command for testing
 */
export async function runCommand(
  args: string[],
  repo: TestRepository,
  options: RunCommandOptions = {}
): Promise<void> {
  // Set up prompts if provided
  if (options.prompts) {
    mockPrompts(options.prompts);
  }

  // Import command dynamically based on first arg
  const commandName = args[0];
  const commandModule = await import(`../../src/commands/${commandName}`);
  const commandFn = commandModule[`${commandName}Command`];

  if (!commandFn) {
    throw new Error(`Command '${commandName}' not found`);
  }

  // Change working directory temporarily
  const originalCwd = process.cwd();
  try {
    process.chdir(options.cwd || repo.path);

    // Parse options from args (e.g., --current)
    const commandOptions: Record<string, any> = {};
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('--')) {
        const key = arg.substring(2);
        // Check if next arg is a value or another flag
        if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
          commandOptions[key] = args[++i];
        } else {
          commandOptions[key] = true;
        }
      } else {
        // Positional argument (like branch name for 'co')
        commandOptions._positional = commandOptions._positional || [];
        commandOptions._positional.push(arg);
      }
    }

    // Execute command
    await commandFn(commandOptions._positional?.[0], commandOptions);
  } finally {
    process.chdir(originalCwd);
    clearPromptMocks();
  }
}
