import { select, input, confirm, checkbox } from '@inquirer/prompts';
import { StagingChoice, GitStatusFile } from '../types/index.js';
import * as output from './output.js';

/**
 * Handle prompt cancellation (ESC key or Ctrl+C)
 */
function handleCancellation(error: any): never {
  // For debugging: log the error details
  console.error('Prompt error:', { name: error.name, message: error.message, code: error.code });

  // Check for various cancellation error types
  const isCancellation =
    error.name === 'ExitPromptError' ||
    error.name === 'CancelPromptError' ||
    error.message?.includes('User force closed') ||
    error.message?.includes('canceled') ||
    error.message?.includes('cancelled') ||
    error.code === 'ERR_USE_AFTER_CLOSE' ||
    // ESC key in new inquirer
    error instanceof Error && !error.message;

  if (isCancellation) {
    output.info('Cancelled');
    process.exit(0);
  }

  // If it's any other error during prompt, treat as cancellation too
  // This catches cases where the user interrupts the prompt in unexpected ways
  if (error instanceof Error) {
    output.info('Cancelled');
    process.exit(0);
  }

  throw error;
}

/**
 * Prompt for staging options when there are unstaged changes
 */
export async function promptStagingChoice(): Promise<StagingChoice> {
  try {
    const choice = await select({
      message: 'You have unstaged changes. What would you like to do?',
      choices: [
        { name: 'Stage all', value: 'all' },
        { name: 'Select files', value: 'select' },
        { name: 'Cancel', value: 'cancel' },
      ],
    });
    return choice as StagingChoice;
  } catch (error) {
    return handleCancellation(error);
  }
}

/**
 * Prompt for file selection
 */
export async function promptFileSelection(files: GitStatusFile[]): Promise<string[]> {
  try {
    const selected = await checkbox({
      message: 'Select files to stage:',
      choices: files.map(f => ({
        name: `${f.status} ${f.path}`,
        value: f.path,
        checked: f.staged,
      })),
    });
    return selected;
  } catch (error) {
    return handleCancellation(error);
  }
}

/**
 * Prompt for commit message
 */
export async function promptCommitMessage(): Promise<string> {
  try {
    const message = await input({
      message: 'Enter commit message:',
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Commit message cannot be empty';
        }
        return true;
      },
    });
    return message.trim();
  } catch (error) {
    return handleCancellation(error);
  }
}

/**
 * Prompt for branch name confirmation
 */
export async function promptBranchNameConfirmation(branchName: string): Promise<boolean> {
  try {
    const confirmed = await confirm({
      message: `Create branch '${branchName}'?`,
      default: true,
    });
    return confirmed;
  } catch (error) {
    return handleCancellation(error);
  }
}

/**
 * Prompt for yes/no confirmation
 */
export async function promptConfirmation(message: string, defaultValue: boolean = false): Promise<boolean> {
  try {
    const confirmed = await confirm({
      message,
      default: defaultValue,
    });
    return confirmed;
  } catch (error) {
    return handleCancellation(error);
  }
}

/**
 * Prompt for text input
 */
export async function promptInput(message: string, defaultValue: string = ''): Promise<string> {
  try {
    const value = await input({
      message,
      default: defaultValue,
    });
    return value;
  } catch (error) {
    return handleCancellation(error);
  }
}

/**
 * Prompt for branch selection
 */
export async function promptBranchSelection(
  branches: Array<{ name: string; description: string }>,
  message: string = 'Select a branch:'
): Promise<string> {
  try {
    const branch = await select({
      message,
      choices: branches.map(b => ({
        name: b.description,
        value: b.name,
      })),
    });
    return branch;
  } catch (error) {
    return handleCancellation(error);
  }
}
