#!/usr/bin/env node
/**
 * Smoke test: prove the TypeScript LSP actually serves symbol navigation.
 *
 * Spawns `typescript-language-server --stdio`, connects over JSON-RPC, opens a
 * real repo file, and asserts a `textDocument/definition` round-trip returns a
 * location for an exported symbol. This is the "does it really work" complement
 * to scripts/validate-opencode-config.mjs (which only checks the config shape).
 *
 * The language server needs a `typescript` install. In an installed checkout the
 * workspace dependency satisfies it. In a bare worktree without node_modules,
 * point it at an existing tsserver with --tsserver <path> (e.g. the lane that
 * owns node_modules) or TYPESCRIPT_TSSERVER_PATH. That mirrors what the OpenCode
 * `tsserver.path` initialization option sets; see docs/research/opencode.md.
 *
 * Usage:
 *   node scripts/smoke-opencode-lsp.mjs
 *   node scripts/smoke-opencode-lsp.mjs --tsserver <path-to-tsserver.js>
 * Exit 0 when a definition is returned, 1 otherwise.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsserverArg = process.argv.indexOf('--tsserver');
const tsserverPath =
  tsserverArg !== -1 && process.argv[tsserverArg + 1]
    ? process.argv[tsserverArg + 1]
    : process.env.TYPESCRIPT_TSSERVER_PATH;

// A real exported symbol and the file that declares it. `shortText` is exported
// from packages/domain/src/blocks.ts; its declaration is the first occurrence.
const file = path.join(root, 'packages/domain/src/blocks.ts');
const uri = 'file://' + file;
const symbol = 'shortText';

const server = spawn('typescript-language-server', ['--stdio'], {
  stdio: ['pipe', 'pipe', 'pipe'],
});
let stderr = '';
server.stderr.on('data', (d) => (stderr += String(d)));

let nextId = 0;
const pending = new Map();
let messageBuffer = '';

function send(method, params, id) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
  const framed = `Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`;
  server.stdin.write(framed);
}

function call(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    send(method, params, id);
  });
}
function notify(method, params) {
  const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
  server.stdin.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`);
}
server.stdout.on('data', (chunk) => {
  messageBuffer += chunk;
  while (true) {
    const headerEnd = messageBuffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;
    const header = messageBuffer.slice(0, headerEnd);
    const match = /Content-Length: (\d+)/.exec(header);
    if (!match) {
      messageBuffer = messageBuffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    if (messageBuffer.length < headerEnd + 4 + length) break;
    const body = messageBuffer.slice(headerEnd + 4, headerEnd + 4 + length);
    messageBuffer = messageBuffer.slice(headerEnd + 4 + length);
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      continue;
    }
    if (parsed.id != null && pending.has(parsed.id)) {
      const p = pending.get(parsed.id);
      pending.delete(parsed.id);
      if (parsed.error) p.reject(new Error(parsed.error.message));
      else p.resolve(parsed.result);
    }
  }
});

const INIT_TIMEOUT = 60_000;

async function main() {
  let init;
  try {
    init = await Promise.race([
      call('initialize', {
        processId: process.pid,
        rootUri: 'file://' + root,
        capabilities: {},
        ...(tsserverPath ? { initializationOptions: { tsserver: { path: tsserverPath } } } : {}),
      }),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('initialize timed out')), INIT_TIMEOUT),
      ),
    ]);
  } catch (e) {
    console.error('FAIL server did not initialize:', e.message);
    if (stderr) console.error(stderr.trim().split('\n').slice(0, 3).join('\n'));
    server.kill();
    process.exit(1);
  }

  const caps = init.capabilities || {};
  console.log('definitionProvider:', caps.definitionProvider === true);
  console.log('hoverProvider:', caps.hoverProvider === true);
  console.log('implementationProvider:', caps.implementationProvider === true);
  console.log('documentSymbolProvider:', caps.documentSymbolProvider === true);

  notify('initialized', {});
  notify('textDocument/didOpen', {
    textDocument: { uri, languageId: 'typescript', version: 1, text: await readFile(file, 'utf8') },
  });

  // Wait briefly for tsserver project load before asking for a definition.
  await new Promise((r) => setTimeout(r, 3000));

  const source = (await readFile(file, 'utf8')).split('\n');
  let line = -1;
  let col = -1;
  for (let i = 0; i < source.length; i++) {
    const idx = source[i].indexOf(symbol);
    if (idx !== -1) {
      line = i;
      col = idx;
      break;
    }
  }
  if (line === -1) {
    console.error(`FAIL could not locate ${symbol} in ${file}`);
    server.kill();
    process.exit(1);
  }

  let definition;
  try {
    definition = await Promise.race([
      call('textDocument/definition', {
        textDocument: { uri },
        position: { line, character: col },
      }),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('definition request timed out')), 30_000),
      ),
    ]);
  } catch (e) {
    console.error('FAIL definition request:', e.message);
    server.kill();
    process.exit(1);
  }

  const locations = Array.isArray(definition) ? definition : definition ? [definition] : [];
  if (locations.length === 0) {
    console.error('FAIL definition returned no locations');
    server.kill();
    process.exit(1);
  }
  const loc = locations[0];
  const start = loc.range && loc.range.start;
  console.log(
    `OK definition for ${symbol} -> ${path.relative(root, loc.uri.replace(/^file:\/\//, ''))}:${start ? start.line + 1 + ':' + start.character : '?'}`,
  );
  server.kill();
  process.exit(0);
}

// If the server dies before we finish, surface its stderr tip.
main().catch(async (e) => {
  console.error('FAIL:', e.message);
  if (stderr) console.error(stderr.trim().split('\n').slice(0, 5).join('\n'));
  server.kill();
  process.exit(1);
});
