// Re-export types
export type { PatchTypeWithKey, ScrollIntent } from './types';

// Use old WebSocket-based hook for history loading
export { useConversationHistoryOld as useConversationHistory } from './useConversationHistoryOld';
