# NestJS 11 + gRPC + Buf + ts-proto — Reference

Verified 2026-08-17 against docs.nestjs.com, github.com/nestjs/nest (source, tag matching published 11.2.1), github.com/stephenh/ts-proto (main branch README/NESTJS.markdown), buf.build/docs (v2 config), and github.com/grpc/grpc-node. Stack: NestJS 11.2.x, `@grpc/grpc-js` 1.14, `@grpc/proto-loader` 0.8, Buf CLI 1.72 (`buf.yaml`/`buf.gen.yaml` v2), ts-proto 2.12, TypeScript 5.9.

---

## 1. Buf config + ts-proto codegen

### `packages/proto/buf.yaml` (v2)

```yaml
version: v2
modules:
  - path: proto
lint:
  use:
    - STANDARD
  except:
    # ts-proto's nestJs generator doesn't require Request/Response-suffixed
    # message names; relax this if your messages don't follow that convention.
    - RPC_REQUEST_STANDARD_NAME
    - RPC_RESPONSE_STANDARD_NAME
  rpc_allow_same_request_response: true
  rpc_allow_google_protobuf_empty_requests: true
  rpc_allow_google_protobuf_empty_responses: true
breaking:
  use:
    - WIRE_JSON
```

Notes:
- `STANDARD` = `BASIC` + naming/versioning/RPC rules; it's buf's recommended baseline. `except` removes individual rules from the category. Only add the `RPC_REQUEST_STANDARD_NAME`/`RPC_RESPONSE_STANDARD_NAME` excepts if you actually plan to violate `MethodNameRequest`/`MethodNameResponse` naming — otherwise keep them on, they're good hygiene. (buf.build/docs/configuration/v2/buf-yaml)
- `rpc_allow_same_request_response`, `rpc_allow_google_protobuf_empty_requests`, `rpc_allow_google_protobuf_empty_responses` are lint config keys (siblings of `use`/`except`) that loosen the RPC-naming rules for cases like empty requests/responses — common with simple CRUD RPCs. (buf.build/docs/configuration/v2/buf-yaml)
- `breaking.use: [WIRE_JSON]` is buf's own recommended minimum (checks wire *and* JSON compatibility); `FILE` is the default if unset but only checks that generated code doesn't move between files, not actual compatibility. Use `WIRE_JSON` deliberately for an API-stability guarantee.

### `packages/proto/buf.gen.yaml` (v2) — local ts-proto plugin

```yaml
version: v2
clean: true
plugins:
  - local: node_modules/.bin/protoc-gen-ts_proto
    out: src/generated
    opt:
      - nestJs=true
      - outputServices=grpc-js       # see trade-off discussion below
      - addGrpcMetadata=true
      - useDate=true
      - esModuleInterop=true
      - importSuffix=.js
      - snakeToCamel=keys_json
      - env=node
      - outputEncodeMethods=true      # only meaningful if you keep grpc-js output; see below
      - useOptionals=none
      - stringEnums=false
    strategy: all
inputs:
  - directory: proto
```

Run via pnpm (from `packages/proto`, or with `pnpm --filter @patches/proto`):

```bash
pnpm buf generate
```

Since it's a pnpm workspace, `node_modules/.bin/protoc-gen-ts_proto` is a symlink pnpm creates the same way npm/yarn do — no special pnpm handling is needed, `local:` just needs to resolve on disk relative to where `buf generate` runs. (buf.build/docs/configuration/v2/buf-gen-yaml)

**Important interaction**: `nestJs=true` **unconditionally forces** `outputEncodeMethods=false`, `outputJsonMethods=false`, `outputClientImpl=false`, `lowerCaseServiceMethods=true`, and **ignores** `outputServices` entirely — ts-proto's own docs state this explicitly. So the `outputServices=grpc-js` / `outputEncodeMethods=true` lines above are only meaningful if you *don't* set `nestJs=true`. You cannot get both "NestJS controller/client interfaces" and "grpc-js encode/decode stubs" from one generation pass. (github.com/stephenh/ts-proto README, "NestJS Support" section)

### The real trade-off: one generation, two consumers

