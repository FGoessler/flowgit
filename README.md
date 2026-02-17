# Flo(w)Git (fgt)

**Flo(w)Git** — Flo's variant of git that flows. A workflow-optimized wrapper around git and gh CLI, inspired by Graphite, designed for fast-paced feature development with PR-based workflows.

## Overview

Flo(w)Git simplifies common git workflows by providing smart, interactive commands that handle the tedious parts of branch management, commits, and PR creation. It tracks your working branches and provides an optimized interface for switching between them.

## Installation

```bash
npm install -g flowgit
```

Or run directly with npx:

```bash
npx flowgit <command>
```

## Core Concepts

### Tracked Branches

Flo(w)Git maintains a list of "tracked branches" - branches that you're actively working on. This allows commands like `fgt checkout` to show only relevant branches instead of cluttering your view with every branch in the repository.

**How branches become tracked:**

- Created via `fgt create`
- Explicitly checked out by name via `fgt checkout <branch-name>`

**Where tracked branches are stored:**

- `.git/config` using git's native configuration

### Branch Naming

Branches are automatically named in `kebab-case` derived from commit messages:

- Commit: "Add user authentication" → Branch: `add-user-authentication`
- Commit: "Fix: login button not working" → Branch: `fix-login-button-not-working`

### Branch Stacking

Flo(w)Git supports **stacking** - creating multiple PRs that build on top of each other. This keeps PRs small and focused while allowing you to continue working on dependent features.

**How stacking works:**
- Each branch can have a **parent branch** (defaults to `main`)
- When you run `fgt create` from a branch, the new branch's parent is the current branch
- PRs target their parent branch, not main
- When you run `fgt submit`, it submits all branches from main to current (the entire stack)

**Example stack:**
```
main
  └─> add-api-endpoint (PR #1 → main)
       └─> add-frontend (PR #2 → add-api-endpoint)
            └─> add-tests (PR #3 → add-frontend)
```

**Parent relationship:**
- Stored in `.git/config` as `flowgit.branch.<branch-name>.parent`
- Automatically set when creating a branch
- Can be changed manually if needed

## Commands

### Git passthrough

Unknown commands are passed through to git. This lets you use `fgt` as a drop-in replacement in many workflows:

- `fgt status` → `git status`
- `fgt branch` → `git branch`
- `fgt diff` → `git diff`
- `fgt commit -m "message"` → `git commit -m "message"`

Only the commands listed below are handled by fgt; all other subcommands are forwarded to git unchanged.

### `fgt create`

Creates a new branch based on current changes, prompts for a commit message, and derives the branch name automatically.

**Behavior:**

1. Checks if there are any changes (staged or unstaged)
2. If changes exist but nothing is staged:
   - Shows options:
     - "Stage all" - stages all changes
     - "Select files" - interactive file selector
     - "Cancel" - aborts the operation
3. If still no staged changes, prompts: "No changes to commit. Create empty branch? (y/N)"
4. Prompts for commit message
5. Derives branch name from commit message (kebab-case)
6. Creates the branch and commits staged changes
7. Marks the branch as tracked
8. **Records parent branch** (the branch you were on when running `fgt create`)
9. Displays: `✓ Created branch 'branch-name' and committed changes`
   - If stacking: `✓ Created branch 'branch-name' (parent: parent-branch) and committed changes`

**Examples:**

```bash
# Interactive flow
$ fgt create
? You have unstaged changes. What would you like to do?
  > Stage all
    Select files
    Cancel

? Enter commit message: Add user authentication

✓ Created branch 'add-user-authentication' and committed changes
```

**Edge Cases:**

- If no changes exist, create an empty branch (after confirmation)
- If already on a branch created via fgt create, create a new branch from current branch
- Validate branch name doesn't already exist

---

### `fgt submit`

Pushes the current branch (and its stack) to GitHub and creates/updates pull requests.

**Behavior:**

1. **Determines the stack**: Walks up the parent chain from current branch to trunk (main)
   - Example: If on `add-tests`, and parent is `add-frontend`, and its parent is `add-api`, and its parent is `main`
   - Stack to submit: `add-api`, `add-frontend`, `add-tests`
2. **For each branch in the stack** (from trunk outward):
   - Checks if branch has a remote tracking branch
   - If remote exists:
     - Fetches remote branch
     - Compares local vs remote commits
     - If remote is ahead: automatically force pushes with `--force-with-lease`
     - If local is ahead or same: proceeds with push
   - If no remote exists: pushes with `-u origin <branch-name>`
