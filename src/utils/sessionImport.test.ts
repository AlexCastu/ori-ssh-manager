import { describe, it, expect } from 'vitest';
import { parseSessionsFile, resolveImportGroupPath } from './sessionImport';

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

describe('parseSessionsFile - export roundtrip', () => {
  it('preserves the camelCase ExportSession values including agent and spaced secrets', () => {
    const exported = {
      name: 'destino',
      host: 'destination.test',
      port: 2222,
      username: 'ops',
      authMethod: 'agent',
      jumpHops: [{
        name: 'Bastion',
        refSessionId: null,
        host: 'bastion.test',
        port: 22,
        username: 'jumpuser',
        authMethod: 'agent',
        password: '  jump secret  ',
        privateKeyPath: '~/.ssh/jump',
        privateKeyPassphrase: '  jump passphrase  ',
      }],
      usableAsJump: true,
      color: 'purple',
      icon: 'server',
      notes: 'Primera línea\nSegunda línea',
      groupName: 'Padre/Hija',
    };

    const { sessions, errors } = parseSessionsFile('sessions.json', JSON.stringify([exported]));

    expect(errors).toEqual([]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual({
      ...exported,
      jumpHops: [{ ...exported.jumpHops[0], refSessionId: undefined }],
    });
  });

  it.each(['agent', 'password', 'key'])('respects explicit %s before inferring key authentication', (authMethod) => {
    const json = JSON.stringify([{
      name: 'destination', host: 'host', username: 'user', authMethod,
      privateKeyPath: '~/.ssh/id_ed25519',
      jumpHops: [{ host: 'jump', authMethod, privateKeyPath: '~/.ssh/jump' }],
    }]);

    const { sessions, errors } = parseSessionsFile('sessions.json', json);

    expect(errors).toEqual([]);
    expect(sessions[0].authMethod).toBe(authMethod);
    expect(sessions[0].jumpHops?.[0].authMethod).toBe(authMethod);
  });

  it.each(['', '  ', '  secret  '])('preserves nonempty secrets %j for sessions and hops', (secret) => {
    const json = JSON.stringify([{
      name: 'destination', host: 'host', username: 'user', authMethod: 'key',
      password: secret, privateKeyPath: '~/.ssh/id_ed25519', privateKeyPassphrase: secret,
      jumpHops: [{ host: 'jump', password: secret, privateKeyPassphrase: secret }],
    }]);

    const { sessions, errors } = parseSessionsFile('sessions.json', json);
    const expected = secret || undefined;

    expect(errors).toEqual([]);
    // Key auth: only the passphrase is kept for the session itself
    expect(sessions[0].password).toBeUndefined();
    expect(sessions[0].privateKeyPassphrase).toBe(expected);
    expect(sessions[0].jumpHops?.[0].password).toBe(expected);
    expect(sessions[0].jumpHops?.[0].privateKeyPassphrase).toBe(expected);
  });

  it.each([false, true])('preserves CSV secret spaces with quoted fields: %s', (quoted) => {
    const secret = quoted ? '"  secret  "' : '  secret  ';
    const csv = 'name,host,username,authMethod,privateKeyPath,password,privateKeyPassphrase,jumpHost,jumpPassword\n'
      + ` destination , host , user ,key, ~/.ssh/id_ed25519 ,${secret},${secret}, jump ,${secret}`;

    const { sessions, errors } = parseSessionsFile('sessions.csv', csv);

    expect(errors).toEqual([]);
    expect(sessions[0]).toMatchObject({
      name: 'destination', host: 'host', username: 'user',
      privateKeyPath: '~/.ssh/id_ed25519',
      privateKeyPassphrase: '  secret  ',
    });
    expect(sessions[0].password).toBeUndefined();
    expect(sessions[0].jumpHops?.[0]).toMatchObject({ host: 'jump', password: '  secret  ' });
  });

  it('still ignores CSV rows containing only whitespace', () => {
    const csv = 'name,host,username\n  ,  ,  \n destination , host , user \n  ,  ,  ';

    const { sessions, errors } = parseSessionsFile('sessions.csv', csv);

    expect(errors).toEqual([]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ name: 'destination', host: 'host', username: 'user' });
  });

  it('detects semicolon CSV after a BOM and leading blank lines without trimming the final secret', () => {
    const csv = '\uFEFF\n  \r\nname;host;username;password\r\n destination ; host ; user ;  secret  ';

    const { sessions, errors } = parseSessionsFile('sessions.csv', csv);

    expect(errors).toEqual([]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      name: 'destination', host: 'host', username: 'user', password: '  secret  ',
    });
  });
});

