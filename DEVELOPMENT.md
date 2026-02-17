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
│   │   └── sync.ts       # fgt sync
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
├── tests/                # Tests (TODO)
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
  - Extracts Linear ticket IDs

- ✅ `fgt sync` - Synchronize branches
  - Fetches and updates trunk
  - Detects merged branches
  - Fast-forwards branches behind remote
  - Prompts to delete merged branches

### Phase 2: Stack Commands (TODO)

- [ ] `fgt up` - Navigate to child branch
- [ ] `fgt down` - Navigate to parent branch
- [ ] `fgt log` - Visualize stack
- [ ] `fgt restack` - Rebase stack

### Phase 3+: Future Enhancements

- [ ] Unit tests
- [ ] Integration tests
- [ ] AI-generated PR descriptions
- [ ] Linear API integration
- [ ] Configurable trunk branch
- [ ] Better error handling

## Testing Checklist

### Test `fgt create`
- [ ] Create branch with staged changes
- [ ] Create branch with unstaged changes (stage all)
- [ ] Create branch with unstaged changes (select files)
- [ ] Create empty branch
- [ ] Create stacked branch (from non-main branch)
- [ ] Verify branch naming (kebab-case)

### Test `fgt modify`
- [ ] Amend with staged changes
- [ ] Amend with unstaged changes (stage all)
- [ ] Amend with unstaged changes (select files)
- [ ] Error on no commits
- [ ] Error on no changes

### Test `fgt checkout` / `fgt co`
- [ ] Interactive checkout from tracked branches
- [ ] Checkout by name (existing local)
- [ ] Checkout by name (fetch from remote)
- [ ] Error on non-existent branch

### Test `fgt submit`
- [ ] Submit single branch (new PR)
- [ ] Submit single branch (update existing PR)
- [ ] Submit stacked branches
- [ ] Submit with `--current` flag
- [ ] Force push prompt when remote ahead

### Test `fgt sync`
- [ ] Fetch and update trunk
- [ ] Delete merged branches
- [ ] Fast-forward branches behind remote
- [ ] Show diverged branches

## Known Issues

1. **Command name**: `fgt` (no shell built-in conflict)
2. **No tests yet**: Manual testing required
3. **Linear integration**: Not implemented (regex detection only)
4. **AI PR descriptions**: Not implemented

## Next Steps

1. Add comprehensive error handling
2. Implement stack navigation commands (`up`, `down`, `log`, `restack`)
3. Write unit tests
4. Add integration tests
5. Publish to npm for easy installation