3. **For each branch in the stack**:
   - Checks if PR exists using `gh pr list --head <branch-name>`
   - If PR doesn't exist:
     - Derives PR title from the **first commit** on the branch (after parent)
     - Generates PR description using Claude CLI if available
     - Creates PR targeting **parent branch**: `gh pr create --title "<title>" --body "<description>" --base <parent-branch>`
     - Automatically opens the PR in your browser
     - Displays: `✓ Created PR #123: <title> (<branch> → <parent>)`
   - If PR exists:
     - Displays: `✓ Pushed changes to PR #123: <title>`

**Flags:**
- `fgt submit --current` - Only submit the current branch, not the full stack

**PR Title Generation:**

- Uses the commit message of the first commit on the branch
- Extracts Linear ticket ID if present (e.g., "PTL-1234")
- Format: `[PTL-1234] Commit message` or just `Commit message`

**Examples:**

```bash
# Single branch (no stack)
$ fgt submit
↑ Pushing add-user-auth to origin...
✓ Created PR #123: Add user authentication (add-user-auth → main)
  https://github.com/user/repo/pull/123

# Stacked branches
$ fgt submit
↑ Pushing 3 branches in stack...
✓ Pushed add-api → main (PR #101)
✓ Pushed add-frontend → add-api (PR #102)
✓ Created PR #103: Add tests (add-tests → add-frontend)
  https://github.com/user/repo/pull/103

# Only submit current branch
$ fgt submit --current
↑ Pushing add-tests to origin...
✓ Pushed changes to PR #103: Add tests
```

**Current Features:**

- ✅ AI-generated PR descriptions using Claude CLI (if installed)
- ✅ Automatic PR opening in browser

**Future Enhancements:**

- Linear ticket description integration via API/MCP

---

### `fgt modify`

Amends the current commit with new changes. A quick way to add changes to the last commit without creating a new commit.

**Behavior:**

1. Checks if there are any changes (staged or unstaged)
2. If changes exist but nothing is staged:
   - Shows options:
     - "Stage all" - stages all changes
     - "Select files" - interactive file selector
     - "Cancel" - aborts the operation
3. If staged changes exist:
   - Runs `git commit --amend --no-edit`
   - Displays: `✓ Amended commit: <commit-message>`
4. If no changes at all:
   - Displays: `✗ No changes to amend`

**Examples:**

```bash
$ fgt modify
? You have unstaged changes. What would you like to do?
  > Stage all
    Select files
    Cancel

✓ Amended commit: Add user authentication
```

**Edge Cases:**

- If there's no previous commit (empty branch), show error: "No commits to amend"
- Does not change commit message
- Warns if the branch has been pushed: "⚠ Branch has been pushed. You'll need to force push."

---

### `fgt checkout` (alias: `co`)

Smart branch checkout with fuzzy search through tracked branches.

**Behavior:**

1. If branch name is provided: `fgt checkout <branch-name>`
   - Checks if branch exists locally
   - If exists: checks out the branch and marks it as tracked
   - If not exists locally: tries to fetch from `origin/<branch-name>` and checkout
   - If not found remotely: displays error "Branch '<branch-name>' not found"
2. If no branch name provided: `fgt checkout`
   - Shows interactive picker with tracked branches
   - Sorts by most recently checked out (use git reflog)
   - Displays branch name and last commit message
   - Supports fuzzy search/filtering
   - On selection: checks out the branch

**Interactive Display:**

```bash
$ fgt checkout
? Select a branch:
  > add-user-authentication (Add user authentication) - 2 minutes ago
    fix-login-button (Fix login button not working) - 1 hour ago
    update-dashboard (Update dashboard layout) - 2 days ago
```

**Examples:**

```bash
# Interactive mode
$ fgt checkout
? Select a branch: [interactive picker]

# Direct checkout (co is an alias)
$ fgt checkout feature-branch
✓ Switched to branch 'feature-branch'

# Fetch from remote
$ fgt co remote-branch
↓ Fetching branch from origin...
✓ Switched to branch 'remote-branch'
```

---

### `fgt sync`

Synchronizes tracked branches with remote and cleans up merged branches.

**Behavior:**

1. Fetches from origin: `git fetch origin`
2. Checks out `main` branch and pulls latest: `git checkout main && git pull`
3. Analyzes all tracked branches:
   - **Merged branches**: Checks if branch is merged into main
   - **Behind remote**: Checks if remote tracking branch has new commits
   - **Ahead of remote**: Local has unpushed commits
   - **Diverged**: Both local and remote have different commits
4. For **merged branches**:
   - Shows list: "These branches have been merged:"
   - Prompts: "Delete merged branches? (y/N)"
   - If yes: deletes local branches and removes from tracked list
   - **For stacked branches**: Updates children to point to grandparent (adopts grandparent)
