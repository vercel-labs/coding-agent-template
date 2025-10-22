import { generateText } from 'ai'

export interface TitleGenerationOptions {
  prompt: string
  repoName?: string
  context?: string
}

export async function generateTaskTitle(options: TitleGenerationOptions): Promise<string> {
  const { prompt, repoName, context } = options

  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error('AI_GATEWAY_API_KEY environment variable is required')
  }

  // Create the prompt for title generation
  const systemPrompt = `Generate a concise, descriptive title for the following task:

Description: ${prompt}
${repoName ? `Repository: ${repoName}` : ''}
${context ? `Additional context: ${context}` : ''}

Requirements:
- Keep it under 60 characters
- Be descriptive but concise
- Use sentence case (capitalize first letter only)
- Make it clear and meaningful
- No quotes or special formatting

Examples of good titles:
- Add user authentication
- Fix memory leak in parser
- Update dependencies
- Add API documentation

Return ONLY the title, nothing else.`

  try {
    // Generate title using AI SDK 5 with AI Gateway
    const result = await generateText({
      model: 'openai/gpt-5-nano',
      prompt: systemPrompt,
      temperature: 0.3,
    })

    // Clean up the response (remove any extra whitespace or quotes)
    const title = result.text.trim().replace(/^["']|["']$/g, '')

    // Validate the title length
    if (title.length > 60) {
      return title.substring(0, 57) + '...'
    }

    return title
  } catch (error) {
    console.error('Title generation error:', error)
    // Return a fallback title based on the prompt
    return createFallbackTitle(prompt)
  }
}

export function createFallbackTitle(prompt: string): string {
  // If prompt is short enough, use it as the title
  if (prompt.length <= 60) {
    return prompt
  }

  // Otherwise, truncate and add ellipsis
  return prompt.substring(0, 57) + '...'
}
