import { TestRepository } from "./helpers/testRepo";
import { runCommand } from "./helpers/runCommand";
import { MockExecutor } from "./helpers/mockExecutor";
import { setExecutor, resetExecutor } from "../src/lib/executor";

describe("fgt sync", () => {
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

  describe("trunk update", () => {
    it("fetches and pulls latest trunk", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      // Create a feature branch to ensure we're not on main
      testRepo.git("checkout -b feature");
      testRepo.writeFile("feature.ts", "code");
      testRepo.git("add feature.ts");
      testRepo.git('commit -m "Add feature"');
      testRepo.git('config flowgit.tracked "feature"');

      // Act
      await runCommand(["sync"], testRepo);

      // Assert
      const calls = mockExecutor.getCalls();
      expect(calls.some((c) => c.includes("git fetch --prune origin"))).toBe(true);
      expect(calls.some((c) => c.includes("git checkout main"))).toBe(true);
      expect(calls.some((c) => c.includes("git pull"))).toBe(true);
    });

    it("switches back to original branch after sync", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      testRepo.git("checkout -b my-feature");
      testRepo.writeFile("feature.ts", "code");
      testRepo.git("add feature.ts");
      testRepo.git('commit -m "Add feature"');
      testRepo.git('config flowgit.tracked "my-feature"');

      expect(testRepo.currentBranch()).toBe("my-feature");

      // Act
      await runCommand(["sync"], testRepo);

      // Assert - should be back on my-feature
      expect(testRepo.currentBranch()).toBe("my-feature");
    });

    it("stays on trunk if started on trunk", async () => {
      // Arrange
      const remote = testRepo.createRemote();
      testRepo.git("checkout main");

      expect(testRepo.currentBranch()).toBe("main");

      // Act
      await runCommand(["sync"], testRepo);

      // Assert - should still be on main
      expect(testRepo.currentBranch()).toBe("main");
    });
  });

  describe("branch analysis", () => {
    it("detects merged branches", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      // Create and merge a branch
      testRepo.git("checkout -b merged-feature");
      testRepo.writeFile("merged.ts", "code");
      testRepo.git("add merged.ts");
      testRepo.git('commit -m "Add merged feature"');
      testRepo.git("push -u origin merged-feature");

      testRepo.git("checkout main");
      testRepo.git('merge merged-feature --no-ff -m "Merge merged-feature"');
      testRepo.git("push origin main");

      testRepo.git('config flowgit.tracked "merged-feature"');

      // Act
      await runCommand(["sync"], testRepo, {
        prompts: { confirmed: false }, // Don't delete yet
      });

      // Assert - merged branch should be detected
      const tracked = testRepo.trackedBranches();
      expect(tracked).toContain("merged-feature");
    });

    it("detects branches behind remote", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      testRepo.git("checkout -b behind-branch");
      testRepo.writeFile("behind.ts", "code");
      testRepo.git("add behind.ts");
      testRepo.git('commit -m "Initial commit"');
      testRepo.git("push -u origin behind-branch");

      // Simulate remote being ahead by making commit elsewhere
      testRepo.git("checkout main");
      const clonePath = testRepo.path + "-clone";
      testRepo.git(`clone ${remote} ${clonePath}`);

      // Make commit in clone and push
      mockExecutor.exec(`git checkout behind-branch`, { cwd: clonePath });
      mockExecutor.exec(`echo "new" > new.ts`, { cwd: clonePath });
      mockExecutor.exec(`git add new.ts`, { cwd: clonePath });
      mockExecutor.exec(`git commit -m "New commit"`, { cwd: clonePath });
      mockExecutor.exec(`git push origin behind-branch`, { cwd: clonePath });

      testRepo.git("checkout behind-branch");
      testRepo.git('config flowgit.tracked "behind-branch"');

      // Act
      await runCommand(["sync"], testRepo);

      // Assert - branch should be fast-forwarded
      expect(testRepo.fileExists("new.ts")).toBe(true);
    });

    it("detects branches ahead of remote", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      testRepo.git("checkout -b ahead-branch");
      testRepo.writeFile("ahead.ts", "code");
      testRepo.git("add ahead.ts");
      testRepo.git('commit -m "Initial commit"');
      testRepo.git("push -u origin ahead-branch");

      // Make another local commit
      testRepo.writeFile("local.ts", "local code");
      testRepo.git("add local.ts");
      testRepo.git('commit -m "Local commit"');

      testRepo.git('config flowgit.tracked "ahead-branch"');

      // Act
      await runCommand(["sync"], testRepo);

      // Assert - ahead branch should remain unchanged
      expect(testRepo.currentBranch()).toBe("ahead-branch");
      expect(testRepo.fileExists("local.ts")).toBe(true);
    });

    it("detects diverged branches", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      testRepo.git("checkout -b diverged-branch");
      testRepo.writeFile("diverged.ts", "code");
      testRepo.git("add diverged.ts");
      testRepo.git('commit -m "Initial commit"');
      testRepo.git("push -u origin diverged-branch");

      // Make local commit
      testRepo.writeFile("local.ts", "local");
      testRepo.git("add local.ts");
      testRepo.git('commit -m "Local commit"');

      // Simulate remote commit
      const clonePath = testRepo.path + "-clone2";
      testRepo.git(`clone ${remote} ${clonePath}`);
      mockExecutor.exec(`git checkout diverged-branch`, { cwd: clonePath });
      mockExecutor.exec(`echo "remote" > remote.ts`, { cwd: clonePath });
      mockExecutor.exec(`git add remote.ts`, { cwd: clonePath });
      mockExecutor.exec(`git commit -m "Remote commit"`, { cwd: clonePath });
      mockExecutor.exec(`git push origin diverged-branch`, { cwd: clonePath });

      testRepo.git("fetch origin");
      testRepo.git('config flowgit.tracked "diverged-branch"');

      // Act
      await runCommand(["sync"], testRepo);

      // Assert - diverged branch should be reported but not auto-fixed
      expect(testRepo.currentBranch()).toBe("diverged-branch");
      expect(testRepo.fileExists("local.ts")).toBe(true);
      expect(testRepo.fileExists("remote.ts")).toBe(false); // Not merged
    });
  });

  describe("cleanup", () => {
    it("prompts to delete merged branches", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      testRepo.git("checkout -b merged-branch");
      testRepo.writeFile("merged.ts", "code");
      testRepo.git("add merged.ts");
      testRepo.git('commit -m "Add merged"');
      testRepo.git("push -u origin merged-branch");

      testRepo.git("checkout main");
      testRepo.git('merge merged-branch --no-ff -m "Merge merged-branch"');
      testRepo.git("push origin main");

      testRepo.git('config flowgit.tracked "merged-branch"');

      // Act
      await runCommand(["sync"], testRepo, {
        prompts: { confirmed: true }, // Accept deletion
      });

      // Assert
      expect(testRepo.branchExists("merged-branch")).toBe(false);
      expect(testRepo.trackedBranches()).not.toContain("merged-branch");
    });

    it("removes tracked branches from config when deleted", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      testRepo.git("checkout -b to-delete");
      testRepo.writeFile("file.ts", "code");
      testRepo.git("add file.ts");
      testRepo.git('commit -m "Add file"');
      testRepo.git("push -u origin to-delete");

      testRepo.git("checkout main");
      testRepo.git('merge to-delete --no-ff -m "Merge to-delete"');
      testRepo.git("push origin main");

      testRepo.git('config flowgit.tracked "to-delete"');

      expect(testRepo.trackedBranches()).toContain("to-delete");

      // Act
      await runCommand(["sync"], testRepo, {
        prompts: { confirmed: true },
      });

      // Assert
      expect(testRepo.trackedBranches()).not.toContain("to-delete");
    });

    it("handles deletion when currently on branch", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      testRepo.git("checkout -b current-merged");
      testRepo.writeFile("file.ts", "code");
      testRepo.git("add file.ts");
      testRepo.git('commit -m "Add file"');
      testRepo.git("push -u origin current-merged");

      testRepo.git("checkout main");
      testRepo.git('merge current-merged --no-ff -m "Merge current-merged"');
      testRepo.git("push origin main");

      testRepo.git("checkout current-merged");
      testRepo.git('config flowgit.tracked "current-merged"');

      expect(testRepo.currentBranch()).toBe("current-merged");

      // Act
      await runCommand(["sync"], testRepo, {
        prompts: { confirmed: true },
      });

      // Assert - should switch to main before deleting
      expect(testRepo.currentBranch()).toBe("main");
      expect(testRepo.branchExists("current-merged")).toBe(false);
    });

    it("does not delete when prompt is rejected", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      testRepo.git("checkout -b keep-merged");
      testRepo.writeFile("file.ts", "code");
      testRepo.git("add file.ts");
      testRepo.git('commit -m "Add file"');
      testRepo.git("push -u origin keep-merged");

      testRepo.git("checkout main");
      testRepo.git('merge keep-merged --no-ff -m "Merge keep-merged"');
      testRepo.git("push origin main");

      testRepo.git('config flowgit.tracked "keep-merged"');

      // Act
      await runCommand(["sync"], testRepo, {
        prompts: { confirmed: false }, // Reject deletion
      });

      // Assert
      expect(testRepo.branchExists("keep-merged")).toBe(true);
      expect(testRepo.trackedBranches()).toContain("keep-merged");
    });
  });

  describe("fast-forward", () => {
    it("automatically fast-forwards branches behind remote", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      testRepo.git("checkout -b ff-branch");
      testRepo.writeFile("initial.ts", "code");
      testRepo.git("add initial.ts");
      testRepo.git('commit -m "Initial"');
      testRepo.git("push -u origin ff-branch");

      // Make remote ahead
      const clonePath = testRepo.path + "-clone-ff";
      testRepo.git(`clone ${remote} ${clonePath}`);
      mockExecutor.exec(`git checkout ff-branch`, { cwd: clonePath });
      mockExecutor.exec(`echo "new" > new.ts`, { cwd: clonePath });
      mockExecutor.exec(`git add new.ts`, { cwd: clonePath });
      mockExecutor.exec(`git commit -m "New commit"`, { cwd: clonePath });
      mockExecutor.exec(`git push origin ff-branch`, { cwd: clonePath });

      testRepo.git("checkout main");
      testRepo.git('config flowgit.tracked "ff-branch"');

      expect(testRepo.branchExists("ff-branch")).toBe(true);

      // Act
      await runCommand(["sync"], testRepo);

      // Assert - branch should be fast-forwarded
      testRepo.git("checkout ff-branch");
      expect(testRepo.fileExists("new.ts")).toBe(true);
    });

    it("shows warning for diverged branches without auto-fixing", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      testRepo.git("checkout -b diverged");
      testRepo.writeFile("initial.ts", "code");
      testRepo.git("add initial.ts");
      testRepo.git('commit -m "Initial"');
      testRepo.git("push -u origin diverged");

      // Local commit
      testRepo.writeFile("local.ts", "local");
      testRepo.git("add local.ts");
      testRepo.git('commit -m "Local"');

      // Remote commit
      const clonePath = testRepo.path + "-clone-diverged";
      testRepo.git(`clone ${remote} ${clonePath}`);
      mockExecutor.exec(`git checkout diverged`, { cwd: clonePath });
      mockExecutor.exec(`echo "remote" > remote.ts`, { cwd: clonePath });
      mockExecutor.exec(`git add remote.ts`, { cwd: clonePath });
      mockExecutor.exec(`git commit -m "Remote"`, { cwd: clonePath });
      mockExecutor.exec(`git push origin diverged`, { cwd: clonePath });

      testRepo.git("fetch origin");
      testRepo.git("checkout main");
      testRepo.git('config flowgit.tracked "diverged"');

      // Act
      await runCommand(["sync"], testRepo);

      // Assert - diverged branch not auto-fixed
      testRepo.git("checkout diverged");
      expect(testRepo.fileExists("local.ts")).toBe(true);
      expect(testRepo.fileExists("remote.ts")).toBe(false);
    });

    it("leaves ahead branches alone", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      testRepo.git("checkout -b ahead");
      testRepo.writeFile("initial.ts", "code");
      testRepo.git("add initial.ts");
      testRepo.git('commit -m "Initial"');
      testRepo.git("push -u origin ahead");

      // Local ahead commit
      testRepo.writeFile("ahead.ts", "ahead");
      testRepo.git("add ahead.ts");
      testRepo.git('commit -m "Ahead"');

      testRepo.git("checkout main");
      testRepo.git('config flowgit.tracked "ahead"');

      const beforeSync = testRepo.git("log --oneline ahead");

      // Act
      await runCommand(["sync"], testRepo);

      // Assert - ahead branch unchanged
      const afterSync = testRepo.git("log --oneline ahead");
      expect(afterSync).toBe(beforeSync);
    });
  });

  describe("stacking with sync", () => {
    it("deletes merged parent branches", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      // Create parent branch
      testRepo.git("checkout -b parent");
      testRepo.writeFile("parent.ts", "parent");
      testRepo.git("add parent.ts");
      testRepo.git('commit -m "Add parent"');
      testRepo.git("push -u origin parent");
      testRepo.git('config flowgit.branch.parent.parent "main"');

      // Create child branch
      testRepo.git("checkout -b child");
      testRepo.writeFile("child.ts", "child");
      testRepo.git("add child.ts");
      testRepo.git('commit -m "Add child"');
      testRepo.git("push -u origin child");
      testRepo.git('config flowgit.branch.child.parent "parent"');

      testRepo.git('config flowgit.tracked "parent,child"');

      // Merge parent into main
      testRepo.git("checkout main");
      testRepo.git('merge parent --no-ff -m "Merge parent"');
      testRepo.git("push origin main");

      // Act
      await runCommand(["sync"], testRepo, {
        prompts: { confirmed: true }, // Delete merged parent
      });

      // Assert - parent should be deleted, child remains with parent reference
      expect(testRepo.branchExists("parent")).toBe(false);
      expect(testRepo.branchExists("child")).toBe(true);
      expect(testRepo.trackedBranches()).toContain("child");
      expect(testRepo.trackedBranches()).not.toContain("parent");
    });

    it("deletes merged branches in multi-level stacks", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      // Create 3-level stack
      testRepo.git("checkout -b level1");
      testRepo.writeFile("level1.ts", "l1");
      testRepo.git("add level1.ts");
      testRepo.git('commit -m "Level 1"');
      testRepo.git("push -u origin level1");
      testRepo.git('config flowgit.branch.level1.parent "main"');

      testRepo.git("checkout -b level2");
      testRepo.writeFile("level2.ts", "l2");
      testRepo.git("add level2.ts");
      testRepo.git('commit -m "Level 2"');
      testRepo.git("push -u origin level2");
      testRepo.git('config flowgit.branch.level2.parent "level1"');

      testRepo.git("checkout -b level3");
      testRepo.writeFile("level3.ts", "l3");
      testRepo.git("add level3.ts");
      testRepo.git('commit -m "Level 3"');
      testRepo.git("push -u origin level3");
      testRepo.git('config flowgit.branch.level3.parent "level2"');

      testRepo.git('config flowgit.tracked "level1,level2,level3"');

      // Merge level1 into main
      testRepo.git("checkout main");
      testRepo.git('merge level1 --no-ff -m "Merge level1"');
      testRepo.git("push origin main");

      // Act
      await runCommand(["sync"], testRepo, {
        prompts: { confirmed: true },
      });

      // Assert - level1 deleted, others remain
      expect(testRepo.branchExists("level1")).toBe(false);
      expect(testRepo.branchExists("level2")).toBe(true);
      expect(testRepo.branchExists("level3")).toBe(true);
      expect(testRepo.trackedBranches()).not.toContain("level1");
      expect(testRepo.trackedBranches()).toContain("level2");
      expect(testRepo.trackedBranches()).toContain("level3");
    });
  });

  describe("remote PR status detection", () => {
    it("detects squash-merged PRs via gh and cleans up", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      testRepo.git("checkout -b squash-merged");
      testRepo.writeFile("squash.ts", "code");
      testRepo.git("add squash.ts");
      testRepo.git('commit -m "Squash feature"');
      testRepo.git("push -u origin squash-merged");
      testRepo.git("checkout main");

      testRepo.git('config flowgit.tracked "squash-merged"');

      // Mock gh: authenticated, PR is MERGED
      mockExecutor.onCommand("gh auth status").returns("");
      mockExecutor
        .onCommand("gh pr list --state all")
        .returns(
          JSON.stringify([
            { headRefName: "squash-merged", state: "MERGED", merged: true },
          ]),
        );

      // Act - confirm deletion
      await runCommand(["sync"], testRepo, {
        prompts: { confirmed: true },
      });

      // Assert - branch cleaned up
      expect(testRepo.branchExists("squash-merged")).toBe(false);
      expect(testRepo.trackedBranches()).not.toContain("squash-merged");
    });

    it("detects closed PRs and offers cleanup", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      testRepo.git("checkout -b closed-pr");
      testRepo.writeFile("closed.ts", "code");
      testRepo.git("add closed.ts");
      testRepo.git('commit -m "Closed feature"');
      testRepo.git("push -u origin closed-pr");
      testRepo.git("checkout main");

      testRepo.git('config flowgit.tracked "closed-pr"');

      // Mock gh: authenticated, PR is CLOSED (not merged)
      mockExecutor.onCommand("gh auth status").returns("");
      mockExecutor
        .onCommand("gh pr list --state all")
        .returns(
          JSON.stringify([
            { headRefName: "closed-pr", state: "CLOSED", merged: false },
          ]),
        );

      // Act - confirm deletion of closed PR branches
      await runCommand(["sync"], testRepo, {
        prompts: { confirmed: true },
      });

      // Assert - branch cleaned up
      expect(testRepo.branchExists("closed-pr")).toBe(false);
      expect(testRepo.trackedBranches()).not.toContain("closed-pr");
    });

    it("keeps branches with open PRs", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      testRepo.git("checkout -b open-pr");
      testRepo.writeFile("open.ts", "code");
      testRepo.git("add open.ts");
      testRepo.git('commit -m "Open feature"');
      testRepo.git("push -u origin open-pr");
      testRepo.git("checkout main");

      testRepo.git('config flowgit.tracked "open-pr"');

      // Mock gh: authenticated, PR is OPEN
      mockExecutor.onCommand("gh auth status").returns("");
      mockExecutor
        .onCommand("gh pr list --state all")
        .returns(
          JSON.stringify([
            { headRefName: "open-pr", state: "OPEN", merged: false },
          ]),
        );

      // Act
      await runCommand(["sync"], testRepo);

      // Assert - branch kept
      expect(testRepo.branchExists("open-pr")).toBe(true);
      expect(testRepo.trackedBranches()).toContain("open-pr");
    });

    it("detects branches whose remote was deleted after merge", async () => {
      // Arrange - simulate a branch that was pushed, then remote branch deleted
      const remote = testRepo.createRemote();

      testRepo.git("checkout -b remote-deleted");
      testRepo.writeFile("rd.ts", "code");
      testRepo.git("add rd.ts");
      testRepo.git('commit -m "Remote deleted feature"');
      testRepo.git("push -u origin remote-deleted");
      testRepo.git("checkout main");

      testRepo.git('config flowgit.tracked "remote-deleted"');

      // Delete the remote branch (simulating GitHub auto-delete after merge)
      testRepo.git("push origin --delete remote-deleted");

      // Act - confirm deletion
      await runCommand(["sync"], testRepo, {
        prompts: { confirmed: true },
      });

      // Assert - branch detected as merged and cleaned up
      expect(testRepo.branchExists("remote-deleted")).toBe(false);
      expect(testRepo.trackedBranches()).not.toContain("remote-deleted");
    });
  });

  describe("error handling", () => {
    it("fails when not in git repo", async () => {
      // Arrange
      const nonGitRepo = TestRepository.create();
      // Remove .git directory using node fs instead of git command
      const fs = require("fs");
      const path = require("path");
      const gitDir = path.join(nonGitRepo.path, ".git");
      fs.rmSync(gitDir, { recursive: true, force: true });

      // Act & Assert
      await expect(runCommand(["sync"], nonGitRepo)).rejects.toThrow();

      nonGitRepo.destroy();
    });

    it("handles trunk update failures", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      // Corrupt main branch
      testRepo.git("checkout main");
      testRepo.writeFile("conflict.ts", "local content");
      testRepo.git("add conflict.ts");
      testRepo.git('commit -m "Local conflict"');

      // Create remote conflict
      const clonePath = testRepo.path + "-clone-conflict";
      testRepo.git(`clone ${remote} ${clonePath}`);
      mockExecutor.exec(`echo "remote content" > conflict.ts`, {
        cwd: clonePath,
      });
      mockExecutor.exec(`git add conflict.ts`, { cwd: clonePath });
      mockExecutor.exec(`git commit -m "Remote conflict"`, { cwd: clonePath });
      mockExecutor.exec(`git push origin main`, { cwd: clonePath });

      testRepo.git("checkout -b feature");
      testRepo.writeFile("feature.ts", "code");
      testRepo.git("add feature.ts");
      testRepo.git('commit -m "Feature"');

      // Act & Assert
      await expect(runCommand(["sync"], testRepo)).rejects.toThrow();
    });

    it("handles branches that no longer exist", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      testRepo.git('config flowgit.tracked "non-existent-branch"');

      // Act
      await runCommand(["sync"], testRepo);

      // Assert - non-existent branch removed from tracking
      expect(testRepo.trackedBranches()).not.toContain("non-existent-branch");
    });
  });

  describe("sync summary", () => {
    it("reports number of synced branches", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      // Create branches that need sync
      testRepo.git("checkout -b sync1");
      testRepo.writeFile("sync1.ts", "code");
      testRepo.git("add sync1.ts");
      testRepo.git('commit -m "Sync1"');
      testRepo.git("push -u origin sync1");

      testRepo.git("checkout main");
      testRepo.git("checkout -b sync2");
      testRepo.writeFile("sync2.ts", "code");
      testRepo.git("add sync2.ts");
      testRepo.git('commit -m "Sync2"');
      testRepo.git("push -u origin sync2");

      testRepo.git('config flowgit.tracked "sync1,sync2"');
      testRepo.git("checkout main");

      // Act
      await runCommand(["sync"], testRepo);

      // Assert - both branches exist and are tracked
      expect(testRepo.trackedBranches()).toContain("sync1");
      expect(testRepo.trackedBranches()).toContain("sync2");
    });

    it("handles empty tracked list gracefully", async () => {
      // Arrange
      const remote = testRepo.createRemote();

      // No tracked branches

      // Act
      await runCommand(["sync"], testRepo);

      // Assert - should complete without error
      expect(testRepo.currentBranch()).toBe("main");
    });
  });
});
