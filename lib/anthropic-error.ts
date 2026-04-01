import Anthropic from '@anthropic-ai/sdk'

export function formatAnthropicError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    if (err.status === 529) {
      return "Anthropic's AI servers are temporarily overloaded (error 529). This isn't a problem with your data — please wait a moment and try again."
    }
    if (err.status === 503) {
      return `AI service temporarily unavailable (error 503). Please try again in a few seconds.`
    }
    return `AI error (${err.status}): ${err.message}`
  }
  return err instanceof Error ? err.message : 'Something went wrong'
}
