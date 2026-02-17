import * as git from '../lib/git.js';
import * as config from '../lib/config.js';
import * as gh from '../lib/gh.js';
import * as output from '../lib/output.js';
import { select } from '@inquirer/prompts';
import chalk from 'chalk';

interface PRItem {
  number: number;
  title: string;
  url: string;
  branch: string;
  isDraft: boolean;
  state: string;
  reviewDecision?: string;
  statusCheckRollup?: any;
  comments?: {
    total: number;
    resolved: number;
  };
  category: string;
}

interface TodoCategory {
  title: string;
  items: PRItem[];
  priority: number;
}

export async function todoCommand(): Promise<void> {
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

  const spin = output.spinner('Fetching PRs and branch status...');

  let categories: Map<string, TodoCategory>;
  let localBranches: string[];

  try {
    // Fetch all relevant PRs
    categories = fetchAndCategorizePRs();

    // Get local tracked branches that don't have PRs
    localBranches = getLocalBranches(categories);

    spin.succeed('Loaded PRs and branches');
  } catch (error: any) {
    spin.fail('Failed to fetch PRs');
    output.error(error.message);
    process.exit(1);
  }

  // Display outside try/catch so prompt cancellation propagates cleanly
  await displayTodoList(categories!, localBranches!);
}

const PR_FIELDS = 'number,title,url,headRefName,isDraft,state,reviewDecision,statusCheckRollup';

/**
 * Fetch PRs and organize into categories
 */
function fetchAndCategorizePRs(): Map<string, TodoCategory> {
  const categories = new Map<string, TodoCategory>();

  // Initialize categories
  categories.set('needs-my-review', {
    title: '📋 PRs Needing Your Review',
    items: [],
    priority: 1,
  });
  categories.set('change-requests', {
    title: '🔴 Your PRs with Change Requests',
    items: [],
    priority: 2,
  });
  categories.set('awaiting-review', {
    title: '⏳ Your PRs Awaiting Review',
    items: [],
    priority: 3,
  });
  categories.set('approved', {
    title: '✅ Your Approved PRs',
    items: [],
    priority: 4,
  });
  categories.set('draft', {
    title: '📝 Your Draft PRs',
    items: [],
    priority: 5,
  });

  // Fetch PRs where you're requested as reviewer
  try {
    const reviewRequested = fetchPRs('review-requested:@me state:open');
    reviewRequested.forEach(pr => {
      pr.category = 'needs-my-review';
      categories.get('needs-my-review')!.items.push(pr);
    });
  } catch (e) {
    // Ignore if search fails
  }

  // Fetch your PRs
  try {
    const myPRs = fetchPRs('author:@me state:open');

    myPRs.forEach(pr => {
      if (pr.isDraft) {
        pr.category = 'draft';
        categories.get('draft')!.items.push(pr);
      } else if (pr.reviewDecision === 'CHANGES_REQUESTED') {
        pr.category = 'change-requests';
        categories.get('change-requests')!.items.push(pr);
      } else if (pr.reviewDecision === 'APPROVED') {
        pr.category = 'approved';
        categories.get('approved')!.items.push(pr);
      } else {
        pr.category = 'awaiting-review';
        categories.get('awaiting-review')!.items.push(pr);
      }
    });
  } catch (e) {
    // Ignore if fetch fails
  }

  return categories;
}

/**
 * Fetch PRs using gh CLI via executor
 */
function fetchPRs(searchQuery: string): PRItem[] {
  const prs = gh.searchPRs(searchQuery, PR_FIELDS);

  return prs.map((pr: any) => {
    const total = gh.getPRCommentCount(pr.number);
    const resolved = gh.getPRResolvedThreadCount(pr.number);

    return {
      number: pr.number,
      title: pr.title,
      url: pr.url,
      branch: pr.headRefName,
      isDraft: pr.isDraft,
      state: pr.state,
      reviewDecision: pr.reviewDecision,
      statusCheckRollup: pr.statusCheckRollup,
      comments: { total, resolved },
      category: '',
    };
  });
}

/**
 * Get local tracked branches that don't have PRs
 */
function getLocalBranches(categories: Map<string, TodoCategory>): string[] {
  const tracked = config.getTrackedBranches();
  const trunk = config.getTrunkBranch();

  // Get all PR branch names
  const prBranches = new Set<string>();
  for (const category of categories.values()) {
    for (const pr of category.items) {
      prBranches.add(pr.branch);
    }
  }

  // Filter out trunk and branches that have PRs
  return tracked.filter(branch => branch !== trunk && !prBranches.has(branch));
}

/**
 * Display interactive todo list
 */
