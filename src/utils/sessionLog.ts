// Audit logging helpers for SSH sessions.
//
// Two kinds of entries are recorded (see SessionLogKind):
//   - 'event'   : connect / disconnect / error / host-key, always logged.
//   - 'command' : a line launched in the terminal, gated by the logCommands
//                 setting AND the password-prompt guard below.
//
// The guard is the reason command capture is acceptable: when the most recent
// server output looks like a password/passphrase prompt, the next typed line
// is NOT recorded, so interactive secrets (sudo, ssh, su…) don't leak into the
// log. It is a heuristic, hence the global on/off toggle in Settings.

import { invoke } from '@tauri-apps/api/core';
import type { SessionLog, SessionLogKind } from '../types';

// Matches the tail of an output buffer that ends in a password/passphrase
// prompt (English + Spanish), e.g. "Password:", "[sudo] password for x:",
// "Enter passphrase for key ...:", "Contraseña:".
export const PASSWORD_PROMPT_REGEX =
  /(?:password|passphrase|contraseña|clave)[^\n]*:\s*$/i;

/** True when the recent output tail is asking for a secret. */
export function isPasswordPrompt(outputTail: string): boolean {
  return PASSWORD_PROMPT_REGEX.test(outputTail.trimEnd());
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Persist one audit entry. Fire-and-forget: a logging failure must never break
 * the SSH flow, so errors are only reported to the console.
 */
export function logSessionEvent(
  sessionId: string,
  kind: SessionLogKind,
  message: string
): void {
  const text = message.trim();
  if (!sessionId || !text) return;

  const log: SessionLog = {
    id: newId(),
    sessionId,
    ts: new Date().toISOString(),
    kind,
    message: text,
  };

  invoke('add_session_log', { log }).catch((err) =>
    console.error('add_session_log failed:', err)
  );
}

export async function fetchSessionLogs(
  sessionId: string,
  limit?: number
): Promise<SessionLog[]> {
  return invoke<SessionLog[]>('get_session_logs', { sessionId, limit: limit ?? null });
}

export async function clearSessionLogs(sessionId: string): Promise<void> {
  await invoke('clear_session_logs', { sessionId });
}
