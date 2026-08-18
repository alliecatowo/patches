# Infra & Security Libraries — Verified Reference

Researched 2026-08-17 against official docs. Every claim below is cited; anything not
confirmed in official docs is explicitly flagged as **inference/unconfirmed** rather than
stated as fact.

---

## 1. Fly.io

### 1.1 gRPC (h2c) service config

Fly's gRPC guide uses `[http_service]` (the modern, simplified form) rather than the older
`[[services]]` block. `h2_backend` lives under `[http_service.http_options]`, not directly
under `[http_service]`.

```toml
# fly.toml
app = "myapp"
primary_region = "iad"

[build]

[http_service]
  internal_port = 50051
  force_https = false          # gRPC clients don't redirect like browsers
  processes = ["server"]
  auto_stop_machines = "stop"  # NOT boolean — see 1.3
  auto_start_machines = true
  min_machines_running = 0

  [http_service.http_options]
    h2_backend = true

  [http_service.tls_options]
    alpn = ["h2"]
```

Source: [fly.io/docs/app-guides/grpc-and-grpc-web-services](https://fly.io/docs/app-guides/grpc-and-grpc-web-services/),
[fly.io/docs/reference/configuration](https://fly.io/docs/reference/configuration/)

`h2_backend`: "indicates whether the app supports HTTP/2 cleartext (H2C) with prior
knowledge." Without it, Fly's edge proxy downgrades to HTTP/1.1 on the backend connection,
which breaks gRPC's use of HTTP trailers.

**TLS termination mechanics** (combining the gRPC guide with the general networking doc,
since the gRPC guide itself doesn't spell this out): the `tls` handler "terminates TLS using
Fly.io-managed application certificates, then forwards a plaintext connection to the
application process." With `h2_backend = true`, that forwarded connection is HTTP/2
**plaintext (h2c)** to your app on `internal_port`. Equivalent older `[[services]]` syntax:

```toml
[[services.ports]]
  handlers = ["tls", "http"]
  port = 443
```
Source: [fly.io/docs/networking/services](https://fly.io/docs/networking/services/)

### 1.2 Health checks — no native gRPC check type

**Confirmed: Fly does NOT support a `type = "grpc"` check.** Only `http` and `tcp` are
documented check types, in both `[checks]` (Machine-level) and `[http_service.checks]` /
`[[services.tcp_checks|http_checks]]` forms.

```toml
[checks]
  [checks.server_tcp]
    type = "tcp"
    port = 50051
    interval = "15s"
    timeout = "2s"
    grace_period = "5s"
    processes = ["server"]
```
Source: [fly.io/docs/reference/configuration](https://fly.io/docs/reference/configuration/),
[fly.io/docs/reference/health-checks](https://fly.io/docs/reference/health-checks/)

For a gRPC-only service, official docs give no built-in recipe. **Unconfirmed/inference:**
either (a) a plain `tcp` check on the gRPC port (connection-level only, no app-layer health),
or (b) a separate lightweight HTTP endpoint on another port for an `http` check. gRPC Health
Checking Protocol (`grpc_health_probe`) is discussed in Fly community threads, not official docs.

### 1.3 Process groups, release_command, kill/auto-stop keys

```toml
[processes]
  server = "node dist/apps/server/main.js"
  worker = "node dist/apps/worker/main.js"

[http_service]
  internal_port = 50051
  processes = ["server"]        # attach service to one group only

[deploy]
  release_command = "node dist/apps/server/migrate.js"

kill_signal = "SIGTERM"
kill_timeout = 120              # 0-300s, default 5
```
Source: [fly.io/docs/launch/processes](https://fly.io/docs/launch/processes/),
[fly.io/docs/reference/configuration](https://fly.io/docs/reference/configuration/)

- `release_command` replaces `CMD` in a one-off Machine run before the real deploy proceeds;
  it does **not** override the image's `ENTRYPOINT`.
- **`auto_stop_machines` accepts only `"off" | "stop" | "suspend"` (strings), NOT boolean
  `true`/`false`.** Docs: default is `"off"`; `"stop"` stops machines when idle, `"suspend"`
  suspends (faster resume than cold stop). No legacy boolean form is documented — treat
  `true`/`false` examples elsewhere as outdated.
- `auto_start_machines` (boolean, default `true`) and `min_machines_running` (integer,
  default `0`) are separate keys.

### 1.4 Fly Managed Postgres (MPG)

```bash
fly mpg create --name mydb --org myorg --region iad --plan Launch --volume-size 10
fly mpg attach <CLUSTER_ID> -a myapp   # writes DATABASE_URL secret to the app
```
Source: [fly.io/docs/flyctl/mpg-create](https://fly.io/docs/flyctl/mpg-create/),
[fly.io/docs/flyctl/mpg-attach](https://fly.io/docs/flyctl/mpg-attach/)

`fly mpg attach` "adds a secret to the specified app containing the connection string";
`--variable-name` defaults to `DATABASE_URL`.

Connection strings use `.flympg.net` hostnames over Fly's private network (6PN):
```
# pooled (recommended for app traffic, routes through PgBouncer)
postgresql://fly-user:PASSWORD@pgbouncer.YOUR_CLUSTER.flympg.net/fly-db
# direct (migrations, advisory locks, LISTEN/NOTIFY)
postgresql://fly-user:PASSWORD@direct.YOUR_CLUSTER.flympg.net/fly-db
```
"SSL is enabled by default on all MPG connections. You do not need to set `sslmode`."
Source: [fly.io/docs/mpg/client-configuration](https://fly.io/docs/mpg/client-configuration/)

MPG's own landing page lists "Automatic backups and recovery" as a core included feature
across all plans ([fly.io/docs/mpg](https://fly.io/docs/mpg/)) — but retention window /
point-in-time-recovery mechanics are **not documented in detail** in the pages fetched;
flag as unconfirmed at the detail level. MPG is the fully-managed successor to the older
unmanaged `fly postgres` clusters (separate `/docs/mpg/` doc tree vs `/docs/postgres/`,
whose own docs are titled "This Is Not Managed Postgres").

For local dev: `fly mpg proxy` port-forwards to the cluster over 6PN.

### 1.5 Secrets

```bash
fly secrets set DATABASE_URL="postgres://..." RESEND_API_KEY="re_..." -a myapp
fly secrets set JWT_PRIVATE_KEY="$(cat key.pem | base64 -w0)" --stage   # skip deploy, next deploy picks it up
```
`--stage`: "Set secrets but skip deployment for machine apps." Source:
[fly.io/docs/flyctl/secrets-set](https://fly.io/docs/flyctl/secrets-set/)

### 1.6 GitHub Actions deploy

```yaml
# .github/workflows/fly-deploy.yml
name: Fly Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    concurrency: deploy-group
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```
Source: [fly.io/docs/launch/continuous-deployment-with-github-actions](https://fly.io/docs/launch/continuous-deployment-with-github-actions/)

`FLY_API_TOKEN` is still the current documented secret name. Docs recommend generating a
scoped **deploy token** rather than a full personal token:
```bash
fly tokens create deploy -x 999999h   # copy the ENTIRE token incl. "FlyV1" prefix
```
`--remote-only` builds on Fly's remote builders so the CI runner needs no local Docker.

### 1.7 Dockerfile guidance

Official page: [fly.io/docs/js/the-basics/dockerfiles](https://fly.io/docs/js/the-basics/dockerfiles/).
Fly's own generator: `fly launch` or `npx @flydotio/dockerfile`.

**Confirmed absent from this page:** no specific base image names/versions, no explicit
multi-stage discussion, and **no mention of pnpm or monorepos anywhere**. Any pnpm-monorepo
Dockerfile pattern below is a general best-practice convention, not sourced from Fly's docs.

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base
# bookworm-slim (glibc), not alpine: sharp needs glibc-compatible prebuilt binaries
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY apps/worker/package.json apps/worker/
RUN pnpm fetch

FROM deps AS build
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter server --filter worker build
RUN pnpm deploy --filter server --prod /prod/server
RUN pnpm deploy --filter worker --prod /prod/worker

FROM base AS runtime
ENV NODE_ENV=production
RUN groupadd -r app && useradd -r -g app app
COPY --from=build /prod/server /app/server
COPY --from=build /prod/worker /app/worker
USER app
EXPOSE 50051
CMD ["node", "/app/server/dist/main.js"]
```
`pnpm deploy --filter <pkg> --prod <dir>` produces an isolated, prod-only `node_modules` for
that package — a pnpm feature, not Fly's; verify against your own pnpm version's docs.

---

## 2. Cloudflare R2

### 2.1 Endpoint, region, tokens

```
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
region = "auto"   # empty string and "us-east-1" also alias to auto
```
Source: [developers.cloudflare.com/r2/api/s3/api](https://developers.cloudflare.com/r2/api/s3/api/)

API tokens: dashboard → R2 → Manage API Tokens → create token scoped to **Object Read &
Write** on a specific bucket. Issues an Access Key ID + Secret Access Key (secret shown once).
"Object Read & Write is only supported by the S3-compatible API, not the Cloudflare REST
API." Source: [developers.cloudflare.com/r2/api/tokens](https://developers.cloudflare.com/r2/api/tokens/)

### 2.2 S3Client config

```ts
import { S3Client } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
  // See 2.5 — required workaround for SDK >= 3.729.0
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
```
`forcePathStyle` is **not set** in Cloudflare's own example — R2 uses virtual-hosted-style
addressing (`bucket.<account>.r2.cloudflarestorage.com`) by default. Source:
[developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/)

### 2.3 Presigned PUT / GET

```ts
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const putUrl = await getSignedUrl(
  s3,
  new PutObjectCommand({ Bucket: "media", Key: key, ContentType: contentType }),
  { expiresIn: 3600 },
);

const getUrl = await getSignedUrl(
  s3,
  new GetObjectCommand({ Bucket: "media", Key: key }),
  { expiresIn: 3600 },
);
```
Source: [developers.cloudflare.com/r2/api/s3/presigned-urls](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)

- If you sign with `ContentType`, "the client must include a matching `Content-Type` header
  in the request." Docs do **not** mention signing/matching `Content-Length` at all.
- **Max `expiresIn`: 7 days (604,800 seconds)**, per SigV4/R2 docs.

### 2.4 CORS

Only relevant when the *consumer* of the request is a web browser: "CORS is used when you
interact with a bucket from a web browser... While presigned URLs handle authentication, you
still need to configure CORS when making requests from a browser." A non-browser client (a
TUI, curl, a backend service) doesn't trigger CORS enforcement at all — **no bucket CORS
config is needed for presigned URLs consumed outside a browser.** Source:
[developers.cloudflare.com/r2/buckets/cors](https://developers.cloudflare.com/r2/buckets/cors/)

### 2.5 Checksum incompatibility — confirmed NOT in Cloudflare's docs, but real

**This is a known gotcha, but it is documented on GitHub/community forums, NOT on any
official `developers.cloudflare.com` page** (checked the full R2 docs text dump and the
live `aws-sdk-js-v3` example page directly — no mention of `checksum`,
`requestChecksumCalculation`, or SDK version 3.729.0 anywhere in Cloudflare's own docs).

The underlying issue: `@aws-sdk/client-s3` v3.729.0+ (Jan 2025) defaults to adding a
checksum header (e.g. `x-amz-checksum-crc32`) on `PutObject`/`UploadPart` and validating
checksums on `GetObject`. R2 doesn't implement this AWS-specific extension, causing errors
like `Header 'x-amz-checksum-crc32' ... not implemented`.

Fix (config shown in section 2.2 above):
```ts
{ requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" }
```
Sources: [github.com/aws/aws-sdk-js-v3 issue #6810](https://github.com/aws/aws-sdk-js-v3/issues/6810),
Cloudflare community thread (not official docs): [community.cloudflare.com/.../aws-sdk-client-s3-v3-729-0-breaks...](https://community.cloudflare.com/t/aws-sdk-client-s3-v3-729-0-breaks-uploadpart-and-putobject-r2-s3-api-compatibility/758637)
— alternative workaround there is pinning `@aws-sdk/client-s3@3.726.1`.

### 2.6 Local dev alternative

R2 has no official local emulator in these docs. Common practice: run a `minio/minio`
container with S3-compatible API for local dev, pointing the same `S3Client` config at
`http://localhost:9000` with `forcePathStyle: true` (MinIO needs path-style; **this MinIO
detail is general knowledge, not from Cloudflare's docs**). Alternatively use a real R2
dev/staging bucket — simplest if consistency with prod R2 behavior matters more than offline
dev.

---

## 3. Resend & Mailpit

### 3.1 Resend Node SDK

```ts
import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY);

const { data, error } = await resend.emails.send({
  from: "Acme <notifications@yourdomain.com>",
  to: [user.email],
  subject: "Welcome",
  html: "<strong>It works!</strong>",
  text: "It works!",
});
if (error) throw error;
```
Source: [resend.com/docs/send-with-nodejs](https://resend.com/docs/send-with-nodejs)

Domain verification is required: "You must add and verify at least one domain to send
emails with Resend" — the `from` address's domain must be verified (can't send from an
arbitrary/unverified domain). Source:
[resend.com/docs/dashboard/domains/introduction](https://resend.com/docs/dashboard/domains/introduction)

### 3.2 Mailpit (local dev)

Default ports: SMTP `1025`, Web UI `8025`. Source:
[github.com/axllent/mailpit](https://github.com/axllent/mailpit),
[mailpit.axllent.org/docs/install/docker](https://mailpit.axllent.org/docs/install/docker/)

```yaml
# docker-compose.yml
services:
  mailpit:
    image: axllent/mailpit
    restart: unless-stopped
    ports: ["8025:8025", "1025:1025"]
    environment:
      MP_SMTP_AUTH_ACCEPT_ANY: 1
      MP_SMTP_AUTH_ALLOW_INSECURE: 1
```

Nodemailer transport pointed at Mailpit (**not documented by Mailpit itself — this is
generic nodemailer SMTP usage**):
```ts
import nodemailer from "nodemailer";
const transporter = nodemailer.createTransport({
  host: "localhost",
  port: 1025,
  secure: false,
  ignoreTLS: true,
});
```

### 3.3 Recommended EmailProvider adapter shape

```ts
interface EmailProvider {
  send(msg: { to: string; subject: string; html: string; text?: string }): Promise<void>;
}

class ResendEmailProvider implements EmailProvider {
  constructor(private resend: Resend, private from: string) {}
  async send(msg) {
    const { error } = await this.resend.emails.send({ from: this.from, ...msg, to: [msg.to] });
    if (error) throw new Error(error.message);
  }
}

class SmtpEmailProvider implements EmailProvider {
  constructor(private transport: nodemailer.Transporter, private from: string) {}
  async send(msg) {
    await this.transport.sendMail({ from: this.from, ...msg });
  }
}
// Wire ResendEmailProvider in prod, SmtpEmailProvider(→Mailpit) in dev, via config/env.
```

---

## 4. `@napi-rs/keyring` (TUI refresh-token storage)

### 4.1 API

```ts
import { Entry } from "@napi-rs/keyring";

const entry = new Entry("myapp", "refresh_token"); // (service, username)
entry.setPassword(refreshToken);
const stored = entry.getPassword();   // string | null
entry.deletePassword();               // alias for deleteCredential()
```
Source: [github.com/Brooooooklyn/keyring-node](https://github.com/Brooooooklyn/keyring-node)
(`index.d.ts`, README). An `AsyncEntry` class with Promise-returning equivalents also exists.

### 4.2 Platform backends & headless-Linux behavior

**The README itself documents almost nothing about platform behavior or headless caveats**
— this required reading the actual source (`Cargo.toml`, `src/linux_credential_builder.rs`)
in the same repo:

- macOS → Keychain, Windows → Credential Manager (documented via Cargo feature names only).
- Linux → **both** D-Bus secret-service (libsecret/gnome-keyring/kwallet) **and** kernel
  `keyutils` are compiled in, with an undocumented-in-prose fallback chain:

```rust
// src/linux_credential_builder.rs (source, not README prose)
match SecretServiceStore::new_with_configuration(&HashMap::new()) {
    Ok(ss_store) => ss_store,
    Err(_) => KeyutilsStore::new_with_configuration(&HashMap::new())?,  // fallback
}
```

**Practical implication for a TUI run over SSH/headless:** `new Entry(...)` first tries
D-Bus secret-service (needs a session bus + provider daemon). If unavailable, it silently
falls back to kernel `keyutils` (no daemon needed) — so it's more headless-resilient than
the README implies. It only throws if *both* backends fail. **Unconfirmed inference:**
keyutils session/user-keyring persistence across separate SSH logins may differ from a
"real" desktop keychain's persistence — not documented by this repo, worth testing directly
rather than trusting as a guarantee.

### 4.3 Defensive import + file fallback

**Not documented by the library** — dynamic-import/fallback design is your own:

```ts
async function loadNativeKeyring() {
  try { return await import("@napi-rs/keyring"); }
  catch { return null; } // unsupported platform/arch, missing prebuilt binary, sandboxed env
}

// Fallback: file store with 0600 permissions
import { promises as fs } from "node:fs";
async function writeSecretFile(path: string, value: string) {
  await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await fs.writeFile(path, value, { mode: 0o600 });
  await fs.chmod(path, 0o600); // belt-and-suspenders against umask
}
```

---

## 5. Argon2id: `@node-rs/argon2` vs `argon2`

**Recommendation: `@node-rs/argon2`** — NAPI-RS prebuilt binaries, "No node-gyp and
postinstall," smaller install (476K vs 3.7M). Source:
[github.com/napi-rs/node-rs — packages/argon2/README.md](https://github.com/napi-rs/node-rs/blob/main/packages/argon2/README.md)

`argon2` (ranisalt/node-argon2) only gained prebuilt binaries from v0.26.0, for a narrow
platform matrix (Ubuntu 22.04, macOS 13/14, Windows Server 2022, Alpine 3.18, FreeBSD 14);
outside that matrix it requires a global `node-gyp` install plus GCC ≥5/Clang ≥3.3 (or MSVC
on Windows), and requires Node ≥22. Source:
[github.com/ranisalt/node-argon2](https://github.com/ranisalt/node-argon2)

```ts
// @node-rs/argon2 — recommended
import { hash, verify, Algorithm } from "@node-rs/argon2";

const hashed = await hash(password, {
  algorithm: Algorithm.Argon2id,  // default
  memoryCost: 19456,              // KiB — OWASP m=19456 (19 MiB)
  timeCost: 2,
  parallelism: 1,
});
await verify(hashed, password); // boolean
```

```ts
// argon2 (ranisalt) — alternative, param names differ slightly
import * as argon2 from "argon2";

const hashed = await argon2.hash(password, {
  type: argon2.argon2id,   // library default is already argon2id
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});
await argon2.verify(hashed, password);
```
Note: `argon2`'s own *library default* is `m=65536, t=3, p=4` (stronger than OWASP's
minimum) — pass explicit options above to match OWASP's baseline instead.

**OWASP current recommendation** (quoted verbatim, cheatsheetseries.owasp.org, checked live):
> "Use Argon2id with a minimum configuration of 19 MiB of memory, an iteration count of 2,
> and 1 degree of parallelism." Alternative equal-strength configs: `m=47104 (46 MiB), t=1,
> p=1` / `m=19456 (19 MiB), t=2, p=1` / `m=12288 (12 MiB), t=3, p=1` / `m=9216 (9 MiB), t=4,
> p=1` / `m=7168 (7 MiB), t=5, p=1` — "Do not use [the two lightest] with Argon2i."

Source: [cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

Use `m=19456, t=2, p=1` (matches both libraries' realistic defaults and OWASP's baseline).

---

## 6. `jose` 6 — JWT with EdDSA/ES256

```ts
import { generateKeyPair, exportPKCS8, exportSPKI, SignJWT, jwtVerify } from "jose";

// extractable: true is REQUIRED to later export the private key (default is false)
const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
  crv: "Ed25519",
  extractable: true,
});
// ES256 alternative: await generateKeyPair("ES256", { extractable: true })

const privatePem = await exportPKCS8(privateKey); // PEM, PKCS8
const publicPem = await exportSPKI(publicKey);    // PEM, SPKI

// Store in env as base64 of the PEM text:
// JWT_PRIVATE_KEY=$(cat private.pem | base64 -w0)
```
Source: [github.com/panva/jose](https://github.com/panva/jose) — `docs/key/generate_key_pair`,
`docs/key/export`. `GenerateKeyPairOptions.extractable` defaults to `false`; the README's own
example uses `extractable: true` and notes it's required to export the private key.

```ts
const jwt = await new SignJWT({ sub: userId })
  .setProtectedHeader({ alg: "EdDSA" })
  .setIssuedAt()
  .setIssuer("https://myapp")
  .setAudience("myapp-api")
  .setExpirationTime("15m")
  .sign(privateKey);

const { payload } = await jwtVerify(jwt, publicKey, {
  issuer: "https://myapp",
  audience: "myapp-api",
});
```
Source: `docs/jwt/sign/classes/SignJWT.md`, `docs/jwt/verify/functions/jwtVerify.md` in the
jose repo — this exact chain matches jose's own documented example.

**Recommended alg: EdDSA (Ed25519).** Note: jose's own docs give **no comparative
recommendation** between EdDSA and ES256 (checked README, generateKeyPair, SignJWT,
jwtVerify docs, and issue #210) — only each algorithm's key requirement. The EdDSA
preference here (smaller keys/signatures, faster verification, no malleability) is **general
cryptography knowledge, not a jose doc recommendation.** ES256 remains the safer choice if
you need broad third-party JWT-library or hardware-KMS interoperability.

Env var format: base64-encode the PKCS8/SPKI PEM text; decode and pass to
`importPKCS8`/`importSPKI` at boot.

---

## 7. NestJS 11

### 7.1 `@nestjs/config` — custom validate (zod adaptation)

Nest's docs show two schema-validation paths: Joi (`validationSchema`) and a custom
`validate()` function (used with class-validator in the docs). **Zod itself is not
mentioned anywhere in NestJS's docs** — the snippet below adapts the documented `validate`
function *contract* (sync `Record<string,unknown> → validated object`, throw to abort boot),
it is not a quoted Nest example.

```ts
// env.validation.ts — zod adaptation of Nest's documented `validate` shape
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(0).max(65535),
  DATABASE_URL: z.string().url(),
  JWT_PRIVATE_KEY: z.string().min(1),
});

export function validate(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);
  if (!result.success) throw new Error(result.error.toString());
  return result.data;
}

// app.module.ts
ConfigModule.forRoot({ validate, isGlobal: true });
```
Docs: "If the function throws an error, it will prevent the application from bootstrapping."
Source: [docs.nestjs.com/techniques/configuration](https://docs.nestjs.com/techniques/configuration)

### 7.2 `ConsoleLogger` JSON output

Confirmed option name: `json` (boolean, default `false`) on `ConsoleLoggerOptions`. `colors`
auto-disables when `json` is on (to keep valid JSON), overridable back to `true`.

```ts
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({ json: true }),
});
```
Source: [docs.nestjs.com/techniques/logger](https://docs.nestjs.com/techniques/logger)

`bufferLogs: true` is a separate concern (buffers log calls until a **custom** logger is
attached during bootstrap) — not required just to use `ConsoleLogger({ json: true })`.

### 7.3 `@nestjs/throttler` v6 — HTTP-only, gRPC needs a custom guard

```ts
ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]);
// global guard
{ provide: APP_GUARD, useClass: ThrottlerGuard }
```
Source: [docs.nestjs.com/security/rate-limiting](https://docs.nestjs.com/security/rate-limiting)

**Confirmed: the docs contain zero mentions of gRPC/microservices/RPC/`switchToRpc`.** The
only non-default-HTTP extension patterns documented are WebSockets and GraphQL, both via
overriding `getRequestResponse()`/`getTracker()` — and for WS the docs explicitly say the
guard "cannot be registered with `APP_GUARD`," it must be applied per-controller.

**Unconfirmed inference, by analogy to the documented WS/GraphQL pattern** — for gRPC you'd
need:
```ts
@Injectable()
class RpcThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    return req.peerAddress ?? "unknown"; // synthesize a key from RPC metadata
  }
  protected getRequestResponse(context: ExecutionContext) {
    const rpc = context.switchToRpc();
    const data = rpc.getData();
    return { req: data, res: data }; // gRPC has no res object — reuse data
  }
}
```
This pattern is not documented on docs.nestjs.com and (per the WS restriction) may need to
be applied per-handler rather than as `APP_GUARD`. Note the `@nestjs/throttler` GitHub repo
description mentions RPC support, but that claim wasn't verified against docs.nestjs.com
content — treat as unconfirmed for this reference.

### 7.4 Graceful shutdown

```ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(50051);
}
```
```ts
@Injectable()
class UsersService implements OnApplicationShutdown {
  onApplicationShutdown(signal: string) { /* e.g. "SIGINT" */ }
}
```
"Shutdown hook listeners consume system resources, so they are disabled by default." Windows
has limited signal support (`SIGTERM` doesn't fire there). No gRPC/microservice-specific
shutdown guidance found in the docs — the mechanism is generic/app-level. Source:
[docs.nestjs.com/fundamentals/lifecycle-events](https://docs.nestjs.com/fundamentals/lifecycle-events)
(the `/fundamentals/enable-shutdown-hooks` path resolves into this same content — no
separate page exists in the docs source tree).

---

## 8. sharp 0.35

```ts
import sharp from "sharp";

const meta = await sharp(buffer, { limitInputPixels: 20e6 }).metadata();
const isAnimated = (meta.pages ?? 1) > 1; // confirmed field: `pages`

const output = await sharp(buffer, { limitInputPixels: 20e6 })
  .rotate()                                          // no-arg = auto-orient from EXIF
  .resize({ width: 1600, withoutEnlargement: true })
  .jpeg({ quality: 80, mozjpeg: true })               // or .webp({ quality: 80 })
  .toBuffer();
```
Source: [sharp.pixelplumbing.com/api-constructor](https://sharp.pixelplumbing.com/api-constructor),
[api-operation](https://sharp.pixelplumbing.com/api-operation),
[api-resize](https://sharp.pixelplumbing.com/api-resize),
[api-input](https://sharp.pixelplumbing.com/api-input)

- `limitInputPixels` default `268402689` (~16383×16383); set lower to reject huge inputs.
- `.rotate()` with no args: "if no angle is provided, `.autoOrient()` will be called" — reads
  EXIF orientation.
- `meta.pages`: "Number of pages/frames... with support for TIFF, HEIF, PDF, animated GIF and
  animated WebP" — `pages > 1` is the documented animation-detection check.
- **Metadata stripping is the default:** "By default all metadata will be removed, which
  includes EXIF-based orientation." Call `.keepMetadata()` (preserve as-is) or
  `.withMetadata()` (preserve most + normalize to sRGB ICC) to retain it; narrower
  `.keepExif()`/`.keepIccProfile()` also exist.

### Install / pnpm

Prebuilt binaries cover macOS (x64/arm64), Linux (glibc+musl, x64/arm64/armv7/riscv64/etc.),
Windows, FreeBSD (WASM). Docs show `pnpm add sharp` and point to pnpm's own
`supportedArchitectures` setting for cross-platform installs. **Sharp's docs do not mention
pnpm's `onlyBuiltDependencies`/approved-builds gate** (the mechanism where pnpm ≥9/10 blocks
native postinstall scripts unless the package is allow-listed) — that's general pnpm
knowledge you must apply yourself:
```json
// package.json
{ "pnpm": { "onlyBuiltDependencies": ["sharp"] } }
```
Source: [sharp.pixelplumbing.com/install](https://sharp.pixelplumbing.com/install)

Confirms the earlier Dockerfile choice of `node:24-bookworm-slim` (glibc), not Alpine, unless
you specifically pull sharp's musl-targeted binaries.

---

## 9. OpenTelemetry Node SDK (MVP-later — minimal setup only)

```ts
// instrumentation.ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(), // reads OTEL_EXPORTER_OTLP_ENDPOINT
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
```
Run with `node --import ./instrumentation.js dist/main.js`. Source:
[opentelemetry.io/docs/languages/js/getting-started/nodejs](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)
(quick-start there uses `ConsoleSpanExporter` by default; swap in OTLP as above).

Standard env vars (from the general, non-JS-specific OTel docs — the JS-specific
`configuration/` path returned 404):
- `OTEL_EXPORTER_OTLP_ENDPOINT` — default `http://localhost:4317` (gRPC) /
  `http://localhost:4318` (HTTP)
- `OTEL_EXPORTER_OTLP_PROTOCOL` — `grpc` | `http/protobuf` | `http/json`
- `OTEL_SERVICE_NAME` — sets the `service.name` resource attribute (default
  `unknown_service`)

Source: [opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter](https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/),
[opentelemetry.io/docs/languages/sdk-configuration/general](https://opentelemetry.io/docs/languages/sdk-configuration/general/)
