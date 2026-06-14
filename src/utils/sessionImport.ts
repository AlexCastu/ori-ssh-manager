import type { AuthMethod, JumpHop, Session, SessionColor } from '../types';

export type ImportedSession = Omit<Session, 'id' | 'createdAt'> & {
  groupName?: string;
};

export interface SessionImportResult {
  sessions: ImportedSession[];
  errors: string[];
}

const VALID_COLORS: SessionColor[] = [
  'blue',
  'green',
  'purple',
  'orange',
  'red',
  'cyan',
  'pink',
  'yellow',
];

// Values include legacy flat jump columns (jumpHost...) that are folded
// into the jumpHops array during normalization
const HEADER_ALIASES: Record<string, string> = {
  auth: 'authMethod',
  auth_method: 'authMethod',
  authmethod: 'authMethod',
  color: 'color',
  group: 'groupName',
  groupname: 'groupName',
  host: 'host',
  ip: 'host',
  jump_host: 'jumpHost',
  jumphost: 'jumpHost',
  // Header normalization lowercases every key, so the camelCase "jumpHops"
  // array would lose its capital P and never match in normalizeJumpHops.
  // Map the lowercased/snake_case forms back to the canonical key.
  jumphops: 'jumpHops',
  jump_hops: 'jumpHops',
  jump_password: 'jumpPassword',
  jumppassword: 'jumpPassword',
  jump_port: 'jumpPort',
  jumpport: 'jumpPort',
  jump_username: 'jumpUsername',
  jumpusername: 'jumpUsername',
  name: 'name',
  nombre: 'name',
  pass: 'password',
  password: 'password',
  port: 'port',
  private_key_passphrase: 'privateKeyPassphrase',
  private_key_path: 'privateKeyPath',
  privatekeypassphrase: 'privateKeyPassphrase',
  privatekeypath: 'privateKeyPath',
  puerto: 'port',
  server: 'host',
  session: 'name',
  user: 'username',
  username: 'username',
  usuario: 'username',
};

export function parseSessionsFile(fileName: string, content: string): SessionImportResult {
  const trimmedContent = content.replace(/^\uFEFF/, '').trim();
  if (!trimmedContent) {
    return { sessions: [], errors: ['El archivo esta vacio'] };
  }

  if (fileName.toLowerCase().endsWith('.json') || trimmedContent.startsWith('[') || trimmedContent.startsWith('{')) {
    return parseJsonSessions(trimmedContent);
  }

  return parseCsvSessions(trimmedContent);
}

function parseJsonSessions(content: string): SessionImportResult {
  try {
    const parsed: unknown = JSON.parse(content);
    const rows = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.sessions)
        ? parsed.sessions
        : null;

    if (!rows) {
      return { sessions: [], errors: ['JSON debe ser un array o un objeto con "sessions"'] };
    }

    return normalizeRows(rows, 1);
  } catch {
    return { sessions: [], errors: ['JSON no valido'] };
  }
}

function parseCsvSessions(content: string): SessionImportResult {
  const rows = parseCsvRows(content);
  if (rows.length < 2) {
    return { sessions: [], errors: ['CSV debe incluir cabecera y al menos una sesion'] };
  }

  const headers = rows[0].map((header) => normalizeHeader(header));
  const objects = rows.slice(1).map((row) => {
    const item: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (header) {
        item[header] = row[index] ?? '';
      }
    });
    return item;
  });

  return normalizeRows(objects, 2);
}

function parseCsvRows(content: string): string[][] {
  const delimiter = detectDelimiter(content);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(field.trim());
      field = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  row.push(field.trim());
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  return rows;
}

function detectDelimiter(content: string) {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
  return firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
}

function normalizeRows(rows: unknown[], rowOffset: number): SessionImportResult {
  const sessions: ImportedSession[] = [];
  const errors: string[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + rowOffset;
    if (!isRecord(row)) {
      errors.push(`Fila ${rowNumber}: formato no valido`);
      return;
    }

    const normalized = normalizeSession(normalizeInputRow(row));
    if (!normalized.ok) {
      errors.push(`Fila ${rowNumber}: ${normalized.error}`);
      return;
    }

    sessions.push(normalized.session);
  });

  return { sessions, errors };
}

