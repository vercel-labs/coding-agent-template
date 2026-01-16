# Git Push

Add, commit, and push changes to GitHub with intelligent commit message generation.


## What it does
1. **Analyze Changes**: Review all modified, added, and deleted files
2. **Generate Smart Commit Message**: Create descriptive commit message based on actual changes
3. **Stage Changes**: Add all relevant files to git staging area
4. **Create Commit**: Commit with generated message and Claude Code attribution
5. **Push to Remote**: Push to the current branch on GitHub
6. **Deployment Trigger**: Automatically triggers Vercel deployment if pushing to main/production branch

## Smart commit message generation
- **Feature Additions**: "Add [feature] with [key components]"
- **Bug Fixes**: "Fix [issue] in [component/file]" 
- **Type Safety**: "Improve TypeScript compatibility for [components]"
- **Performance**: "Optimize [area] performance with [technique]"
- **Refactoring**: "Refactor [component] for better [maintainability/performance]"
- **Dependencies**: "Update [packages] to [versions]"
- **Documentation**: "Update documentation for [feature/change]"

## Safety features
- **Pre-commit Checks**: Runs basic validation before committing
- **Branch Detection**: Shows current branch and confirms push target
- **Change Summary**: Lists all files being committed with change types
- **Conflict Detection**: Checks for potential merge conflicts
- **Large File Warning**: Alerts about files >1MB being committed

## Example output
```
📋 Analyzing changes...
   Modified: components/code-block.tsx (TypeScript interface update)
   Modified: CLAUDE.md (documentation update) 
   Added: .claude/commands/type-check.md (new slash command)

📝 Generated commit message:
   "Fix CodeBlock TypeScript compatibility with ReactMarkdown
   
   - Make children prop optional in CodeBlockProps interface  
   - Add fallback for undefined children in JSX rendering
   - Update documentation with recent performance optimizations"

✅ Committed changes (7 files)
🚀 Pushed to origin/cayman
🔄 Vercel deployment triggered
