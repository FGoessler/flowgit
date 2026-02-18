import * as git from '../lib/git.js';
import * as config from '../lib/config.js';
import * as gh from '../lib/gh.js';
import * as branch from '../lib/branch.js';
import * as prompts from '../lib/prompts.js';
import * as output from '../lib/output.js';
import * as claude from '../lib/claude.js';

export async function submitCommand(options: { current?: boolean } = {}): Promise<void> {
  // Check if in a git repo
  if (!git.isGitRepo()) {
    output.error('Not in a git repository');
    process.exit(1);
  }

  // Check if gh is authenticated
  if (!gh.isGhAuthenticated()) {
    output.error('GitHub CLI not authenticated. Run "gh auth login" first.');
    process.exit(1);
  }

  const currentBranch = git.getCurrentBranch();
  const trunk = config.getTrunkBranch();

  if (currentBranch === trunk) {
    output.error(`Cannot submit from trunk branch (${trunk})`);
    process.exit(1);
  }

  // Determine which branches to submit
  let branchesToSubmit: string[];

  if (options.current) {
    // Only submit current branch
    branchesToSubmit = [currentBranch];
  } else {
    // Submit full stack from trunk to current
    branchesToSubmit = config.getStackToTrunk(currentBranch, trunk);
  }

  if (branchesToSubmit.length === 0) {
    output.error('No branches to submit');
    process.exit(1);
  }

  // Show what will be submitted
  if (branchesToSubmit.length > 1) {
    output.info(`Submitting ${branchesToSubmit.length} branches in stack:`);
    branchesToSubmit.forEach(b => output.log(`  - ${b}`));
    output.separator();
  }

  // Push each branch
  for (const branchName of branchesToSubmit) {
    await pushBranch(branchName);
  }

  output.separator();

  // Create/update PRs for each branch
  for (const branchName of branchesToSubmit) {
    await createOrUpdatePR(branchName, trunk);
  }
}

async function pushBranch(branchName: string): Promise<void> {
  const hasRemoteTracking = git.hasRemote(branchName);

  if (hasRemoteTracking) {
    // Check if remote has changes
    git.fetch();
    const { ahead, behind } = git.compareWithRemote(branchName);

    if (behind > 0) {
      // Remote is ahead - force push automatically
      output.info(`Remote has changes on '${branchName}', force pushing...`);
      const spin = output.spinner(`Force pushing ${branchName}...`);
      git.push(branchName, false, true);
      spin.succeed(`Force pushed ${branchName}`);
    } else if (ahead > 0) {
      // Local is ahead - regular push
      const spin = output.spinner(`Pushing ${branchName}...`);
      git.push(branchName, false, false);
      spin.succeed(`Pushed ${branchName}`);
    } else {
      output.info(`${branchName} is up to date`);
    }
  } else {
    // No remote tracking - push with -u
    const spin = output.spinner(`Pushing ${branchName} to origin...`);
    git.push(branchName, true, false);
    spin.succeed(`Pushed ${branchName} to origin`);
  }
}

async function createOrUpdatePR(branchName: string, trunk: string): Promise<void> {
  // Check if PR already exists
  const existingPR = gh.getPRForBranch(branchName);

  if (existingPR) {
    output.success(`Pushed PR #${existingPR.number}: ${existingPR.title}`);
    output.log(`  ${existingPR.url}`);

    const updateDescription = await prompts.promptConfirmation(
      'Update PR description?',
      false,
    );

    if (updateDescription) {
      const parentBranch = config.getParentBranch(branchName) || trunk;
      await regeneratePRDescription(existingPR.number, branchName, parentBranch, existingPR.title);
    }

    return;
  }

  // Create new PR
  const parentBranch = config.getParentBranch(branchName) || trunk;

  // Get PR title from first commit
  const firstCommitMessage = git.getFirstCommitMessage(branchName, parentBranch);
  const prTitle = branch.formatPRTitle(firstCommitMessage);

  // Generate PR description using Claude CLI if available
  let prBody = '';
  if (claude.isClaudeInstalled()) {
    const spin = output.spinner('Generating PR description with Claude...');
    try {
      prBody = claude.generatePRDescription(branchName, parentBranch, prTitle);
      spin.succeed('Generated PR description');
    } catch (error: any) {
      spin.fail('Failed to generate description');
      output.warning(error.message);
    }
  }

  const spin = output.spinner('Creating PR...');
  try {
    const pr = gh.createPR(prTitle, prBody, parentBranch);
    spin.succeed(`Created PR #${pr.number}: ${pr.title} (${branchName} → ${parentBranch})`);
    output.log(`  ${pr.url}`);

    // Automatically open the PR in browser (skip in tests)
    if (!process.env.JEST_WORKER_ID) {
      try {
        const { execSync } = require('child_process');
        const platform = process.platform;
        const openCommand = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
        execSync(`${openCommand} "${pr.url}"`, { stdio: 'ignore' });
      } catch {
        // Ignore if browser open fails
      }
    }
  } catch (error: any) {
    spin.stop();
    // Check if error is because PR already exists
    if (error.message.includes('already exists')) {
      // Extract URL from error message if present
      const urlMatch = error.message.match(/(https:\/\/github\.com\/[^\s]+)/);
      if (urlMatch) {
        output.success(`Updated existing PR: ${urlMatch[1]}`);

        // Open the existing PR in browser (skip in tests)
        if (!process.env.JEST_WORKER_ID) {
          try {
            const { execSync } = require('child_process');
            const platform = process.platform;
            const openCommand = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
            execSync(`${openCommand} "${urlMatch[1]}"`, { stdio: 'ignore' });
          } catch {
            // Ignore if browser open fails
          }
        }
      } else {
        output.success(`Updated existing PR for branch '${branchName}'`);
      }
    } else {
      output.error(`Failed to create PR: ${error.message}`);
    }
  }
}

async function regeneratePRDescription(
  prNumber: number,
  branchName: string,
  parentBranch: string,
  prTitle: string,
): Promise<void> {
  if (!claude.isClaudeInstalled()) {
    output.warning('Claude CLI not installed — cannot generate description.');
    return;
  }

  const spin = output.spinner('Generating PR description with Claude...');
  try {
    const body = claude.generatePRDescription(branchName, parentBranch, prTitle);
    spin.succeed('Generated PR description');

    const updateSpin = output.spinner('Updating PR description...');
    gh.updatePRBody(prNumber, body);
    updateSpin.succeed('Updated PR description');
  } catch (error: any) {
    spin.fail('Failed to generate description');
    output.warning(error.message);
  }
}
