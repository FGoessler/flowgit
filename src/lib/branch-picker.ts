import { Separator } from '@inquirer/prompts';
import chalk from 'chalk';
import * as git from './git.js';
import * as config from './config.js';
import * as prompts from './prompts.js';

interface TreeNode {
  name: string;
  children: TreeNode[];
}

interface FlatBranch {
  name: string;
  depth: number;
}

/**
 * Show an interactive branch picker with tree visualization.
 * Returns the selected branch name, or null if no selectable branches.
 */
export async function showBranchPicker(message?: string): Promise<string | null> {
  const trackedBranches = config.getTrackedBranches();
  const trunk = config.getTrunkBranch();
  const currentBranch = git.getCurrentBranch();

  const { tree, standalone } = buildBranchTree(trackedBranches, trunk);

  // Get last commit message for each branch
  const commitMsgs = new Map<string, string>();
  for (const branch of [...new Set([...trackedBranches, trunk])]) {
    try {
      commitMsgs.set(branch, git.execGit(`log -1 --pretty=%s ${branch}`));
    } catch {
      commitMsgs.set(branch, '');
    }
  }

  const choices = buildTreeChoices(tree, standalone, currentBranch, trunk, commitMsgs);

  const selectableCount = choices.filter(c => !(c instanceof Separator)).length;
  if (selectableCount === 0) {
    return null;
  }

  return prompts.promptTreeSelection(choices, message);
}

function buildBranchTree(
  trackedBranches: string[],
  trunk: string,
): { tree: TreeNode; standalone: string[] } {
  const root: TreeNode = { name: trunk, children: [] };
  const nodeMap = new Map<string, TreeNode>();
  nodeMap.set(trunk, root);
  const standalone: string[] = [];

  for (const branch of trackedBranches) {
    if (branch === trunk) continue;
    const parent = config.getParentBranch(branch);
    if (parent) {
      nodeMap.set(branch, { name: branch, children: [] });
    } else {
      standalone.push(branch);
    }
  }

  for (const [branch, node] of nodeMap) {
    if (branch === trunk) continue;
    const parent = config.getParentBranch(branch)!;
    const parentNode = nodeMap.get(parent) || root;
    parentNode.children.push(node);
  }

  return { tree: root, standalone };
}

function flattenSubtree(node: TreeNode, depth: number): FlatBranch[] {
  const result: FlatBranch[] = [];
  for (const child of node.children) {
    result.push(...flattenSubtree(child, depth + 1));
  }
  result.push({ name: node.name, depth });
  return result;
}

function formatBranchLine(branch: string, commitMsgs: Map<string, string>): string {
  const msg = commitMsgs.get(branch) || '';
  return msg ? `${chalk.cyan(branch)}  ${chalk.dim(msg)}` : chalk.cyan(branch);
}

function buildTreeChoices(
  tree: TreeNode,
  standalone: string[],
  currentBranch: string,
  trunk: string,
  commitMsgs: Map<string, string>,
): Array<{ name: string; value: string } | Separator> {
  const choices: Array<{ name: string; value: string } | Separator> = [];

  const stacked: FlatBranch[] = [];
  for (const child of tree.children) {
    stacked.push(...flattenSubtree(child, 1));
  }

  for (const item of stacked) {
    addBranchChoice(choices, item.name, item.depth, currentBranch, commitMsgs);
  }

  addTrunkChoice(choices, trunk, currentBranch, commitMsgs);

  for (const branch of standalone) {
    addBranchChoice(choices, branch, 0, currentBranch, commitMsgs);
  }

  return choices;
}

function addBranchChoice(
  choices: Array<{ name: string; value: string } | Separator>,
  branch: string,
  depth: number,
  currentBranch: string,
  commitMsgs: Map<string, string>,
): void {
  const indent = '  '.repeat(depth);
  const display = formatBranchLine(branch, commitMsgs);

  if (branch === currentBranch) {
    choices.push(new Separator(`  ${indent}● ${display} ${chalk.dim('(you)')}`));
  } else {
    choices.push({ name: `${indent}○ ${display}`, value: branch });
  }
}

function addTrunkChoice(
  choices: Array<{ name: string; value: string } | Separator>,
  trunk: string,
  currentBranch: string,
  commitMsgs: Map<string, string>,
): void {
  const display = formatBranchLine(trunk, commitMsgs);

  if (trunk === currentBranch) {
    choices.push(new Separator(`  › ${display} ${chalk.dim('(you)')}`));
  } else {
    choices.push({ name: `› ${display}`, value: trunk });
  }
}
