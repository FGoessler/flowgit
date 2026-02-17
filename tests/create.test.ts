import { TestRepository } from "./helpers/testRepo";
import { runCommand } from "./helpers/runCommand";
import { MockExecutor } from "./helpers/mockExecutor";
import { setExecutor, resetExecutor } from "../src/lib/executor";

describe("fgt create", () => {
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

  describe("with staged changes", () => {
    it("creates a branch and commits changes", async () => {
      // Arrange
      testRepo.writeFile("test.txt", "content");
      testRepo.git("add test.txt");

      // Act
      await runCommand(["create"], testRepo, {
        prompts: { message: "Add test file" },
      });

      // Assert
      expect(testRepo.currentBranch()).toBe("add-test-file");
      expect(testRepo.lastCommitMessage()).toBe("Add test file");
      expect(testRepo.trackedBranches()).toContain("add-test-file");
      expect(testRepo.isClean()).toBe(true);
    });

    it("derives branch name from commit message", async () => {
      // Arrange
      testRepo.writeFile("auth.ts", "export const auth = () => {}");
      testRepo.git("add auth.ts");

      // Act
      await runCommand(["create"], testRepo, {
        prompts: { message: "Add user authentication system" },
      });

      // Assert
      expect(testRepo.currentBranch()).toBe("add-user-authentication-system");
    });

    it("sets parent branch to current branch", async () => {
      // Arrange - create and switch to a feature branch first
      testRepo.git("checkout -b feature-api");
      testRepo.writeFile("api.ts", "api code");
      testRepo.git("add api.ts");
      testRepo.git('commit -m "Add API"');
      testRepo.git('config flowgit.tracked "feature-api"');
      testRepo.git('config flowgit.branch.feature-api.parent "main"');

      // Add new changes
      testRepo.writeFile("frontend.ts", "frontend code");
      testRepo.git("add frontend.ts");

      // Act
      await runCommand(["create"], testRepo, {
        prompts: { message: "Add frontend" },
      });

      // Assert
      expect(testRepo.currentBranch()).toBe("add-frontend");
      expect(testRepo.parentBranch("add-frontend")).toBe("feature-api");
    });

    it("handles special characters in commit message", async () => {
      // Arrange
      testRepo.writeFile("test.txt", "content");
      testRepo.git("add test.txt");

      // Act
      await runCommand(["create"], testRepo, {
        prompts: { message: "Fix: bug with user@email.com & validation!" },
      });

      // Assert
      // Special characters like @ are removed, dots are kept
      expect(testRepo.currentBranch()).toBe(
        "fix-bug-with-useremailcom-validation",
      );
    });
  });

  describe("with unstaged changes", () => {
    it('stages all changes when user selects "all"', async () => {
      // Arrange
      testRepo.writeFile("file1.txt", "content1");
      testRepo.writeFile("file2.txt", "content2");

      // Act
      await runCommand(["create"], testRepo, {
        prompts: {
          choice: "all",
          message: "Add files",
        },
      });

      // Assert
      expect(testRepo.currentBranch()).toBe("add-files");
      expect(testRepo.isClean()).toBe(true);
    });

    it('stages selected files when user selects "select"', async () => {
      // Arrange
      testRepo.writeFile("file1.txt", "content1");
      testRepo.writeFile("file2.txt", "content2");
      testRepo.git("add file1.txt"); // Pre-stage file1 for this test

      // Act
      await runCommand(["create"], testRepo, {
        prompts: {
          choice: "select",
          selected: ["file1.txt"],
          message: "Add file1",
        },
      });

      // Assert
      expect(testRepo.currentBranch()).toBe("add-file1");
      expect(testRepo.lastCommitMessage()).toBe("Add file1");
      // file2 should still be untracked
      expect(testRepo.status()).toContain("file2.txt");
    });
  });

  describe("branch naming", () => {
    it("converts to kebab-case", async () => {
      testRepo.writeFile("test.txt", "content");
      testRepo.git("add test.txt");

      await runCommand(["create"], testRepo, {
        prompts: { message: "This Is A Test Message" },
      });

      expect(testRepo.currentBranch()).toBe("this-is-a-test-message");
    });

    it("limits branch name length to 50 characters", async () => {
      testRepo.writeFile("test.txt", "content");
      testRepo.git("add test.txt");

      await runCommand(["create"], testRepo, {
        prompts: {
          message:
            "This is a very long commit message that should be truncated to fifty characters maximum",
        },
      });

      const branch = testRepo.currentBranch();
      expect(branch.length).toBeLessThanOrEqual(50);
      // Branch name is truncated at 50 chars and trailing hyphens removed
      expect(branch).toBe("this-is-a-very-long-commit-message-that-should-be");
    });

    it("removes leading and trailing hyphens", async () => {
      testRepo.writeFile("test.txt", "content");
      testRepo.git("add test.txt");

      await runCommand(["create"], testRepo, {
        prompts: { message: "---test message---" },
      });

      expect(testRepo.currentBranch()).toBe("test-message");
    });
  });

  describe("when branch already exists", () => {
    it("commits on current branch when already on the derived branch", async () => {
      // Arrange - create branch, stay on it, make more changes
      testRepo.writeFile("first.txt", "first");
      testRepo.git("add first.txt");
      await runCommand(["create"], testRepo, {
        prompts: { message: "Test branch" },
      });
      expect(testRepo.currentBranch()).toBe("test-branch");

      // Now add more changes on the same branch
      testRepo.writeFile("second.txt", "second");
      testRepo.git("add second.txt");

      // Act - create with same derived name
      await runCommand(["create"], testRepo, {
        prompts: { message: "Test branch" },
      });

      // Assert - committed on existing branch, no error
      expect(testRepo.currentBranch()).toBe("test-branch");
      expect(testRepo.lastCommitMessage()).toBe("Test branch");
      expect(testRepo.fileExists("second.txt")).toBe(true);
      expect(testRepo.isClean()).toBe(true);
    });

    it("asks to commit on current branch when derived name exists elsewhere", async () => {
      // Arrange - create test-branch, switch back to main
      testRepo.git("checkout -b test-branch");
      testRepo.writeFile("old.txt", "old");
      testRepo.git("add old.txt");
      testRepo.git('commit -m "Old commit"');
      testRepo.git("checkout main");

      testRepo.writeFile("new.txt", "content");
      testRepo.git("add new.txt");

      // Act - confirmed: true accepts "Commit on current branch instead?"
      await runCommand(["create"], testRepo, {
        prompts: {
          message: "Test branch",
          confirmed: true,
        },
      });

      // Assert - committed on main instead
      expect(testRepo.currentBranch()).toBe("main");
      expect(testRepo.lastCommitMessage()).toBe("Test branch");
      expect(testRepo.isClean()).toBe(true);
    });

    it("cancels when user declines committing on current branch", async () => {
      // Arrange
      testRepo.git("checkout -b test-branch");
      testRepo.git("checkout main");
      testRepo.writeFile("test.txt", "content");
      testRepo.git("add test.txt");

      const originalCommit = testRepo.git("rev-parse HEAD");

      // Act - confirmed: false declines the prompt
      await runCommand(["create"], testRepo, {
        prompts: {
          message: "Test branch",
          confirmed: false,
        },
      });

      // Assert - nothing changed
      expect(testRepo.currentBranch()).toBe("main");
      expect(testRepo.git("rev-parse HEAD")).toBe(originalCommit);
    });
  });

  describe("stacking", () => {
    it("records parent as main when on main", async () => {
      // Arrange
      testRepo.writeFile("test.txt", "content");
      testRepo.git("add test.txt");

      // Act
      await runCommand(["create"], testRepo, {
        prompts: { message: "First feature" },
      });

      // Assert
      expect(testRepo.parentBranch("first-feature")).toBe("main");
    });

    it("creates stack of branches", async () => {
      // Create first branch
      testRepo.writeFile("api.ts", "api");
      testRepo.git("add api.ts");
      await runCommand(["create"], testRepo, {
        prompts: { message: "Add API" },
      });

      expect(testRepo.currentBranch()).toBe("add-api");
      expect(testRepo.parentBranch("add-api")).toBe("main");

      // Create second branch on top
      testRepo.writeFile("frontend.ts", "frontend");
      testRepo.git("add frontend.ts");
      await runCommand(["create"], testRepo, {
        prompts: { message: "Add frontend" },
      });

      expect(testRepo.currentBranch()).toBe("add-frontend");
      expect(testRepo.parentBranch("add-frontend")).toBe("add-api");

      // Create third branch on top
      testRepo.writeFile("tests.ts", "tests");
      testRepo.git("add tests.ts");
      await runCommand(["create"], testRepo, {
        prompts: { message: "Add tests" },
      });

      expect(testRepo.currentBranch()).toBe("add-tests");
      expect(testRepo.parentBranch("add-tests")).toBe("add-frontend");

      // Verify all are tracked
      const tracked = testRepo.trackedBranches();
      expect(tracked).toContain("add-api");
      expect(tracked).toContain("add-frontend");
      expect(tracked).toContain("add-tests");
    });
  });

  describe("edge cases", () => {
    it("handles very long file paths", async () => {
      // Arrange - create nested directory structure with long path
      const longPath =
        "very/deeply/nested/directory/structure/that/goes/on/for/a/while";
      testRepo.writeFile(`${longPath}/file.txt`, "content");
      testRepo.git("add .");

      // Act
      await runCommand(["create"], testRepo, {
        prompts: { message: "Add deeply nested file" },
      });

      // Assert
      expect(testRepo.currentBranch()).toBe("add-deeply-nested-file");
      expect(testRepo.fileExists(`${longPath}/file.txt`)).toBe(true);
      expect(testRepo.isClean()).toBe(true);
    });

    it("handles unicode characters in commit messages", async () => {
      // Arrange
      testRepo.writeFile("test.txt", "content");
      testRepo.git("add test.txt");

      // Act - commit message with various unicode characters
      await runCommand(["create"], testRepo, {
        prompts: { message: "Add feature 🚀 with émojis and spëcial çhars" },
      });

      // Assert - unicode is stripped but message is preserved in commit
      expect(testRepo.currentBranch()).toBe(
        "add-feature-with-mojis-and-spcial-hars",
      );
      expect(testRepo.lastCommitMessage()).toBe(
        "Add feature 🚀 with émojis and spëcial çhars",
      );
    });

    it("handles empty commit message after sanitization", async () => {
      // Arrange
      testRepo.writeFile("test.txt", "content");
      testRepo.git("add test.txt");

      // Act & Assert - commit message that becomes empty after sanitization should throw
      await expect(
        runCommand(["create"], testRepo, {
          prompts: { message: "!@#$%^&*()" },
        }),
      ).rejects.toThrow();
    });

    it("handles creating empty branch", async () => {
      // Arrange - no changes, but confirm empty branch creation

      // Act
      await runCommand(["create"], testRepo, {
        prompts: {
          message: "Empty branch",
          confirmed: true,
        },
      });

      // Assert
      expect(testRepo.currentBranch()).toBe("empty-branch");
      expect(testRepo.trackedBranches()).toContain("empty-branch");
      // Should be same commit as main (no new commit made)
      testRepo.git("checkout main");
      const mainCommit = testRepo.git("rev-parse HEAD");
      testRepo.git("checkout empty-branch");
      const branchCommit = testRepo.git("rev-parse HEAD");
      expect(branchCommit).toBe(mainCommit);
    });

    it("handles dirty working directory with untracked files", async () => {
      // Arrange
      testRepo.writeFile("tracked.txt", "will be tracked");
      testRepo.writeFile("untracked.txt", "will stay untracked");
      testRepo.git("add tracked.txt");

      // Act - prompt fires because of unstaged untracked.txt, select only tracked.txt
      await runCommand(["create"], testRepo, {
        prompts: {
          choice: "select",
          selected: ["tracked.txt"],
          message: "Add tracked file",
        },
      });

      // Assert
      expect(testRepo.currentBranch()).toBe("add-tracked-file");
      expect(testRepo.fileExists("tracked.txt")).toBe(true);
      expect(testRepo.fileExists("untracked.txt")).toBe(true);
      // Only untracked file should remain in status
      expect(testRepo.status()).toContain("untracked.txt");
    });

    it("handles branch name that starts with digits", async () => {
      // Arrange
      testRepo.writeFile("test.txt", "content");
      testRepo.git("add test.txt");

      // Act
      await runCommand(["create"], testRepo, {
        prompts: { message: "123 feature request" },
      });

      // Assert
      expect(testRepo.currentBranch()).toBe("123-feature-request");
    });

    it("handles consecutive spaces and hyphens in commit message", async () => {
      // Arrange
      testRepo.writeFile("test.txt", "content");
      testRepo.git("add test.txt");

      // Act
      await runCommand(["create"], testRepo, {
        prompts: { message: "Add    multiple     spaces  --  and   hyphens" },
      });

      // Assert
      expect(testRepo.currentBranch()).toBe("add-multiple-spaces-and-hyphens");
    });

    it("handles mixed case and numbers in branch name", async () => {
      // Arrange
      testRepo.writeFile("test.txt", "content");
      testRepo.git("add test.txt");

      // Act
      await runCommand(["create"], testRepo, {
        prompts: { message: "Fix V2 API endpoint for User123" },
      });

      // Assert
      expect(testRepo.currentBranch()).toBe("fix-v2-api-endpoint-for-user123");
    });

    it("handles cancellation when no changes and user declines empty branch", async () => {
      // Arrange - no changes
      const originalBranch = testRepo.currentBranch();

      // Act
      await runCommand(["create"], testRepo, {
        prompts: {
          message: "Test",
          confirmed: false,
        },
      });

      // Assert - should still be on original branch
      expect(testRepo.currentBranch()).toBe(originalBranch);
    });

    it("handles staging no files when using select option", async () => {
      // Arrange
      testRepo.writeFile("file1.txt", "content1");
      testRepo.writeFile("file2.txt", "content2");
      const originalBranch = testRepo.currentBranch();

      // Act
      await runCommand(["create"], testRepo, {
        prompts: {
          choice: "select",
          selected: [],
          message: "Test",
        },
      });

      // Assert - should remain on original branch
      expect(testRepo.currentBranch()).toBe(originalBranch);
    });

    it("handles maximum branch name truncation at word boundary", async () => {
      // Arrange
      testRepo.writeFile("test.txt", "content");
      testRepo.git("add test.txt");

      // Act - exactly 50 chars when truncated
      await runCommand(["create"], testRepo, {
        prompts: {
          message:
            "Add a super extremely ridiculously long commit message that goes way beyond fifty characters",
        },
      });

      // Assert
      const branch = testRepo.currentBranch();
      expect(branch.length).toBeLessThanOrEqual(50);
      expect(branch).not.toMatch(/-$/); // Should not end with hyphen
    });
  });
});
