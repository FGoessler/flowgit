import * as git from '../lib/git.js';
import * as prompts from '../lib/prompts.js';
import * as output from '../lib/output.js';

export async function modifyCommand(): Promise<void> {
  // Check if in a git repo
  if (!git.isGitRepo()) {
    output.error('Not in a git repository');
    process.exit(1);
  }

  // Check if there's a commit to amend
  try {
    git.getLastCommitMessage();
  } catch {
    output.error('No commits to amend');
    process.exit(1);
  }

  const currentBranch = git.getCurrentBranch();
  const status = git.getStatus();

  // Check if there are any changes
  if (!status.hasChanges) {
    output.error('No changes to amend');
    process.exit(1);
  }

  // Handle staging
  let hasStagedChanges = status.hasStagedChanges;

  if (status.hasChanges && !status.hasStagedChanges) {
    // Has changes but nothing staged - ask what to do
    const choice = await prompts.promptStagingChoice();

    if (choice === 'cancel') {
      output.info('Cancelled');
      return;
    }

    if (choice === 'all') {
      git.stageAll();
      hasStagedChanges = true;
      output.success('Staged all changes');
    } else if (choice === 'select') {
      const selectedFiles = await prompts.promptFileSelection(status.files);
      if (selectedFiles.length === 0) {
        output.info('No files selected');
        return;
      }
      git.stageFiles(selectedFiles);
      hasStagedChanges = true;
      output.success(`Staged ${selectedFiles.length} file(s)`);
    }
  }

  if (!hasStagedChanges) {
    output.error('No staged changes to amend');
    return;
  }

  // Warn if branch has been pushed
  if (git.hasRemote(currentBranch)) {
    output.warning('Branch has been pushed. You\'ll need to force push.');
  }

  // Amend the commit
  git.amendCommit();

  const commitMessage = git.getLastCommitMessage();
  output.success(`Amended commit: ${commitMessage}`);
}
