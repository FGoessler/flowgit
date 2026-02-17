import { TestRepository } from "./helpers/testRepo";
import { runCommand } from "./helpers/runCommand";
import { MockExecutor } from "./helpers/mockExecutor";
import { setExecutor, resetExecutor } from "../src/lib/executor";

describe("fgt up", () => {
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

  it("navigates to child branch when only one exists", async () => {
    // Arrange - create parent and child branch
    testRepo.git("checkout -b parent-branch");
    testRepo.writeFile("parent.ts", "parent code");
    testRepo.git("add parent.ts");
    testRepo.git('commit -m "Parent commit"');

    testRepo.git("checkout -b child-branch");
    testRepo.writeFile("child.ts", "child code");
    testRepo.git("add child.ts");
    testRepo.git('commit -m "Child commit"');

    // Track branches and set parent
    testRepo.git('config flowgit.tracked "parent-branch,child-branch"');
    testRepo.git('config flowgit.branch.parent-branch.parent "main"');
    testRepo.git('config flowgit.branch.child-branch.parent "parent-branch"');

    // Go back to parent
    testRepo.git("checkout parent-branch");

    // Act
    await runCommand(["up"], testRepo);

    // Assert
    expect(testRepo.currentBranch()).toBe("child-branch");
  });

  it("shows picker when multiple children exist", async () => {
    // Arrange - create parent and two children
    testRepo.git("checkout -b parent-branch");
    testRepo.writeFile("parent.ts", "parent code");
    testRepo.git("add parent.ts");
    testRepo.git('commit -m "Parent commit"');

    testRepo.git("checkout -b child1-branch");
    testRepo.writeFile("child1.ts", "child1 code");
    testRepo.git("add child1.ts");
    testRepo.git('commit -m "Child 1 commit"');

    testRepo.git("checkout parent-branch");
    testRepo.git("checkout -b child2-branch");
    testRepo.writeFile("child2.ts", "child2 code");
    testRepo.git("add child2.ts");
    testRepo.git('commit -m "Child 2 commit"');

    // Track branches and set parents
    testRepo.git(
      'config flowgit.tracked "parent-branch,child1-branch,child2-branch"',
    );
    testRepo.git('config flowgit.branch.parent-branch.parent "main"');
    testRepo.git('config flowgit.branch.child1-branch.parent "parent-branch"');
    testRepo.git('config flowgit.branch.child2-branch.parent "parent-branch"');

    // Go back to parent
    testRepo.git("checkout parent-branch");

    // Act - select first child
    await runCommand(["up"], testRepo, {
      prompts: { branch: "child1-branch" },
    });

    // Assert
    expect(testRepo.currentBranch()).toBe("child1-branch");
  });

  it("shows error when no children exist", async () => {
    // Arrange - create a branch with no children
    testRepo.git("checkout -b lonely-branch");
    testRepo.writeFile("lonely.ts", "lonely code");
    testRepo.git("add lonely.ts");
    testRepo.git('commit -m "Lonely commit"');

    testRepo.git('config flowgit.tracked "lonely-branch"');
    testRepo.git('config flowgit.branch.lonely-branch.parent "main"');

    // Act & Assert
    await expect(runCommand(["up"], testRepo)).rejects.toThrow(
      "process.exit(1)",
    );
  });

  it("navigates through multi-level stack", async () => {
    // Arrange - create 3-level stack: main -> a -> b -> c
    testRepo.git("checkout -b branch-a");
    testRepo.writeFile("a.ts", "a");
    testRepo.git("add a.ts");
    testRepo.git('commit -m "A"');

    testRepo.git("checkout -b branch-b");
    testRepo.writeFile("b.ts", "b");
    testRepo.git("add b.ts");
    testRepo.git('commit -m "B"');

    testRepo.git("checkout -b branch-c");
    testRepo.writeFile("c.ts", "c");
    testRepo.git("add c.ts");
    testRepo.git('commit -m "C"');

    // Set up tracking and parents
    testRepo.git('config flowgit.tracked "branch-a,branch-b,branch-c"');
    testRepo.git('config flowgit.branch.branch-a.parent "main"');
    testRepo.git('config flowgit.branch.branch-b.parent "branch-a"');
    testRepo.git('config flowgit.branch.branch-c.parent "branch-b"');

    // Navigate from a -> b
    testRepo.git("checkout branch-a");
    await runCommand(["up"], testRepo);
    expect(testRepo.currentBranch()).toBe("branch-b");

    // Navigate from b -> c
    await runCommand(["up"], testRepo);
    expect(testRepo.currentBranch()).toBe("branch-c");

    // Try to go up from c (no children)
    await expect(runCommand(["up"], testRepo)).rejects.toThrow(
      "process.exit(1)",
    );
  });
});
