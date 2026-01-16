# Claude Code Skills Guide

## What Are Skills?

Skills are **model-invoked** modular capabilities that extend Claude's functionality. They package expertise into discoverable capabilities that Claude **autonomously activates** based on request context and the skill's description.

Each skill consists of:

- **`SKILL.md`** (required): Instructions Claude reads when relevant
- **Supporting files** (optional): Documentation, scripts, templates, references

## Key Distinction: Model-Invoked vs User-Invoked

| Feature         | Skills                                   | Slash Commands                   |
| --------------- | ---------------------------------------- | -------------------------------- |
| **Invocation**  | Model decides (automatic)                | User types `/command` (explicit) |
| **Trigger**     | Context-based discovery                  | Manual execution                 |
| **Best for**    | Complex capabilities requiring structure | Simple, frequently-used prompts  |
| **Structure**   | SKILL.md + supporting resources          | Single Markdown file             |
| **Composition** | Multiple skills can work together        | Commands invoke independently    |

**When Claude encounters a request matching a skill's description, it automatically loads and applies that skill's instructions.**

## When to Use Skills

✅ **Use Skills for:**

- Extending Claude's capabilities for specific workflows
- Sharing expertise across teams via version control
- Reducing repetitive prompting
- Complex tasks requiring multiple supporting files
- Composable capabilities that work together
- Team-standardized workflows

❌ **Use Slash Commands instead for:**

- Simple, frequently-used prompt templates
- Quick one-liners that don't need discovery
- User-initiated explicit workflows

## File Structure

### Directory Locations

```
.claude/skills/          # Project skills (team-shared, versioned)
  ├── api-design/
  │   ├── SKILL.md
  │   ├── REST_STANDARDS.md
  │   └── OPENAPI_TEMPLATE.yaml
  ├── security-review/
  │   └── SKILL.md
  └── performance-audit/
      ├── SKILL.md
      └── scripts/
          └── benchmark.sh

~/.claude/skills/        # Personal skills (individual workflows)
  └── my-workflow/
      └── SKILL.md

# Plugin skills (bundled with installed Claude Code plugins)
# See: https://code.claude.com/docs/en/plugins
```

**Tip**: Prefer project skills for team-shared workflows (commit them to git). Use personal skills for individual preferences and experiments.

### Basic Skill Structure

**Simple Skill** (single file):

```
skill-name/
└── SKILL.md
```

**Complex Skill** (with resources):

```
skill-name/
├── SKILL.md              # Main instructions (required)
├── REFERENCE.md          # Supporting documentation
├── FORMS.md              # Templates or forms
└── scripts/              # Utility scripts
    ├── analyze.py
    └── generate.sh
```

## Creating Skills

### 1. SKILL.md Format

Every skill requires YAML frontmatter:

```markdown
---
name: skill-name
description: What it does and when to use it
allowed-tools: Read, Grep, Glob # Optional: restrict tools
---

# Skill Instructions

Claude will read and follow these instructions when the skill is invoked.

## When to Use

[Describe scenarios where this skill applies]

## How to Apply

[Step-by-step instructions]

## Examples

[Concrete examples of usage]

## References

See @REFERENCE.md for additional details.
```

### 2. Required Frontmatter Fields

```yaml
name:
  lowercase-with-hyphens
  # Max 64 characters
  # Letters, numbers, hyphens only
  # Example: "api-design-review"

description:
  Brief description of what it does and when to use it
  # Max 1024 characters
  # CRITICAL for discovery
  # Include trigger terms users might mention
  # Be specific, not vague
```

### 3. Optional Frontmatter Fields

```yaml
allowed-tools:
  Read, Grep, Glob
  # Restricts which Claude Code tools Claude can use when this skill is active
  # Omit allowed-tools to allow all tools
  # Use for read-only or security-sensitive workflows
```

## Best Practices

### 1. Write Specific Descriptions

The description field is **critical for Claude to discover when to use your skill**.

