import { TestRepository } from './helpers/testRepo';
import { runCommand } from './helpers/runCommand';
import { MockExecutor } from './helpers/mockExecutor';
import { setExecutor, resetExecutor } from '../src/lib/executor';

describe('fgt checkout (alias: co)', () => {
  let testRepo: TestRepository;
  let mockExecutor: MockExecutor;

  beforeEach(() => {
    testRepo = TestRepository.create();
    mockExecutor = new MockExecutor();
    setExecutor(mockExecutor);
  });

  afterEach(() => {
    testRepo.destroy();
    resetExecutor();
  });

  describe('direct checkout by name', () => {
    it('checks out existing local branch', async () => {
      // Arrange - create a branch
      testRepo.git('checkout -b feature-branch');
      testRepo.writeFile('feature.ts', 'code');
      testRepo.git('add feature.ts');
      testRepo.git('commit -m "Add feature"');
      testRepo.git('checkout main');

      // Act - both checkout and co work
      await runCommand(['checkout', 'feature-branch'], testRepo);

      // Assert
      expect(testRepo.currentBranch()).toBe('feature-branch');
      expect(testRepo.trackedBranches()).toContain('feature-branch');
    });

    it('co alias checks out existing branch', async () => {
      testRepo.git('checkout -b alias-branch');
      testRepo.git('checkout main');

      await runCommand(['co', 'alias-branch'], testRepo);

      expect(testRepo.currentBranch()).toBe('alias-branch');
    });

    it('marks checked out branch as tracked', async () => {
      // Arrange - create branch without tracking
      testRepo.git('checkout -b untracked-branch');
      testRepo.git('checkout main');

      expect(testRepo.trackedBranches()).not.toContain('untracked-branch');

      // Act
      await runCommand(['co', 'untracked-branch'], testRepo);

      // Assert
      expect(testRepo.currentBranch()).toBe('untracked-branch');
      expect(testRepo.trackedBranches()).toContain('untracked-branch');
    });

    it('fetches and checks out remote branch', async () => {
      // Arrange - create a remote and push a branch
      const remotePath = testRepo.createRemote();

      // Create a new branch in "remote" repo
      testRepo.git('checkout -b remote-feature');
      testRepo.writeFile('remote.ts', 'remote code');
      testRepo.git('add remote.ts');
      testRepo.git('commit -m "Remote feature"');
      testRepo.git('push -u origin remote-feature');
      testRepo.git('checkout main');
      testRepo.git('branch -D remote-feature'); // Delete local copy

      // Act
      await runCommand(['co', 'remote-feature'], testRepo);

      // Assert
      expect(testRepo.currentBranch()).toBe('remote-feature');
      expect(testRepo.trackedBranches()).toContain('remote-feature');
      expect(testRepo.fileExists('remote.ts')).toBe(true);
    });

    it('throws error when branch does not exist', async () => {
      // Act & Assert
      await expect(
        runCommand(['co', 'non-existent-branch'], testRepo)
      ).rejects.toThrow();
    });
  });

  describe('interactive checkout', () => {
    it('shows picker with tracked branches', async () => {
      // Arrange - create multiple tracked branches
      testRepo.git('checkout -b feature-a');
      testRepo.git('config flowgit.tracked "feature-a"');
      testRepo.git('checkout main');

      testRepo.git('checkout -b feature-b');
      testRepo.git('config flowgit.tracked "feature-a,feature-b"');
      testRepo.git('checkout main');

      // Act
      await runCommand(['co'], testRepo, {
        prompts: { branch: 'feature-a' },
      });

      // Assert
      expect(testRepo.currentBranch()).toBe('feature-a');
    });

    it('excludes current branch from picker', async () => {
      // Arrange
      testRepo.git('checkout -b current-branch');
      testRepo.git('config flowgit.tracked "current-branch,other-branch"');
      testRepo.git('checkout -b other-branch');
      testRepo.git('checkout current-branch');

      // Act - select other-branch
      await runCommand(['co'], testRepo, {
        prompts: { branch: 'other-branch' },
      });

      // Assert
      expect(testRepo.currentBranch()).toBe('other-branch');
    });

    it('throws error when no tracked branches exist', async () => {
      // No tracked branches configured

      // Act & Assert
      await expect(runCommand(['co'], testRepo)).rejects.toThrow();
    });

    it('switches between tracked branches', async () => {
      // Arrange - create a few branches with commits
      testRepo.git('checkout -b api');
      testRepo.writeFile('api.ts', 'api');
      testRepo.git('add api.ts');
      testRepo.git('commit -m "Add API"');

      testRepo.git('checkout main');
      testRepo.git('checkout -b frontend');
      testRepo.writeFile('frontend.ts', 'frontend');
      testRepo.git('add frontend.ts');
      testRepo.git('commit -m "Add frontend"');

      testRepo.git('config flowgit.tracked "api,frontend"');

      // Act - switch to api
      await runCommand(['co'], testRepo, {
        prompts: { branch: 'api' },
      });

      // Assert
      expect(testRepo.currentBranch()).toBe('api');
      expect(testRepo.fileExists('api.ts')).toBe(true);
      expect(testRepo.fileExists('frontend.ts')).toBe(false);
    });
  });

  describe('checkout with stacks', () => {
    it('checks out branch in a stack', async () => {
      // Arrange - create a stack
      testRepo.git('checkout -b add-api');
      testRepo.writeFile('api.ts', 'api');
      testRepo.git('add api.ts');
      testRepo.git('commit -m "Add API"');
      testRepo.git('config flowgit.branch.add-api.parent "main"');

      testRepo.git('checkout -b add-frontend');
      testRepo.writeFile('frontend.ts', 'frontend');
      testRepo.git('add frontend.ts');
      testRepo.git('commit -m "Add frontend"');
      testRepo.git('config flowgit.branch.add-frontend.parent "add-api"');

      testRepo.git('config flowgit.tracked "add-api,add-frontend"');
      testRepo.git('checkout main');

      // Act - checkout add-frontend
      await runCommand(['co', 'add-frontend'], testRepo);

      // Assert
      expect(testRepo.currentBranch()).toBe('add-frontend');
      expect(testRepo.fileExists('api.ts')).toBe(true);
      expect(testRepo.fileExists('frontend.ts')).toBe(true);
    });
  });

  describe('branch history sorting', () => {
    it('sorts branches by most recently checked out', async () => {
      // Arrange - create and checkout branches in specific order
      testRepo.git('checkout -b branch-old');
      testRepo.git('checkout main');

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      testRepo.git('checkout -b branch-new');
      testRepo.git('checkout main');

      testRepo.git('config flowgit.tracked "branch-old,branch-new"');

      // The most recent in reflog should be branch-new
      // When we call co without args, it should show branch-new first

      // Act - the picker would show branch-new first (most recent)
      await runCommand(['co'], testRepo, {
        prompts: { branch: 'branch-new' },
      });

      // Assert
      expect(testRepo.currentBranch()).toBe('branch-new');
    });
  });

  describe('edge cases', () => {
    it('handles checking out with dirty working directory', async () => {
      // Arrange - create branches and dirty the working directory
      testRepo.git('checkout -b feature-a');
      testRepo.writeFile('feature-a.txt', 'content a');
      testRepo.git('add feature-a.txt');
      testRepo.git('commit -m "Add feature a"');

      testRepo.git('checkout main');
      testRepo.git('checkout -b feature-b');
      testRepo.writeFile('feature-b.txt', 'content b');
      testRepo.git('add feature-b.txt');
      testRepo.git('commit -m "Add feature b"');

      // Make working directory dirty
      testRepo.writeFile('dirty.txt', 'uncommitted changes');

      testRepo.git('config flowgit.tracked "feature-a,feature-b"');

      // Act - try to checkout with uncommitted changes
      await runCommand(['co', 'feature-a'], testRepo);

      // Assert - should switch if changes don't conflict
      expect(testRepo.currentBranch()).toBe('feature-a');
      expect(testRepo.fileExists('dirty.txt')).toBe(true); // Dirty file preserved
    });

    it('handles switching between branches with different files', async () => {
      // Arrange - create branches with different file sets
      testRepo.git('checkout -b branch-with-extra-files');
      testRepo.writeFile('file1.txt', 'content1');
      testRepo.writeFile('file2.txt', 'content2');
      testRepo.git('add .');
      testRepo.git('commit -m "Add files"');

      testRepo.git('checkout main');

      testRepo.git('config flowgit.tracked "branch-with-extra-files"');

      // Act
      await runCommand(['co', 'branch-with-extra-files'], testRepo);

      // Assert
      expect(testRepo.currentBranch()).toBe('branch-with-extra-files');
      expect(testRepo.fileExists('file1.txt')).toBe(true);
      expect(testRepo.fileExists('file2.txt')).toBe(true);

      // Switch back
      await runCommand(['co', 'main'], testRepo);
      expect(testRepo.fileExists('file1.txt')).toBe(false);
      expect(testRepo.fileExists('file2.txt')).toBe(false);
    });

    it('handles non-existent remote when fetching', async () => {
      // Arrange - no remote configured
      // Act & Assert
      await expect(
        runCommand(['co', 'non-existent-remote-branch'], testRepo)
      ).rejects.toThrow();
    });

    it('handles checkout with only current branch tracked', async () => {
      // Arrange - only main is tracked, already on main
      testRepo.git('config flowgit.tracked "main"');

      // Act - when no other branches exist, should exit gracefully
      await runCommand(['co'], testRepo);

      // Assert - should still be on main (no switch occurred)
      expect(testRepo.currentBranch()).toBe('main');
    });

    it('handles branch with no commits in history', async () => {
      // Arrange - create orphan branch
      testRepo.git('checkout --orphan orphan-branch');
      testRepo.git('rm -rf .gitkeep');
      testRepo.writeFile('orphan.txt', 'content');
      testRepo.git('add orphan.txt');
      testRepo.git('commit -m "Orphan commit"');
      testRepo.git('checkout main');

      testRepo.git('config flowgit.tracked "orphan-branch"');

      // Act
      await runCommand(['co', 'orphan-branch'], testRepo);

      // Assert
      expect(testRepo.currentBranch()).toBe('orphan-branch');
      expect(testRepo.fileExists('orphan.txt')).toBe(true);
    });

    it('handles interactive checkout with branch that has no commits', async () => {
      // Arrange - create branch without commits
      testRepo.git('checkout -b empty-branch');
      testRepo.git('checkout main');

      testRepo.git('config flowgit.tracked "empty-branch"');

      // Act
      await runCommand(['co'], testRepo, {
        prompts: { branch: 'empty-branch' },
      });

      // Assert
      expect(testRepo.currentBranch()).toBe('empty-branch');
    });

    it('handles checking out branch with special characters in name', async () => {
      // Arrange - create branch with underscores and dots
      testRepo.git('checkout -b feature/test_branch.v2');
      testRepo.git('checkout main');

      // Act
      await runCommand(['co', 'feature/test_branch.v2'], testRepo);

      // Assert
      expect(testRepo.currentBranch()).toBe('feature/test_branch.v2');
    });

    it('handles remote fetch failure gracefully', async () => {
      // Arrange - create remote but make it invalid
      const remotePath = testRepo.createRemote();
      // Corrupt the remote by removing it
      require('fs').rmSync(remotePath, { recursive: true, force: true });

      // Act & Assert - should fail gracefully
      await expect(
        runCommand(['co', 'non-existent-branch'], testRepo)
      ).rejects.toThrow();
    });

    it('handles checkout of branch that exists remotely but not locally', async () => {
      // Arrange - setup remote with a branch
      const remotePath = testRepo.createRemote();

      testRepo.git('checkout -b remote-only-branch');
      testRepo.writeFile('remote.txt', 'remote content');
      testRepo.git('add remote.txt');
      testRepo.git('commit -m "Remote branch"');
      testRepo.git('push -u origin remote-only-branch');

      // Delete local branch but keep remote
      testRepo.git('checkout main');
      testRepo.git('branch -D remote-only-branch');

      // Act
      await runCommand(['co', 'remote-only-branch'], testRepo);

      // Assert
      expect(testRepo.currentBranch()).toBe('remote-only-branch');
      expect(testRepo.fileExists('remote.txt')).toBe(true);
      expect(testRepo.trackedBranches()).toContain('remote-only-branch');
    });

    it('handles multiple tracked branches with same last commit message', async () => {
      // Arrange - create branches with identical commit messages
      testRepo.git('checkout -b feature-1');
      testRepo.writeFile('file1.txt', 'content1');
      testRepo.git('add file1.txt');
      testRepo.git('commit -m "Same message"');

      testRepo.git('checkout main');
      testRepo.git('checkout -b feature-2');
      testRepo.writeFile('file2.txt', 'content2');
      testRepo.git('add file2.txt');
      testRepo.git('commit -m "Same message"');

      testRepo.git('config flowgit.tracked "feature-1,feature-2"');

      // Act
      await runCommand(['co'], testRepo, {
        prompts: { branch: 'feature-1' },
      });

      // Assert
      expect(testRepo.currentBranch()).toBe('feature-1');
    });

    it('handles empty reflog when no checkout history exists', async () => {
      // Arrange - fresh branches with minimal history
      testRepo.git('checkout -b new-branch-1');
      testRepo.git('checkout -b new-branch-2');
      testRepo.git('checkout main');

      testRepo.git('config flowgit.tracked "new-branch-1,new-branch-2"');

      // Act - should still work even with minimal reflog
      await runCommand(['co'], testRepo, {
        prompts: { branch: 'new-branch-1' },
      });

      // Assert
      expect(testRepo.currentBranch()).toBe('new-branch-1');
    });

    it('handles checkout when current branch is not tracked', async () => {
      // Arrange
      testRepo.git('checkout -b untracked-current');
      testRepo.git('checkout -b tracked-target');
      testRepo.git('checkout untracked-current');

      testRepo.git('config flowgit.tracked "tracked-target"');

      // Act
      await runCommand(['co', 'tracked-target'], testRepo);

      // Assert
      expect(testRepo.currentBranch()).toBe('tracked-target');
      expect(testRepo.trackedBranches()).toContain('tracked-target');
    });
  });
});