5. For **behind remote** branches:
   - If no local changes: automatically fast-forwards
   - If has local changes: shows warning "Branch 'x' has diverged. Manual rebase needed."
6. Displays summary:
   ```
   ✓ Synced 3 branches
   ✓ Deleted 2 merged branches
   ⚠ 1 branch needs manual rebase
   ```

**Examples:**

```bash
$ fgt sync
↓ Fetching from origin...
↓ Updating main...

Merged branches:
  - feature-old
  - bugfix-123

? Delete merged branches? (y/N) y
✓ Deleted feature-old
✓ Deleted bugfix-123

Behind remote:
  ↓ Fast-forwarded feature-new (3 commits)

⚠ Diverged branches (manual rebase needed):
  - feature-conflict

✓ Synced 5 tracked branches
```

**Edge Cases:**

- If currently on a branch being deleted, switch to main first
- Skip main/master from tracked branches list
- Handle detached HEAD state

---

### `fgt up`

Navigate to the child branch in the stack (move up the stack, away from trunk).

**Behavior:**

1. Checks if any tracked branch has the current branch as its parent
2. If multiple children exist, shows a picker to select which one
3. If one child exists, checks out that branch
4. If no children exist: `✗ No branches built on top of '<current-branch>'`

**Examples:**

```bash
# On add-api, navigate to add-frontend
$ fgt up
✓ Switched to branch 'add-frontend'

# Multiple children
$ fgt up
? Multiple branches built on 'add-api':
  > add-frontend
    add-mobile
```

---

### `fgt down`

Navigate to the parent branch in the stack (move down the stack, toward trunk).

**Behavior:**

1. Checks if current branch has a parent
2. If parent exists, checks out parent branch
3. If no parent (parent is main): `✗ Already at trunk`

**Examples:**

```bash
# On add-frontend, navigate to add-api
$ fgt down
✓ Switched to branch 'add-api'

# Already at trunk
$ fgt down
✗ Already at trunk (main)
```

---

### `fgt log`

Displays a visual representation of your current branch stack.

**Behavior:**

1. If current branch has no parent and no children:
   - Shows: `main ← <current-branch>`
2. If current branch is part of a stack:
   - Shows the full stack from main to the tip
   - Highlights current branch
   - Shows PR status for each branch

**Examples:**

```bash
$ fgt log
main
  └─> add-api-endpoint (#101 ✓)
       └─> add-frontend (#102 ✓)
            └─> add-tests (#103) ← current

$ fgt log
main
  ├─> add-api-endpoint (#101 ✓)
  │    └─> add-frontend (#102 ✓)
  │         └─> add-tests (#103) ← current
  └─> fix-bug (#104 ✓)
```

**Symbols:**
- `(#123 ✓)` - PR exists and is open
- `(#123 ✓ merged)` - PR was merged
- `(no PR)` - No PR created yet
- `← current` - Current branch

---

### `fgt restack`

Rebases the current branch (and its descendants) on top of the latest parent.

**Behavior:**

1. Determines the parent branch
2. Fetches latest changes: `git fetch origin`
3. Updates parent branch if it has a remote
4. Rebases current branch onto parent: `git rebase <parent>`
5. If current branch has children:
   - Asks: "Rebase children branches too? (Y/n)"
   - If yes: recursively rebases each child onto its parent
6. Displays: `✓ Rebased <branch> onto <parent>`

**Examples:**

```bash
# Simple rebase
$ fgt restack
↓ Fetching from origin...
↓ Rebasing add-frontend onto add-api...
✓ Rebased add-frontend onto add-api

# Rebase with children
$ fgt restack
↓ Fetching from origin...
↓ Rebasing add-frontend onto add-api...
✓ Rebased add-frontend onto add-api
? Rebase children branches too? (Y/n) y
↓ Rebasing add-tests onto add-frontend...
✓ Rebased add-tests onto add-frontend
✓ Restacked 2 branches
```

**Edge Cases:**
- If rebase conflicts: stop and display: `✗ Rebase conflicts. Resolve manually and run 'git rebase --continue'`
- If already up to date: `✓ Already up to date`

---

## Configuration

Configuration is stored in `.git/config` using git's native configuration.

**Tracked branches:**

```
[flowgit]
    tracked = branch1,branch2,branch3
```

**Branch parent relationships (for stacking):**

```
[flowgit "branch.add-frontend"]
    parent = add-api
[flowgit "branch.add-tests"]
    parent = add-frontend
```

**Access via git config:**

```bash
# Get tracked branches
git config --get flowgit.tracked

# Set tracked branches
git config flowgit.tracked "branch1,branch2"

# Get branch parent
git config --get flowgit.branch.<branch-name>.parent

# Set branch parent
git config flowgit.branch.<branch-name>.parent "parent-branch"
```

