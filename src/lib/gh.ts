import { PRInfo } from '../types/index.js';
import { getExecutor } from './executor.js';

/**
 * Execute a gh command and return the output
 */
function execGh(command: string, cwd?: string): string {
  const executor = getExecutor();
  return executor.exec(`gh ${command}`, { cwd });
}

/**
 * Check if a PR exists for a branch
 */
export function getPRForBranch(branchName: string): PRInfo | null {
  try {
    // Try with just the branch name first
    let output = execGh(`pr list --head ${branchName} --json number,title,url,state,merged`);

    // If empty, try with origin/ prefix
    if (!output || output === '[]') {
      try {
        output = execGh(`pr list --head origin/${branchName} --json number,title,url,state,merged`);
      } catch {
        // Ignore error, will return null below
      }
    }

    if (!output || output === '[]') {
      return null;
    }

    const prs = JSON.parse(output);
    if (prs.length === 0) {
      return null;
    }

    const pr = prs[0];
    return {
      number: pr.number,
      title: pr.title,
      url: pr.url,
      state: pr.state,
      merged: pr.merged || false,
    };
  } catch (error) {
    // Silently return null - PR doesn't exist or can't be fetched
    return null;
  }
}

/**
 * Create a new PR
 */
export function createPR(title: string, body: string, baseBranch: string): PRInfo {
  try {
    // Create the PR (returns URL)
    const url = execGh(`pr create --title "${title}" --body "${body}" --base ${baseBranch}`).trim();

    // Fetch the PR details using the URL
    const output = execGh(`pr view ${url} --json number,title,url,state`);
    const pr = JSON.parse(output);

    return {
      number: pr.number,
      title: pr.title,
      url: pr.url,
      state: pr.state,
      merged: false,
    };
  } catch (error: any) {
    throw new Error(`Failed to create PR: ${error.message}`);
  }
}

/**
 * Check if gh CLI is installed and authenticated
 */
export function isGhAuthenticated(): boolean {
  try {
    execGh('auth status');
    return true;
  } catch {
    return false;
  }
}
