#!/usr/bin/env python3
"""
Generate a new AI SDK 5 tool file from template.

Usage:
    python create-tool.py <tool-name> <tool-type> [--output <path>]

Arguments:
    tool-name   Name of the tool in kebab-case (e.g., search-papers)
    tool-type   Type of tool: simple | factory | factory-auth | factory-streaming

Options:
    --output    Output directory (default: lib/ai/tools/)

Examples:
    python create-tool.py get-weather simple
    python create-tool.py search-data factory-auth
    python create-tool.py analyze-dataset factory-streaming
"""

import argparse
import os
import sys
from pathlib import Path


def kebab_to_camel(name: str) -> str:
    """Convert kebab-case to camelCase."""
    parts = name.split('-')
    return parts[0] + ''.join(word.capitalize() for word in parts[1:])


def generate_simple_tool(tool_name: str) -> str:
    """Generate a simple tool (no factory)."""
    camel_name = kebab_to_camel(tool_name)

    return f"""import {{ tool }} from 'ai';
import {{ z }} from 'zod';

export const {camel_name} = tool({{
  description: 'TODO: Describe what this tool does',
  inputSchema: z.object({{
    // TODO: Define your input schema
    // Example:
    // query: z.string().min(1).describe('Search query'),
    // limit: z.number().int().min(1).max(100).optional().describe('Maximum results'),
  }}),
  execute: async (input) => {{
    // TODO: Implement tool logic

    // Example return:
    return {{
      success: true,
      data: {{}},
    }};
  }},
}});
"""


def generate_factory_tool(tool_name: str, include_auth: bool = False, include_streaming: bool = False) -> str:
    """Generate a factory tool."""
    camel_name = kebab_to_camel(tool_name)

    imports = ["import { tool, type UIMessageStreamWriter } from 'ai';",
               "import { z } from 'zod';"]

    factory_props = []
    execute_params = []

    if include_auth:
        imports.append("import type { AuthSession } from '@/lib/auth/types';")
        factory_props.append("session: AuthSession")
        execute_params.append("session")

    if include_streaming or include_auth:
        imports.append("import type { ChatMessage } from '@/lib/types';")
        factory_props.append("dataStream: UIMessageStreamWriter<ChatMessage>")
        execute_params.append("dataStream")

    factory_props.append("chatId?: string  // Optional chat context")

    imports_str = "\n".join(imports)
    factory_props_str = ";\n  ".join(factory_props)

    auth_check = ""
    if include_auth:
        auth_check = """
      // Auth check
      if (!session.user?.id) {
        return { error: 'Unauthorized: login required' };
      }
"""

    streaming_example = ""
    if include_streaming:
        streaming_example = """
      // Optional: Emit UI progress updates
      dataStream.write({
        type: 'data-status',
        data: { message: 'Processing...' },
        transient: true,  // Temporary message
      });
"""

    return f"""{imports_str}

interface FactoryProps {{
  {factory_props_str};
}}

const inputSchema = z.object({{
  // TODO: Define your input schema
  // Examples:
  // query: z.string().min(1).describe('Search query'),
  // limit: z.number().int().min(1).max(100).optional().describe('Maximum results'),
}});

type Input = z.infer<typeof inputSchema>;

export const {camel_name} = ({{ {", ".join(factory_props.split(";"[:1]))} }}: FactoryProps) =>
  tool({{
    description: 'TODO: Describe what this tool does',
    inputSchema,
    execute: async (input: Input) => {{{auth_check}{streaming_example}
      // TODO: Implement tool logic

      // Example return:
      return {{
        success: true,
        data: {{}},
      }};
    }},
  }});
"""


def create_tool_file(tool_name: str, tool_type: str, output_dir: str = "lib/ai/tools") -> None:
    """Create a new tool file."""
    # Validate tool name
    if not all(c.isalnum() or c == '-' for c in tool_name):
        print(f"Error: Tool name must be kebab-case (lowercase letters, numbers, and hyphens only)")
        sys.exit(1)

    # Generate content based on type
    if tool_type == "simple":
        content = generate_simple_tool(tool_name)
    elif tool_type == "factory":
        content = generate_factory_tool(tool_name, include_auth=False, include_streaming=False)
    elif tool_type == "factory-auth":
        content = generate_factory_tool(tool_name, include_auth=True, include_streaming=False)
    elif tool_type == "factory-streaming":
        content = generate_factory_tool(tool_name, include_auth=True, include_streaming=True)
    else:
        print(f"Error: Unknown tool type '{tool_type}'")
        print("Valid types: simple, factory, factory-auth, factory-streaming")
        sys.exit(1)

    # Create output file
    output_path = Path(output_dir) / f"{tool_name}.ts"

    # Check if file exists
    if output_path.exists():
        response = input(f"File {output_path} already exists. Overwrite? (y/N): ")
        if response.lower() != 'y':
            print("Cancelled.")
            sys.exit(0)

    # Create directory if needed
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Write file
    output_path.write_text(content, encoding='utf-8')

    print(f"✅ Created {output_path}")
    print(f"")
    print(f"Next steps:")
    print(f"1. Edit {output_path} and implement the TODO items")
    print(f"2. Register in app/(chat)/api/chat/route.ts:")
    print(f"   - Import: import {{ {kebab_to_camel(tool_name)} }} from '@/lib/ai/tools/{tool_name}';")
    if tool_type == "simple":
        print(f"   - Add to tools: {kebab_to_camel(tool_name)},")
    else:
        print(f"   - Add to tools: {kebab_to_camel(tool_name)}: {kebab_to_camel(tool_name)}({{ session, dataStream }}),")
    print(f"   - Add to ACTIVE_TOOLS: '{kebab_to_camel(tool_name)}',")
    print(f"3. Test the tool via chat interface")


def main():
    parser = argparse.ArgumentParser(
        description="Generate a new AI SDK 5 tool file from template",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python create-tool.py get-weather simple
  python create-tool.py search-data factory-auth
  python create-tool.py analyze-dataset factory-streaming

Tool types:
  simple              - Stateless tool, no auth or streaming
  factory             - Factory pattern, no auth
  factory-auth        - Factory pattern with auth
  factory-streaming   - Factory pattern with auth and UI streaming
        """
    )

    parser.add_argument('tool_name', help='Name of the tool in kebab-case (e.g., search-papers)')
    parser.add_argument('tool_type', choices=['simple', 'factory', 'factory-auth', 'factory-streaming'],
                       help='Type of tool to generate')
    parser.add_argument('--output', default='lib/ai/tools',
                       help='Output directory (default: lib/ai/tools/)')

    args = parser.parse_args()

    create_tool_file(args.tool_name, args.tool_type, args.output)


if __name__ == '__main__':
    main()
