import * as tmp from 'tmp';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Helper class for managing temporary git repositories in tests
 */
export class TestRepository {
  public readonly path: string;
  private cleanup: (() => void) | null = null;

  constructor(repoPath: string, cleanup: () => void) {
    this.path = repoPath;
    this.cleanup = cleanup;
  }

  /**
   * Create a new temporary git repository
   */
  static create(): TestRepository {
    // Create temporary directory
    const tmpObj = tmp.dirSync({ unsafeCleanup: true });
    const repoPath = tmpObj.name;

    // Initialize git repo
    execSync('git init -b main', { cwd: repoPath, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: repoPath, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { cwd: repoPath, stdio: 'pipe' });

    // Create initial commit
    fs.writeFileSync(path.join(repoPath, '.gitkeep'), '');
    execSync('git add .gitkeep', { cwd: repoPath, stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', { cwd: repoPath, stdio: 'pipe' });

    return new TestRepository(repoPath, () => tmpObj.removeCallback());
  }

  /**
   * Write a file in the repository
   */
  writeFile(filename: string, content: string): void {
    const filePath = path.join(this.path, filename);
    const dir = path.dirname(filePath);

    // Create directories if needed
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, content);
  }

  /**
   * Read a file from the repository
   */
  readFile(filename: string): string {
    return fs.readFileSync(path.join(this.path, filename), 'utf-8');
  }

  /**
   * Check if a file exists
   */
  fileExists(filename: string): boolean {
    return fs.existsSync(path.join(this.path, filename));
  }

  /**
   * Execute a git command in the repository
   */
  git(command: string): string {
    return execSync(`git ${command}`, {
      cwd: this.path,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  }

  /**
   * Get current branch
   */
  currentBranch(): string {
    return this.git('branch --show-current');
  }

  /**
   * Get last commit message
   */
  lastCommitMessage(): string {
    return this.git('log -1 --pretty=%B');
  }

  /**
   * Get all branches
   */
  branches(): string[] {
    const output = this.git('branch --format="%(refname:short)"');
    return output.split('\n').filter(b => b.trim());
  }

  /**
   * Check if a branch exists
   */
  branchExists(name: string): boolean {
    return this.branches().includes(name);
  }

  /**
   * Get tracked branches from config
   */
  trackedBranches(): string[] {
    try {
      const tracked = this.git('config --get flowgit.tracked');
      return tracked.split(',').filter(b => b.trim());
    } catch {
      return [];
    }
  }

  /**
   * Get parent of a branch
   */
  parentBranch(branchName: string): string | null {
    try {
      return this.git(`config --get flowgit.branch.${branchName}.parent`);
    } catch {
      return null;
    }
  }

  /**
   * Get git status (porcelain format)
   */
  status(): string {
    return this.git('status --porcelain');
  }

  /**
   * Check if working directory is clean
   */
  isClean(): boolean {
    return this.status() === '';
  }

  /**
   * Get list of staged files
   */
  stagedFiles(): string[] {
    const status = this.status();
    if (!status) return [];

    return status
      .split('\n')
      .filter(line => line[0] !== ' ' && line[0] !== '?')
      .map(line => line.substring(3));
  }

  /**
   * Create a bare remote repository
   */
  createRemote(): string {
    const remotePath = path.join(this.path, '..', `remote-${Date.now()}.git`);

    // Create bare repo
    execSync(`git init --bare ${remotePath}`, { stdio: 'pipe' });

    // Add remote to this repo
    this.git(`remote add origin ${remotePath}`);

    // Push main branch
    try {
      this.git('push -u origin main');
    } catch (error) {
      // If push fails, try with force
      this.git('push -u origin main --force');
    }

    return remotePath;
  }

  /**
   * Clean up the temporary repository
   */
  destroy(): void {
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = null;
    }
  }
}
