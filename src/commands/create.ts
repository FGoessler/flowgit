import * as git from '../lib/git.js';
import * as config from '../lib/config.js';
import * as prompts from '../lib/prompts.js';
import * as branch from '../lib/branch.js';
import * as output from '../lib/output.js';
import { handleStaging } from '../lib/staging.js';

export async function createCommand(): Promise<void> {
  // Check if in a git repo
  if (!git.isGitRepo()) {
    output.error('Not in a git repository');
    process.exit(1);
  }

  const currentBranch = git.getCurrentBranch();
  const status = git.getStatus();

  // Handle staging
  const staging = await handleStaging(status);
  if (staging.cancelled) return;
  let hasStagedChanges = staging.hasStagedChanges;

  // If still no staged changes, ask if they want to create an empty branch
  if (!hasStagedChanges) {
    const createEmpty = await prompts.promptConfirmation(
      'No changes to commit. Create empty branch?',
      false
    );

    if (!createEmpty) {
      output.info('Cancelled');
      return;
    }
  }

  // Prompt for commit message
  const commitMessage = await prompts.promptCommitMessage();

  // Derive branch name
  const branchName = branch.commitMessageToBranchName(commitMessage);

  // Check if branch already exists
  if (git.branchExists(branchName)) {
    if (currentBranch === branchName) {
      // Already on this branch - just commit here
      if (hasStagedChanges) {
        git.commit(commitMessage);
        output.success(`Committed on '${branchName}'`);
      } else {
        output.info('No changes to commit');
      }
      return;
    }

    // Branch exists but we're on a different branch
    const commitHere = await prompts.promptConfirmation(
      `Branch '${branchName}' already exists. Commit on current branch '${currentBranch}' instead?`,
      true,
    );

    if (!commitHere) {
      output.info('Cancelled');
      return;
    }

    if (hasStagedChanges) {
      git.commit(commitMessage);
      output.success(`Committed on '${currentBranch}'`);
    }
    return;
  }

  // Create the branch
  git.createBranch(branchName);

  // Commit changes if there are any
  if (hasStagedChanges) {
    git.commit(commitMessage);
  }

  // Mark as tracked
  config.addTrackedBranch(branchName);

  // Set parent branch
  const trunk = config.getTrunkBranch();
  if (currentBranch && currentBranch !== trunk) {
    config.setParentBranch(branchName, currentBranch);
    output.success(
      `Created branch '${branchName}' (parent: ${currentBranch})${hasStagedChanges ? ' and committed changes' : ''}`
    );
  } else {
    config.setParentBranch(branchName, trunk);
    output.success(`Created branch '${branchName}'${hasStagedChanges ? ' and committed changes' : ''}`);
  }
}
