import * as git from '../lib/git.js';
import * as config from '../lib/config.js';
import * as output from '../lib/output.js';

export async function comCommand(): Promise<void> {
  if (!git.isGitRepo()) {
    output.error('Not in a git repository');
    process.exit(1);
  }

  const trunk = config.getTrunkBranch();

  git.checkoutBranch(trunk);

  // Pull latest if remote exists
  if (git.hasRemote(trunk)) {
    git.pull();
    output.success(`Switched to ${trunk} and pulled latest`);
  } else {
    output.success(`Switched to ${trunk}`);
  }
}