```yaml
# ❌ Too vague - won't activate reliably
description: Helps with documents

# ❌ Too narrow - misses similar requests
description: Creates PDF forms with exactly 5 fields

# ✅ Specific and comprehensive
description: Review and design RESTful APIs following REST principles, OpenAPI 3.0 standards, and industry best practices for versioning, authentication, and error handling

# ✅ Includes trigger terms
description: Analyze code performance, identify bottlenecks, profile execution time, and suggest optimizations for CPU and memory usage
```

**Tips:**

- Include both **what it does** and **when to use it**
- Add **trigger terms** users might mention ("API design", "performance", "security review")
- Be **specific** about scope and capabilities
- Avoid **generic terms** like "helps with" or "manages"

### 2. Keep Skills Focused

**One skill = One capability**

```markdown
# ❌ Too broad

name: document-processing
description: Handles all document-related tasks

# ✅ Focused and clear

name: pdf-form-filling
description: Fill out PDF forms with structured data validation

name: contract-review
description: Review legal contracts for standard clauses and compliance

name: invoice-generation
description: Generate invoices from transaction data with tax calculations
```

### 3. Structure Supporting Files

```
research-assistant/
├── SKILL.md              # Main skill definition
├── SEARCH_STRATEGY.md    # How to search academic papers
├── CITATION_FORMATS.md   # Citation style guide
└── templates/
    ├── summary.md        # Research summary template
    └── bibliography.md   # Bibliography format
```

**Benefits:**

- Claude loads supporting files **only when needed**
- Keeps main SKILL.md concise
- Enables modular updates
- Improves context efficiency

### 4. Use Tool Restrictions Thoughtfully

```yaml
# Read-only skill (analysis, review)
allowed-tools: Read, Grep, Glob
# Unrestricted (use sparingly)
# Omit allowed-tools field
```

### 5. Provide Clear Instructions

```markdown
---
name: security-review
description: Review code for security vulnerabilities, common attack vectors, and OWASP Top 10 issues
---

# Security Review Skill

## Scope

Analyze code for:

- SQL injection vulnerabilities
- XSS attack vectors
- Authentication/authorization flaws
- Insecure cryptography
- Dependency vulnerabilities

## Process

1. Identify user input points
2. Trace data flow through application
3. Check for sanitization and validation
4. Review authentication mechanisms
5. Analyze third-party dependencies

## Output Format

- Risk level (Critical/High/Medium/Low)
- Affected files and line numbers
- Exploit scenario
- Remediation steps

## References

See @OWASP_TOP_10.md for vulnerability details.
```

### 6. Compose Multiple Skills

Skills can work together for complex workflows:

```
User: "Review this API and check for security issues"

Claude automatically:
1. Loads "api-design-review" skill
2. Loads "security-review" skill
3. Applies both sets of instructions
4. Provides comprehensive analysis
```

## Skill Discovery and Debugging

### View Available Skills

```bash
# List all available skills
# (Built-in command in Claude Code)
# View skills in .claude/skills/ and ~/.claude/skills/
```

You can also ask Claude directly:

```
What Skills are available?
```

### Troubleshooting: Skill Not Activating

**Problem**: Claude doesn't use your skill

**Solutions**:

1. **Check description specificity**

   ```yaml
   # Add more trigger terms and context
   description: Review REST APIs for design quality, OpenAPI compliance,
     versioning strategy, error handling, authentication patterns,
     and response format consistency
   ```

2. **Verify YAML syntax**

   ```yaml
   # ✅ Correct indentation
   ---
   name: skill-name
   description: Description here
   ---
   # ❌ Invalid YAML
   ---
   name:skill-name
   description Description here
   ---
   ```

3. **Check file paths**

   ```bash
   # Project skills
   .claude/skills/skill-name/SKILL.md

   # Personal skills
   ~/.claude/skills/skill-name/SKILL.md

   # ❌ Wrong location
   .claude/skill-name/SKILL.md  # Missing /skills/
   ```

4. **Test explicitly**

   ```
   "Use the api-design-review skill to analyze this endpoint"
   ```

5. **Simplify for testing**
   - Start with minimal SKILL.md
   - Add complexity incrementally
   - Verify activation at each step

## Example Skills

### 1. Simple Skill: Code Review