async function displayTodoList(
  categories: Map<string, TodoCategory>,
  localBranches: string[]
): Promise<void> {
  const choices: Array<{ name: string; value: string; description?: string; disabled?: boolean | string }> = [];

  // Sort categories by priority
  const sortedCategories = Array.from(categories.values()).sort(
    (a, b) => a.priority - b.priority
  );

  // Build choice list
  for (const category of sortedCategories) {
    if (category.items.length === 0) continue;

    // Add category header as disabled (non-selectable but visible)
    choices.push({
      name: chalk.bold(`\n${category.title}`),
      value: `header-${category.title}`,
      disabled: '',
    });

    // Add PRs in this category
    for (const pr of category.items) {
      const indicators = buildIndicators(pr);
      const name = `  ${indicators} #${pr.number} ${pr.title}`;

      choices.push({
        name,
        value: `pr-${pr.number}`,
        description: pr.url,
      });
    }
  }

  // Add local branches without PRs
  if (localBranches.length > 0) {
    choices.push({
      name: chalk.bold('\n🔧 Local Branches (No PR)'),
      value: 'header-local',
      disabled: '',
    });

    for (const branch of localBranches) {
      choices.push({
        name: `  ${branch}`,
        value: `branch-${branch}`,
        description: '',
      });
    }
  }

  if (choices.length === 0) {
    output.success('All caught up! No PRs or branches need attention. 🎉');
    return;
  }

  // Show selection in a loop so Cancel returns to the menu
  let keepGoing = true;
  while (keepGoing) {
    try {
      const selected = await select({
        message: 'Select a PR or branch:',
        choices,
        pageSize: 20,
      });

      if (selected.startsWith('pr-')) {
        const prNumber = parseInt(selected.replace('pr-', ''));
        keepGoing = await handlePRSelection(prNumber);
      } else if (selected.startsWith('branch-')) {
        const branch = selected.replace('branch-', '');
        keepGoing = await handleBranchSelection(branch);
      }
    } catch (error: any) {
      // User cancelled with ESC
      output.info('Cancelled');
      process.exit(0);
    }
  }
}

/**
 * Build indicator string for a PR
 */
function buildIndicators(pr: PRItem): string {
  const indicators: string[] = [];

  // CI status - statusCheckRollup is an array of CheckRun objects
  if (pr.statusCheckRollup && Array.isArray(pr.statusCheckRollup) && pr.statusCheckRollup.length > 0) {
    // Filter out malformed checks (where name/status/conclusion are undefined)
    const checks = pr.statusCheckRollup.filter((c: any) => c && c.name);

    // Check for failures or errors
    const hasFailure = checks.some((c: any) =>
      c.conclusion === 'FAILURE' ||
      c.conclusion === 'ERROR' ||
      c.conclusion === 'TIMED_OUT' ||
      c.conclusion === 'ACTION_REQUIRED'
    );

    // Check for pending/in-progress
    const hasPending = checks.some((c: any) =>
      c.status === 'IN_PROGRESS' ||
      c.status === 'QUEUED' ||
      c.status === 'PENDING' ||
      c.status === 'REQUESTED' ||
      c.status === 'WAITING' ||
      (c.status !== 'COMPLETED' && !c.conclusion)
    );

    // Determine overall state
    if (hasFailure) {
      indicators.push(chalk.red('✗'));
    } else if (hasPending) {
      indicators.push(chalk.yellow('⋯'));
    } else {
      // All checks completed successfully
      indicators.push(chalk.green('✓'));
    }
  } else {
    // No checks or empty array
    indicators.push(chalk.gray('○'));
  }

  // Comment status
  if (pr.comments && pr.comments.total > 0) {
    const ratio = `${pr.comments.resolved}/${pr.comments.total}`;
    const color = pr.comments.resolved === pr.comments.total ? chalk.green : chalk.yellow;
    indicators.push(color(`💬${ratio}`));
  }

  // Draft indicator
  if (pr.isDraft) {
    indicators.push(chalk.gray('[Draft]'));
  }

  return indicators.join(' ');
}

/**
 * Handle PR selection
 * @returns true to show menu again, false to exit
 */
async function handlePRSelection(prNumber: number): Promise<boolean> {
  const action = await select({
    message: `What would you like to do with PR #${prNumber}?`,
    choices: [
      { name: 'Checkout branch', value: 'checkout' },
      { name: 'Open in browser', value: 'open' },
      { name: 'Cancel', value: 'cancel' },
    ],
  });

  if (action === 'cancel') {
    return true; // Return to main menu
  }

  if (action === 'checkout') {
    try {
      const branch = gh.getPRBranchName(prNumber);

      if (git.branchExists(branch)) {
        git.checkoutBranch(branch);
        output.success(`Checked out branch '${branch}'`);
      } else {
        git.fetch();
        git.checkoutBranch(branch);
        config.addTrackedBranch(branch);
        output.success(`Checked out branch '${branch}'`);
      }
    } catch (error: any) {
      output.error(`Failed to checkout branch: ${error.message}`);
      return true; // Return to menu on error
    }
  } else if (action === 'open') {
    try {
      gh.openPRInBrowser(prNumber);
    } catch (error: any) {
      output.error(`Failed to open PR: ${error.message}`);
      return true; // Return to menu on error
    }
  }

  return false; // Exit after successful action
}

/**
 * Handle branch selection
 * @returns true to show menu again, false to exit
 */
async function handleBranchSelection(branch: string): Promise<boolean> {
  const action = await select({
    message: `What would you like to do with branch '${branch}'?`,
    choices: [
      { name: 'Checkout branch', value: 'checkout' },
      { name: 'Create PR', value: 'create-pr' },
      { name: 'Cancel', value: 'cancel' },
    ],
  });

  if (action === 'cancel') {
    return true; // Return to main menu
  }

  if (action === 'checkout') {
    try {
      git.checkoutBranch(branch);
      output.success(`Checked out branch '${branch}'`);
    } catch (error: any) {
      output.error(`Failed to checkout branch: ${error.message}`);
      return true; // Return to menu on error
    }
  } else if (action === 'create-pr') {
    try {
      output.info('Opening PR creation...');
      gh.createPRWeb();
    } catch (error: any) {
      output.error(`Failed to create PR: ${error.message}`);
      return true; // Return to menu on error
    }
  }

  return false; // Exit after successful action
}
