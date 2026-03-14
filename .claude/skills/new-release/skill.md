---
name: new-release
description: Create a new release of the plugin. Bumps version, builds, creates GitHub release, and updates PluginDatabase.
allowed-tools: Read, Edit, Bash, AskUserQuestion
---

# New Release

Creates a new release of the HLTB for Steam plugin, handling the full release workflow.

Before running this skill, run the game-id-review skill to ensure that the game IDs are high quality.

## Usage

```
/new-release
/new-release 1.2.3
```

If no version is provided, suggests a patch increment.

## Workflow

### Phase 1: Gather Information

1. Read `plugin.json` and `package.json` to get current local version
2. Verify versions match - abort with error if they differ
3. Get latest GitHub release version:
   ```bash
   gh release list --limit 1 --json tagName --jq '.[0].tagName'
   ```
4. Check git status:
   ```bash
   git status --porcelain
   git branch --show-current
   git fetch origin && git status -uno
   ```
5. Get commits since last release for release notes:
   ```bash
   git log v{GITHUB_VERSION}..HEAD --oneline --no-merges
   ```
6. Generate release notes: one bullet per commit, excluding:
   - Version bump commits ("Release v...")
   - Trivial commits (typos, formatting)
   - Skill/agent updates (.claude directory changes)
   - CI/workflow updates (.github directory changes)
7. Verify `../PluginDatabase` exists and contains the submodule:
   ```bash
   ls ../PluginDatabase/plugins/hltb-millennium-plugin
   ```

**Abort conditions:**
- Local versions don't match
- Working tree has uncommitted changes
- Not on main branch
- Local branch is behind remote

### Phase 2: Determine New Version

1. Parse current version as major.minor.patch
2. If user provided version argument, validate format (X.Y.Z) and use it
3. Otherwise, calculate patch increment (e.g., 1.0.4 → 1.0.5)
4. Use AskUserQuestion to confirm version:
   - Header: "Version"
   - Question: "Release version {SUGGESTED}?"
   - Options: suggested version, minor bump, major bump, custom

### Phase 3: Present Execution Plan

Display this exact format and ask for confirmation:

```
## Release Plan: v{NEW_VERSION}

### Current State
- Local version: {LOCAL_VERSION}
- GitHub release: {GITHUB_VERSION}
- Git: clean, on main, up-to-date

### Release Notes
- {BULLET_POINT_PER_SIGNIFICANT_COMMIT}
- ...

### Steps to Execute
1. Update plugin.json version: {OLD} -> {NEW}
2. Update package.json version: {OLD} -> {NEW}
3. Run `npm install` to update package-lock.json
4. Run `npm run build` to verify build succeeds
5. Run Lua tests to verify backend code
6. Commit: "Release v{NEW_VERSION}"
7. Push to origin/main
8. Trigger GitHub Action "Create Release"
9. Wait for release workflow to complete
10. Update submodule in ../PluginDatabase to latest commit
11. Commit in PluginDatabase: "Update HLTB for Steam to v{NEW_VERSION}"
12. Push PluginDatabase to origin
13. Create PR to SteamClientHomebrew/PluginDatabase

Proceed with release?
```

Use AskUserQuestion with options: "Yes, proceed" / "No, abort"

### Phase 4: Execute

Execute each step, reporting progress. Stop immediately on any failure.

#### Step 1-2: Update versions
Use Edit tool to update version in both files.

#### Step 3: npm install
```bash
npm install
```

#### Step 4: Build
```bash
npm run build
```
Abort if build fails.

#### Step 5: Run Lua tests
```bash
cmd //c "busted tests/"
```
Abort if any tests fail. If busted is not available, see `docs/development.md` section "Running Lua Tests" for setup instructions.

#### Step 6: Commit
```bash
git add plugin.json package.json
git commit -m "Release v{VERSION}"
```

#### Step 7: Push
```bash
git push origin main
```

#### Step 8: Trigger GitHub Action
```bash
gh workflow run release.yml -f version={VERSION}
```

#### Step 9: Wait for workflow
```bash
gh run list --workflow=release.yml --limit 1 --json status,conclusion,databaseId
```
Poll every 10 seconds until status is "completed". Abort if conclusion is not "success".

#### Step 10: Update submodule
```bash
cd ../PluginDatabase/plugins/hltb-millennium-plugin
git fetch origin
git checkout origin/main
cd ../..
```

#### Step 11: Commit PluginDatabase
```bash
cd ../PluginDatabase
git add plugins/hltb-millennium-plugin
git commit -m "Update HLTB for Steam to v{VERSION}"
```

#### Step 12: Push PluginDatabase
```bash
cd ../PluginDatabase
git push origin
```

#### Step 13: Create PR
```bash
cd ../PluginDatabase
gh pr create --repo SteamClientHomebrew/PluginDatabase --title "Update HLTB for Steam to v{VERSION}" --body "Updates the HLTB for Steam plugin submodule to v{VERSION}.

## Changes
{RELEASE_NOTES_AS_BULLET_POINTS}"
```

### Completion

Report success with:
- GitHub release URL
- PluginDatabase PR URL

## Error Messages

Provide clear, actionable error messages:

- **Versions don't match**: "plugin.json has version {X} but package.json has version {Y}. Fix this manually before releasing."
- **Dirty working tree**: "Uncommitted changes detected. Commit or stash changes before releasing."
- **Wrong branch**: "Currently on branch {X}. Switch to main before releasing."
- **Behind remote**: "Local main is behind origin/main. Pull latest changes first."
- **Build failed**: "Build failed. Fix build errors before releasing."
- **Tests failed**: "Lua tests failed. Fix test failures before releasing."
- **Workflow failed**: "GitHub release workflow failed. Check Actions tab for details."
