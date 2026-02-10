import * as git from '../lib/git.js';
import * as config from '../lib/config.js';
import * as prompts from '../lib/prompts.js';
import * as output from '../lib/output.js';

export async function upCommand(): Promise<void> {
  // Check if in a git repo
  if (!git.isGitRepo()) {
    output.error('Not in a git repository');
    process.exit(1);
  }

  const currentBranch = git.getCurrentBranch();

  // Get all children (branches that have current as parent)
  const children = config.getChildren(currentBranch);

  if (children.length === 0) {
    output.error(`No branches built on top of '${currentBranch}'`);
    process.exit(1);
  }

  let targetBranch: string;

  if (children.length === 1) {
    // Only one child, checkout directly
    targetBranch = children[0];
  } else {
    // Multiple children, show picker
    const branches = children.map(branch => {
      let lastCommitMessage = '';
      try {
        lastCommitMessage = git.execGit(`log -1 --pretty=%s ${branch} 2>/dev/null`);
      } catch {
        lastCommitMessage = 'No commits';
      }

      return {
        name: branch,
        description: `${branch} (${lastCommitMessage})`,
      };
    });

    targetBranch = await prompts.promptBranchSelection(
      branches,
      `Multiple branches built on '${currentBranch}':`
    );
  }

  // Checkout the selected branch
  git.checkoutBranch(targetBranch);
  output.success(`Switched to branch '${targetBranch}'`);
}
