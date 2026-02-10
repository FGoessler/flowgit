# Development Guide

## Project Setup

The FlowGit CLI tool is now set up and ready for testing!

### Testing the CLI

After running `npm link`, the `gf` command is globally available:

```bash
# Check version and help
gf --help
gf create --help

# Test in a test repository (not this one!)
cd /path/to/test-repo
gf create
```

## Development Workflow

### Making changes

1. Edit source files in `src/`
2. Rebuild: `npm run build`
3. Test: use the `gf` command (via alias or full path)

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
│   │   ├── create.ts     # gf create
│   │   ├── modify.ts     # gf modify
│   │   ├── co.ts         # gf co
│   │   ├── submit.ts     # gf submit
│   │   └── sync.ts       # gf sync
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

- ✅ `gf create` - Create branch with commit
  - Smart staging (all, select files, cancel)
  - Derives branch name from commit message
  - Tracks parent branch for stacking
  - Marks branch as tracked

- ✅ `gf modify` - Amend commits
  - Smart staging
  - Warns if branch has been pushed

- ✅ `gf co` - Smart checkout
  - Interactive picker for tracked branches
  - Sorted by most recently checked out
  - Can checkout by name (fetches from remote if needed)

- ✅ `gf submit` - Push and create PRs
  - Submits full stack by default
  - `--current` flag to submit only current branch
  - Smart force push detection
  - Creates PRs targeting parent branch
  - Extracts Linear ticket IDs

- ✅ `gf sync` - Synchronize branches
  - Fetches and updates trunk
  - Detects merged branches
  - Fast-forwards branches behind remote
  - Prompts to delete merged branches

### Phase 2: Stack Commands (TODO)

- [ ] `gf up` - Navigate to child branch
- [ ] `gf down` - Navigate to parent branch
- [ ] `gf log` - Visualize stack
- [ ] `gf restack` - Rebase stack

### Phase 3+: Future Enhancements

- [ ] Unit tests
- [ ] Integration tests
- [ ] AI-generated PR descriptions
- [ ] Linear API integration
- [ ] Configurable trunk branch
- [ ] Better error handling

## Testing Checklist

### Test `gf create`
- [ ] Create branch with staged changes
- [ ] Create branch with unstaged changes (stage all)
- [ ] Create branch with unstaged changes (select files)
- [ ] Create empty branch
- [ ] Create stacked branch (from non-main branch)
- [ ] Verify branch naming (kebab-case)

### Test `gf modify`
- [ ] Amend with staged changes
- [ ] Amend with unstaged changes (stage all)
- [ ] Amend with unstaged changes (select files)
- [ ] Error on no commits
- [ ] Error on no changes

### Test `gf co`
- [ ] Interactive checkout from tracked branches
- [ ] Checkout by name (existing local)
- [ ] Checkout by name (fetch from remote)
- [ ] Error on non-existent branch

### Test `gf submit`
- [ ] Submit single branch (new PR)
- [ ] Submit single branch (update existing PR)
- [ ] Submit stacked branches
- [ ] Submit with `--current` flag
- [ ] Force push prompt when remote ahead

### Test `gf sync`
- [ ] Fetch and update trunk
- [ ] Delete merged branches
- [ ] Fast-forward branches behind remote
- [ ] Show diverged branches

## Known Issues

1. **Command name conflict**: `gf` conflicts with shell built-in (see workaround above)
2. **No tests yet**: Manual testing required
3. **Linear integration**: Not implemented (regex detection only)
4. **AI PR descriptions**: Not implemented

## Next Steps

1. Add comprehensive error handling
2. Implement stack navigation commands (`up`, `down`, `log`, `restack`)
3. Write unit tests
4. Add integration tests
5. Consider alternative command name to avoid shell built-in conflict
