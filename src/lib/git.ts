import { GitStatus, GitStatusFile } from '../types/index.js';
import { getExecutor } from './executor.js';

/**
 * Execute a git command and return the output
 */
export function execGit(command: string, cwd?: string): string {
  const executor = getExecutor();
  return executor.exec(`git ${command}`, { cwd });
}

/**
 * Check if we're in a git repository
 */
export function isGitRepo(cwd?: string): boolean {
  try {
    execGit('rev-parse --git-dir', cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current branch name
 */
export function getCurrentBranch(cwd?: string): string {
  return execGit('branch --show-current', cwd);
}

/**
 * Get git status with parsed file information
 */
export function getStatus(cwd?: string): GitStatus {
  const output = execGit('status --porcelain', cwd);

  if (!output) {
    return {
      hasChanges: false,
      hasStagedChanges: false,
      hasUnstagedChanges: false,
      files: [],
    };
  }

  const files: GitStatusFile[] = output
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => {
      const status = line.substring(0, 2);
      // The path starts after the status (2 chars) and at least one space
      // Find the first non-space character after position 2
      let pathStart = 2;
      while (pathStart < line.length && line[pathStart] === ' ') {
        pathStart++;
      }
      const path = line.substring(pathStart);
      const staged = status[0] !== ' ' && status[0] !== '?';

      return { path, status, staged };
    });

  return {
    hasChanges: files.length > 0,
    hasStagedChanges: files.some(f => f.staged),
    hasUnstagedChanges: files.some(f => !f.staged),
    files,
  };
}

/**
 * Stage all changes
 */
export function stageAll(cwd?: string): void {
  execGit('add -A', cwd);
}

/**
 * Stage specific files
 */
export function stageFiles(files: string[], cwd?: string): void {
  files.forEach(file => {
    // Use single quotes to prevent shell variable expansion
    // Escape any single quotes in the filename
    const escapedFile = file.replace(/'/g, "'\\''");
    execGit(`add '${escapedFile}'`, cwd);
  });
}

/**
 * Create a new branch
 */
export function createBranch(branchName: string, cwd?: string): void {
  execGit(`checkout -b ${branchName}`, cwd);
}

/**
 * Check if a branch exists locally
 */
export function branchExists(branchName: string, cwd?: string): boolean {
  try {
    execGit(`rev-parse --verify ${branchName}`, cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checkout a branch
 */
export function checkoutBranch(branchName: string, cwd?: string): void {
  execGit(`checkout ${branchName}`, cwd);
}

/**
 * Create a commit with a message
 */
export function commit(message: string, cwd?: string): void {
  execGit(`commit -m "${message.replace(/"/g, '\\"')}"`, cwd);
}

/**
 * Amend the last commit without changing the message
 */
export function amendCommit(cwd?: string): void {
  execGit('commit --amend --no-edit', cwd);
}

/**
 * Get the last commit message
 */
export function getLastCommitMessage(cwd?: string): string {
  try {
    return execGit('log -1 --pretty=%B', cwd);
  } catch {
    throw new Error('No commits found');
  }
}

/**
 * Check if branch has a remote tracking branch
 */
export function hasRemote(branchName: string, cwd?: string): boolean {
  try {
    execGit(`rev-parse --verify origin/${branchName}`, cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch from origin
 */
export function fetch(cwd?: string): void {
  execGit('fetch origin', cwd);
}

/**
 * Push branch to origin
 */
export function push(branchName: string, setUpstream: boolean = false, force: boolean = false, cwd?: string): void {
  let command = 'push';
  if (setUpstream) {
    command += ` -u origin ${branchName}`;
  }
  if (force) {
    command += ' --force-with-lease';
  }
  execGit(command, cwd);
}

/**
 * Compare local and remote branches
 * Returns { ahead, behind }
 */
export function compareWithRemote(branchName: string, cwd?: string): { ahead: number; behind: number } {
  try {
    const output = execGit(`rev-list --left-right --count origin/${branchName}...${branchName}`, cwd);
    const [behind, ahead] = output.split('\t').map(Number);
    return { ahead, behind };
  } catch {
    return { ahead: 0, behind: 0 };
  }
}

/**
 * Get list of all local branches
 */
export function getAllBranches(cwd?: string): string[] {
  const output = execGit('branch --format="%(refname:short)"', cwd);
  return output.split('\n').filter(b => b.trim());
}

/**
 * Get the first commit message on a branch after it diverged from parent
 */
export function getFirstCommitMessage(branchName: string, parentBranch: string, cwd?: string): string {
  try {
    return execGit(`log ${parentBranch}..${branchName} --pretty=%B --reverse | head -n 1`, cwd);
  } catch {
    return getLastCommitMessage(cwd);
  }
}

/**
 * Get the diff between two branches
 */
export function getDiff(fromBranch: string, toBranch: string, cwd?: string): string {
  try {
    return execGit(`diff ${fromBranch}...${toBranch}`, cwd);
  } catch (error) {
    return '';
  }
}

/**
 * Check if a branch has been merged into another branch
 */
export function isMerged(branchName: string, targetBranch: string, cwd?: string): boolean {
  try {
    const merged = execGit(`branch --merged ${targetBranch}`, cwd);
    return merged.includes(branchName);
  } catch {
    return false;
  }
}

/**
 * Delete a branch
 */
export function deleteBranch(branchName: string, cwd?: string): void {
  execGit(`branch -d ${branchName}`, cwd);
}

/**
 * Pull latest changes for current branch
 */
export function pull(cwd?: string): void {
  execGit('pull', cwd);
}

/**
 * Rebase current branch onto another branch
 */
export function rebase(targetBranch: string, cwd?: string): void {
  execGit(`rebase ${targetBranch}`, cwd);
}

/**
 * Get reflog entries for branch checkouts
 */
export function getCheckoutHistory(cwd?: string): Array<{ branch: string; time: Date }> {
  try {
    const output = execGit('reflog --date=iso | grep "checkout:"', cwd);
    const entries = output.split('\n');

    return entries.map(entry => {
      const match = entry.match(/checkout: moving from .+ to (.+)$/);
      const dateMatch = entry.match(/\{(.+)\}/);

      if (match && dateMatch) {
        return {
          branch: match[1],
          time: new Date(dateMatch[1]),
        };
      }
      return null;
    }).filter(Boolean) as Array<{ branch: string; time: Date }>;
  } catch {
    return [];
  }
}
