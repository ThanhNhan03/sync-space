import { useEffect, useRef } from 'react'
import type { ChatMessage, ToolCallResult } from '@shared/types'
import { MessageBubble } from './MessageBubble'
import { ToolCallBadge } from './ToolCallBadge'
import { ThinkingIndicator } from './ThinkingIndicator'

interface MessageListProps {
  messages: ChatMessage[]
  streamingMessageId?: string | null
  isThinking?: boolean
}

const ERROR_PREFIX = 'Error:'

function findToolResult(
  messages: ChatMessage[],
  toolCallId: string,
  toolCallName: string
): ToolCallResult | undefined {
  const match = messages.find((candidate) => candidate.role === 'tool' && candidate.toolCallId === toolCallId)

  if (!match) {
    return undefined
  }

  return {
    id: toolCallId,
    name: toolCallName,
    ok: !match.content.startsWith(ERROR_PREFIX),
    content: match.content
  }
}

export function MessageList({
  messages,
  streamingMessageId = null,
  isThinking = false
}: MessageListProps): JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  const visibleMessages = messages.filter(
    (message) => message.role === 'user' || message.role === 'assistant'
  )

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
      {visibleMessages.map((message) => (
        <div key={message.id} className="flex flex-col gap-2">
          <div className="relative">
            <MessageBubble message={message} />
            {streamingMessageId === message.id && (
              <span
                className={`absolute bottom-3 ${
                  message.role === 'user' ? 'right-4' : 'left-4'
                } inline-block h-4 w-[2px] animate-pulse bg-accent`}
                aria-hidden="true"
              />
            )}
          </div>

          {message.toolCalls && message.toolCalls.length > 0 && (
            <div
              className={`flex flex-col gap-1 ${
                message.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              {message.toolCalls.map((toolCall) => (
                <ToolCallBadge
                  key={toolCall.id}
                  toolCall={toolCall}
                  result={findToolResult(messages, toolCall.id, toolCall.name)}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      <ThinkingIndicator active={isThinking} />
      <div ref={bottomRef} />
    </div>
  )
}
