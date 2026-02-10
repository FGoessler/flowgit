import * as git from '../lib/git.js';
import * as config from '../lib/config.js';
import * as prompts from '../lib/prompts.js';
import * as output from '../lib/output.js';

export async function restackCommand(): Promise<void> {
  // Check if in a git repo
  if (!git.isGitRepo()) {
    output.error('Not in a git repository');
    process.exit(1);
  }

  const currentBranch = git.getCurrentBranch();
  const trunk = config.getTrunkBranch();

  // Can't restack trunk
  if (currentBranch === trunk) {
    output.error(`Cannot restack trunk branch (${trunk})`);
    process.exit(1);
  }

  // Get parent branch
  const parentBranch = config.getParentBranch(currentBranch) || trunk;

  // Fetch latest changes
  const fetchSpin = output.spinner('Fetching from origin...');
  try {
    git.fetch();
    fetchSpin.succeed('Fetched from origin');
  } catch (error: any) {
    fetchSpin.fail('Failed to fetch');
    output.warning('Continuing without fetch');
  }

  // Update parent branch if it has a remote
  if (parentBranch !== trunk && git.hasRemote(parentBranch)) {
    try {
      const originalBranch = git.getCurrentBranch();
      git.checkoutBranch(parentBranch);
      git.pull();
      git.checkoutBranch(originalBranch);
      output.success(`Updated ${parentBranch}`);
    } catch (error: any) {
      output.warning(`Could not update ${parentBranch}: ${error.message}`);
    }
  }

  // Rebase current branch onto parent
  const rebaseSpin = output.spinner(`Rebasing ${currentBranch} onto ${parentBranch}...`);
  try {
    git.rebase(parentBranch);
    rebaseSpin.succeed(`Rebased ${currentBranch} onto ${parentBranch}`);
  } catch (error: any) {
    rebaseSpin.fail('Rebase failed');
    output.error('Rebase conflicts. Resolve manually and run \'git rebase --continue\'');
    process.exit(1);
  }

  // Check if current branch has children
  const children = config.getChildren(currentBranch);

  if (children.length > 0) {
    // Ask if user wants to rebase children too
    const shouldRestackChildren = await prompts.promptConfirmation(
      'Rebase children branches too?',
      true
    );

    if (shouldRestackChildren) {
      let restackedCount = 0;
      const originalBranch = currentBranch;

      for (const child of children) {
        try {
          // Checkout child and rebase
          git.checkoutBranch(child);
          const childRebaseSpin = output.spinner(`Rebasing ${child} onto ${originalBranch}...`);

          git.rebase(originalBranch);
          childRebaseSpin.succeed(`Rebased ${child} onto ${originalBranch}`);
          restackedCount++;

          // Recursively restack grandchildren
          await restackChildrenRecursive(child);
        } catch (error: any) {
          output.error(`Failed to rebase ${child}: ${error.message}`);
          output.warning('Stopping restack. Fix conflicts and run restack again.');
          process.exit(1);
        }
      }

      // Return to original branch
      git.checkoutBranch(originalBranch);

      if (restackedCount > 0) {
        output.success(`Restacked ${restackedCount + 1} branch(es)`);
      }
    }
  }
}

/**
 * Recursively restack all descendants of a branch
 */
async function restackChildrenRecursive(branchName: string): Promise<void> {
  const children = config.getChildren(branchName);

  for (const child of children) {
    git.checkoutBranch(child);
    const spin = output.spinner(`Rebasing ${child} onto ${branchName}...`);

    try {
      git.rebase(branchName);
      spin.succeed(`Rebased ${child} onto ${branchName}`);

      // Recursively restack this child's children
      await restackChildrenRecursive(child);
    } catch (error: any) {
      spin.fail(`Failed to rebase ${child}`);
      throw error;
    }
  }
}
