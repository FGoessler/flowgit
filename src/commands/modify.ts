import * as git from '../lib/git.js';
import * as output from '../lib/output.js';
import { handleStaging } from '../lib/staging.js';

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
  const staging = await handleStaging(status);
  if (staging.cancelled) return;
  const hasStagedChanges = staging.hasStagedChanges;

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
