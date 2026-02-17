# Stack Navigation Demo

## Overview

Flo(w)Git now supports full stack navigation! This allows you to create multiple dependent PRs and easily navigate between them.

## Quick Start

### 1. Create a Stack

```bash
# Start on main
cd my-project

# Create first branch
fgt create
# Enter: "Add API endpoint"
# Creates: add-api-endpoint (parent: main)

# Create second branch on top
fgt create
# Enter: "Add frontend for API"
# Creates: add-frontend-for-api (parent: add-api-endpoint)

# Create third branch on top
fgt create
# Enter: "Add tests"
# Creates: add-tests (parent: add-frontend-for-api)
```

### 2. Visualize Your Stack

```bash
fgt log
```

Output:
```
main
  └─> add-api-endpoint (no PR)
       └─> add-frontend-for-api (no PR)
            └─> add-tests (no PR) ← current
```

### 3. Navigate the Stack

```bash
# Move down to parent branch
fgt down
# ✓ Switched to branch 'add-frontend-for-api'

fgt down
# ✓ Switched to branch 'add-api-endpoint'

# Move up to child branch
fgt up
# ✓ Switched to branch 'add-frontend-for-api'

fgt up
# ✓ Switched to branch 'add-tests'
```

### 4. Submit the Stack

```bash
# Submit all branches in the stack (creates 3 PRs)
fgt submit
# ✓ Pushed add-api-endpoint → main (PR #101)
# ✓ Pushed add-frontend-for-api → add-api-endpoint (PR #102)
# ✓ Created PR #103: Add tests (add-tests → add-frontend-for-api)
```

### 5. View Stack with PRs

```bash
fgt log
```

Output:
```
main
  └─> add-api-endpoint (#101 ✓)
       └─> add-frontend-for-api (#102 ✓)
            └─> add-tests (#103 ✓) ← current
```

### 6. Make Changes to Middle Branch

```bash
# Navigate to middle branch
fgt down

# Make changes
echo "Updated API" > api-update.txt
fgt modify

# Restack dependent branches
fgt restack
# ✓ Rebased add-frontend-for-api onto add-api-endpoint
# ? Rebase children branches too? Yes
# ✓ Rebased add-tests onto add-frontend-for-api
# ✓ Restacked 2 branches

# Submit updates
fgt submit
```

## Commands Reference

### `fgt up`
Navigate to the child branch (move up the stack, away from trunk).

```bash
fgt up
```

If multiple children exist, shows a picker:
```
? Multiple branches built on 'add-api':
  > add-frontend
    add-mobile
```

### `fgt down`
Navigate to the parent branch (move down the stack, toward trunk).

```bash
fgt down
```

### `fgt log`
Display a visual tree of your branch stack with PR information.

```bash
fgt log
```

Shows:
- Branch hierarchy
- PR numbers and status
- Current branch indicator
- Merged status

### `fgt restack`
Rebase the current branch onto its parent, with option to restack children.

```bash
fgt restack
```

Workflow:
1. Fetches latest from origin
2. Updates parent branch if it has a remote
3. Rebases current branch onto parent
4. Optionally rebases all children recursively

## Advanced Stack Patterns

### Linear Stack
```
main → feature-a → feature-b → feature-c
```

### Branching Stack
```
main
  ├─> feature-a
  │    └─> feature-a-enhancement
  └─> feature-b
       └─> feature-b-tests
```

### Deep Stack
```
main → api → validation → frontend → styling → tests
```

## Tips

1. **Keep stacks small**: 3-5 branches max for easy review
2. **Use descriptive names**: Branch names should explain what each PR does
3. **Restack early**: Run `fgt restack` after modifying parent branches
4. **Visualize often**: Use `fgt log` to see your stack structure
5. **Submit frequently**: Use `fgt submit` to keep PRs up to date

## Common Workflows

### Adding a Feature to the Middle of a Stack

```bash
# Navigate to the position where you want to insert
fgt checkout add-api-endpoint

# Create new branch
fgt create
# This becomes a child of add-api-endpoint

# Existing children remain attached to add-api-endpoint
# You can manually change parent relationships if needed
```

### Merging a Stack

Once the first PR is merged:
```bash
fgt sync
# Detects merged branches and offers to clean up
# Children automatically adopt grandparent (main)
```

### Recovering from Rebase Conflicts

If `fgt restack` fails:
```bash
# Resolve conflicts manually
git status
# ... fix conflicts ...
git add .
git rebase --continue

# Then restack children
fgt restack
```

## Next Steps

- Try creating your first stack!
- Use `fgt log` frequently to visualize your work
- Submit stacks with `fgt submit` (it handles all PRs at once)
- Clean up merged branches with `fgt sync`
