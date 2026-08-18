# Infra & Security Libraries — Verified Reference

Researched 2026-08-17 against official docs. Unconfirmed/inferred items are flagged inline.

---

## 1. Fly.io

### gRPC (h2c) service

`h2_backend` lives under `[http_service.http_options]`, not directly under `[http_service]`.

```toml
app = "myapp"
primary_region = "iad"

[http_service]
  internal_port = 50051
  force_https = false
  processes = ["server"]
  auto_stop_machines = "stop"   # string only: "off"|"stop"|"suspend" — NOT boolean
  auto_start_machines = true
  min_machines_running = 0

  [http_service.http_options]
    h2_backend = true
  [http_service.tls_options]
    alpn = ["h2"]
```

Source: [grpc-and-grpc-web-services](https://fly.io/docs/app-guides/grpc-and-grpc-web-services/), [reference/configuration](https://fly.io/docs/reference/configuration/)

Mechanics (combining gRPC guide + networking doc): the `tls` handler "terminates TLS using
Fly.io-managed application certificates, then forwards a plaintext connection to the
application process"; `h2_backend = true` makes that forwarded connection HTTP/2 plaintext
(h2c) instead of downgrading to HTTP/1.1 (which breaks gRPC trailers). Older equivalent:
`[[services.ports]] handlers = ["tls","http"]`. Source: [networking/services](https://fly.io/docs/networking/services/)

**Health checks: no native `type = "grpc"` check exists** — only `http`/`tcp` are documented.

```toml
[checks.server_tcp]
  type = "tcp"
  port = 50051
  interval = "15s"
  timeout = "2s"
  processes = ["server"]
```

Source: [reference/health-checks](https://fly.io/docs/reference/health-checks/). **Unconfirmed inference:** for a gRPC-only service, use a tcp check on the gRPC port or add a
separate HTTP health endpoint — no official recipe found.

### Process groups, release_command, deploy

```toml
[processes]
  server = "node dist/apps/server/main.js"
  worker = "node dist/apps/worker/main.js"

[deploy]
  release_command = "node dist/apps/server/migrate.js"   # replaces CMD only, not ENTRYPOINT

kill_signal = "SIGTERM"
kill_timeout = 120   # 0-300s, default 5
```

Attach services/checks to a group via `processes = ["server"]`. Source: [launch/processes](https://fly.io/docs/launch/processes/)

### Fly Managed Postgres (MPG)

```bash
fly mpg create --name mydb --org myorg --region iad --plan Launch --volume-size 10
fly mpg attach <CLUSTER_ID> -a myapp   # writes DATABASE_URL secret; --variable-name to rename
```

Connects over 6PN via `.flympg.net` hostnames:

```
postgresql://fly-user:PASSWORD@pgbouncer.CLUSTER.flympg.net/fly-db   # pooled, for app traffic
postgresql://fly-user:PASSWORD@direct.CLUSTER.flympg.net/fly-db      # direct, for migrations
```

"SSL is enabled by default on all MPG connections. You do not need to set `sslmode`."
Source: [flyctl/mpg-attach](https://fly.io/docs/flyctl/mpg-attach/), [mpg/client-configuration](https://fly.io/docs/mpg/client-configuration/)

MPG's landing page lists automatic backups as included on all plans ([mpg](https://fly.io/docs/mpg/)); retention/PITR specifics not found — unconfirmed at detail level.
MPG is the managed successor to the older unmanaged `fly postgres` (`/docs/postgres/`, titled "This Is Not Managed Postgres"). Local dev: `fly mpg proxy` port-forwards over 6PN.

### Secrets & CI

```bash
fly secrets set DATABASE_URL="postgres://..." -a myapp
fly secrets set JWT_PRIVATE_KEY="$(base64 -w0 key.pem)" --stage   # "skip deployment for machine apps"
```

Source: [flyctl/secrets-set](https://fly.io/docs/flyctl/secrets-set/)

```yaml
# .github/workflows/fly-deploy.yml
on: { push: { branches: [main] } }
jobs:
  deploy:
    runs-on: ubuntu-latest
    concurrency: deploy-group
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env: { FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }} }
```

`FLY_API_TOKEN` is still current; generate a scoped token with `fly tokens create deploy -x 999999h` (copy incl. the `FlyV1` prefix). Source: [continuous-deployment-with-github-actions](https://fly.io/docs/launch/continuous-deployment-with-github-actions/)

### Dockerfile

Official page ([js/the-basics/dockerfiles](https://fly.io/docs/js/the-basics/dockerfiles/)) gives no base-image names and **no mention of pnpm/monorepos at all** — the pattern below is general convention, not Fly-documented.

```dockerfile
FROM node:24-bookworm-slim AS base   # glibc, not alpine — sharp needs glibc prebuilds
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter server --filter worker build
RUN pnpm deploy --filter server --prod /prod/server
RUN pnpm deploy --filter worker --prod /prod/worker

FROM base AS runtime
ENV NODE_ENV=production
RUN groupadd -r app && useradd -r -g app app
COPY --from=build /prod/server /app/server
USER app
EXPOSE 50051
CMD ["node", "/app/server/dist/main.js"]
```

---

## 2. Cloudflare R2

```ts
const s3 = new S3Client({
  region: 'auto', // "" and "us-east-1" also alias to auto
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
  requestChecksumCalculation: 'WHEN_REQUIRED', // see checksum note below
  responseChecksumValidation: 'WHEN_REQUIRED',
});
```

No `forcePathStyle` in Cloudflare's own example (virtual-hosted-style by default). API
tokens: dashboard → R2 → API Tokens → scope **Object Read & Write** to a bucket (S3 API
only, not the REST API). Source: [r2/api/s3/api](https://developers.cloudflare.com/r2/api/s3/api/), [r2/api/tokens](https://developers.cloudflare.com/r2/api/tokens/)

```ts
const putUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket, Key, ContentType }), {
  expiresIn: 3600,
});
const getUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket, Key }), { expiresIn: 3600 });
```

If `ContentType` is signed, the client's request header must match it. Docs do **not**
mention signing/matching `Content-Length`. **Max `expiresIn`: 7 days (604800s)**. Source: [r2/api/s3/presigned-urls](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)

**CORS** only matters when the _consumer_ is a browser: "you still need to configure CORS
when making requests from a browser." A TUI/backend consumer of a presigned URL triggers no
CORS enforcement — **no bucket CORS needed** for non-browser clients. Source: [r2/buckets/cors](https://developers.cloudflare.com/r2/buckets/cors/)

**Checksum incompatibility — real, but NOT in Cloudflare's official docs** (verified against
the full R2 docs text dump and the live SDK example page — no mention of `checksum` or SDK
`3.729.0` anywhere). `@aws-sdk/client-s3` ≥3.729.0 defaults to adding
`x-amz-checksum-crc32` on PUT/UploadPart and validating on GET, which R2 rejects
(`... not implemented`). Fix is the two config keys shown above; alternative is pinning to
`@aws-sdk/client-s3@3.726.1`. Sources: [aws-sdk-js-v3 #6810](https://github.com/aws/aws-sdk-js-v3/issues/6810), Cloudflare community thread (not official docs): [community.cloudflare.com/.../758637](https://community.cloudflare.com/t/aws-sdk-client-s3-v3-729-0-breaks-uploadpart-and-putobject-r2-s3-api-compatibility/758637)

Local dev: no official R2 emulator; common practice is a `minio/minio` container
(`forcePathStyle: true` — MinIO-specific, not Cloudflare-documented) or a real R2 dev bucket.

---

## 3. Resend & Mailpit

```ts
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);
const { data, error } = await resend.emails.send({
  from: 'Acme <notifications@yourdomain.com>',
  to: [user.email],
  subject: 'Welcome',
  html: '<strong>It works!</strong>',
  text: 'It works!',
});
```

Source: [resend.com/docs/send-with-nodejs](https://resend.com/docs/send-with-nodejs). The
`from` domain must be verified: "You must add and verify at least one domain to send emails
with Resend." Source: [resend.com/docs/dashboard/domains/introduction](https://resend.com/docs/dashboard/domains/introduction)

Mailpit: SMTP `1025`, Web UI `8025`. Source: [github.com/axllent/mailpit](https://github.com/axllent/mailpit)

```yaml
services:
  mailpit:
    image: axllent/mailpit
    ports: ['8025:8025', '1025:1025']
```

Nodemailer→Mailpit (generic SMTP usage, not Mailpit-documented):

```ts
const transporter = nodemailer.createTransport({
  host: 'localhost',
  port: 1025,
  secure: false,
  ignoreTLS: true,
});
```

**EmailProvider adapter:**

```ts
interface EmailProvider {
  send(msg: { to: string; subject: string; html: string; text?: string }): Promise<void>;
}
class ResendEmailProvider implements EmailProvider {
  /* wraps resend.emails.send */
}
class SmtpEmailProvider implements EmailProvider {
  /* wraps nodemailer transport → Mailpit */
}
// bind ResendEmailProvider in prod, SmtpEmailProvider in dev via config
```

---

## 4. `@napi-rs/keyring`

```ts
import { Entry } from '@napi-rs/keyring';
const entry = new Entry('myapp', 'refresh_token'); // (service, username)
entry.setPassword(refreshToken);
const stored = entry.getPassword(); // string | null
entry.deletePassword(); // alias: deleteCredential()
```

Source: [github.com/Brooooooklyn/keyring-node](https://github.com/Brooooooklyn/keyring-node) (`index.d.ts`, README). An `AsyncEntry` variant also exists.

**Platform/headless behavior — the README documents almost nothing here**; this required
reading the source (`Cargo.toml`, `src/linux_credential_builder.rs`) in the same repo. macOS
→ Keychain, Windows → Credential Manager. Linux compiles in **both** D-Bus secret-service
(libsecret/gnome-keyring) and kernel `keyutils`, with an undocumented fallback:

```rust
match SecretServiceStore::new_with_configuration(&HashMap::new()) {
    Ok(store) => store,
    Err(_) => KeyutilsStore::new_with_configuration(&HashMap::new())?,  // fallback
}
```

For a TUI over SSH: `new Entry(...)` tries D-Bus first; if no session bus/provider, it
silently falls back to `keyutils` (no daemon needed) — more headless-resilient than the
README suggests. Throws only if both fail. **Unconfirmed inference:** keyutils
session-keyring persistence across separate SSH logins may differ from desktop-keychain
persistence — not documented, worth testing directly.

**Defensive import + fallback (your own design — not documented by the library):**

```ts
async function loadNativeKeyring() {
  try {
    return await import('@napi-rs/keyring');
  } catch {
    return null;
  } // unsupported platform, missing prebuild, sandboxed env
}
// Fallback: file store, mode 0600
await fs.writeFile(path, value, { mode: 0o600 });
await fs.chmod(path, 0o600); // guard against umask
```

---

## 5. Argon2id: `@node-rs/argon2` vs `argon2`

**Recommendation: `@node-rs/argon2`** — prebuilt NAPI-RS binaries, "No node-gyp and
postinstall," 476K install vs `argon2`'s 3.7M. Source: [node-rs/packages/argon2](https://github.com/napi-rs/node-rs/blob/main/packages/argon2/README.md)

`argon2` (ranisalt) only gained prebuilt binaries from v0.26.0, for a narrow matrix (Ubuntu
22.04, macOS 13/14, Windows Server 2022, Alpine 3.18, FreeBSD 14); outside it, requires
global `node-gyp` + GCC≥5/Clang≥3.3/MSVC, and Node ≥22. Source: [ranisalt/node-argon2](https://github.com/ranisalt/node-argon2)

```ts
// @node-rs/argon2
import { hash, verify, Algorithm } from '@node-rs/argon2';
await hash(password, {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});
await verify(hashed, password);
```

```ts
// argon2 (ranisalt) — default is already argon2id, but library default is m=65536,t=3,p=4
import * as argon2 from 'argon2';
await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});
await argon2.verify(hashed, password);
```

OWASP current guidance (quoted verbatim, cheatsheetseries.owasp.org): "Use Argon2id with a
minimum configuration of 19 MiB of memory, an iteration count of 2, and 1 degree of
parallelism." Equal-strength alternatives: `m=47104 (46 MiB),t=1,p=1` /
`m=19456 (19 MiB),t=2,p=1` / `m=12288,t=3,p=1` / `m=9216,t=4,p=1` / `m=7168,t=5,p=1` — "Do
not use [the two lightest] with Argon2i." Source: [Password_Storage_Cheat_Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

Use `m=19456, t=2, p=1` (matches OWASP's baseline).

---

## 6. `jose` 6 — JWT (EdDSA/ES256)

```ts
import { generateKeyPair, exportPKCS8, exportSPKI, SignJWT, jwtVerify } from 'jose';

// extractable: true REQUIRED to export the private key later (default false)
const { publicKey, privateKey } = await generateKeyPair('EdDSA', {
  crv: 'Ed25519',
  extractable: true,
});
// ES256 alt: await generateKeyPair("ES256", { extractable: true })

const privatePem = await exportPKCS8(privateKey); // PEM PKCS8
const publicPem = await exportSPKI(publicKey); // PEM SPKI
// env var: base64(privatePem) — decode + importPKCS8/importSPKI at boot
```

Source: [github.com/panva/jose](https://github.com/panva/jose) — `docs/key/generate_key_pair`, `docs/key/export`.

```ts
const jwt = await new SignJWT({ sub: userId })
  .setProtectedHeader({ alg: 'EdDSA' })
  .setIssuedAt()
  .setIssuer('https://myapp')
  .setAudience('myapp-api')
  .setExpirationTime('15m')
  .sign(privateKey);

const { payload } = await jwtVerify(jwt, publicKey, {
  issuer: 'https://myapp',
  audience: 'myapp-api',
});
```

Matches jose's own documented `SignJWT`/`jwtVerify` examples exactly.

**Recommended: EdDSA (Ed25519).** jose's own docs give **no comparative recommendation**
between EdDSA and ES256 (checked README + generateKeyPair/SignJWT/jwtVerify docs + issue
#210) — only per-algorithm key requirements. The EdDSA preference here (smaller
keys/signatures, faster verify, no malleability) is general crypto knowledge, not a jose doc
claim. ES256 remains preferable if broad third-party JWT-library/HSM/KMS interop matters
more than key size.

---

## 7. NestJS 11

**`@nestjs/config` validate (zod)** — Nest's docs show Joi (`validationSchema`) and a custom
`validate()` function (with class-validator); **zod is not mentioned in Nest's docs at all**.
Below adapts the documented `validate` _contract_ (sync, throws to abort boot):

```ts
import { z } from 'zod';
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535),
  DATABASE_URL: z.string().url(),
});
export function validate(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);
  if (!result.success) throw new Error(result.error.toString());
  return result.data;
}
// ConfigModule.forRoot({ validate, isGlobal: true });
```

Source: [docs.nestjs.com/techniques/configuration](https://docs.nestjs.com/techniques/configuration)

**Logger:** confirmed option name is `json` (boolean, default `false`) on
`ConsoleLoggerOptions`; `colors` auto-disables when `json` is on.

```ts
NestFactory.create(AppModule, { logger: new ConsoleLogger({ json: true }) });
```

Source: [docs.nestjs.com/techniques/logger](https://docs.nestjs.com/techniques/logger)

**Throttler v6 — HTTP-only, confirmed no gRPC support in docs:**

```ts
ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]);
{ provide: APP_GUARD, useClass: ThrottlerGuard }
```

Docs contain zero mentions of gRPC/microservices/`switchToRpc`; only WS and GraphQL
extension patterns are documented (both via overriding `getRequestResponse()`/
`getTracker()`), and for WS the guard explicitly **cannot** use `APP_GUARD` — must be
per-controller. Source: [docs.nestjs.com/security/rate-limiting](https://docs.nestjs.com/security/rate-limiting)

**Unconfirmed inference** (by analogy, not documented) for gRPC:

```ts
@Injectable()
class RpcThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>) {
    return req.peerAddress ?? 'unknown';
  }
  protected getRequestResponse(context: ExecutionContext) {
    const data = context.switchToRpc().getData();
    return { req: data, res: data }; // gRPC has no res object
  }
}
```

May need per-handler registration rather than `APP_GUARD`, mirroring the WS restriction —
unconfirmed for RPC specifically.

**Graceful shutdown:**

```ts
const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();
// class X implements OnApplicationShutdown { onApplicationShutdown(signal) {} }
```

"Shutdown hook listeners consume system resources, so they are disabled by default." Windows
has limited signal support (no `SIGTERM`). No gRPC/microservice-specific guidance found —
mechanism is generic/app-level. Source: [docs.nestjs.com/fundamentals/lifecycle-events](https://docs.nestjs.com/fundamentals/lifecycle-events)

---

## 8. sharp 0.35

```ts
const meta = await sharp(buffer, { limitInputPixels: 20e6 }).metadata();
const isAnimated = (meta.pages ?? 1) > 1; // confirmed field: `pages`

const out = await sharp(buffer, { limitInputPixels: 20e6 })
  .rotate() // no-arg = auto-orient via EXIF
  .resize({ width: 1600, withoutEnlargement: true })
  .jpeg({ quality: 80, mozjpeg: true }) // or .webp({ quality: 80 })
  .toBuffer();
```

Source: [api-constructor](https://sharp.pixelplumbing.com/api-constructor), [api-operation](https://sharp.pixelplumbing.com/api-operation), [api-resize](https://sharp.pixelplumbing.com/api-resize), [api-input](https://sharp.pixelplumbing.com/api-input)

`limitInputPixels` default `268402689` (~16383×16383). `meta.pages`: "Number of pages/frames
... TIFF, HEIF, PDF, animated GIF and animated WebP" — `pages > 1` is the documented
animation check. **Metadata stripping is the default:** "By default all metadata will be
removed, which includes EXIF-based orientation." Use `.keepMetadata()` (as-is) or
`.withMetadata()` (most metadata + normalize to sRGB) to retain; narrower
`.keepExif()`/`.keepIccProfile()` also exist.

Install: prebuilt binaries for macOS/Linux(glibc+musl)/Windows/FreeBSD. Docs show `pnpm add
sharp` + point to pnpm's `supportedArchitectures`, but **do not mention pnpm's
`onlyBuiltDependencies` gate** (pnpm ≥9/10 blocks native postinstall scripts unless
allow-listed) — general pnpm knowledge, apply yourself:

```json
{ "pnpm": { "onlyBuiltDependencies": ["sharp"] } }
```

Source: [sharp.pixelplumbing.com/install](https://sharp.pixelplumbing.com/install). Confirms
using `node:24-bookworm-slim` (glibc) rather than Alpine in the Dockerfile above.

---

## 9. OpenTelemetry Node SDK (MVP-later)

```ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(), // reads OTEL_EXPORTER_OTLP_ENDPOINT
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
```

Run: `node --import ./instrumentation.js dist/main.js`. Source: [getting-started/nodejs](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/) (quick-start defaults to
`ConsoleSpanExporter`; swap in OTLP as above).

Env vars (from the general OTel docs — the JS-specific `configuration/` path 404s):
`OTEL_EXPORTER_OTLP_ENDPOINT` (default `http://localhost:4317` grpc / `:4318` http),
`OTEL_EXPORTER_OTLP_PROTOCOL` (`grpc`|`http/protobuf`|`http/json`), `OTEL_SERVICE_NAME`
(default `unknown_service`). Source: [sdk-configuration/otlp-exporter](https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/), [sdk-configuration/general](https://opentelemetry.io/docs/languages/sdk-configuration/general/)
