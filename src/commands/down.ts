import * as git from '../lib/git.js';
import * as config from '../lib/config.js';
import * as output from '../lib/output.js';

export async function downCommand(): Promise<void> {
  // Check if in a git repo
  if (!git.isGitRepo()) {
    output.error('Not in a git repository');
    process.exit(1);
  }

  const currentBranch = git.getCurrentBranch();
  const trunk = config.getTrunkBranch();

  // Check if already on trunk
  if (currentBranch === trunk) {
    output.error(`Already at trunk (${trunk})`);
    process.exit(1);
  }

  // Get parent branch
  const parentBranch = config.getParentBranch(currentBranch);

  if (!parentBranch) {
    output.error(`No parent branch found for '${currentBranch}'`);
    process.exit(1);
  }

  // If parent is trunk, show different message
  if (parentBranch === trunk) {
    output.error(`Already at trunk (${trunk})`);
    process.exit(1);
  }

  // Checkout parent branch
  git.checkoutBranch(parentBranch);
  output.success(`Switched to branch '${parentBranch}'`);
}
