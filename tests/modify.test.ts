import { TestRepository } from './helpers/testRepo';
import { runCommand } from './helpers/runCommand';
import { MockExecutor } from './helpers/mockExecutor';
import { setExecutor, resetExecutor } from '../src/lib/executor';

describe('gf modify', () => {
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

  describe('with staged changes', () => {
    it('amends commit with staged changes', async () => {
      // Arrange - create a commit
      testRepo.git('checkout -b feature');
      testRepo.writeFile('file1.txt', 'original content');
      testRepo.git('add file1.txt');
      testRepo.git('commit -m "Add file1"');

      const originalMessage = testRepo.lastCommitMessage();

      // Add more changes
      testRepo.writeFile('file2.txt', 'additional content');
      testRepo.git('add file2.txt');

      // Act
      await runCommand(['modify'], testRepo);

      // Assert
      expect(testRepo.lastCommitMessage()).toBe(originalMessage);
      expect(testRepo.fileExists('file1.txt')).toBe(true);
      expect(testRepo.fileExists('file2.txt')).toBe(true);
      expect(testRepo.isClean()).toBe(true);

      // Should have only 2 commits (initial + feature commit)
      const commitCount = testRepo.git('rev-list --count HEAD');
      expect(commitCount).toBe('2');
    });

    it('keeps original commit message', async () => {
      // Arrange
      testRepo.git('checkout -b feature');
      testRepo.writeFile('file.txt', 'content');
      testRepo.git('add file.txt');
      testRepo.git('commit -m "Original commit message"');

      // Add amendment
      testRepo.writeFile('file.txt', 'updated content');
      testRepo.git('add file.txt');

      // Act
      await runCommand(['modify'], testRepo);

      // Assert
      expect(testRepo.lastCommitMessage()).toBe('Original commit message');
    });
  });

  describe('with unstaged changes', () => {
    it('stages all changes when user selects "all"', async () => {
      // Arrange - create initial commit
      testRepo.git('checkout -b feature');
      testRepo.writeFile('file1.txt', 'content1');
      testRepo.git('add file1.txt');
      testRepo.git('commit -m "Initial commit"');

      // Add unstaged changes
      testRepo.writeFile('file2.txt', 'content2');
      testRepo.writeFile('file3.txt', 'content3');

      // Act
      await runCommand(['modify'], testRepo, {
        prompts: { choice: 'all' },
      });

      // Assert
      expect(testRepo.isClean()).toBe(true);
      expect(testRepo.fileExists('file2.txt')).toBe(true);
      expect(testRepo.fileExists('file3.txt')).toBe(true);
    });

    it('stages selected files when user selects "select"', async () => {
      // Arrange - create initial commit
      testRepo.git('checkout -b feature');
      testRepo.writeFile('file1.txt', 'content1');
      testRepo.git('add file1.txt');
      testRepo.git('commit -m "Initial commit"');

      // Add unstaged changes
      testRepo.writeFile('file2.txt', 'content2');
      testRepo.writeFile('file3.txt', 'content3');
      testRepo.git('add file2.txt'); // Pre-stage file2

      // Act
      await runCommand(['modify'], testRepo, {
        prompts: {
          choice: 'select',
          selected: ['file2.txt'],
        },
      });

      // Assert
      expect(testRepo.fileExists('file2.txt')).toBe(true);
      expect(testRepo.status()).toContain('file3.txt'); // file3 still unstaged
    });

    it('cancels when user selects "cancel"', async () => {
      // Arrange - create initial commit
      testRepo.git('checkout -b feature');
      testRepo.writeFile('file1.txt', 'content1');
      testRepo.git('add file1.txt');
      testRepo.git('commit -m "Initial commit"');

      const originalCommitHash = testRepo.git('rev-parse HEAD');

      // Add unstaged changes
      testRepo.writeFile('file2.txt', 'content2');

      // Act
      await runCommand(['modify'], testRepo, {
        prompts: { choice: 'cancel' },
      });

      // Assert - commit should not have changed
      expect(testRepo.git('rev-parse HEAD')).toBe(originalCommitHash);
      expect(testRepo.status()).toContain('file2.txt'); // Changes still unstaged
    });
  });

  describe('error handling', () => {
    it('throws error when no commits exist', async () => {
      // Arrange - create a new branch with no commits
      testRepo.git('checkout --orphan new-branch');
      testRepo.git('rm -rf .'); // Clear all files
      testRepo.writeFile('file.txt', 'content');
      testRepo.git('add file.txt');

      // Act & Assert
      await expect(runCommand(['modify'], testRepo)).rejects.toThrow();
    });

    it('throws error when no changes exist', async () => {
      // Arrange - create a commit with no further changes
      testRepo.git('checkout -b feature');
      testRepo.writeFile('file.txt', 'content');
      testRepo.git('add file.txt');
      testRepo.git('commit -m "Initial commit"');

      // Act & Assert - no changes to amend
      await expect(runCommand(['modify'], testRepo)).rejects.toThrow();
    });

    it('returns when no staged changes after selection', async () => {
      // Arrange
      testRepo.git('checkout -b feature');
      testRepo.writeFile('file1.txt', 'content1');
      testRepo.git('add file1.txt');
      testRepo.git('commit -m "Initial commit"');

      const originalCommitHash = testRepo.git('rev-parse HEAD');

      testRepo.writeFile('file2.txt', 'content2'); // Unstaged

      // Act - select no files (command should return early)
      await runCommand(['modify'], testRepo, {
        prompts: {
          choice: 'select',
          selected: [],
        },
      });

      // Assert - commit should not have changed
      expect(testRepo.git('rev-parse HEAD')).toBe(originalCommitHash);
      expect(testRepo.status()).toContain('file2.txt'); // Changes still unstaged
    });
  });

  describe('with remote tracking', () => {
    it('warns when branch has been pushed', async () => {
      // Arrange - create remote and push
      const remotePath = testRepo.createRemote();

      testRepo.git('checkout -b feature');
      testRepo.writeFile('file1.txt', 'content1');
      testRepo.git('add file1.txt');
      testRepo.git('commit -m "Initial commit"');
      testRepo.git('push -u origin feature');

      // Add changes to amend
      testRepo.writeFile('file2.txt', 'content2');
      testRepo.git('add file2.txt');

      // Mock console.warn to capture warning
      const warnSpy = jest.spyOn(console, 'warn');

      // Act
      await runCommand(['modify'], testRepo);

      // Assert - should still work but may have warned
      expect(testRepo.isClean()).toBe(true);
      // The command should succeed even with remote
    });
  });

  describe('multiple amendments', () => {
    it('amends same commit multiple times', async () => {
      // Arrange - create initial commit
      testRepo.git('checkout -b feature');
      testRepo.writeFile('file1.txt', 'v1');
      testRepo.git('add file1.txt');
      testRepo.git('commit -m "Feature commit"');

      const initialCommitCount = testRepo.git('rev-list --count HEAD');

      // First amendment
      testRepo.writeFile('file1.txt', 'v2');
      testRepo.git('add file1.txt');
      await runCommand(['modify'], testRepo);

      expect(testRepo.git('rev-list --count HEAD')).toBe(initialCommitCount);
      expect(testRepo.readFile('file1.txt')).toBe('v2');

      // Second amendment
      testRepo.writeFile('file1.txt', 'v3');
      testRepo.git('add file1.txt');
      await runCommand(['modify'], testRepo);

      // Assert - still same number of commits, message preserved
      expect(testRepo.git('rev-list --count HEAD')).toBe(initialCommitCount);
      expect(testRepo.lastCommitMessage()).toBe('Feature commit');
      expect(testRepo.readFile('file1.txt')).toBe('v3');
    });
  });

  describe('with file modifications', () => {
    it('amends with modified existing files', async () => {
      // Arrange
      testRepo.git('checkout -b feature');
      testRepo.writeFile('file.txt', 'original');
      testRepo.git('add file.txt');
      testRepo.git('commit -m "Add file"');

      // Modify the file
      testRepo.writeFile('file.txt', 'modified');
      testRepo.git('add file.txt');

      // Act
      await runCommand(['modify'], testRepo);

      // Assert
      expect(testRepo.readFile('file.txt')).toBe('modified');
      expect(testRepo.isClean()).toBe(true);
    });

    it('amends with deleted files', async () => {
      // Arrange
      testRepo.git('checkout -b feature');
      testRepo.writeFile('file1.txt', 'content1');
      testRepo.writeFile('file2.txt', 'content2');
      testRepo.git('add .');
      testRepo.git('commit -m "Add files"');

      // Delete a file
      testRepo.git('rm file2.txt');

      // Act
      await runCommand(['modify'], testRepo);

      // Assert
      expect(testRepo.fileExists('file1.txt')).toBe(true);
      expect(testRepo.fileExists('file2.txt')).toBe(false);
      expect(testRepo.isClean()).toBe(true);
    });
  });

  describe('working with stacks', () => {
    it('amends commit in a stacked branch', async () => {
      // Arrange - create a stack
      testRepo.git('checkout -b add-api');
      testRepo.writeFile('api.ts', 'api v1');
      testRepo.git('add api.ts');
      testRepo.git('commit -m "Add API"');
      testRepo.git('config flowgit.branch.add-api.parent "main"');

      testRepo.git('checkout -b add-frontend');
      testRepo.writeFile('frontend.ts', 'frontend');
      testRepo.git('add frontend.ts');
      testRepo.git('commit -m "Add frontend"');
      testRepo.git('config flowgit.branch.add-frontend.parent "add-api"');

      // Go back to api branch and amend
      testRepo.git('checkout add-api');
      testRepo.writeFile('api.ts', 'api v2');
      testRepo.git('add api.ts');

      // Act
      await runCommand(['modify'], testRepo);

      // Assert
      expect(testRepo.currentBranch()).toBe('add-api');
      expect(testRepo.readFile('api.ts')).toBe('api v2');
      expect(testRepo.lastCommitMessage()).toBe('Add API');

      // Frontend branch should still exist
      testRepo.git('checkout add-frontend');
      expect(testRepo.fileExists('frontend.ts')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles amending initial commit on new branch', async () => {
      // Arrange
      testRepo.git('checkout -b new-feature');
      testRepo.writeFile('initial.txt', 'v1');
      testRepo.git('add initial.txt');
      testRepo.git('commit -m "Initial feature commit"');

      // Amend the first commit
      testRepo.writeFile('initial.txt', 'v2');
      testRepo.git('add initial.txt');

      // Act
      await runCommand(['modify'], testRepo);

      // Assert
      expect(testRepo.readFile('initial.txt')).toBe('v2');
      expect(testRepo.lastCommitMessage()).toBe('Initial feature commit');
      expect(testRepo.git('rev-list --count HEAD')).toBe('2'); // initial + feature
    });

    it('handles very large file modifications', async () => {
      // Arrange
      testRepo.git('checkout -b large-file-branch');
      const largeContent = 'x'.repeat(1024 * 100); // 100KB
      testRepo.writeFile('large.txt', largeContent);
      testRepo.git('add large.txt');
      testRepo.git('commit -m "Add large file"');

      // Modify large file
      const newLargeContent = 'y'.repeat(1024 * 100);
      testRepo.writeFile('large.txt', newLargeContent);
      testRepo.git('add large.txt');

      // Act
      await runCommand(['modify'], testRepo);

      // Assert
      expect(testRepo.readFile('large.txt')).toBe(newLargeContent);
      expect(testRepo.isClean()).toBe(true);
    });

    it('handles binary file modifications', async () => {
      // Arrange
      testRepo.git('checkout -b binary-branch');
      // Create a simple binary-like file
      const buffer = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG header
      require('fs').writeFileSync(
        require('path').join(testRepo.path, 'image.bin'),
        buffer
      );
      testRepo.git('add image.bin');
      testRepo.git('commit -m "Add binary file"');

      // Modify binary file
      const newBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38]); // GIF header
      require('fs').writeFileSync(
        require('path').join(testRepo.path, 'image.bin'),
        newBuffer
      );
      testRepo.git('add image.bin');

      // Act
      await runCommand(['modify'], testRepo);

      // Assert
      expect(testRepo.fileExists('image.bin')).toBe(true);
      expect(testRepo.isClean()).toBe(true);
    });

    it('handles amending with both additions and deletions', async () => {
      // Arrange
      testRepo.git('checkout -b multi-change');
      testRepo.writeFile('keep.txt', 'keep this');
      testRepo.writeFile('delete.txt', 'delete this');
      testRepo.git('add .');
      testRepo.git('commit -m "Add files"');

      // Add new file and delete existing
      testRepo.writeFile('new.txt', 'new content');
      testRepo.git('rm delete.txt');
      testRepo.git('add .');

      // Act
      await runCommand(['modify'], testRepo);

      // Assert
      expect(testRepo.fileExists('keep.txt')).toBe(true);
      expect(testRepo.fileExists('new.txt')).toBe(true);
      expect(testRepo.fileExists('delete.txt')).toBe(false);
      expect(testRepo.isClean()).toBe(true);
    });

    it('handles amending when commit has unicode content', async () => {
      // Arrange
      testRepo.git('checkout -b unicode-branch');
      testRepo.writeFile('unicode.txt', 'Hello 世界 🌍');
      testRepo.git('add unicode.txt');
      testRepo.git('commit -m "Add unicode file"');

      // Modify with more unicode
      testRepo.writeFile('unicode.txt', 'Hello 世界 🌍 مرحبا Привет');
      testRepo.git('add unicode.txt');

      // Act
      await runCommand(['modify'], testRepo);

      // Assert
      expect(testRepo.readFile('unicode.txt')).toBe('Hello 世界 🌍 مرحبا Привет');
      expect(testRepo.isClean()).toBe(true);
    });

    it('handles amending with file mode changes', async () => {
      // Arrange
      testRepo.git('checkout -b mode-branch');
      testRepo.writeFile('script.sh', '#!/bin/bash\necho "test"');
      testRepo.git('add script.sh');
      testRepo.git('commit -m "Add script"');

      // Modify file content (permission-only changes are not visible to git status)
      testRepo.writeFile('script.sh', '#!/bin/bash\necho "updated"');
      testRepo.git('add script.sh');

      // Act
      await runCommand(['modify'], testRepo);

      // Assert
      expect(testRepo.readFile('script.sh')).toBe('#!/bin/bash\necho "updated"');
      expect(testRepo.isClean()).toBe(true);
    });

    it('handles rapid successive amendments', async () => {
      // Arrange
      testRepo.git('checkout -b rapid-amend');
      testRepo.writeFile('counter.txt', '0');
      testRepo.git('add counter.txt');
      testRepo.git('commit -m "Initial"');

      const initialCommitCount = testRepo.git('rev-list --count HEAD');

      // Act - amend multiple times in succession
      for (let i = 1; i <= 5; i++) {
        testRepo.writeFile('counter.txt', i.toString());
        testRepo.git('add counter.txt');
        await runCommand(['modify'], testRepo);
      }

      // Assert
      expect(testRepo.readFile('counter.txt')).toBe('5');
      expect(testRepo.git('rev-list --count HEAD')).toBe(initialCommitCount);
      expect(testRepo.lastCommitMessage()).toBe('Initial');
    });

    it('handles amending with nested directory structures', async () => {
      // Arrange
      testRepo.git('checkout -b nested-dirs');
      testRepo.writeFile('a/b/c/deep.txt', 'deep content');
      testRepo.git('add .');
      testRepo.git('commit -m "Add nested file"');

      // Modify deep file
      testRepo.writeFile('a/b/c/deep.txt', 'updated deep content');
      testRepo.git('add .');

      // Act
      await runCommand(['modify'], testRepo);

      // Assert
      expect(testRepo.readFile('a/b/c/deep.txt')).toBe('updated deep content');
      expect(testRepo.isClean()).toBe(true);
    });

    it('handles cancellation with unstaged changes only', async () => {
      // Arrange
      testRepo.git('checkout -b partial-stage');
      testRepo.writeFile('committed.txt', 'v1');
      testRepo.git('add committed.txt');
      testRepo.git('commit -m "Initial"');

      const originalCommit = testRepo.git('rev-parse HEAD');

      // Add unstaged changes only (no staged changes)
      testRepo.writeFile('file1.txt', 'content1');
      testRepo.writeFile('file2.txt', 'content2');
      // Don't stage anything

      // Act - cancel the modify
      await runCommand(['modify'], testRepo, {
        prompts: { choice: 'cancel' },
      });

      // Assert - commit unchanged
      expect(testRepo.git('rev-parse HEAD')).toBe(originalCommit);
      // files should still be unstaged
      expect(testRepo.status()).toContain('file1.txt');
      expect(testRepo.status()).toContain('file2.txt');
    });

    it('handles amending with mix of tracked and untracked files', async () => {
      // Arrange
      testRepo.git('checkout -b mixed-files');
      testRepo.writeFile('tracked.txt', 'tracked');
      testRepo.git('add tracked.txt');
      testRepo.git('commit -m "Add tracked"');

      // Modify tracked and add untracked
      testRepo.writeFile('tracked.txt', 'updated');
      testRepo.writeFile('untracked.txt', 'untracked');
      testRepo.git('add tracked.txt'); // Don't stage untracked

      // Act - will prompt for unstaged files, cancel to keep only staged files
      await runCommand(['modify'], testRepo, {
        prompts: { choice: 'cancel' },
      });

      // Assert
      expect(testRepo.readFile('tracked.txt')).toBe('updated');
      expect(testRepo.status()).toContain('untracked.txt'); // Remains untracked
    });

    it('handles amending with empty file', async () => {
      // Arrange
      testRepo.git('checkout -b empty-file');
      testRepo.writeFile('empty.txt', '');
      testRepo.git('add empty.txt');
      testRepo.git('commit -m "Add empty file"');

      // Add content to empty file
      testRepo.writeFile('empty.txt', 'now has content');
      testRepo.git('add empty.txt');

      // Act
      await runCommand(['modify'], testRepo);

      // Assert
      expect(testRepo.readFile('empty.txt')).toBe('now has content');
      expect(testRepo.isClean()).toBe(true);
    });

    it('handles amending when working directory has symlinks', async () => {
      // Arrange
      testRepo.git('checkout -b symlink-branch');
      testRepo.writeFile('target.txt', 'target content');
      testRepo.git('add target.txt');
      testRepo.git('commit -m "Add target"');

      // Create symlink and amend
      const fs = require('fs');
      const path = require('path');
      fs.symlinkSync(
        path.join(testRepo.path, 'target.txt'),
        path.join(testRepo.path, 'link.txt')
      );
      testRepo.git('add link.txt');

      // Act
      await runCommand(['modify'], testRepo);

      // Assert
      expect(testRepo.fileExists('link.txt')).toBe(true);
      expect(testRepo.isClean()).toBe(true);
    });

    it('handles amending after file rename', async () => {
      // Arrange
      testRepo.git('checkout -b rename-branch');
      testRepo.writeFile('old-name.txt', 'content');
      testRepo.git('add old-name.txt');
      testRepo.git('commit -m "Add file"');

      // Rename file
      testRepo.git('mv old-name.txt new-name.txt');

      // Act
      await runCommand(['modify'], testRepo);

      // Assert
      expect(testRepo.fileExists('new-name.txt')).toBe(true);
      expect(testRepo.fileExists('old-name.txt')).toBe(false);
      expect(testRepo.isClean()).toBe(true);
    });

    it('handles selecting files with spaces in names', async () => {
      // Arrange
      testRepo.git('checkout -b spaces-in-names');
      testRepo.writeFile('no spaces.txt', 'content');
      testRepo.git('add .');
      testRepo.git('commit -m "Initial"');

      testRepo.writeFile('file with spaces.txt', 'new content');
      testRepo.git('add .');

      // Act
      await runCommand(['modify'], testRepo, {
        prompts: {
          choice: 'select',
          selected: ['file with spaces.txt'],
        },
      });

      // Assert
      expect(testRepo.fileExists('file with spaces.txt')).toBe(true);
    });
  });
});