**Future configuration options (not in initial version):**

- Default trunk branch (currently hardcoded to `main`)
- Branch naming prefix (e.g., `flo/`)
- Linear integration settings
- AI API keys

---

## Technical Details

### Tech Stack

- **Language**: TypeScript
- **CLI Framework**: Commander.js for command parsing
- **Interactive Prompts**: Inquirer.js for user input
- **Styling**: Chalk for colored output, Ora for spinners
- **Git Operations**: Direct shell execution of git/gh commands
- **Testing**: Jest or Vitest

### Project Structure

```
flowgit/
├── src/
│   ├── commands/
│   │   ├── create.ts
│   │   ├── submit.ts
│   │   ├── modify.ts
│   │   ├── co.ts
│   │   └── sync.ts
│   ├── lib/
│   │   ├── git.ts          # Git wrapper functions
│   │   ├── gh.ts           # GitHub CLI wrapper functions
│   │   ├── config.ts       # Config management
│   │   ├── branch.ts       # Branch naming & tracking logic
│   │   └── prompts.ts      # Reusable prompt functions
│   ├── types/
│   │   └── index.ts        # TypeScript type definitions
│   └── index.ts            # CLI entry point
├── tests/
│   └── ...
├── package.json
├── tsconfig.json
└── README.md
```

### Dependencies

```json
{
  "dependencies": {
    "commander": "^11.0.0",
    "inquirer": "^9.0.0",
    "chalk": "^5.0.0",
    "ora": "^7.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/inquirer": "^9.0.0",
    "typescript": "^5.0.0",
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0",
    "ts-jest": "^29.0.0"
  }
}
```

### Git Commands Reference

**Commands that will be used:**

- `git status --porcelain` - Check for changes
- `git add -A` - Stage all changes
- `git add <files>` - Stage specific files
- `git commit -m "<message>"` - Create commit
- `git commit --amend --no-edit` - Amend commit
- `git branch` - List branches
- `git checkout -b <branch>` - Create and checkout branch
- `git checkout <branch>` - Checkout branch
- `git fetch origin` - Fetch from remote
- `git pull` - Pull changes
- `git push -u origin <branch>` - Push and set upstream
- `git push` - Push changes
- `git push --force-with-lease` - Force push safely
- `git rev-list --left-right --count origin/branch...branch` - Compare commits
- `git log --oneline` - Show commit history
- `git reflog --date=relative` - Show checkout history
- `git branch --merged main` - List merged branches
- `git branch -d <branch>` - Delete branch
- `git config --get flowgit.tracked` - Get tracked branches
- `git config flowgit.tracked "..."` - Set tracked branches
- `git config --get flowgit.branch.<name>.parent` - Get branch parent
- `git config flowgit.branch.<name>.parent "..."` - Set branch parent
- `git rebase <parent>` - Rebase current branch onto parent
- `git log <parent>..<branch> --oneline` - Show commits on branch since parent
- `git merge-base <branch1> <branch2>` - Find common ancestor

**GitHub CLI commands:**

- `gh pr list --head <branch>` - Check if PR exists
- `gh pr create --title "..." --body "..." --base <parent>` - Create PR with custom base
- `gh pr view <number>` - View PR details

---

## Development Roadmap

### Phase 1: Core Commands (MVP)

- [x] Project setup & specification
- [x] `fgt create` - Basic branch creation (with parent tracking)
- [x] `fgt modify` - Amend commits
- [x] `fgt checkout` (alias: `co`) - Branch checkout
- [x] `fgt submit` - Push & PR creation (single branch)
- [x] `fgt sync` - Branch synchronization

### Phase 2: Stacking Support

- [x] `fgt submit` - Stack submission (submit all branches in stack)
- [x] `fgt up` / `fgt down` - Stack navigation
- [x] `fgt log` - Stack visualization
- [x] `fgt restack` - Rebase stack
- [x] `fgt sync` - Handle stacked branches (adopt grandparent when parent merged)

### Phase 3: Enhancements

- [ ] Better error handling & validation
- [ ] Unit tests for all commands
- [ ] Integration tests
- [ ] Improved interactive UX
- [ ] `fgt submit --current` flag for single-branch submit

### Phase 4: Advanced Features

- [ ] AI-generated PR descriptions
- [ ] Linear API integration
- [ ] Configurable default branch
- [ ] Branch naming prefixes
- [ ] Multi-level stack visualization in `fgt log`

---

## Contributing

This is a personal workflow tool, but suggestions and improvements are welcome!

## License

MIT