function normalizeSession(row: Record<string, unknown>):
  | { ok: true; session: ImportedSession }
  | { ok: false; error: string } {
  const name = readText(row, 'name');
  const host = readText(row, 'host');
  const username = readText(row, 'username');

  if (!name || !host || !username) {
    return { ok: false, error: 'name, host y username son obligatorios' };
  }

  const port = readNumber(row, 'port', 22);
  if (port < 1 || port > 65535) {
    return { ok: false, error: 'port debe estar entre 1 y 65535' };
  }

  const privateKeyPath = readText(row, 'privateKeyPath');
  const authMethod = normalizeAuthMethod(readText(row, 'authMethod'), privateKeyPath);
  if (authMethod === 'key' && !privateKeyPath) {
    return { ok: false, error: 'privateKeyPath es obligatorio cuando authMethod es key' };
  }

  const jumpResult = normalizeJumpHops(row);
  if (!jumpResult.ok) {
    return jumpResult;
  }

  return {
    ok: true,
    session: {
      name,
      host,
      port,
      username,
      authMethod,
      password: authMethod === 'password' ? readText(row, 'password') : undefined,
      privateKeyPath: authMethod === 'key' ? privateKeyPath : undefined,
      privateKeyPassphrase: authMethod === 'key' ? readText(row, 'privateKeyPassphrase') : undefined,
      jumpHops: jumpResult.hops,
      color: normalizeColor(readText(row, 'color')),
      groupName: readText(row, 'groupName'),
    },
  };
}

/// Builds the jump chain from either a jumpHops array (JSON import) or the
/// legacy flat jumpHost/jumpPort/jumpUsername/jumpPassword columns (CSV)
function normalizeJumpHops(
  row: Record<string, unknown>
): { ok: true; hops: JumpHop[] } | { ok: false; error: string } {
  if (Array.isArray(row.jumpHops)) {
    const hops: JumpHop[] = [];
    for (const raw of row.jumpHops) {
      if (!isRecord(raw)) {
        return { ok: false, error: 'jumpHops contiene un elemento no valido' };
      }
      const host = readText(raw, 'host');
      if (!host) {
        return { ok: false, error: 'cada salto de jumpHops necesita host' };
      }
      const hopPort = readNumber(raw, 'port', 22);
      if (hopPort < 1 || hopPort > 65535) {
        return { ok: false, error: 'port de salto debe estar entre 1 y 65535' };
      }
      hops.push({
        name: readText(raw, 'name'),
        host,
        port: hopPort,
        username: readText(raw, 'username') ?? '',
        authMethod: normalizeAuthMethod(readText(raw, 'authMethod'), readText(raw, 'privateKeyPath')),
        password: readText(raw, 'password'),
        privateKeyPath: readText(raw, 'privateKeyPath'),
        privateKeyPassphrase: readText(raw, 'privateKeyPassphrase'),
      });
    }
    return { ok: true, hops };
  }

  const jumpHost = readText(row, 'jumpHost');
  if (!jumpHost) {
    return { ok: true, hops: [] };
  }
  const jumpPort = readNumber(row, 'jumpPort', 22);
  if (jumpPort < 1 || jumpPort > 65535) {
    return { ok: false, error: 'jumpPort debe estar entre 1 y 65535' };
  }
  return {
    ok: true,
    hops: [
      {
        host: jumpHost,
        port: jumpPort,
        username: readText(row, 'jumpUsername') ?? '',
        authMethod: 'password',
        password: readText(row, 'jumpPassword'),
      },
    ],
  };
}

function normalizeHeader(header: string) {
  const key = header.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return HEADER_ALIASES[key] ?? key;
}

function normalizeInputRow(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value])
  );
}

function normalizeAuthMethod(value: string | undefined, privateKeyPath: string | undefined): AuthMethod {
  const normalized = value?.toLowerCase();
  if (normalized === 'key' || normalized === 'ssh_key' || normalized === 'private_key') {
    return 'key';
  }
  return privateKeyPath ? 'key' : 'password';
}

function normalizeColor(value: string | undefined): SessionColor {
  return VALID_COLORS.includes(value as SessionColor) ? (value as SessionColor) : 'blue';
}

function readText(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key];
  if (value === null || value === undefined) {
    return undefined;
  }
  const text = String(value).trim();
  return text || undefined;
}

function readNumber(row: Record<string, unknown>, key: string, fallback: number): number {
  const value = readText(row, key);
  if (!value) {
    return fallback;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
