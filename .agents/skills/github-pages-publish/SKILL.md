---
name: github-pages-publish
description: >-
  Builds the latest version from the main branch in single-player mode, prepares the gh-pages branch with the production assets, and publishes the static app to GitHub Pages.
---

# GitHub Pages Publish Skill

## Overview
Automates the compilation and deployment of the single-player tactical conquest game to the `gh-pages` branch. It manages branch switching, temporary directory creation, assets copying, and provides error recovery to restore the working branch if any step fails.

## Dependencies
- `git`: For version control and branch management.
- `npm` / `npx`: To build the static production bundle using Vite.

## Quick Start
To build and deploy the latest single-player application:
```bash
./scripts/publish-gh-pages.sh
```

## Workflow
When this skill is triggered, the agent should follow this protocol:

### 1. Verification
- Verify that the local Git working tree on the `main` branch is clean (no uncommitted changes).
- If there are uncommitted changes, prompt the user to commit or stash them first.

### 2. Execution
- Execute the automation script:
  ```bash
  ./scripts/publish-gh-pages.sh
  ```
- Monitor the output of the script.
- If the script successfully builds the static bundle and commits it to the local `gh-pages` branch but fails to push to origin (due to missing remote credentials), explain the situation to the user and prompt them to run `git push -f origin gh-pages` manually.

### 3. Cleanup
- Verify that the agent is returned to the `main` branch and the temporary directory `dist-temp` is cleaned up.

## Common Mistakes
- **Running on non-clean branch**: Trying to run the script with modified files in the working directory. Always verify `git status` first.
- **Root paths in build**: Forgetting to use relative paths (`--base=./`) which causes assets to fail loading on subdirectory-based GitHub Pages URLs. The script handles this automatically.
