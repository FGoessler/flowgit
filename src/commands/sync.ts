import * as git from '../lib/git.js';
import * as gh from '../lib/gh.js';
import * as config from '../lib/config.js';
import * as prompts from '../lib/prompts.js';
import * as output from '../lib/output.js';

export async function syncCommand(): Promise<void> {
  // Check if in a git repo
  if (!git.isGitRepo()) {
    output.error('Not in a git repository');
    process.exit(1);
  }

  const trunk = config.getTrunkBranch();
  const currentBranch = git.getCurrentBranch();

  // Fetch from origin with --prune to remove stale remote tracking branches
  const fetchSpin = output.spinner('Fetching from origin...');
  git.fetch();
  fetchSpin.succeed('Fetched from origin');

  // Update trunk
  const updateSpin = output.spinner(`Updating ${trunk}...`);
  try {
    git.checkoutBranch(trunk);
    git.pull();
    updateSpin.succeed(`Updated ${trunk}`);
  } catch (error: any) {
    updateSpin.fail(`Failed to update ${trunk}`);
    output.error(error.message);
    process.exit(1);
  }

  // Go back to original branch if not on trunk
  if (currentBranch !== trunk) {
    try {
      git.checkoutBranch(currentBranch);
    } catch {
      // Branch may have issues, stay on trunk
    }
  }

  // Batch-fetch PR statuses from GitHub (single API call)
  let prStatuses = new Map<string, { state: string; merged: boolean }>();
  const ghAuthenticated = gh.isGhAuthenticated();
  if (ghAuthenticated) {
    const prSpin = output.spinner('Checking PR statuses...');
    try {
      prStatuses = gh.getAllPRStatuses();
      prSpin.succeed(`Checked ${prStatuses.size} PR(s)`);
    } catch {
      prSpin.fail('Could not fetch PR statuses');
    }
  }

  // Analyze tracked branches
  const trackedBranches = config.getTrackedBranches().filter(b => b !== trunk);
  const mergedBranches: string[] = [];
  const closedBranches: string[] = [];
  const divergedBranches: string[] = [];
  let syncedCount = 0;

  output.separator();

  for (const branchName of trackedBranches) {
    // Check if branch still exists locally
    if (!git.branchExists(branchName)) {
      config.removeTrackedBranch(branchName);
      continue;
    }

    // 1. Check if merged locally (works for regular merges)
    if (git.isMerged(branchName, trunk)) {
      mergedBranches.push(branchName);
      continue;
    }

    // 2. Check PR status on GitHub (catches squash merges, closed PRs)
    const prStatus = prStatuses.get(branchName);
    if (prStatus) {
      if (prStatus.merged || prStatus.state === 'MERGED') {
        mergedBranches.push(branchName);
        continue;
      }
      if (prStatus.state === 'CLOSED') {
        closedBranches.push(branchName);
        continue;
      }
    }

    // 3. Check if remote branch was deleted (after --prune fetch)
    //    If a branch was pushed before but origin/<branch> is now gone,
    //    the remote branch was deleted (typically after merge on GitHub)
    const wasEverPushed = git.hasUpstream(branchName);
    const remoteExists = git.hasRemote(branchName);
    if (wasEverPushed && !remoteExists) {
      mergedBranches.push(branchName);
      continue;
    }

    // 4. Check if behind/ahead of remote for fast-forward
    if (remoteExists) {
      const { ahead, behind } = git.compareWithRemote(branchName);

      if (behind > 0 && ahead === 0) {
        // Can fast-forward
        try {
          git.checkoutBranch(branchName);
          git.pull();
          output.success(`Fast-forwarded ${branchName} (${behind} commits)`);
          syncedCount++;
        } catch {
          divergedBranches.push(branchName);
        }
      } else if (behind > 0 && ahead > 0) {
        // Diverged
        divergedBranches.push(branchName);
      }
    }
  }

  // Go back to original branch
  if (currentBranch !== trunk && git.branchExists(currentBranch)) {
    try {
      git.checkoutBranch(currentBranch);
    } catch {
      // Stay where we are
    }
  }

  // Handle merged branches
  if (mergedBranches.length > 0) {
    output.separator();
    output.info('Merged branches:');
    mergedBranches.forEach(b => output.log(`  - ${b}`));

    const shouldDelete = await prompts.promptConfirmation('Delete merged branches?', true);

    if (shouldDelete) {
      for (const branchName of mergedBranches) {
        await deleteBranchCleanly(branchName, currentBranch, trunk);
      }
    }
  }

  // Handle closed branches (PR closed without merge)
  if (closedBranches.length > 0) {
    output.separator();
    output.info('Branches with closed PRs (not merged):');
    closedBranches.forEach(b => output.log(`  - ${b}`));

    const shouldDelete = await prompts.promptConfirmation('Delete branches with closed PRs?', false);

    if (shouldDelete) {
      for (const branchName of closedBranches) {
        await deleteBranchCleanly(branchName, currentBranch, trunk);
      }
    }
  }

  // Show diverged branches
  if (divergedBranches.length > 0) {
    output.separator();
    output.warning('Diverged branches (manual rebase needed):');
    divergedBranches.forEach(b => output.log(`  - ${b}`));
  }

  // Summary
  output.separator();
  const deleted = mergedBranches.length + closedBranches.length;
  if (deleted > 0) {
    output.success(`Cleaned up ${deleted} branch(es), synced ${syncedCount} branch(es)`);
  } else {
    output.success(`Synced ${syncedCount} tracked branch(es)`);
  }
}

/**
 * Delete a branch cleanly: adopt children, switch if needed, delete, untrack.
 */
async function deleteBranchCleanly(branchName: string, currentBranch: string, trunk: string): Promise<void> {
  // Don't delete if currently on this branch
  if (branchName === currentBranch) {
    git.checkoutBranch(trunk);
  }

  try {
    // Before deleting, adopt children to grandparent
    adoptChildrenToGrandparent(branchName, trunk);

    // Try normal delete first, fall back to force delete for squash-merged branches
    try {
      git.deleteBranch(branchName);
    } catch {
      git.forceDeleteBranch(branchName);
    }
    config.removeTrackedBranch(branchName);
    output.success(`Deleted ${branchName}`);
  } catch (error: any) {
    output.error(`Failed to delete ${branchName}: ${error.message}`);
  }
}

/**
 * When deleting a branch, update its children to point to its parent (adopt grandparent)
 */
function adoptChildrenToGrandparent(branchToDelete: string, trunk: string): void {
  const children = config.getChildren(branchToDelete);

  if (children.length === 0) {
    return;
  }

  // Get the parent of the branch being deleted
  const grandparent = config.getParentBranch(branchToDelete) || trunk;

  // Update each child to point to grandparent
  for (const child of children) {
    config.setParentBranch(child, grandparent);
    output.info(`  Updated ${child} to point to ${grandparent}`);
  }
}
