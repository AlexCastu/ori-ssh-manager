// Pure helpers for "copy last command + output" — kept out of the terminal
// hook so they can be unit tested without an xterm instance.

// Detect a shell prompt line for the common shells, optionally followed by a
// typed command. Structured (user@host / drive path / PS) so that ordinary
// output lines ending in $ # % > are NOT mistaken for prompts:
//   user@host:~/path$ cmd   root@host:~# cmd   ...%   C:\path>cmd   PS C:\> cmd
export const PROMPT_LINE_REGEX =
  /(?:[\w.-]+@[\w.-]+.*?|^\s*[A-Za-z]:\\.*?|^\s*PS\s.*?)[$#%>]/;

/**
 * Given the terminal buffer as an array of plain-text lines, return the last
 * command together with its output (best effort, prompt-boundary based).
 *
 * - Trailing empty lines are dropped.
 * - The block runs from the prompt that carries the last command up to (but
 *   excluding) the freshly printed prompt that follows it.
 * - If a command is still running (no fresh prompt yet) it runs to the end.
 * - If no prompt can be detected (unusual PS1, raw output) the whole buffer is
 *   returned as a safe fallback.
 */
export function extractLastBlock(rawLines: string[]): string {
  const lines = [...rawLines];
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  if (lines.length === 0) return '';

  const promptIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (PROMPT_LINE_REGEX.test(lines[i])) promptIndices.push(i);
  }

  if (promptIndices.length === 0) return lines.join('\n').trim();

  const lastPrompt = promptIndices[promptIndices.length - 1];
  const lastIsBare = /[$#%>]\s*$/.test(lines[lastPrompt].trim());

  if (lastIsBare && promptIndices.length >= 2) {
    const start = promptIndices[promptIndices.length - 2];
    return lines.slice(start, lastPrompt).join('\n').trim();
  }

  return lines.slice(lastPrompt).join('\n').trim();
}
