import * as git from '../lib/git.js';
import * as config from '../lib/config.js';
import * as output from '../lib/output.js';
import { showBranchPicker } from '../lib/branch-picker.js';

export async function coCommand(branchName?: string): Promise<void> {
  // Check if in a git repo
  if (!git.isGitRepo()) {
    output.error('Not in a git repository');
    process.exit(1);
  }

  // If branch name provided, checkout directly
  if (branchName) {
    await checkoutByName(branchName);
    return;
  }

  // Otherwise, show interactive picker
  await checkoutInteractive();
}

async function checkoutByName(branchName: string): Promise<void> {
  // Check if branch exists locally
  if (git.branchExists(branchName)) {
    git.checkoutBranch(branchName);
    config.addTrackedBranch(branchName);
    output.success(`Switched to branch '${branchName}'`);
    return;
  }

  // Try to fetch from remote
  const spin = output.spinner('Fetching branch from origin...');
  try {
    git.fetch();
    git.execGit(`checkout -b ${branchName} origin/${branchName}`);
    spin.succeed('Fetched and switched to branch');
    config.addTrackedBranch(branchName);
    output.success(`Switched to branch '${branchName}'`);
  } catch {
    spin.fail();
    output.error(`Branch '${branchName}' not found`);
    process.exit(1);
  }
}

async function checkoutInteractive(): Promise<void> {
  const trackedBranches = config.getTrackedBranches();

  if (trackedBranches.length === 0) {
    output.error('No tracked branches. Use "fgt checkout <branch-name>" to checkout a branch.');
    process.exit(1);
  }

  const selected = await showBranchPicker();

  if (!selected) {
    output.info('No other tracked branches to switch to');
    return;
  }

  git.checkoutBranch(selected);
  output.success(`Switched to branch '${selected}'`);
}
