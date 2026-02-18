import { TestRepository } from "./helpers/testRepo";
import { runCommand } from "./helpers/runCommand";
import { MockExecutor } from "./helpers/mockExecutor";
import { setExecutor, resetExecutor } from "../src/lib/executor";

describe("fgt com", () => {
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

  it("checks out main from a feature branch", async () => {
    // Arrange - create a feature branch
    testRepo.git("checkout -b feature-branch");
    testRepo.writeFile("feature.ts", "feature code");
    testRepo.git("add feature.ts");
    testRepo.git('commit -m "Feature commit"');

    expect(testRepo.currentBranch()).toBe("feature-branch");

    // Act
    await runCommand(["com"], testRepo);

    // Assert
    expect(testRepo.currentBranch()).toBe("main");
  });

  it("is a no-op when already on main", async () => {
    expect(testRepo.currentBranch()).toBe("main");

    await runCommand(["com"], testRepo);

    expect(testRepo.currentBranch()).toBe("main");
  });

  it("checks out main from a deeply stacked branch", async () => {
    // Arrange - create a 3-level stack
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

    expect(testRepo.currentBranch()).toBe("branch-c");

    // Act
    await runCommand(["com"], testRepo);

    // Assert
    expect(testRepo.currentBranch()).toBe("main");
  });

  it("pulls when remote exists", async () => {
    // Arrange - create remote
    testRepo.createRemote();

    testRepo.git("checkout -b feature-branch");
    testRepo.writeFile("feature.ts", "feature code");
    testRepo.git("add feature.ts");
    testRepo.git('commit -m "Feature"');

    // Act
    await runCommand(["com"], testRepo);

    // Assert
    expect(testRepo.currentBranch()).toBe("main");
    // Verify pull was called (git pull goes through executor)
    const pullCalls = mockExecutor.getCallsMatching("git pull");
    expect(pullCalls.length).toBe(1);
  });

  it("skips pull when no remote exists", async () => {
    // Arrange - no remote, just on a feature branch
    testRepo.git("checkout -b feature-branch");
    testRepo.writeFile("feature.ts", "feature code");
    testRepo.git("add feature.ts");
    testRepo.git('commit -m "Feature"');

    // Act
    await runCommand(["com"], testRepo);

    // Assert
    expect(testRepo.currentBranch()).toBe("main");
    const pullCalls = mockExecutor.getCallsMatching("git pull");
    expect(pullCalls.length).toBe(0);
  });
});
