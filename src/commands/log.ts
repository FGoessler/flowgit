import * as git from '../lib/git.js';
import * as config from '../lib/config.js';
import * as gh from '../lib/gh.js';
import * as output from '../lib/output.js';
import chalk from 'chalk';

interface StackNode {
  name: string;
  children: StackNode[];
  pr?: { number: number; state: string; merged: boolean };
  isCurrent: boolean;
}

export async function logCommand(): Promise<void> {
  // Check if in a git repo
  if (!git.isGitRepo()) {
    output.error('Not in a git repository');
    process.exit(1);
  }

  const currentBranch = git.getCurrentBranch();
  const trunk = config.getTrunkBranch();
  const trackedBranches = config.getTrackedBranches();

  // Build tree structure
  const tree = buildStackTree(trackedBranches, currentBranch, trunk);

  // Display the tree
  output.log(''); // Empty line
  displayTree(tree, '', true, currentBranch);
  output.log(''); // Empty line
}

/**
 * Build a tree structure of branches
 */
function buildStackTree(
  trackedBranches: string[],
  currentBranch: string,
  trunk: string
): StackNode {
  // Create root node (trunk)
  const root: StackNode = {
    name: trunk,
    children: [],
    isCurrent: currentBranch === trunk,
  };

  // Map of branch name to node
  const nodeMap = new Map<string, StackNode>();
  nodeMap.set(trunk, root);

  // Create nodes for all tracked branches
  for (const branch of trackedBranches) {
    if (branch !== trunk) {
      const node: StackNode = {
        name: branch,
        children: [],
        isCurrent: branch === currentBranch,
      };

      // Get PR info if available
      try {
        const pr = gh.getPRForBranch(branch);
        if (pr) {
          node.pr = {
            number: pr.number,
            state: pr.state,
            merged: pr.merged,
          };
        }
      } catch {
        // Ignore if gh fails
      }

      nodeMap.set(branch, node);
    }
  }

  // Build parent-child relationships
  for (const branch of trackedBranches) {
    if (branch === trunk) continue;

    const parent = config.getParentBranch(branch) || trunk;
    const parentNode = nodeMap.get(parent);
    const childNode = nodeMap.get(branch);

    if (parentNode && childNode) {
      parentNode.children.push(childNode);
    }
  }

  return root;
}

/**
 * Display the tree recursively
 */
function displayTree(
  node: StackNode,
  prefix: string,
  isLast: boolean,
  currentBranch: string
): void {
  // Determine line characters
  const connector = isLast ? '└─>' : '├─>';
  const continuer = isLast ? '   ' : '│  ';

  // Format branch name
  let branchDisplay = node.name;

  // Add PR info if available
  if (node.pr) {
    const prStatus = node.pr.merged
      ? chalk.gray(`#${node.pr.number} merged`)
      : chalk.green(`#${node.pr.number} ✓`);
    branchDisplay += ` (${prStatus})`;
  } else if (node.name !== config.getTrunkBranch()) {
    branchDisplay += chalk.gray(' (no PR)');
  }

  // Highlight current branch
  if (node.isCurrent) {
    branchDisplay += chalk.cyan(' ← current');
  }

  // Print the node
  if (prefix === '') {
    // Root node
    output.log(branchDisplay);
  } else {
    output.log(prefix + connector + ' ' + branchDisplay);
  }

  // Print children
  const childPrefix = prefix + (prefix === '' ? '' : continuer);
  node.children.forEach((child, index) => {
    const isLastChild = index === node.children.length - 1;
    displayTree(child, childPrefix, isLastChild, currentBranch);
  });
}