describe('parseSessionsFile - invalid input', () => {
  it.each(['invalid', '22invalid', '22.5', 22.5, 0, 65536])('rejects invalid port %j on each row', (port) => {
    const json = JSON.stringify([
      { name: 'invalid', host: 'host', username: 'user', port },
      { name: 'valid', host: 'host', username: 'user' },
    ]);

    const { sessions, errors } = parseSessionsFile('sessions.json', json);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ name: 'valid', port: 22 });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Fila 1: port/);
  });

  it.each(['invalid', '22.5'])('rejects invalid CSV port %s', (port) => {
    const csv = `name,host,username,port\ninvalid,host,user,${port}\nvalid,host,user,`;

    const { sessions, errors } = parseSessionsFile('sessions.csv', csv);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ name: 'valid', port: 22 });
    expect(errors[0]).toMatch(/Fila 2: port/);
  });

  it.each(['invalid', 22.5])('rejects invalid ports %j in JSON and legacy hops', (port) => {
    const json = JSON.stringify([
      { name: 'json-hop', host: 'host', username: 'user', jumpHops: [{ host: 'jump', port }] },
      { name: 'flat-hop', host: 'host', username: 'user', jumpHost: 'jump', jumpPort: port },
    ]);

    const { sessions, errors } = parseSessionsFile('sessions.json', json);

    expect(sessions).toEqual([]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/Fila 1: port de salto/);
    expect(errors[1]).toMatch(/Fila 2: jumpPort/);
  });

  it('defaults missing ports to 22 for sessions and both hop formats', () => {
    const json = JSON.stringify([
      { name: 'json-hop', host: 'host', username: 'user', jumpHops: [{ host: 'jump' }] },
      { name: 'flat-hop', host: 'host', username: 'user', jumpHost: 'jump' },
    ]);

    const { sessions, errors } = parseSessionsFile('sessions.json', json);

    expect(errors).toEqual([]);
    expect(sessions.map((session) => session.port)).toEqual([22, 22]);
    expect(sessions.map((session) => session.jumpHops?.[0].port)).toEqual([22, 22]);
  });

  it('rejects the entire CSV file when quotes are unclosed at EOF', () => {
    const csv = 'name,host,username,password\nvalid,host,user,secret\ninvalid,host,user,"unclosed';

    const { sessions, errors } = parseSessionsFile('sessions.csv', csv);

    expect(sessions).toEqual([]);
    expect(errors).toEqual(['CSV contiene comillas sin cerrar']);
  });

  it('accepts escaped quotes and multiline secrets in a complete CSV file', () => {
    const csv = 'name,host,username,password\ndestination,host,user,"  first ""line""\nsecond  "';

    const { sessions, errors } = parseSessionsFile('sessions.csv', csv);

    expect(errors).toEqual([]);
    expect(sessions[0].password).toBe('  first "line"\nsecond  ');
  });
});

describe('resolveImportGroupPath', () => {
  const groups = [
    { id: 'parent-a', name: ' Parent A ', parentId: null },
    { id: 'parent-b', name: 'Parent B' },
    { id: 'child-a', name: 'Shared', parentId: 'parent-a' },
    { id: 'child-b', name: ' Shared ', parentId: 'parent-b' },
  ];

  it('resolves repeated child names under their own parent with trimmed case-insensitive names', () => {
    expect(resolveImportGroupPath(' parent a / SHARED ', groups)).toEqual([
      { name: 'parent a', id: 'parent-a' },
      { name: 'SHARED', id: 'child-a' },
    ]);
    expect(resolveImportGroupPath('Parent B/Shared', groups)).toEqual([
      { name: 'Parent B', id: 'parent-b' },
      { name: 'Shared', id: 'child-b' },
    ]);
  });

  it('plans every level in an empty import without mutating the groups', () => {
    const emptyGroups: typeof groups = [];

    expect(resolveImportGroupPath('Parent/Child/Leaf', emptyGroups)).toEqual([
      { name: 'Parent' }, { name: 'Child' }, { name: 'Leaf' },
    ]);
    expect(emptyGroups).toEqual([]);
  });

  it('does not reuse a child from another parent when part of the path is missing', () => {
    expect(resolveImportGroupPath('Parent A/Missing/Shared', groups)).toEqual([
      { name: 'Parent A', id: 'parent-a' },
      { name: 'Missing' },
      { name: 'Shared' },
    ]);
  });

  it('does not reuse a nested folder as the root of an explicit path', () => {
    expect(resolveImportGroupPath('Shared/Leaf', groups)).toEqual([
      { name: 'Shared' }, { name: 'Leaf' },
    ]);
  });

  it('keeps legacy lookup by name at any level and root creation when absent', () => {
    expect(resolveImportGroupPath(' shared ', groups)).toEqual([
      { name: 'shared', id: 'child-b' },
    ]);
    expect(resolveImportGroupPath('New', groups)).toEqual([{ name: 'New' }]);
  });
});
