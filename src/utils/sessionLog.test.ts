import { describe, it, expect } from 'vitest';
import { isPasswordPrompt } from './sessionLog';

describe('isPasswordPrompt (audit command guard)', () => {
  it('detects common password prompts (en/es)', () => {
    expect(isPasswordPrompt('user@host:~$ sudo apt update\n[sudo] password for user:')).toBe(true);
    expect(isPasswordPrompt('Password:')).toBe(true);
    expect(isPasswordPrompt('alex@bastion password: ')).toBe(true);
    expect(isPasswordPrompt("Enter passphrase for key '/home/u/.ssh/id_ed25519':")).toBe(true);
    expect(isPasswordPrompt('Contraseña:')).toBe(true);
    expect(isPasswordPrompt('Introduce la clave: ')).toBe(true);
  });

  it('does not flag ordinary prompts/output as password prompts', () => {
    expect(isPasswordPrompt('user@host:~/project$ ')).toBe(false);
    expect(isPasswordPrompt('total 24\n-rw-r--r-- 1 user user 0 file.txt')).toBe(false);
    expect(isPasswordPrompt('the password was changed successfully')).toBe(false); // not at line end
    expect(isPasswordPrompt('')).toBe(false);
  });
});
