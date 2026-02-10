import * as git from '../lib/git.js';
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

  // Fetch from origin
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
    git.checkoutBranch(currentBranch);
  }

  // Analyze tracked branches
  const trackedBranches = config.getTrackedBranches().filter(b => b !== trunk);
  const mergedBranches: string[] = [];
  const divergedBranches: string[] = [];
  let syncedCount = 0;

  output.separator();

  for (const branchName of trackedBranches) {
    // Check if branch still exists
    if (!git.branchExists(branchName)) {
      config.removeTrackedBranch(branchName);
      continue;
    }

    // Check if merged
    if (git.isMerged(branchName, trunk)) {
      mergedBranches.push(branchName);
      continue;
    }

    // Check if behind remote
    if (git.hasRemote(branchName)) {
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
    git.checkoutBranch(currentBranch);
  }

  // Handle merged branches
  if (mergedBranches.length > 0) {
    output.separator();
    output.info('Merged branches:');
    mergedBranches.forEach(b => output.log(`  - ${b}`));

    const shouldDelete = await prompts.promptConfirmation('Delete merged branches?', false);

    if (shouldDelete) {
      for (const branchName of mergedBranches) {
        // Don't delete if currently on this branch
        if (branchName === currentBranch) {
          git.checkoutBranch(trunk);
        }

        try {
          // Before deleting, adopt children to grandparent
          adoptChildrenToGrandparent(branchName, trunk);

          git.deleteBranch(branchName);
          config.removeTrackedBranch(branchName);
          output.success(`Deleted ${branchName}`);
        } catch (error: any) {
          output.error(`Failed to delete ${branchName}: ${error.message}`);
        }
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
  output.success(`Synced ${syncedCount} tracked branch(es)`);
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
