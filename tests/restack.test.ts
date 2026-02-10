import { TestRepository } from './helpers/testRepo';
import { runCommand } from './helpers/runCommand';
import { MockExecutor } from './helpers/mockExecutor';
import { setExecutor, resetExecutor } from '../src/lib/executor';

describe('gf restack', () => {
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

  it('cannot restack trunk branch', async () => {
    // Arrange - on main branch
    expect(testRepo.currentBranch()).toBe('main');

    // Act & Assert
    await expect(runCommand(['restack'], testRepo)).rejects.toThrow('process.exit(1)');
  });

  it('rebases current branch onto parent', async () => {
    // Arrange - create parent with commits, then child
    testRepo.git('checkout -b parent-branch');
    testRepo.writeFile('parent.ts', 'parent v1');
    testRepo.git('add parent.ts');
    testRepo.git('commit -m "Parent v1"');

    testRepo.git('checkout -b child-branch');
    testRepo.writeFile('child.ts', 'child');
    testRepo.git('add child.ts');
    testRepo.git('commit -m "Child commit"');

    // Add more commits to parent
    testRepo.git('checkout parent-branch');
    testRepo.writeFile('parent.ts', 'parent v2');
    testRepo.git('add parent.ts');
    testRepo.git('commit -m "Parent v2"');

    testRepo.git('checkout child-branch');

    testRepo.git('config flowgit.tracked "parent-branch,child-branch"');
    testRepo.git('config flowgit.branch.parent-branch.parent "main"');
    testRepo.git('config flowgit.branch.child-branch.parent "parent-branch"');

    // Act
    await runCommand(['restack'], testRepo, { prompts: { confirm: false } });

    // Assert - child should now include parent's v2 changes
    expect(testRepo.currentBranch()).toBe('child-branch');
    expect(testRepo.readFile('parent.ts')).toBe('parent v2');
  });

  it('rebases children when confirmed', async () => {
    // Arrange - create 3-level stack
    testRepo.git('checkout -b branch-a');
    testRepo.writeFile('a.ts', 'a v1');
    testRepo.git('add a.ts');
    testRepo.git('commit -m "A v1"');

    testRepo.git('checkout -b branch-b');
    testRepo.writeFile('b.ts', 'b');
    testRepo.git('add b.ts');
    testRepo.git('commit -m "B"');

    testRepo.git('checkout -b branch-c');
    testRepo.writeFile('c.ts', 'c');
    testRepo.git('add c.ts');
    testRepo.git('commit -m "C"');

    // Add commits to main
    testRepo.git('checkout main');
    testRepo.writeFile('main.ts', 'main update');
    testRepo.git('add main.ts');
    testRepo.git('commit -m "Main update"');

    testRepo.git('checkout branch-a');

    testRepo.git('config flowgit.tracked "branch-a,branch-b,branch-c"');
    testRepo.git('config flowgit.branch.branch-a.parent "main"');
    testRepo.git('config flowgit.branch.branch-b.parent "branch-a"');
    testRepo.git('config flowgit.branch.branch-c.parent "branch-b"');

    // Act - rebase branch-a and its children
    await runCommand(['restack'], testRepo, { prompts: { confirm: true } });

    // Assert - all branches should have the main update
    expect(testRepo.currentBranch()).toBe('branch-a');
    expect(testRepo.readFile('main.ts')).toBe('main update');

    testRepo.git('checkout branch-b');
    expect(testRepo.readFile('main.ts')).toBe('main update');

    testRepo.git('checkout branch-c');
    expect(testRepo.readFile('main.ts')).toBe('main update');
  });

  it('rebases onto trunk when parent is main', async () => {
    // Arrange - create branch off main
    testRepo.git('checkout -b feature-branch');
    testRepo.writeFile('feature.ts', 'feature');
    testRepo.git('add feature.ts');
    testRepo.git('commit -m "Feature"');

    // Add commits to main
    testRepo.git('checkout main');
    testRepo.writeFile('main.ts', 'main update');
    testRepo.git('add main.ts');
    testRepo.git('commit -m "Main update"');

    testRepo.git('checkout feature-branch');

    testRepo.git('config flowgit.tracked "feature-branch"');
    testRepo.git('config flowgit.branch.feature-branch.parent "main"');

    // Act
    await runCommand(['restack'], testRepo, { prompts: { confirm: false } });

    // Assert
    expect(testRepo.currentBranch()).toBe('feature-branch');
    expect(testRepo.readFile('main.ts')).toBe('main update');
  });

  it('handles rebase of deeply nested stack', async () => {
    // Arrange - create 4-level stack
    testRepo.git('checkout -b branch-a');
    testRepo.writeFile('a.ts', 'a');
    testRepo.git('add a.ts');
    testRepo.git('commit -m "A"');

    testRepo.git('checkout -b branch-b');
    testRepo.writeFile('b.ts', 'b');
    testRepo.git('add b.ts');
    testRepo.git('commit -m "B"');

    testRepo.git('checkout -b branch-c');
    testRepo.writeFile('c.ts', 'c');
    testRepo.git('add c.ts');
    testRepo.git('commit -m "C"');

    testRepo.git('checkout -b branch-d');
    testRepo.writeFile('d.ts', 'd');
    testRepo.git('add d.ts');
    testRepo.git('commit -m "D"');

    // Add update to main
    testRepo.git('checkout main');
    testRepo.writeFile('main.ts', 'update');
    testRepo.git('add main.ts');
    testRepo.git('commit -m "Update"');

    testRepo.git('checkout branch-a');

    testRepo.git('config flowgit.tracked "branch-a,branch-b,branch-c,branch-d"');
    testRepo.git('config flowgit.branch.branch-a.parent "main"');
    testRepo.git('config flowgit.branch.branch-b.parent "branch-a"');
    testRepo.git('config flowgit.branch.branch-c.parent "branch-b"');
    testRepo.git('config flowgit.branch.branch-d.parent "branch-c"');

    // Act - restack from branch-a
    await runCommand(['restack'], testRepo, { prompts: { confirm: true } });

    // Assert - all branches should have the update
    testRepo.git('checkout branch-d');
    expect(testRepo.readFile('main.ts')).toBe('update');
  });
});
