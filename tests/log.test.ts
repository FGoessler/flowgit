import { TestRepository } from './helpers/testRepo';
import { runCommand } from './helpers/runCommand';
import { MockExecutor } from './helpers/mockExecutor';
import { setExecutor, resetExecutor } from '../src/lib/executor';

describe('gf log', () => {
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

  it('displays simple stack', async () => {
    // Arrange - create simple stack: main -> feature
    testRepo.git('checkout -b feature-branch');
    testRepo.writeFile('feature.ts', 'feature code');
    testRepo.git('add feature.ts');
    testRepo.git('commit -m "Add feature"');

    testRepo.git('config flowgit.tracked "feature-branch"');
    testRepo.git('config flowgit.branch.feature-branch.parent "main"');

    // Mock gh to return no PR
    mockExecutor
      .onCommand('gh pr list --head feature-branch')
      .returns(JSON.stringify([]));

    // Act - should not throw
    await runCommand(['log'], testRepo);

    // Assert - just verify it runs without error
    expect(testRepo.currentBranch()).toBe('feature-branch');
  });

  it('displays multi-level stack', async () => {
    // Arrange - create 3-level stack
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

    testRepo.git('config flowgit.tracked "branch-a,branch-b,branch-c"');
    testRepo.git('config flowgit.branch.branch-a.parent "main"');
    testRepo.git('config flowgit.branch.branch-b.parent "branch-a"');
    testRepo.git('config flowgit.branch.branch-c.parent "branch-b"');

    // Mock gh to return no PRs
    mockExecutor
      .onCommand('gh pr list --head branch-a')
      .returns(JSON.stringify([]));
    mockExecutor
      .onCommand('gh pr list --head branch-b')
      .returns(JSON.stringify([]));
    mockExecutor
      .onCommand('gh pr list --head branch-c')
      .returns(JSON.stringify([]));

    // Act
    await runCommand(['log'], testRepo);

    // Assert - verify current branch is still the same
    expect(testRepo.currentBranch()).toBe('branch-c');
  });

  it('displays stack with PR information', async () => {
    // Arrange
    testRepo.git('checkout -b feature-with-pr');
    testRepo.writeFile('feature.ts', 'feature code');
    testRepo.git('add feature.ts');
    testRepo.git('commit -m "Add feature"');

    testRepo.git('config flowgit.tracked "feature-with-pr"');
    testRepo.git('config flowgit.branch.feature-with-pr.parent "main"');

    // Mock gh to return a PR
    mockExecutor
      .onCommand('gh pr list --head feature-with-pr')
      .returns(
        JSON.stringify([
          {
            number: 123,
            title: 'Add feature',
            state: 'OPEN',
            url: 'https://github.com/user/repo/pull/123',
            merged: false,
          },
        ])
      );

    // Act
    await runCommand(['log'], testRepo);

    // Assert - verify command runs successfully
    expect(testRepo.currentBranch()).toBe('feature-with-pr');
  });

  it('displays branching stack structure', async () => {
    // Arrange - create branching structure:
    // main -> a -> b
    //      -> c
    testRepo.git('checkout -b branch-a');
    testRepo.writeFile('a.ts', 'a');
    testRepo.git('add a.ts');
    testRepo.git('commit -m "A"');

    testRepo.git('checkout -b branch-b');
    testRepo.writeFile('b.ts', 'b');
    testRepo.git('add b.ts');
    testRepo.git('commit -m "B"');

    testRepo.git('checkout main');
    testRepo.git('checkout -b branch-c');
    testRepo.writeFile('c.ts', 'c');
    testRepo.git('add c.ts');
    testRepo.git('commit -m "C"');

    testRepo.git('config flowgit.tracked "branch-a,branch-b,branch-c"');
    testRepo.git('config flowgit.branch.branch-a.parent "main"');
    testRepo.git('config flowgit.branch.branch-b.parent "branch-a"');
    testRepo.git('config flowgit.branch.branch-c.parent "main"');

    // Mock gh
    mockExecutor.onCommand('gh pr list --head branch-a').returns(JSON.stringify([]));
    mockExecutor.onCommand('gh pr list --head branch-b').returns(JSON.stringify([]));
    mockExecutor.onCommand('gh pr list --head branch-c').returns(JSON.stringify([]));

    // Act
    await runCommand(['log'], testRepo);

    // Assert
    expect(testRepo.currentBranch()).toBe('branch-c');
  });

  it('works when on trunk branch', async () => {
    // Arrange - stay on main with no tracked branches
    testRepo.git('config flowgit.tracked ""');

    // Act
    await runCommand(['log'], testRepo);

    // Assert
    expect(testRepo.currentBranch()).toBe('main');
  });

  it('handles branches without parent config', async () => {
    // Arrange - create branch without parent
    testRepo.git('checkout -b orphan-branch');
    testRepo.writeFile('orphan.ts', 'orphan');
    testRepo.git('add orphan.ts');
    testRepo.git('commit -m "Orphan"');

    testRepo.git('config flowgit.tracked "orphan-branch"');
    // Don't set parent - should default to main

    mockExecutor
      .onCommand('gh pr list --head orphan-branch')
      .returns(JSON.stringify([]));

    // Act
    await runCommand(['log'], testRepo);

    // Assert
    expect(testRepo.currentBranch()).toBe('orphan-branch');
  });
});