```markdown
---
name: code-review
description: Review code for quality, best practices, maintainability, and potential bugs
allowed-tools: Read, Grep, Glob
---

# Code Review Skill

## Review Criteria

- Code clarity and readability
- Proper error handling
- Test coverage
- Documentation completeness
- Performance considerations
- Security best practices

## Process

1. Read relevant files
2. Analyze structure and patterns
3. Identify issues by severity
4. Suggest improvements

## Output Format

- **Critical**: Must fix before merge
- **Important**: Should fix soon
- **Suggestion**: Consider for improvement
- **Praise**: Well-implemented patterns
```

### 2. Complex Skill: API Design

```markdown
---
name: api-design-review
description: Review and design RESTful APIs following REST principles, OpenAPI standards, and industry best practices
allowed-tools: Read, Grep, Glob
---

# API Design Review Skill

## Standards

Follow guidelines in @REST_STANDARDS.md

## Review Checklist

- [ ] Resource naming (plural nouns)
- [ ] HTTP method correctness
- [ ] Status code appropriateness
- [ ] Pagination strategy
- [ ] Versioning approach
- [ ] Authentication/authorization
- [ ] Error response format
- [ ] Rate limiting design

## OpenAPI Compliance

Generate OpenAPI 3.0 spec using @OPENAPI_TEMPLATE.yaml

## Output

Provide:

1. Design feedback with line numbers
2. Improved API design
3. OpenAPI specification
4. Migration guide (if applicable)
```

### 3. Team Workflow Skill

```markdown
---
name: feature-implementation
description: Implement new features following team coding standards, testing requirements, and documentation practices
---

# Feature Implementation Skill

## Team Standards

See @CODING_STANDARDS.md for:

- Code style guide
- Naming conventions
- File organization
- Testing requirements

## Implementation Process

1. Understand requirements
2. Design approach (update @DESIGN_DOC.md)
3. Implement with tests
4. Update documentation
5. Run verification script: @scripts/verify.sh

## Testing Requirements

- Unit tests for all functions
- Integration tests for API endpoints
- E2E tests for critical paths
- Minimum 80% code coverage

## Documentation

Update:

- README.md (if user-facing)
- API documentation (if endpoints added)
- CHANGELOG.md (feature description)
```

## Skills vs Subagents

| Use Case                    | Recommendation                 |
| --------------------------- | ------------------------------ |
| Add domain expertise        | Skills                         |
| Isolate context             | Subagents                      |
| Auto-activate capability    | Skills                         |
| Explicit delegation         | Subagents                      |
| Share across team           | Both (version control)         |
| Complex multi-step workflow | Subagents (with Skills loaded) |
| Extend Claude's knowledge   | Skills                         |
| Control tool permissions    | Both (prefer Subagents)        |

**Can be combined**: Subagents can load specific skills via frontmatter:

```yaml
# In subagent definition
---
name: api-designer
skills: [api-design-review, openapi-generation]
---
```

## Cloud Usage (Claude Code on the Web)

### Considerations

- Skills work identically in web and local environments
- Supporting files load on-demand
- Network access inherits environment restrictions
- If your skill relies on scripts, ensure required dependencies are available in the environment where Claude Code is running

### Best Practices for Cloud

```json
// .claude/settings.json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "echo Session started"
          }
        ]
      }
    ]
  }
}
```

## Quick Reference

```bash
# Skill directory structure
.claude/skills/skill-name/SKILL.md

# View available skills
# (Inspect .claude/skills/ directory)

# Test explicit invocation
"Use the [skill-name] skill to..."

# Combine skills
"Use api-design and security-review skills to analyze this endpoint"
```

## Resources

- **Official Docs (Claude Code Skills)**: https://code.claude.com/docs/en/skills
- **Agent Skills overview (platform-level)**: https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview
- **Blog (Introducing Agent Skills)**: https://claude.com/blog/skills
- **Related**: Subagents Guide (`subagents-guide.md`), Context Engineering Guide (`context-engineering-guide.md`)
- **Examples**: `.claude/skills/` directory in your project

---

_Source: Claude Code documentation and Agent Skills posts (verified Dec 2025)_
