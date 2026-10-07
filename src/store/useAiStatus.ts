import { useEffect, useState } from 'react';
import type { AiStatus } from '../domain/aiTypes';
import { aiService } from '../services';

// One request per page load, shared by every component that asks.
let pending: Promise<AiStatus | null> | undefined;

/**
 * `status === undefined` while loading, `null` when there is no AI server (hide the AI features),
 * otherwise `{ configured, model }`. `configured: false` means demo mode (no API key).
 */
export function useAiStatus(): AiStatus | null | undefined {
  const [status, setStatus] = useState<AiStatus | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    pending ??= aiService.status();
    void pending.then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, []);
  return status;
}
