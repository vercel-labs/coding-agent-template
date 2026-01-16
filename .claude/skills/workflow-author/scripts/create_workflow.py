#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Workflow Scaffolding Script

Creates a complete V2 workflow structure from templates.

Usage:
    create_workflow.py <workflow-slug>

Example:
    create_workflow.py grant-review
    create_workflow.py market-analysis
"""

import sys
import io
import re
import argparse
from pathlib import Path
from typing import Dict, Optional

# Configure stdout for UTF-8 on Windows
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')


def to_pascal_case(slug: str) -> str:
    """Convert kebab-case to PascalCase."""
    return ''.join(word.capitalize() for word in slug.split('-'))


def to_snake_case(slug: str) -> str:
    """Convert kebab-case to snake_case."""
    return slug.replace('-', '_')


def to_upper_snake(slug: str) -> str:
    """Convert kebab-case to UPPER_SNAKE_CASE."""
    return slug.replace('-', '_').upper()


def to_title(slug: str) -> str:
    """Convert kebab-case to Title Case."""
    return ' '.join(word.capitalize() for word in slug.split('-'))


def process_template(template_content: str, replacements: Dict[str, str]) -> str:
    """Replace placeholders in template with actual values."""
    result = template_content
    for placeholder, value in replacements.items():
        result = result.replace(f"{{{{{placeholder}}}}}", value)
    return result


def create_workflow(workflow_slug: str, project_root: Path, description: Optional[str] = None):
    """
    Create a complete workflow structure.

    Args:
        workflow_slug: Kebab-case workflow identifier (e.g., 'grant-review')
        project_root: Root directory of the Next.js project
    """

    # Validate slug
    if not re.match(r'^[a-z][a-z0-9-]*[a-z0-9]$', workflow_slug):
        print("❌ Invalid workflow slug. Must be kebab-case (lowercase, hyphens only)")
        print("   Examples: grant-review, market-analysis, due-diligence")
        return False

    # Calculate variations
    workflow_title = to_title(workflow_slug)
    workflow_title_pascal = to_pascal_case(workflow_slug)
    workflow_snake = to_snake_case(workflow_slug)
    workflow_upper = to_upper_snake(workflow_slug)

    # Description (non-interactive friendly)
    # - Prefer explicit --description
    # - If stdin is piped, read it
    # - Otherwise prompt interactively
    final_description = (description or "").strip()
    if not final_description and not sys.stdin.isatty():
        final_description = sys.stdin.read().strip()

    if not final_description:
        print(f"\n📝 Creating workflow: {workflow_slug}")
        try:
            final_description = input("Enter workflow description (optional): ").strip()
        except EOFError:
            final_description = ""

    if not final_description:
        final_description = f"Multi-step workflow for {workflow_title.lower()}"

    # Prepare replacements
    replacements = {
        "workflow_slug": workflow_slug,
        "WORKFLOW_SLUG": workflow_slug,
        "WORKFLOW_SLUG_UPPER": workflow_upper,
        "WORKFLOW_TITLE": workflow_title,
        "WORKFLOW_TITLE_PASCAL": workflow_title_pascal,
        "WORKFLOW_DESCRIPTION": final_description,
        "workflow_snake": workflow_snake,
        "STEP_ID": "step1",
        "STEP_TITLE": "Step 1",
        "STEP_TITLE_PASCAL": "Step1",
    }

    # Find templates directory
    skill_dir = Path(__file__).parent.parent
    templates_dir = skill_dir / "assets" / "templates"

    if not templates_dir.exists():
        print(f"❌ Templates directory not found: {templates_dir}")
        return False

    # Determine next migration number (4-digit prefix)
    migrations_dir = project_root / "lib" / "db" / "migrations"
    next_migration_number = 1
    if migrations_dir.exists():
        existing_numbers = []
        for p in migrations_dir.glob("*.sql"):
            match = re.match(r"^(\d{4})_", p.name)
            if match:
                try:
                    existing_numbers.append(int(match.group(1)))
                except ValueError:
                    pass
        if existing_numbers:
            next_migration_number = max(existing_numbers) + 1

    migration_file_name = (
        f"{next_migration_number:04d}_create_{workflow_snake}_runs_table.sql"
    )

    # Define file mappings (template -> destination)
    file_mappings = [
        # Spec and types
        (
            templates_dir / "spec.template.ts",
            project_root / "lib" / "workflows" / workflow_slug / "spec.ts"
        ),
        (
            templates_dir / "types.template.ts",
            project_root / "lib" / "workflows" / workflow_slug / "types.ts"
        ),

        # Page (server wrapper + client orchestrator)
        (
            templates_dir / "page-server-wrapper.template.tsx",
            project_root / "app" / "(chat)" / "workflows" / workflow_slug / "page.tsx"
        ),
        (
            templates_dir / "page-client-orchestrator.template.tsx",
            project_root / "app" / "(chat)" / "workflows" / workflow_slug / f"{workflow_slug}-client.tsx"
        ),

        # API routes
        (
            templates_dir / "analyze-route.template.ts",
            project_root / "app" / "api" / workflow_slug / "analyze" / "route.ts"
        ),
        (
            templates_dir / "crud-route.template.ts",
            project_root / "app" / "api" / workflow_slug / "route.ts"
        ),
        (
            templates_dir / "crud-id-route.template.ts",
            project_root / "app" / "api" / workflow_slug / "[id]" / "route.ts"
        ),

        # App DB migration
        (
            templates_dir / "migration-runs-table.template.sql",
            project_root / "lib" / "db" / "migrations" / migration_file_name
        ),

        # Step component (example)
        (
            templates_dir / "step-component.template.tsx",
            project_root / "components" / workflow_slug / "step1.tsx"
        ),

        # Documentation
        (
            templates_dir / "readme.template.md",
            project_root
            / "docs"
            / "ai-sdk"
            / "workflows"
            / workflow_slug
            / "README.md"
        ),
    ]

    # Create directories and files
    created_files = []

    for template_path, dest_path in file_mappings:
        try:
            # Read template
            if not template_path.exists():
                print(f"⚠️  Template not found: {template_path.name}, skipping...")
                continue

            template_content = template_path.read_text(encoding='utf-8')

            # Process template
            processed_content = process_template(template_content, replacements)

            # Create destination directory
            dest_path.parent.mkdir(parents=True, exist_ok=True)

            # Write file
            dest_path.write_text(processed_content, encoding='utf-8')

            created_files.append(dest_path)
            print(f"✅ Created: {dest_path.relative_to(project_root)}")

        except Exception as e:
            print(f"❌ Error creating {dest_path.relative_to(project_root)}: {e}")
            return False

    # Create index file for components
    try:
        index_path = project_root / "components" / workflow_slug / "index.ts"
        index_content = f"""/**
 * {workflow_title} Components
 */

