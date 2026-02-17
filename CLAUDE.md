# Flo(w)Git - Claude Context

## Project Overview

Flo(w)Git (`fgt`) is a workflow-optimized git wrapper inspired by Graphite. Flo's variant of git that flows. It simplifies branch management, commits, and PR creation with smart defaults and branch stacking support.

## Key Principles

### 1. Command Naming
- **CLI command is `fgt`**
- Keep commands short and intuitive: `create`, `modify`, `checkout` (alias: `co`), `submit`, `sync`, `up`, `down`, `log`, `restack`, `todo`
- Unknown commands fall through to git (e.g. `fgt status` → `git status`)

### 2. Testing Philosophy
- **Use real git operations** in temporary repos - they're fast and reliable
- **Mock external APIs** (GitHub CLI, Linear) via dependency injection
- **Mock interactive prompts** to enable automated testing
- Each test gets a fresh temporary git repository

### 3. User Experience Principles

#### Graceful Cancellation
- **ESC key handling**: All prompts can be cancelled with ESC
- Cancellation exits with code 0 and shows "Cancelled" message
- No error stack traces on user cancellation
- Implemented via `handleCancellation` wrapper in prompts.ts

### 4. Architecture Patterns

#### Dependency Injection for Testability
All external command execution goes through an injected `CommandExecutor`:
```typescript
export interface CommandExecutor {
  exec(cmd: string, options?: ExecOptions): string;
}
```

This allows tests to:
- Mock `gh` CLI commands
- Record what commands were called
- Return controlled responses
- Still use real git commands for reliability

#### Configuration Storage
- Tracked branches: `.git/config` → `flowgit.tracked`
- Branch parents (stacking): `.git/config` → `flowgit.branch.<name>.parent`
- Uses native git config - no external files needed

#### Branch Naming
- Converts commit messages to kebab-case
- Removes special characters
- Limits length to 50 characters
- Example: "Add user authentication" → "add-user-authentication"

### 5. Stacking Model

Simple parent-pointer model:
```
main (trunk)
  └─> add-api (parent: main)
       └─> add-frontend (parent: add-api)
            └─> add-tests (parent: add-frontend)
```

- Each branch stores its parent in git config
- PRs target parent branch (not main)
- `fgt submit` walks up the stack and submits all branches
- `fgt submit --current` submits only current branch

### 6. Code Organization

```
src/
├── commands/          # Command implementations (create, modify, co, submit, sync, up, down, log, restack, todo)
├── lib/
│   ├── executor.ts    # CommandExecutor interface & implementations
│   ├── git.ts         # Git operations (uses executor)
│   ├── gh.ts          # GitHub CLI operations (uses executor)
│   ├── config.ts      # Git config management
│   ├── branch.ts      # Branch naming utilities
│   ├── prompts.ts     # Interactive prompts
│   └── output.ts      # Console output helpers
└── types/             # TypeScript type definitions
```

### 7. Common Issues & Solutions

#### Issue: Tests failing with "not in a git repository"
**Solution:** Ensure test setup calls `git init` and sets working directory

#### Issue: Commits failing in tests
**Solution:** Set git user in test repo:
```typescript
git.execGit('config user.name "Test User"');
git.execGit('config user.email "test@example.com"');
```

#### Issue: Interactive prompts hanging tests
**Solution:** Mock inquirer or use non-interactive mode

#### Issue: gh commands failing in CI
**Solution:** Mock gh via executor - tests should never call real gh

### 8. Testing Patterns

#### Test Structure
```typescript
describe('fgt create', () => {
  let testRepo: TestRepository;
  let mockGh: MockGitHubCLI;

  beforeEach(() => {
    testRepo = await createTestRepo();
    mockGh = new MockGitHubCLI();
  });

  afterEach(() => {
    testRepo.cleanup();
  });

  it('creates branch with commit', async () => {
    // Arrange
    await testRepo.writeFile('test.txt', 'content');

    // Act
    await runCommand(['create'], testRepo, {
      prompts: { message: 'Add feature' }
    });

    // Assert
    expect(testRepo.currentBranch()).toBe('add-feature');
    expect(testRepo.lastCommitMessage()).toBe('Add feature');
  });
});
```

#### Mock gh Commands
```typescript
mockGh.onCommand('pr list --head feature-branch')
  .returns(JSON.stringify([])); // No PR exists

mockGh.onCommand('pr create')
  .returns(JSON.stringify({ number: 123, url: '...' }));
```

### 9. Implementation Status

**All commands implemented:**
- `fgt create` - Branch creation with parent tracking
- `fgt modify` - Amend commits
- `fgt checkout` (alias: `co`) - Smart checkout with tracked branch picker
- `fgt submit` - Push & PR creation (with stack support)
- `fgt sync` - Synchronize and cleanup branches (detects merged/closed PRs, remote-deleted branches)
- `fgt up` / `fgt down` - Navigate stack
- `fgt log` - Visualize stack (multi-level tree)
- `fgt restack` - Rebase stack
- `fgt todo` - Interactive PR/branch dashboard

### 10. Development Workflow

#### Making Changes
```bash
# Edit source files
npm run build

# Run tests
npm test

# Test manually
fgt --help
```

#### Running Tests
```bash
# All tests
npm test

# Watch mode
npm test -- --watch

# Specific test file
npm test -- create.test.ts
```

#### Debugging
- Tests use real git operations - you can inspect temp repos
- Use `console.log` or debugger in command files
- Check `.git/config` to verify tracked branches and parents

### 11. Future Considerations

#### Performance
- Git operations in temp repos are fast (<10ms each)
- Mocking gh is essential - don't make real API calls in tests
- Consider caching git config reads if performance becomes an issue

#### Error Handling
- Always provide clear error messages
- Show git command output on failures
- Validate state before operations (e.g., check if in git repo)

#### User Experience
- Default to safe operations (no force push without confirmation)
- Show progress spinners for slow operations
- Color-code output (green=success, red=error, yellow=warning)

### 12. Key Files to Reference

- **README.md**: Full specification of all commands
- **DEVELOPMENT.md**: Development and testing guide
- **src/lib/executor.ts**: Command execution abstraction
- **tests/helpers/**: Test utilities and mocks

### 13. Don't Forget

- **Never use replace_all on user-facing text** - it breaks spacing
- **Test with real git repos** - they're more reliable than mocks
- **Keep the CLI fast** - users expect snappy responses
- **Trunk branch is "main"** - hardcoded for now, configurable later

## Questions to Ask When Implementing New Features

1. Does this need to be mocked in tests? (gh, Linear, network)
2. Does this modify git state? (needs assertions in tests)
3. Does this need user confirmation? (force push, delete branches)
4. Does this work with stacked branches? (parent relationships)
5. What error states exist? (not in git repo, no commits, conflicts)

## Common Git Commands Used

```bash
# Status & Changes
git status --porcelain
git diff

# Branches
git branch --show-current
git checkout -b <branch>
git branch --merged main

# Commits
git commit -m "message"
git commit --amend --no-edit
git log -1 --pretty=%B

# Remotes
git fetch --prune origin
git push -u origin <branch>
git push --force-with-lease
git rev-list --left-right --count origin/branch...branch

# Config
git config --get flowgit.tracked
git config flowgit.branch.<name>.parent "parent"
```

## References

- Graphite CLI: https://graphite.dev/docs
- Git stacking model: Parent pointers stored in git config
- Testing approach: Real git + mocked externals
