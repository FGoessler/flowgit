# Development Guide

## Project Setup

The Flo(w)Git CLI tool is now set up and ready for testing!

### Testing the CLI

After running `npm link`, the `fgt` command is globally available:

```bash
# Check version and help
fgt --help
fgt create --help

# Test in a test repository (not this one!)
cd /path/to/test-repo
fgt create
```

## Development Workflow

### Making changes

1. Edit source files in `src/`
2. Rebuild: `npm run build`
3. Test: use the `fgt` command (via alias or full path)

### Quick development

Use tsx for faster iteration without building:

```bash
npm run dev -- create
npm run dev -- --help
```

## Project Structure

```
flowgit/
├── src/
│   ├── commands/         # Command implementations
│   │   ├── create.ts     # fgt create
│   │   ├── modify.ts     # fgt modify
│   │   ├── co.ts         # fgt checkout (alias: co)
│   │   ├── submit.ts     # fgt submit
│   │   ├── sync.ts       # fgt sync
│   │   ├── up.ts         # fgt up
│   │   ├── down.ts       # fgt down
│   │   ├── log.ts        # fgt log
│   │   ├── restack.ts    # fgt restack
│   │   └── todo.ts       # fgt todo
│   ├── lib/              # Utility libraries
│   │   ├── git.ts        # Git command wrappers
│   │   ├── gh.ts         # GitHub CLI wrappers
│   │   ├── config.ts     # Config management (tracked branches, parents)
│   │   ├── branch.ts     # Branch naming utilities
│   │   ├── prompts.ts    # Interactive prompts
│   │   └── output.ts     # Console output utilities
│   ├── types/            # TypeScript type definitions
│   │   └── index.ts
│   └── index.ts          # CLI entry point
├── dist/                 # Compiled JavaScript (generated)
├── tests/                # Tests (142+ passing)
├── package.json
├── tsconfig.json
└── README.md
```

## What's Implemented

### Phase 1: Core Commands ✅

- ✅ `fgt create` - Create branch with commit
  - Smart staging (all, select files, cancel)
  - Derives branch name from commit message
  - Tracks parent branch for stacking
  - Marks branch as tracked

- ✅ `fgt modify` - Amend commits
  - Smart staging
  - Warns if branch has been pushed

- ✅ `fgt checkout` (alias: `co`) - Smart checkout
  - Interactive picker for tracked branches
  - Sorted by most recently checked out
  - Can checkout by name (fetches from remote if needed)

- ✅ `fgt submit` - Push and create PRs
  - Submits full stack by default
  - `--current` flag to submit only current branch
  - Smart force push detection
  - Creates PRs targeting parent branch
  - AI-generated PR descriptions via Claude CLI

- ✅ `fgt sync` - Synchronize branches
  - Fetches and updates trunk
  - Detects merged branches
  - Fast-forwards branches behind remote
  - Prompts to delete merged branches

### Phase 2: Stack Commands ✅

- ✅ `fgt up` - Navigate to child branch
- ✅ `fgt down` - Navigate to parent branch
- ✅ `fgt log` - Visualize stack
- ✅ `fgt restack` - Rebase stack
- ✅ `fgt todo` - Interactive PR/branch dashboard

### Phase 3+: Future Enhancements

- ✅ Unit tests (142+ passing)
- ✅ Integration tests
- ✅ AI-generated PR descriptions
- ✅ Better error handling
- [ ] Linear API integration
- [ ] Configurable trunk branch

## Testing

All commands have comprehensive test suites in `tests/`. Run with:

```bash
npm test                    # All tests
npm run test:watch          # Watch mode
npm test -- create.test.ts  # Specific test file
```

## Known Issues

1. **Linear integration**: Not implemented
2. **Configurable trunk branch**: Hardcoded to `main`
