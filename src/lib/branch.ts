/**
 * Convert a commit message to a kebab-case branch name
 */
export function commitMessageToBranchName(message: string): string {
  return message
    .toLowerCase()
    .trim()
    // Remove special characters except spaces and hyphens
    .replace(/[^a-z0-9\s-]/g, '')
    // Replace spaces with hyphens
    .replace(/\s+/g, '-')
    // Remove multiple consecutive hyphens
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Limit length to 50 characters
    .substring(0, 50)
    // Remove trailing hyphen if substring cut in the middle
    .replace(/-+$/g, '');
}

/**
 * Extract Linear ticket ID from a commit message
 * Matches patterns like PTL-1234, PROJ-123, etc.
 */
export function extractLinearTicketId(message: string): string | null {
  const match = message.match(/\b([A-Z]{2,}-\d+)\b/);
  return match ? match[1] : null;
}

/**
 * Format PR title - just use the commit message as-is
 */
export function formatPRTitle(commitMessage: string): string {
  return commitMessage;
}
