import { describe, it, expect } from 'vitest';
import { parseSessionsFile } from './sessionImport';

describe('parseSessionsFile - jumpHops', () => {
  it('preserves the camelCase jumpHops array from a JSON import', () => {
    const json = JSON.stringify([
      {
        name: 'destino',
        host: '10.0.0.10',
        port: 22,
        username: 'user',
        authMethod: 'password',
        password: 'secret',
        groupName: 'DC1',
        jumpHops: [
          { host: '10.0.0.1', port: 22, username: 'jumpuser', authMethod: 'password', password: 'jp' },
          { host: '10.0.0.2', port: 22, username: 'bastuser', authMethod: 'password', password: 'bp' },
        ],
      },
    ]);

    const { sessions, errors } = parseSessionsFile('x.json', json);

    expect(errors).toEqual([]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].jumpHops).toHaveLength(2);
    expect(sessions[0].jumpHops?.[0].host).toBe('10.0.0.1');
    expect(sessions[0].jumpHops?.[1].host).toBe('10.0.0.2');
    expect(sessions[0].jumpHops?.[0].password).toBe('jp');
  });

  it('still accepts the legacy flat jumpHost columns (single hop)', () => {
    const json = JSON.stringify([
      { name: 'd', host: 'h', username: 'u', jumpHost: '10.0.0.1', jumpUsername: 'j', jumpPassword: 'p' },
    ]);

    const { sessions } = parseSessionsFile('x.json', json);

    expect(sessions[0].jumpHops).toHaveLength(1);
    expect(sessions[0].jumpHops?.[0].host).toBe('10.0.0.1');
  });
});
