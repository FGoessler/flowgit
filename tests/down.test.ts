import { TestRepository } from "./helpers/testRepo";
import { runCommand } from "./helpers/runCommand";
import { MockExecutor } from "./helpers/mockExecutor";
import { setExecutor, resetExecutor } from "../src/lib/executor";

describe("fgt down", () => {
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

  it("navigates to parent branch", async () => {
    // Arrange - create parent and child
    testRepo.git("checkout -b parent-branch");
    testRepo.writeFile("parent.ts", "parent code");
    testRepo.git("add parent.ts");
    testRepo.git('commit -m "Parent commit"');

    testRepo.git("checkout -b child-branch");
    testRepo.writeFile("child.ts", "child code");
    testRepo.git("add child.ts");
    testRepo.git('commit -m "Child commit"');

    // Track branches and set parents
    testRepo.git('config flowgit.tracked "parent-branch,child-branch"');
    testRepo.git('config flowgit.branch.parent-branch.parent "main"');
    testRepo.git('config flowgit.branch.child-branch.parent "parent-branch"');

    // Act
    await runCommand(["down"], testRepo);

    // Assert
    expect(testRepo.currentBranch()).toBe("parent-branch");
  });

  it("shows error when already on trunk", async () => {
    // Arrange - on main branch
    expect(testRepo.currentBranch()).toBe("main");

    // Act & Assert
    await expect(runCommand(["down"], testRepo)).rejects.toThrow(
      "process.exit(1)",
    );
  });

  it("shows error when parent is trunk", async () => {
    // Arrange - create branch with main as parent
    testRepo.git("checkout -b feature-branch");
    testRepo.writeFile("feature.ts", "feature code");
    testRepo.git("add feature.ts");
    testRepo.git('commit -m "Feature commit"');

    testRepo.git('config flowgit.tracked "feature-branch"');
    testRepo.git('config flowgit.branch.feature-branch.parent "main"');

    // Act & Assert - can't go down from branch that points to trunk
    await expect(runCommand(["down"], testRepo)).rejects.toThrow(
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

    // Navigate from c -> b
    await runCommand(["down"], testRepo);
    expect(testRepo.currentBranch()).toBe("branch-b");

    // Navigate from b -> a
    await runCommand(["down"], testRepo);
    expect(testRepo.currentBranch()).toBe("branch-a");

    // Try to go down from a (parent is main)
    await expect(runCommand(["down"], testRepo)).rejects.toThrow(
      "process.exit(1)",
    );
  });

  it("shows error when no parent branch configured", async () => {
    // Arrange - branch without parent config
    testRepo.git("checkout -b orphan-branch");
    testRepo.writeFile("orphan.ts", "orphan code");
    testRepo.git("add orphan.ts");
    testRepo.git('commit -m "Orphan commit"');

    testRepo.git('config flowgit.tracked "orphan-branch"');
    // Don't set parent

    // Act & Assert
    await expect(runCommand(["down"], testRepo)).rejects.toThrow(
      "process.exit(1)",
    );
  });
});
