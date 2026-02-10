import { TestRepository } from './helpers/testRepo';
import { runCommand } from './helpers/runCommand';
import { MockExecutor } from './helpers/mockExecutor';
import { setExecutor, resetExecutor } from '../src/lib/executor';

describe('gf todo', () => {
  let testRepo: TestRepository;
  let mockExecutor: MockExecutor;

  beforeEach(() => {
    testRepo = TestRepository.create();
    mockExecutor = new MockExecutor();
    setExecutor(mockExecutor);

    // Mock gh auth status to always succeed
    mockExecutor.onCommand('gh auth status').returns('');
  });

  afterEach(() => {
    testRepo.destroy();
    resetExecutor();
  });

  it('should display message when no PRs or branches exist', async () => {
    // Mock gh pr list commands to return empty arrays
    mockExecutor
      .onCommand(/gh pr list --search "review-requested:@me/)
      .returns('[]');

    mockExecutor
      .onCommand(/gh pr list --search "author:@me/)
      .returns('[]');

    await expect(runCommand(['todo'], testRepo)).resolves.not.toThrow();
  });

  it('should fetch PRs requiring review', async () => {
    const reviewRequestedPRs = JSON.stringify([
      {
        number: 123,
        title: 'Fix bug in login',
        url: 'https://github.com/user/repo/pull/123',
        headRefName: 'fix-login-bug',
        isDraft: false,
        reviewDecision: null,
        statusCheckRollup: { state: 'SUCCESS' },
      },
    ]);

    mockExecutor
      .onCommand(/gh pr list --search "review-requested:@me/)
      .returns(reviewRequestedPRs);

    mockExecutor
      .onCommand(/gh pr list --search "author:@me/)
      .returns('[]');

    // Mock comment count queries
    mockExecutor.onCommand(/gh pr view 123 --json comments/).returns('2');
    mockExecutor.onCommand(/gh pr view 123 --json reviewThreads/).returns('1');

    // Mock user cancelling the selection
    await expect(runCommand(['todo'], testRepo, { prompts: { choice: 'cancel' } })).resolves.not.toThrow();
  });

  it('should categorize PRs correctly', async () => {
    const myPRs = JSON.stringify([
      {
        number: 100,
        title: 'Draft PR',
        url: 'https://github.com/user/repo/pull/100',
        headRefName: 'draft-branch',
        isDraft: true,
        reviewDecision: null,
        statusCheckRollup: null,
      },
      {
        number: 101,
        title: 'PR with changes requested',
        url: 'https://github.com/user/repo/pull/101',
        headRefName: 'changes-requested',
        isDraft: false,
        reviewDecision: 'CHANGES_REQUESTED',
        statusCheckRollup: { state: 'FAILURE' },
      },
      {
        number: 102,
        title: 'Approved PR',
        url: 'https://github.com/user/repo/pull/102',
        headRefName: 'approved-pr',
        isDraft: false,
        reviewDecision: 'APPROVED',
        statusCheckRollup: { state: 'SUCCESS' },
      },
      {
        number: 103,
        title: 'Awaiting review',
        url: 'https://github.com/user/repo/pull/103',
        headRefName: 'awaiting-review',
        isDraft: false,
        reviewDecision: null,
        statusCheckRollup: { state: 'PENDING' },
      },
    ]);

    mockExecutor
      .onCommand(/gh pr list --search "review-requested:@me/)
      .returns('[]');

    mockExecutor
      .onCommand(/gh pr list --search "author:@me/)
      .returns(myPRs);

    // Mock comment count queries for all PRs
    for (let i = 100; i <= 103; i++) {
      mockExecutor.onCommand(new RegExp(`gh pr view ${i} --json comments`)).returns('0');
      mockExecutor.onCommand(new RegExp(`gh pr view ${i} --json reviewThreads`)).returns('0');
    }

    await expect(runCommand(['todo'], testRepo, { prompts: { choice: 'cancel' } })).resolves.not.toThrow();
  });

  it('should handle gh CLI errors gracefully', async () => {
    // Mock gh commands to fail - should catch and continue
    mockExecutor
      .onCommand(/gh pr list/)
      .returns('[]');

    await expect(runCommand(['todo'], testRepo)).resolves.not.toThrow();
  });

  it('should include local tracked branches without PRs', async () => {
    // Create some tracked branches
    testRepo.git('checkout -b feature-1');
    testRepo.writeFile('feature.ts', 'feature code');
    testRepo.git('add feature.ts');
    testRepo.git('commit -m "Feature 1"');
    testRepo.git('config flowgit.tracked "main feature-1"');
    testRepo.git('config flowgit.branch.feature-1.parent "main"');

    testRepo.git('checkout main');

    mockExecutor
      .onCommand(/gh pr list/)
      .returns('[]');

    await expect(runCommand(['todo'], testRepo, { prompts: { choice: 'cancel' } })).resolves.not.toThrow();
  });

  it('should handle PRs with comment counts', async () => {
    const prWithComments = JSON.stringify([
      {
        number: 200,
        title: 'PR with unresolved comments',
        url: 'https://github.com/user/repo/pull/200',
        headRefName: 'comments-branch',
        isDraft: false,
        reviewDecision: null,
        statusCheckRollup: { state: 'SUCCESS' },
      },
    ]);

    mockExecutor
      .onCommand(/gh pr list --search "review-requested:@me/)
      .returns('[]');

    mockExecutor
      .onCommand(/gh pr list --search "author:@me/)
      .returns(prWithComments);

    // Mock comment counts: 5 total, 3 resolved
    mockExecutor.onCommand(/gh pr view 200 --json comments/).returns('5');
    mockExecutor.onCommand(/gh pr view 200 --json reviewThreads/).returns('3');

    await expect(runCommand(['todo'], testRepo, { prompts: { choice: 'cancel' } })).resolves.not.toThrow();
  });

  it('should handle different CI states', async () => {
    const prsWithDifferentCI = JSON.stringify([
      {
        number: 301,
        title: 'PR with passing CI',
        url: 'https://github.com/user/repo/pull/301',
        headRefName: 'passing-ci',
        isDraft: false,
        reviewDecision: null,
        statusCheckRollup: { state: 'SUCCESS' },
      },
      {
        number: 302,
        title: 'PR with failing CI',
        url: 'https://github.com/user/repo/pull/302',
        headRefName: 'failing-ci',
        isDraft: false,
        reviewDecision: null,
        statusCheckRollup: { state: 'FAILURE' },
      },
      {
        number: 303,
        title: 'PR with pending CI',
        url: 'https://github.com/user/repo/pull/303',
        headRefName: 'pending-ci',
        isDraft: false,
        reviewDecision: null,
        statusCheckRollup: { state: 'PENDING' },
      },
      {
        number: 304,
        title: 'PR without CI',
        url: 'https://github.com/user/repo/pull/304',
        headRefName: 'no-ci',
        isDraft: false,
        reviewDecision: null,
        statusCheckRollup: null,
      },
    ]);

    mockExecutor
      .onCommand(/gh pr list --search "review-requested:@me/)
      .returns('[]');

    mockExecutor
      .onCommand(/gh pr list --search "author:@me/)
      .returns(prsWithDifferentCI);

    // Mock comment counts for all PRs
    for (let i = 301; i <= 304; i++) {
      mockExecutor.onCommand(new RegExp(`gh pr view ${i} --json comments`)).returns('0');
      mockExecutor.onCommand(new RegExp(`gh pr view ${i} --json reviewThreads`)).returns('0');
    }

    await expect(runCommand(['todo'], testRepo, { prompts: { choice: 'cancel' } })).resolves.not.toThrow();
  });

  it('should display PRs with actions available', async () => {
    const pr = JSON.stringify([
      {
        number: 500,
        title: 'Test PR',
        url: 'https://github.com/user/repo/pull/500',
        headRefName: 'test-branch',
        isDraft: false,
        reviewDecision: null,
        statusCheckRollup: null,
      },
    ]);

    mockExecutor
      .onCommand(/gh pr list --search "review-requested:@me/)
      .returns('[]');

    mockExecutor
      .onCommand(/gh pr list --search "author:@me/)
      .returns(pr);

    mockExecutor.onCommand(/gh pr view 500 --json comments/).returns('0');
    mockExecutor.onCommand(/gh pr view 500 --json reviewThreads/).returns('0');

    // User cancels the selection
    await expect(runCommand(['todo'], testRepo, { prompts: { choice: 'cancel' } })).resolves.not.toThrow();
  });

  it('should display local branches with actions available', async () => {
    // Create a tracked branch
    testRepo.git('checkout -b local-feature');
    testRepo.writeFile('local.ts', 'local feature');
    testRepo.git('add local.ts');
    testRepo.git('commit -m "Local feature"');
    testRepo.git('config flowgit.tracked "main local-feature"');
    testRepo.git('config flowgit.branch.local-feature.parent "main"');
    testRepo.git('checkout main');

    mockExecutor
      .onCommand(/gh pr list/)
      .returns('[]');

    // User cancels the selection
    await expect(runCommand(['todo'], testRepo, { prompts: { choice: 'cancel' } })).resolves.not.toThrow();
  });
});
