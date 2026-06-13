import { describe, it, expect } from 'vitest';
import { extractLastBlock } from './lastBlock';

describe('extractLastBlock', () => {
  it('returns the last command + output, without "Last login" or the trailing prompt', () => {
    const lines = [
      'Last login: Mon',
      'user@host:~$ ls -la',
      'total 8',
      'drwxr-xr-x 2 user user',
      '-rw-r--r-- 1 user user file',
      'user@host:~$ ',
    ];
    expect(extractLastBlock(lines)).toBe(
      'user@host:~$ ls -la\ntotal 8\ndrwxr-xr-x 2 user user\n-rw-r--r-- 1 user user file'
    );
  });

  it('does not treat an output line ending in $ as a prompt boundary', () => {
    const lines = ['user@host:~$ echo "price 5$"', 'price 5$', 'user@host:~$ '];
    expect(extractLastBlock(lines)).toBe('user@host:~$ echo "price 5$"\nprice 5$');
  });

  it('handles a command that is still running (no fresh prompt yet)', () => {
    const lines = [
      'user@host:~$ ping host',
      '64 bytes from host: icmp_seq=1',
      '64 bytes from host: icmp_seq=2',
    ];
    expect(extractLastBlock(lines)).toBe(
      'user@host:~$ ping host\n64 bytes from host: icmp_seq=1\n64 bytes from host: icmp_seq=2'
    );
  });

  it('handles Windows cmd prompts', () => {
    const lines = ['Microsoft Windows', 'C:\\Users\\me>dir', ' 2 File(s)', 'C:\\Users\\me>'];
    expect(extractLastBlock(lines)).toBe('C:\\Users\\me>dir\n 2 File(s)');
  });

  it('handles PowerShell prompts', () => {
    const lines = ['PS C:\\> Get-Date', 'Monday', 'PS C:\\> '];
    expect(extractLastBlock(lines)).toBe('PS C:\\> Get-Date\nMonday');
  });

  it('falls back to the whole buffer when no prompt is detected', () => {
    const lines = ['some raw output', 'more output'];
    expect(extractLastBlock(lines)).toBe('some raw output\nmore output');
  });

  it('drops trailing empty lines and returns empty for an empty buffer', () => {
    expect(extractLastBlock(['', '   ', ''])).toBe('');
    expect(extractLastBlock([])).toBe('');
  });
});
