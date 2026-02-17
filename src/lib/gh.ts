import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
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
 * Escape a string for safe use in single-quoted shell arguments.
 */
function shellEscape(str: string): string {
  return "'" + str.replace(/'/g, "'\\''") + "'";
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
  const tmpFile = join(tmpdir(), `fgt-pr-body-${Date.now()}.md`);
  try {
    writeFileSync(tmpFile, body);
    // Use --body-file to avoid shell escaping issues with backticks, $(), etc.
    const url = execGh(`pr create --title ${shellEscape(title)} --body-file ${shellEscape(tmpFile)} --base ${baseBranch}`).trim();

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
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

/**
 * Update the body of an existing PR
 */
export function updatePRBody(prNumber: number, body: string): void {
  const tmpFile = join(tmpdir(), `fgt-pr-body-${Date.now()}.md`);
  try {
    writeFileSync(tmpFile, body);
    execGh(`pr edit ${prNumber} --body-file ${shellEscape(tmpFile)}`);
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

/**
 * Batch-fetch PR statuses for all branches in a single API call.
 * Returns a map from branch name to { state, merged }.
 */
export function getAllPRStatuses(): Map<string, { state: string; merged: boolean }> {
  try {
    const output = execGh('pr list --state all --json headRefName,state,merged --limit 200');
    const prs = JSON.parse(output);
    const map = new Map<string, { state: string; merged: boolean }>();
    for (const pr of prs) {
      map.set(pr.headRefName, { state: pr.state, merged: pr.merged || false });
    }
    return map;
  } catch {
    return new Map();
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
