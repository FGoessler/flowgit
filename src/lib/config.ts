import { getExecutor } from './executor.js';

/**
 * Get a git config value
 */
function getConfig(key: string, cwd?: string): string | null {
  try {
    const executor = getExecutor();
    return executor.exec(`git config --get ${key}`, { cwd });
  } catch {
    return null;
  }
}

/**
 * Set a git config value
 */
function setConfig(key: string, value: string, cwd?: string): void {
  const executor = getExecutor();
  executor.exec(`git config ${key} "${value}"`, { cwd });
}

/**
 * Get all tracked branches
 */
export function getTrackedBranches(cwd?: string): string[] {
  const tracked = getConfig('flowgit.tracked', cwd);
  if (!tracked) {
    return [];
  }
  return tracked.split(',').filter(b => b.trim());
}

/**
 * Add a branch to the tracked list
 */
export function addTrackedBranch(branchName: string, cwd?: string): void {
  const tracked = getTrackedBranches(cwd);
  if (!tracked.includes(branchName)) {
    tracked.push(branchName);
    setConfig('flowgit.tracked', tracked.join(','), cwd);
  }
}

/**
 * Remove a branch from the tracked list
 */
export function removeTrackedBranch(branchName: string, cwd?: string): void {
  const tracked = getTrackedBranches(cwd);
  const filtered = tracked.filter(b => b !== branchName);
  if (filtered.length > 0) {
    setConfig('flowgit.tracked', filtered.join(','), cwd);
  } else {
    // Unset if empty
    try {
      const executor = getExecutor();
      executor.exec('git config --unset flowgit.tracked', { cwd });
    } catch {
      // Ignore if already unset
    }
  }
}

/**
 * Get the parent branch for a given branch
 */
export function getParentBranch(branchName: string, cwd?: string): string | null {
  return getConfig(`flowgit.branch.${branchName}.parent`, cwd);
}

/**
 * Set the parent branch for a given branch
 */
export function setParentBranch(branchName: string, parentBranch: string, cwd?: string): void {
  setConfig(`flowgit.branch.${branchName}.parent`, parentBranch, cwd);
}

/**
 * Get all children of a branch (branches that have this branch as parent)
 */
export function getChildren(branchName: string, cwd?: string): string[] {
  const tracked = getTrackedBranches(cwd);
  return tracked.filter(branch => getParentBranch(branch, cwd) === branchName);
}

/**
 * Get the full stack from a branch to trunk
 * Returns branches in order from trunk to the given branch
 */
export function getStackToTrunk(branchName: string, trunk: string = 'main', cwd?: string): string[] {
  const stack: string[] = [];
  let current = branchName;

  while (current && current !== trunk) {
    stack.unshift(current);
    const parent = getParentBranch(current, cwd);
    if (!parent || parent === trunk) {
      break;
    }
    current = parent;
  }

  return stack;
}

/**
 * Get the default trunk branch (main or master)
 */
export function getTrunkBranch(): string {
  // For now, hardcoded to 'main'
  // TODO: Make this configurable
  return 'main';
}
