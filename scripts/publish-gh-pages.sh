#!/bin/bash
# Exit immediately if a command exits with a non-zero status
set -e

echo "=== Starting GitHub Pages Publish Workflow ==="

# 1. Verify we are on main branch
CURRENT_BRANCH=$(git symbolic-ref --short HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "Error: You must be on the 'main' branch to publish."
  exit 1
fi

# 2. Check if working tree is clean
if ! git diff-index --quiet HEAD --; then
  echo "Error: You have uncommitted changes. Please commit or stash them first."
  exit 1
fi

# Cleanup handler to ensure we restore the main branch if anything fails
cleanup() {
  echo "Cleaning up..."
  rm -rf dist-temp
  git checkout -f main
  echo "Restored main branch."
}
trap cleanup ERR

# 3. Build the production package
echo "Building the single-player static release..."
VITE_SINGLE_PLAYER_ONLY=true npx vite build public --base=./

# 4. Copy build assets to temporary directory
echo "Copying build artifacts..."
mkdir -p dist-temp
cp -r public/dist/* dist-temp/

# 5. Switch to gh-pages branch
echo "Switching to gh-pages branch..."
if git show-ref --quiet refs/heads/gh-pages; then
  git checkout gh-pages
  # Reset the index and working directory
  git rm -rf .
else
  git checkout --orphan gh-pages
  git rm -rf .
fi

# 6. Copy build assets back to root
echo "Populating build artifacts..."
cp -r dist-temp/* .
touch .nojekyll

# 7. Stage and commit
echo "Staging files..."
git add assets/ index.html .nojekyll
if git diff --cached --quiet; then
  echo "No changes detected. Everything is up-to-date."
else
  git commit -m "deploy: compile static single-player build for GitHub Pages"
fi

# 8. Try to push
echo "Attempting to push to origin gh-pages..."
if git push -f origin gh-pages; then
  echo "Successfully published to GitHub Pages!"
else
  echo "WARNING: Git push failed (likely due to missing credentials)."
  echo "The gh-pages branch has been updated locally."
  echo "You can push it yourself by running: git push -f origin gh-pages"
fi

# 9. Restore main branch and clean up temp folder
trap - ERR
echo "Returning to main branch..."
git checkout main
rm -rf dist-temp
echo "=== Publish Workflow Completed Successfully ==="
