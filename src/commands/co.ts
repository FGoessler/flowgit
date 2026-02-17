import * as git from '../lib/git.js';
import * as config from '../lib/config.js';
import * as prompts from '../lib/prompts.js';
import * as output from '../lib/output.js';

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
    // Try to checkout from remote
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

  const currentBranch = git.getCurrentBranch();

  // Get checkout history for sorting
  const checkoutHistory = git.getCheckoutHistory();
  const branchLastCheckout = new Map<string, Date>();
  checkoutHistory.forEach(entry => {
    if (!branchLastCheckout.has(entry.branch)) {
      branchLastCheckout.set(entry.branch, entry.time);
    }
  });

  // Build branch list with descriptions
  const branches = trackedBranches
    .filter(branch => branch !== currentBranch) // Exclude current branch
    .map(branch => {
      let lastCommitMessage = '';
      try {
        lastCommitMessage = git.execGit(`log -1 --pretty=%s ${branch} 2>/dev/null`);
      } catch {
        lastCommitMessage = 'No commits';
      }

      const lastCheckout = branchLastCheckout.get(branch);
      const timeAgo = lastCheckout ? formatTimeAgo(lastCheckout) : 'never';

      return {
        name: branch,
        description: `${branch} (${lastCommitMessage}) - ${timeAgo}`,
        lastCheckout: lastCheckout || new Date(0),
      };
    })
    .sort((a, b) => b.lastCheckout.getTime() - a.lastCheckout.getTime());

  if (branches.length === 0) {
    output.info('No other tracked branches to switch to');
    return;
  }

  // Prompt for selection
  const selected = await prompts.promptBranchSelection(branches, 'Select a branch:');

  // Checkout the selected branch
  git.checkoutBranch(selected);
  output.success(`Switched to branch '${selected}'`);
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) {
    return 'just now';
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }

  const weeks = Math.floor(days / 7);
  if (weeks < 4) {
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  }

  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}