You have a Nest **server** using `@grpc/proto-loader` at runtime (dynamic reflection off the `.proto` file, no compiled schema needed) and a TUI **client** using `@grpc/grpc-js` directly. Two ts-proto output shapes are available and they are mutually exclusive per `buf generate` invocation unless you run ts-proto twice with different `out` dirs:

| Option | Generates | Runtime cost |
|---|---|---|
| `nestJs=true` | Plain TS interfaces (`Hero`, `HeroById`) + `HeroServiceController`/`HeroServiceClient` interfaces + `@HeroServiceControllerMethods()` decorator + `HERO_PACKAGE_NAME`/`HERO_SERVICE_NAME` consts. **No** `encode`/`decode`, **no** wire serialization, **no** client stub implementation. | Zero — it's types + decorators only. Actual (de)serialization still happens via `@grpc/proto-loader` reading the `.proto` at process start. |
| `outputServices=grpc-js` (no `nestJs`) | Full grpc-js `ServiceDefinition`s plus generated client/server stub classes, with `encode`/`decode` methods using `@bufbuild/protobuf` (ts-proto ≥2.x) for the wire format. | Adds a runtime dep on `@bufbuild/protobuf` (and `protobufjs/minimal` + `long` for varint handling) in whatever package imports the generated code. |

**Recommendation for this setup**: run ts-proto **once**, with `nestJs=true`, into `packages/proto/src/generated`, and let both the Nest server *and* the TUI client import the same generated interfaces:
- **Nest server**: keep `@grpc/proto-loader` doing the actual serialization at runtime (required anyway — `Transport.GRPC` loads the `.proto` dynamically via `protoPath`); use `nestJs=true` interfaces purely for compile-time safety on controller signatures (`implements HeroServiceController`). No `encode`/`decode` needed.
- **TUI client (grpc-js)**: also use `@grpc/proto-loader` (`loadSync` + `loadPackageDefinition`) to build the callable client at runtime, but **type** the resulting object with the generated `HeroServiceClient` interface (a cast) for autocomplete/type-checking. No second codegen pass needed.

proto-loader is thus the single source of truth for wire (de)serialization on both ends; ts-proto/`nestJs=true` is purely a types layer over it — simplest, avoids double-generating, avoids adding `@bufbuild/protobuf` as a runtime dependency anywhere. If later you want fully-typed generated grpc-js client stubs (no proto-loader on the client), add a **second** `buf.gen.yaml` plugin entry with `outputServices=grpc-js` (no `nestJs`) into a separate output dir for the TUI only.

### Does `nestJs=true` output `XxxServiceControllerMethods()` and `XxxServiceClient`?

Yes, confirmed from ts-proto's own NestJS guide. For:

```protobuf
service HeroService {
  rpc FindOneHero (HeroById) returns (Hero) {}
  rpc FindOneVillain (VillainById) returns (Villain) {}
  rpc FindManyVillain (stream VillainById) returns (stream Villain) {}
}
```

it generates `HeroServiceController` (interface to implement), `HeroServiceClient` (interface for the client), `HeroServiceControllerMethods()` (class decorator that wires up `@GrpcMethod`/`@GrpcStreamMethod` for every RPC automatically), plus `HERO_PACKAGE_NAME`/`HERO_SERVICE_NAME` string constants.

```typescript
// hero.controller.ts
import { Controller } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import {
  Hero, HeroById, Villain, VillainById,
  HeroServiceController, HeroServiceControllerMethods,
} from '../generated/hero';

@Controller()
@HeroServiceControllerMethods()
export class HeroController implements HeroServiceController {
  async findOneHero(data: HeroById): Promise<Hero> {
    return { id: data.id, name: 'Stephenh' };
  }

  async findOneVillain(
    @Payload() data: VillainById,
    @Ctx() metadata: Metadata,
  ): Promise<Villain> {
    return { id: data.id, name: 'John' };
  }

  findManyVillain(request: Observable<VillainById>): Observable<Villain> {
    // streaming implementation
  }
}
```

(github.com/stephenh/ts-proto/blob/main/NESTJS.markdown)

`addGrpcMetadata=true` (requires `nestJs=true`) makes the interface's method signature itself accept a trailing `Metadata` argument (so `implements` type-checks it), instead of relying on `@Ctx()`.

---

## 2. `buf breaking` against `main`