export {{ StepComponent as Step1 }} from "./step1";
// Export additional step components here...
"""
        index_path.write_text(index_content, encoding='utf-8')
        created_files.append(index_path)
        print(f"✅ Created: {index_path.relative_to(project_root)}")
    except Exception as e:
        print(f"❌ Error creating component index: {e}")

    # Summary
    print(f"\n✅ Workflow '{workflow_slug}' created successfully!")
    print(f"\n📁 Created {len(created_files)} files:")
    for file_path in created_files:
        print(f"   - {file_path.relative_to(project_root)}")

    # Next steps
    print(f"\n📋 Next steps:")
    print(f"1. Review and customize the generated files")
    print(f"2. Update step definitions in lib/workflows/{workflow_slug}/spec.ts")
    print(f"   - Define all steps with input/output Zod schemas")
    print(f"   - Set dependencies (dependsOn arrays)")
    print(f"   - Specify persistence fields (persist arrays)")
    print(f"3. Customize the workflow client in app/(chat)/workflows/{workflow_slug}/{workflow_slug}-client.tsx")
    print(f"   - Provide step rendering + input/output wiring for `WorkflowContainer`")
    print(f"   - Add additional steps as you expand the spec")
    print(f"4. Implement step components in components/{workflow_slug}/")
    print(f"   - Keep step components “dumb”: render input/output, call onChange/onRun")
    print(f"5. Add/extend server step execution in app/api/{workflow_slug}/analyze/route.ts")
    print(f"   - Validate inputs with spec Zod schemas")
    print(f"   - Use robustGenerateObject() from @/lib/workflows/schema-repair")
    print(f"   - Prefer resolveLanguageModel(modelId) when calling the model")
    print(f"6. Add Drizzle schema and queries (scaffolder doesn't auto-edit shared files):")
    print(f"   - Add table to lib/db/schema.ts")
    print(f"   - Add query helpers to lib/db/queries.ts")
    print(f"   - Wire CRUD routes to use queries")
    print(f"7. Run type-check: pnpm type-check")
    print(f"8. Run linter: pnpm lint")
    print(f"9. Test workflow at: http://localhost:3000/workflows/{workflow_slug}")
    print(f"\n📚 Reference implementations:")
    print(f"   - IC Memo: lib/workflows/ic-memo/ (spec-driven V2)")
    print(f"   - Market Outlook: lib/workflows/market-outlook/ (spec-driven V2)")
    print(f"   - LOI: lib/workflows/loi/ (spec-driven V2)")

    return True


def main():
    parser = argparse.ArgumentParser(
        prog="create_workflow.py",
        description="Scaffold a spec-driven workflow from templates.",
    )
    parser.add_argument("workflow_slug", help="kebab-case workflow identifier (e.g., grant-review)")
    parser.add_argument(
        "--description",
        help="Workflow description (optional). If omitted, will prompt or read from piped stdin.",
        default=None,
    )
    args = parser.parse_args()

    workflow_slug = args.workflow_slug

    # Find project root (where package.json is)
    script_path = Path(__file__).resolve()
    current_dir = script_path.parent

    # Navigate up to find project root
    project_root = None
    for parent in current_dir.parents:
        if (parent / "package.json").exists():
            project_root = parent
            break

    if not project_root:
        print("❌ Could not find project root (package.json not found)")
        print("   Make sure you're running this from within the Next.js project")
        sys.exit(1)

    print(f"🎯 Project root: {project_root}")

    success = create_workflow(workflow_slug, project_root, description=args.description)

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
