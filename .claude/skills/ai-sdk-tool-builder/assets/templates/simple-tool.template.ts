import { tool } from 'ai';
import { z } from 'zod';

export const {{TOOL_NAME}} = tool({
  description: '{{DESCRIPTION}}',
  inputSchema: z.object({
    {{INPUT_SCHEMA}}
  }),
  execute: async (input) => {
    {{IMPLEMENTATION}}

    return {
      success: true,
      data: {},
    };
  },
});