Exact CLI form to check the current working tree against the `main` branch, scoped to the proto subdirectory (run from repo root or anywhere `buf.yaml`'s module path resolves):

```bash
buf breaking --against '.git#branch=main,subdir=packages/proto'
```

General forms confirmed from buf's docs (buf.build/docs/breaking/usage):

```bash
# against a local git branch
buf breaking --against '.git#branch=main'
# against a tag
buf breaking --against '.git#tag=v1.0.0'
# against a remote repo (recommended in CI — local clones may be shallow
# and missing the branches you want to diff against)
buf breaking --against 'https://github.com/acme/petapis.git'
# remote + subdir + tag
buf breaking --against 'https://github.com/acme/petapis.git#tag=v1.0.0,subdir=proto'
```

For a monorepo where `buf.yaml` lives at `packages/proto/`, run `buf breaking` from inside `packages/proto` and use `subdir=packages/proto` on the `.git#` ref so the comparison target resolves to the same module root:

```bash
cd packages/proto
buf breaking --against '.git#branch=main,subdir=packages/proto'
```

In CI (e.g. GitHub Actions), prefer pointing `--against` at the checked-out remote HEAD of `main` rather than a local shallow clone, since GitHub Actions checkouts are shallow by default and won't have `main` available unless fetched explicitly (`fetch-depth: 0` or an explicit `git fetch origin main`).

### Lint rules and common ts-proto exceptions

- Default recommended lint set: `STANDARD` (superset of `MINIMAL` + `BASIC`, plus RPC/versioning rules). Other categories: `COMMENTS` (require doc comments), `UNARY_RPC` (forbid streaming — **do not** enable this since the spec above uses server/bidi streaming).
- `RPC_REQUEST_STANDARD_NAME` / `RPC_RESPONSE_STANDARD_NAME` / `RPC_REQUEST_RESPONSE_UNIQUE` enforce that every RPC's request/response message is named `MethodNameRequest`/`MethodNameResponse` (or `ServiceNameMethodNameRequest/Response`). These are part of `STANDARD`. ts-proto doesn't care about this naming (it works with any message name), so except them only if your team doesn't want to follow the convention — otherwise keep them for BSR/tooling interop.
- `SERVICE_SUFFIX` requires service names end in `Service` (configurable via `service_suffix:`).
- `PACKAGE_VERSION_SUFFIX` requires packages end in a version segment (`v1`, `v1alpha`, `v1beta`) — matches your `patches.v1` package already.
- Lint config keys `rpc_allow_same_request_response`, `rpc_allow_google_protobuf_empty_requests`, `rpc_allow_google_protobuf_empty_responses` loosen the RPC-naming rules for specific shapes without fully excepting the rule category.

(buf.build/docs/lint/rules, buf.build/docs/configuration/v2/buf-yaml)

---

## 3. NestJS 11 gRPC microservice

### Standalone microservice

```typescript
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'patches.v1',
      protoPath: [join(__dirname, '../../proto/proto/patches/v1/hero.proto')],
      url: '0.0.0.0:50051',
      loader: {
        keepCase: false,     // camelCase field names (proto-loader default is false = camelCase)
        longs: String,       // avoid unsafe Number coercion of int64
        enums: String,
        defaults: true,
        oneofs: true,
        includeDirs: [join(__dirname, '../../proto/proto')],
      },
    },
  });
  await app.listen();
}
bootstrap();
```

`package` and `protoPath` are required; `url` defaults to `localhost:5000` if omitted; `protoLoader` defaults to `@grpc/proto-loader`. (docs.nestjs.com/microservices/grpc)

### Hybrid app (HTTP health endpoint + gRPC)

```typescript
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

const app = await NestFactory.create(AppModule);
const grpc = app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.GRPC,
  options: { package: 'patches.v1', protoPath: [...], url: '0.0.0.0:50051' },
});
await app.startAllMicroservices();
await app.listen(3001); // HTTP health/metrics endpoint
```

By default a hybrid app does **not** inherit global pipes/interceptors/guards/filters from the HTTP app; pass `{ inheritAppConfig: true }` as a second arg to `connectMicroservice` to share them. (docs.nestjs.com/faq/hybrid-application)

### `@GrpcMethod` / `@GrpcService` controllers

```typescript
@Controller()
export class HeroesController {
  @GrpcMethod('HeroesService', 'FindOne')
  findOne(data: HeroById, metadata: Metadata, call: ServerUnaryCall<any, any>): Hero {
    return this.heroes.find(({ id }) => id === data.id);
  }
}
```
The method name/service name args can be omitted when they match the handler name (UpperCamelCase) / class name respectively. `@GrpcStreamMethod()` gives an RxJS `Observable` in/out; `@GrpcStreamCall()` gives raw Node stream semantics. (docs.nestjs.com/microservices/grpc)

### `RpcException` with gRPC status codes

NestJS 11.2.x ships typed gRPC status helpers directly (verified against the published `@nestjs/microservices@11.2.1` package, exported from its root):

```typescript
import { RpcException, GrpcStatus, GrpcNotFoundException } from '@nestjs/microservices';

// generic form: pass an object with numeric `code`/`status`
throw new RpcException({ code: GrpcStatus.NOT_FOUND, message: 'Hero not found' });

// or a typed convenience subclass (NestJS 11.2+)
throw new GrpcNotFoundException('Hero not found');
```

`GrpcStatus` mirrors the standard gRPC status codes 0–16 (`OK`…`UNAUTHENTICATED`). Nest's built-in `GrpcExceptionFilter` (applied automatically for `Transport.GRPC`) converts an `RpcException`/`GrpcException` into `{ code, message }`, which grpc-js/proto-loader serializes as the actual gRPC status. Uncaught non-`RpcException` errors are reported as `GrpcStatus.UNKNOWN`. (source: `nestjs/nest` `packages/microservices/exceptions/{rpc-exception,grpc-exception,grpc-exception-filter}.ts`, `packages/microservices/enums/grpc-status.enum.ts`)

### Reading metadata / auth header in a handler

```typescript
@GrpcMethod('HeroesService', 'FindOne')
findOne(data: HeroById, metadata: Metadata, call: ServerUnaryCall<any, any>): Hero {
  const auth = metadata.get('authorization')[0]; // string | Buffer
  // ... validate token ...
  const serverMeta = new Metadata();
  serverMeta.add('Set-Cookie', 'yummy_cookie=choco');
  call.sendMetadata(serverMeta);
  return hero;
}
```
`Metadata` is the second positional handler argument for `@GrpcMethod`; with ts-proto's `nestJs=true` + `addGrpcMetadata=true` interfaces, use `@Ctx() metadata: Metadata` (or a typed trailing param) instead. (docs.nestjs.com/microservices/grpc; ts-proto NESTJS.markdown)

### gRPC guard/interceptor reading metadata

```typescript
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const rpc = context.switchToRpc();
    const metadata = rpc.getContext<Metadata>(); // Metadata instance for gRPC
    const token = metadata.get('authorization')[0];
    return !!token && verify(token);
  }
}
```
`ExecutionContext.switchToRpc().getContext()` is the standard cross-transport way to reach the raw gRPC `Metadata`/call object inside guards and interceptors (same underlying object the handler receives as its 2nd argument).

### Reflection and health checks

There's no first-party Nest abstraction for either — both are wired in via the raw `onLoadPackageDefinition` hook on the gRPC server options:

```typescript
import { ReflectionService } from '@grpc/reflection';
import { HealthImplementation, protoPath as healthCheckProtoPath } from 'grpc-health-check';

const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.GRPC,
  options: {
    package: 'patches.v1',
    protoPath: [healthCheckProtoPath, join(__dirname, '.../hero.proto')],
    onLoadPackageDefinition: (pkg, server) => {
      new ReflectionService(pkg).addToServer(server);
      const health = new HealthImplementation({ '': 'UNKNOWN' });
      health.addToServer(server);
      health.setStatus('', 'SERVING');
    },
  },
});
```
Install: `npm i @grpc/reflection grpc-health-check`. This is the pattern documented directly on docs.nestjs.com/microservices/grpc under "Reflection" / health-check guidance — Nest doesn't wrap these itself, you attach them to the raw `grpc.Server` instance Nest creates.

---

## 4. Does NestJS 11 support ESM?

**No official/native ESM support.** Confirmed directly from the NestJS core team on the open GitHub issue tracking this (github.com/nestjs/nest issue #15919, comment from maintainer `micalevisk`, Nov 2025):

> "the support of importing a ESM-only module is about typescript, not nestjs. Anyone that fully understand typescript+CJS nodejs should know how to make it work. Which is why we don't have a dedicated page about it at nestjs docs"

I.e., there is no dedicated NestJS ESM guide because the team's position is: keep the Nest app compiling to CommonJS, and solve "consuming an ESM-only package" as a TypeScript module-resolution problem, not a framework problem.

**Recommended approach for this monorepo:**
- **Server package**: compile as CommonJS. Set `"module": "nodenext"` (or `"commonjs"`) and `"moduleResolution": "nodenext"` in the server's `tsconfig.json` — this is also what current NestJS CLI scaffolds default to per the same issue thread, and it's what makes TypeScript correctly resolve `.d.ts` types for ESM-only dependencies even though the emitted output stays CJS. Do **not** put `"type": "module"` in the server package's `package.json`.
- **Consuming an ESM-only shared package from the CJS server**: use a dynamic `import()` (which works from CJS at runtime) rather than a static `import`/`require`, since a static import of an ESM-only package from CJS fails at compile/require time.
- **Recommendation for `packages/proto`**: since it's consumed by *both* the CJS Nest server and the ESM-only Ink TUI, build it dual (CJS + ESM) with a `package.json` `"exports"` map (`require`/`import` conditions), or — simpler, given ts-proto output is just plain TS interfaces/decorators with no runtime code — compile it to CJS only and let the TUI's bundler/`tsx`/Node ESM interop `require()` it (Node 22+ supports `require()` of CJS from ESM natively without flags, and also has `--experimental-require-module` for edge cases). A dual-published package is the more future-proof option if you don't want to depend on Node's CJS/ESM interop.

(github.com/nestjs/nest/issues/15919, github.com/nestjs/nest/issues/15375)

---

## 5. Client side (Node/ESM) — dynamic proto-loader vs generated types

### Minimal dynamic client (proto-loader + grpc-js)

```typescript
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const packageDefinition = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [protoIncludeDir],
});
const proto = grpc.loadPackageDefinition(packageDefinition) as any;

const credentials = useTls
  ? grpc.credentials.createSsl()
  : grpc.credentials.createInsecure();

const client = new proto.patches.v1.HeroService(target, credentials);

const deadline = new Date(Date.now() + 5_000); // 5s
const metadata = new grpc.Metadata();
metadata.set('authorization', `Bearer ${token}`);

client.findOneHero({ id: 1 }, metadata, { deadline }, (err, response) => {
  if (err) throw err;
  console.log(response);
});
```
This mirrors grpc-node's own example (`examples/helloworld/dynamic_codegen/greeter_client.js`) plus `deadline`/`metadata`/TLS additions. `CallOptions.deadline` is a documented field on grpc-js's `CallOptions` type (`packages/grpc-js/src/client.ts`). proto-loader's load options (`keepCase`, `longs`, `enums`, `bytes`, `defaults`, `arrays`, `objects`, `oneofs`, `json`, `includeDirs`) are documented in `packages/proto-loader/README.md`. (github.com/grpc/grpc-node)

### Generated-types alternative (`outputServices=grpc-js`)

If you generate a **second** ts-proto output (no `nestJs=true`) with `outputServices=grpc-js`, you get real TS classes for the client/server stubs and `encode`/`decode`, so you can write `new HeroServiceClient(target, credentials)` with full type safety and no `as any` casts, at the cost of an extra runtime dependency (`@bufbuild/protobuf`) and a second codegen target.

**Recommendation**: for the TUI, use the **dynamic proto-loader client above, cast to the `nestJs=true`-generated `HeroServiceClient` interface** for typing:

```typescript
import type { HeroServiceClient } from '@patches/proto/generated/hero';
const client = new proto.patches.v1.HeroService(target, credentials) as unknown as HeroServiceClient;
```

This keeps a single codegen pass (`nestJs=true`) shared by both server and TUI, avoids adding `@bufbuild/protobuf` as a dependency anywhere, and still gives you compile-time method/field checking on the client. Only switch to full `outputServices=grpc-js` codegen if the `as unknown as` cast becomes a real pain point (e.g., you need real class instances, not just interface shapes).

---

## 6. Version pitfalls

- **`@grpc/proto-loader` 0.8.1's own dependencies**: `long@^5.0.0` and `protobufjs@^7.5.3` (verified via npm registry). This is a *separate* runtime stack from anything ts-proto generates — proto-loader always uses its own bundled protobufjs/long for wire (de)serialization regardless of what ts-proto option you pick, because proto-loader parses the `.proto` file directly at runtime.
- **ts-proto 2.x runtime dependency**: as of ts-proto 2.x, generated `encode`/`decode` methods (only emitted when `outputEncodeMethods=true`, which `nestJs=true` disables by default) use `@bufbuild/protobuf` instead of the old `protobufjs`-based writer/reader (ts-proto migrated this in its 2.0 release; verified in ts-proto's own `CHANGELOG.md` migration note: *"The 2.x release of ts-proto migrated the low-level Protobuf serializing that its `encode` and `decode` method use from... `protobufjs`... to `@bufbuild/protobuf`"*). Since our recommended config (`nestJs=true`) never emits `encode`/`decode`, **this dependency is not needed at all** in `packages/proto`'s runtime deps for the recommended setup. Only add `@bufbuild/protobuf` if you separately generate `outputServices=grpc-js` output.
- **`long` package still shows up even without `forceLong`**: ts-proto's *default* (`forceLong=number`) still internally imports the `long` library to safely decode 64-bit wire values before converting to `number` (and throws at runtime if a value exceeds `Number.MAX_SAFE_INTEGER`). Only `onlyTypes=true` fully excludes `long`/`protobufjs/minimal` imports from generated code — not relevant here since we need runtime interfaces, not `onlyTypes`.
- **`esModuleInterop=true`** changes ts-proto's `Long` import style from `import * as Long from 'long'` to `import Long from 'long'` — must match your `tsconfig.json`'s own `esModuleInterop` setting or you'll get default-import errors.
- **`--ts_proto_opt=importSuffix=.js`** is required for any ESM consumer (the TUI) since Node's ESM resolver needs explicit extensions on relative imports; ts-proto's README notes this needs TypeScript ≥4.7 (we're on 5.9, fine). This has no effect on/is unnecessary for the CJS Nest server build, but is harmless to leave on since `moduleResolution: nodenext`/`bundler` in the server also tolerates explicit `.js` specifiers.
- **`addGrpcMetadata=true` and `addNestjsRestParameter=true` both require `nestJs=true`** and are mutually exclusive framing choices for how the trailing argument is typed (`Metadata` vs `...rest: any[]`) — don't combine looking for both behaviors, pick one.
- **proto-loader's `longs`/`enums` client options must match what your handler code expects** — e.g. if the server's `loader.longs` differs from the client's `protoLoader.loadSync(..., { longs })`, int64 fields will arrive as different JS types (`Long` object vs `string`) on each side, causing silent type mismatches since both sides parse the same `.proto` independently at runtime (there's no shared schema object crossing the wire, only bytes).
- **`buf.gen.yaml` `strategy: all` vs `directory` for ts-proto**: ts-proto's own README recommends `strategy: all` (all proto files in one invocation) rather than the default `directory`, because ts-proto needs the full set of files to correctly resolve cross-file imports/types in one pass.

---

## Sources
- docs.nestjs.com/microservices/grpc (via github.com/nestjs/docs.nestjs.com content source)
- docs.nestjs.com/faq/hybrid-application
- github.com/nestjs/nest — `packages/microservices/{exceptions,enums}/*`, published `@nestjs/microservices@11.2.1` on npm
- github.com/nestjs/nest issues #15919, #15375 (ESM support)
- github.com/stephenh/ts-proto — `README.markdown`, `NESTJS.markdown`, `CHANGELOG.md`, npm registry `ts-proto@2.12.0`
- buf.build/docs/configuration/v2/buf-yaml, buf.build/docs/configuration/v2/buf-gen-yaml, buf.build/docs/breaking/usage, buf.build/docs/breaking/rules, buf.build/docs/lint/rules
- github.com/grpc/grpc-node — `examples/helloworld/dynamic_codegen/greeter_client.js`, `packages/proto-loader/README.md`, `packages/grpc-js/src/client.ts`, npm registry `@grpc/proto-loader@0.8.1`, `@grpc/grpc-js@1.14.4`
