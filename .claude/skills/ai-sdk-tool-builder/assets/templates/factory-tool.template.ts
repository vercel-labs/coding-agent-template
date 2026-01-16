import { tool, type UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import type { AuthSession } from '@/lib/auth/types';
import type { ChatMessage } from '@/lib/types';

interface FactoryProps {
  session: AuthSession;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  chatId?: string;
}

const inputSchema = z.object({
  {{INPUT_SCHEMA}}
});

type Input = z.infer<typeof inputSchema>;

export const {{TOOL_NAME}} = ({ session, dataStream, chatId }: FactoryProps) =>
  tool({
    description: '{{DESCRIPTION}}',
    inputSchema,
    execute: async (input: Input) => {
      // Auth check
      if (!session.user?.id) {
        return { error: 'Unauthorized: login required' };
      }

      {{IMPLEMENTATION}}

      return {
        success: true,
        data: {},
      };
    },
  });
