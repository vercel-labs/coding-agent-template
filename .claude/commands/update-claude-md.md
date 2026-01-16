# Update CLAUDE.md

Ensure all CLAUDE.md files are comprehensive, up-to-date, and provide effective context for Claude Code sessions.

## Usage
```
/update-claude-md
```

## What it does
1. **Audit Current Documentation**: Review existing CLAUDE.md files for completeness and accuracy
2. **Sync with Codebase**: Update technical details to match current implementation
3. **Add Missing Context**: Include recently learned patterns, fixes, and architectural decisions
4. **Optimize for Claude**: Structure information for maximum AI comprehension and effectiveness
5. **Validate Commands**: Ensure all development commands are current and tested

## Files updated
- **Project CLAUDE.md**: Core project instructions and architecture
- **Global ~/.claude/CLAUDE.md**: Personal development preferences and guidelines
- **Command documentation**: Sync slash command references

## Key sections reviewed
- **Development Commands**: Package management, build, test, and deployment workflows
- **Architecture Overview**: Technology stack, project structure, and key patterns
- **AI Integration**: Tool development, model configuration, and streaming patterns
- **Common Issues**: Document frequent problems and their solutions
- **Code Quality**: Linting, formatting, and TypeScript configuration

## Updates applied
- **Recent Fixes**: Document citation system optimizations and infinite loop solutions
- **TypeScript Patterns**: Add ReactMarkdown component compatibility notes
- **React Hooks**: Include dependency optimization patterns we've discovered
- **Build Process**: Update Vercel deployment notes with error resolution strategies
- **Tool Development**: Sync AI SDK v5 patterns and breaking changes

## Context optimization
- **Prioritize Critical Info**: Lead with most important architectural decisions
- **Include Examples**: Add code snippets for common patterns
- **Reference Locations**: Specify file paths and line numbers for key implementations
- **Troubleshooting**: Document error patterns and their solutions
- **Performance Notes**: Include optimization strategies we've learned

## Example improvements
```markdown
## Recent Performance Optimizations
- RegisterCitations: Use hash-based dependencies to prevent infinite loops (components/message.tsx:32)
- EnhancedLink: Destructure href prop for type safety (components/markdown.tsx:58)
- CodeBlock: Made props optional for ReactMarkdown compatibility (components/code-block.tsx:3)
```

## Validation
- Verify all command examples work as documented
- Check file paths and references are accurate
- Ensure technical details match current implementation
- Test that new context improves Claude's understanding