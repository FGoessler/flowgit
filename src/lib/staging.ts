import { GitStatus } from '../types/index.js';
import * as git from './git.js';
import * as prompts from './prompts.js';
import * as output from './output.js';

/**
 * Handle interactive staging of files.
 * Returns true if there are staged changes ready to commit, false otherwise.
 * May return early (via the caller checking the result) if the user cancels.
 */
export async function handleStaging(status: GitStatus): Promise<{ hasStagedChanges: boolean; cancelled: boolean }> {
  // If files are already staged, proceed directly without prompting
  if (status.hasStagedChanges) {
    return { hasStagedChanges: true, cancelled: false };
  }

  let hasStagedChanges = false;

  if (status.hasChanges && status.hasUnstagedChanges) {
    const choice = await prompts.promptStagingChoice();

    if (choice === 'cancel') {
      output.info('Cancelled');
      return { hasStagedChanges, cancelled: true };
    }

    if (choice === 'all') {
      git.stageAll();
      hasStagedChanges = true;
      output.success('Staged all changes');
    } else if (choice === 'select') {
      const selectedFiles = await prompts.promptFileSelection(status.files);
      if (selectedFiles.length === 0) {
        if (!hasStagedChanges) {
          output.info('No files selected');
          return { hasStagedChanges: false, cancelled: true };
        }
        // Proceed with pre-staged files
      } else {
        git.stageFiles(selectedFiles);
        hasStagedChanges = true;
        output.success(`Staged ${selectedFiles.length} file(s)`);
      }
    }
  }

  return { hasStagedChanges, cancelled: false };
}
