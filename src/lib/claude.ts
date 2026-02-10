import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

/**
 * Check if Claude CLI is installed
 */
export function isClaudeInstalled(): boolean {
  try {
    execSync('which claude', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a PR description using Claude CLI
 */
export function generatePRDescription(
  branchName: string,
  parentBranch: string,
  title: string
): string {
  if (!isClaudeInstalled()) {
    throw new Error('Claude CLI not installed. Install from: https://code.claude.com/download');
  }

  // Check for PR template
  let templateNote = '';
  const templatePaths = [
    '.github/PULL_REQUEST_TEMPLATE.md',
    '.github/pull_request_template.md',
    'PULL_REQUEST_TEMPLATE.md',
    'pull_request_template.md',
  ];

  for (const templatePath of templatePaths) {
    if (existsSync(templatePath)) {
      templateNote = `\n\nNote: This repository has a PR template at ${templatePath}. Please follow its structure if applicable.`;
      break;
    }
  }

  // Build the prompt for Claude
  const prompt = `You are helping to write a pull request description.

PR Title: ${title}
Branch: ${branchName}
Parent Branch: ${parentBranch}

Please analyze the git diff between ${parentBranch} and ${branchName} (use your git tools to get the diff), and write a clear and concise PR description.

Focus on:
- What changes were made and why
- Any important implementation details
- Breaking changes or migration notes if applicable
${templateNote}

Keep it concise but informative. Use markdown formatting.

Write only the PR description (the body), not the title.`;

  try {
    // Call Claude CLI with the prompt
    const result = execSync(`claude "${prompt.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    // Clean up the response - remove common prefixes/separators
    let cleaned = result.trim();

    // Remove "Here's the PR description:" or similar intro lines
    cleaned = cleaned.replace(/^Here'?s?\s+(?:the\s+)?PR\s+description:?\s*/i, '');

    // Remove leading separators (---, ===, etc.)
    cleaned = cleaned.replace(/^[-=]+\s*\n+/, '');

    return cleaned.trim();
  } catch (error: any) {
    throw new Error(`Claude CLI error: ${error.message}`);
  }
}
