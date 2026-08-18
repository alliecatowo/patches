# TypeORM 1.x + PostgreSQL + NestJS 11 — Reference

Stack: NestJS 11 (CJS build), TS 5.9, TypeORM 1.1.0, pg 8.x, PostgreSQL 17,
`@nestjs/typeorm` 11.0.3, Data Mapper/repository pattern, `synchronize: false`,
snake_case DB / camelCase TS, UUID PKs, monorepo (`packages/database` →
`apps/server`, `apps/worker`).

Verified 2026-08-17 against typeorm.io docs, typeorm/typeorm GitHub source, npm
registry metadata, and nestjs/typeorm source. TypeORM 1.0 shipped 2026-05-19,
1.1.0 on 2026-07-13. This is a real major version — 0.3.x knowledge does not
transfer directly.

## 1. Breaking changes vs 0.3.x that matter here

- **Node 20+ / ES2023 required** (16/18 dropped). Matches Nest 11's own floor.
- **`Connection`/`ConnectionOptions` removed** → `DataSource`/`DataSourceOptions`.
  All globals gone (`createConnection`, `getConnection`, `getManager`,
  `getRepository`, `getCustomRepository`, `getMongoRepository`). Everything goes
  through a `DataSource` instance (`new DataSource(opts)`, `.initialize()`,
  `.destroy()`). `.connection` on Driver/QueryRunner/EntityManager/QueryBuilder
  renamed to `.dataSource`. Named connections / `DataSource.name` removed.
- **`TYPEORM_*` env vars, `ormconfig.env`, auto-dotenv: removed.** Config must
  be a plain TS/JS module exporting `DataSourceOptions`.
- **Repository/find API**: `findOneById()` → `findOneBy({id})`; `findByIds()` →
  `findBy({id: In([...])})`; `.exist()` → `.exists()`. `@EntityRepository` /
  `AbstractRepository` / `getCustomRepository()` removed — extend
  `Repository<Entity>` or use `Repository.extend()`. **String-array
  `select`/`relations` removed** — object syntax only:
  `repo.find({ select: { id: true }, relations: { profile: true } })`. `join`
  find-option removed (use `relations` for LEFT JOIN, QueryBuilder for INNER).
- **`where: { x: null }` now throws** by default (`invalidWhereValuesBehavior`).
  Use `IsNull()`. QueryBuilder's own `.where()/.andWhere()` are unaffected.
- **Non-nullable relations now generate INNER JOIN, not LEFT JOIN.** Any
  `@ManyToOne(() => X, { nullable: false })` used via `relations: {}` may now
  drop rows previously kept by LEFT JOIN — audit joins/reports.
- **QueryBuilder**: `onConflict()` → `orIgnore()`/`orUpdate()`; `printSql()`
  removed (use `.getSql()`); `setNativeParameters()` → `setParameters()`. Lock
  modes consolidated (§5).
- **`@PrimaryGeneratedColumn('uuid')`**: unchanged signature/behavior.
- **Migrations**: `MigrationExecutor.getAllMigrations()` removed →
  `getPendingMigrations()`/`getExecutedMigrations()`/`dataSource.migrations`.
  `QueryRunner.loadedTables`/`loadedViews` → async `getTables()`/`getViews()`.
- **`@Column({ readonly: true })` removed** → `{ update: false }`.
- **ESM/CJS**: both supported; CLI ships `typeorm-ts-node-commonjs` and
  `typeorm-ts-node-esm` launchers (§3). A CJS Nest build is fully supported.
- **Migration tool**: `npx @typeorm/codemod v1 src/` (real npm package,
  confirmed latest 1.0.3) automates most renames above — run once over
  `packages/database` before hand-fixing.
- **Postgres driver**: no Postgres-only breaking option changes found (unlike
  MySQL/SQLite/Mongo/MSSQL, which lost drivers/options). Standard
  `DataSourceOptions` fields (`host`, `port`, `ssl`, `extra`, `poolSize`,
  `namingStrategy`, `entities`, `migrations`) are unchanged for `type: "postgres"`.

Sources: [Release Notes 1.0](https://typeorm.io/docs/releases/1.0/release-notes/) ·
[Upgrading from 0.3 to 1.0](https://typeorm.io/docs/releases/1.0/upgrading-from-0.3/) ·
[TypeORM 1.0 blog](https://typeorm.io/blog/typeorm-1-0/) ·
[Data Source Options](https://typeorm.io/docs/data-source/data-source-options/)

## 2. snake_case naming strategy

**No built-in snake_case strategy in 1.x.** `namingStrategy` still defaults to
`DefaultNamingStrategy`, which snake_cases only the **table** name from the
class name and leaves columns camelCase, with hashed constraint names
(`PK_<hash>` etc). Confirmed from `typeorm/src/naming-strategy/DefaultNamingStrategy.ts`.

**`typeorm-naming-strategies` is NOT 1.x-compatible** — its latest published
version (4.1.0, checked via npm registry) declares
`peerDependencies: { typeorm: "^0.2.0 || ^0.3.0" }`, no `1.x` range. Write a
custom strategy instead — the interface is small and stable:

```ts
// packages/database/src/naming-strategy.ts
import { DefaultNamingStrategy, NamingStrategyInterface } from "typeorm"
import type { Table, View } from "typeorm"

function snakeCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase()
}
function tableRef(t: Table | View | string): string {
  return (typeof t === "string" ? t : t.name).split(".").pop()!
}
function truncate(name: string): string {
  return name.length > 63 ? name.slice(0, 63) : name // pg identifier limit
}

export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  tableName(targetName: string, userSpecifiedName?: string): string {
    return snakeCase(userSpecifiedName ?? targetName)
  }
  columnName(propertyName: string, customName: string | undefined, embeddedPrefixes: string[]): string {
    return snakeCase([...embeddedPrefixes, customName || propertyName].join("_"))
  }
  relationName(propertyName: string): string {
    return snakeCase(propertyName)
  }
  joinColumnName(relationName: string, referencedColumnName: string): string {
    return snakeCase(`${relationName}_${referencedColumnName}`)
  }
  joinTableName(firstTableName: string, secondTableName: string): string {
    return snakeCase(`${firstTableName}_${secondTableName}`)
  }
  joinTableColumnName(tableName: string, propertyName: string, columnName?: string): string {
    return snakeCase(`${tableName}_${columnName || propertyName}`)
  }
  joinTableInverseColumnName(tableName: string, propertyName: string, columnName?: string): string {
    return this.joinTableColumnName(tableName, propertyName, columnName)
  }
  // Human-readable constraint names instead of DefaultNamingStrategy's hashes.
  indexName(t: Table | View | string, cols: string[]): string {
    return truncate(`idx_${tableRef(t)}_${cols.map(snakeCase).sort().join("_")}`)
  }
  primaryKeyName(t: Table | string, cols: string[]): string {
    return truncate(`pk_${tableRef(t)}_${cols.map(snakeCase).sort().join("_")}`)
  }
  foreignKeyName(t: Table | string, cols: string[]): string {
    return truncate(`fk_${tableRef(t)}_${cols.map(snakeCase).sort().join("_")}`)
  }
  uniqueConstraintName(t: Table | string, cols: string[]): string {
    return truncate(`uq_${tableRef(t)}_${cols.map(snakeCase).sort().join("_")}`)
  }
}
```
Inherit `checkConstraintName`, `defaultConstraintName`, `exclusionConstraintName`,
`relationConstraintName`, `closureJunctionTableName`,
`joinTableColumnDuplicationPrefix`, `prefixTableName` from `DefaultNamingStrategy`
unmodified — fine as hashed names. Wire via `namingStrategy: new SnakeNamingStrategy()`.

Sources: [NamingStrategyInterface.ts](https://github.com/typeorm/typeorm/blob/master/src/naming-strategy/NamingStrategyInterface.ts) ·
[DefaultNamingStrategy.ts](https://github.com/typeorm/typeorm/blob/master/src/naming-strategy/DefaultNamingStrategy.ts) ·
[typeorm-naming-strategies npm](https://www.npmjs.com/package/typeorm-naming-strategies) (peerDeps checked via registry)

## 3. Migrations & CLI

```ts
// packages/database/src/data-source.ts — framework-free, shared by CLI + Nest
import "reflect-metadata"
import { DataSource, DataSourceOptions } from "typeorm"
import { SnakeNamingStrategy } from "./naming-strategy"

export const dataSourceOptions: DataSourceOptions = {
  type: "postgres",
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: false,
  namingStrategy: new SnakeNamingStrategy(),
  entities: [__dirname + "/entities/*.entity{.ts,.js}"],
  migrations: [__dirname + "/migrations/*{.ts,.js}"],
}
export const dataSource = new DataSource(dataSourceOptions)
```

**CLI in a pnpm monorepo TS package**: 1.x still ships `typeorm-ts-node-commonjs`
(CJS) / `typeorm-ts-node-esm` wrapper bins — use the CJS one to match this
build. `ts-node` is in maintenance mode; `tsx` also works
(`tsx node_modules/.bin/typeorm ...`) but the documented/supported path is the
bundled wrapper, which handles `emitDecoratorMetadata` + `reflect-metadata`
load order correctly:

```json
// packages/database/package.json
{
  "scripts": {
    "typeorm": "typeorm-ts-node-commonjs",
    "migration:generate": "pnpm typeorm migration:generate -d src/data-source.ts",
    "migration:create": "pnpm typeorm migration:create",
    "migration:run": "pnpm typeorm migration:run -d src/data-source.ts",
    "migration:revert": "pnpm typeorm migration:revert -d src/data-source.ts",
    "migration:show": "pnpm typeorm migration:show -d src/data-source.ts"
  }
}
```
`-d`/`--dataSource` is mandatory, same as 0.3.x. `migration:generate`/`create`
always emit `.ts`. `migration:run`/`revert` work against compiled `.js` too —
for CI, build `packages/database` first and point `-d` at
`dist/data-source.js` to skip the TS loader at deploy time.

**Migration file shape**:
```ts
import { MigrationInterface, QueryRunner } from "typeorm"

export class AddUsersTable1755400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`)
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "users"`)
  }
}
```

**Partial/expression indexes** — `@Index` can't express `WHERE`, so hand-write
raw SQL (generate won't produce these from entity metadata):
```ts
public async up(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`
    CREATE INDEX "idx_users_email_active" ON "users" ("email")
    WHERE "deleted_at" IS NULL`)
  await queryRunner.query(`
    CREATE INDEX "idx_orders_lower_email" ON "orders" (lower("email"))`)
}
public async down(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`DROP INDEX "idx_users_email_active"`)
  await queryRunner.query(`DROP INDEX "idx_orders_lower_email"`)
}
```

Sources: [Using CLI](https://typeorm.io/docs/using-cli/) ·
[Creating migrations manually](https://typeorm.io/docs/migrations/creating/) ·
[Executing and reverting](https://typeorm.io/docs/migrations/executing/) ·
[Upgrading from 0.3 to 1.0](https://typeorm.io/docs/releases/1.0/upgrading-from-0.3/)

## 4. NestJS integration

`@nestjs/typeorm` 11.0.3's `peerDependencies` are
`typeorm: "^0.3.0 || ^1.0.0-dev"` (checked directly via npm registry API);
11.0.1 was the first version with 1.x support. `1.1.0`, a stable non-prerelease
version, satisfies that range under standard semver resolution.

```ts
// apps/server/src/database/database.module.ts
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...dataSourceOptions,
        host: config.get("DB_HOST"),
        password: config.get("DB_PASSWORD"),
      }),
      dataSourceFactory: async (options) => new DataSource(options!).initialize(),
    }),
    TypeOrmModule.forFeature([User, Order]),
  ],
})
export class DatabaseModule {}
```

Injection is unchanged in 1.x:
```ts
constructor(
  @InjectRepository(User) private readonly users: Repository<User>,
  @InjectDataSource() private readonly dataSource: DataSource,
) {}
```

**Transactions — always use the callback-scoped `manager`, never the injected
repository, inside the transaction:**
```ts
async transferCredits(fromId: string, toId: string, amount: number) {
  return this.dataSource.transaction(async (manager) => {
    const from = await manager.findOneByOrFail(Account, { id: fromId })
    const to = await manager.findOneByOrFail(Account, { id: toId })
    from.balance -= amount
    to.balance += amount
    await manager.save([from, to])   // manager, not this.accounts repo
  })
}
```
Calling `this.users.save(...)` (injected repo) inside the callback silently
escapes the transaction — runs against the pool, not the tx connection.
Unchanged 0.3.x/1.x footgun, still the #1 one.

**Worker as a Nest standalone context**, reusing the same `DatabaseModule`:
```ts
// apps/worker/src/main.ts
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ["error", "warn", "log"],
  })
  await app.get(JobRunnerService).start()
  process.on("SIGTERM", async () => app.close())
}
bootstrap()

// apps/worker/src/worker.module.ts
@Module({ imports: [DatabaseModule], providers: [JobRunnerService] })
export class WorkerModule {}
```
`app.close()` cleanly tears down the DataSource (Nest's TypeORM module calls
`dataSource.destroy()` on `onModuleDestroy`) — important for workers under a
process manager.

Sources: [nestjs/typeorm README](https://github.com/nestjs/typeorm) ·
[nestjs/typeorm decorators source](https://github.com/nestjs/typeorm/blob/master/lib/common/typeorm.decorators.ts) ·
npm registry `@nestjs/typeorm` peerDependencies history (11.0.1–11.0.3 confirmed)

## 5. Keyset pagination & `FOR UPDATE SKIP LOCKED`

**Row-value keyset pagination** is plain parameterized SQL via QueryBuilder's
documented raw-fragment `where()` — no dedicated tuple-comparison API, not a
1.x feature, just standard practice:
```ts
async listPage(after?: { createdAt: Date; id: string }, limit = 20) {
  const qb = this.orders.createQueryBuilder("order")
    .orderBy("order.created_at", "DESC")
    .addOrderBy("order.id", "DESC")
    .take(limit)
  if (after) {
    qb.andWhere(`("order"."created_at", "order"."id") < (:createdAt, :id)`, {
      createdAt: after.createdAt,
      id: after.id,
    })
  }
  return qb.getMany()
}
```
Use the actual DB column names (`created_at`/`id`) inside the raw fragment —
QueryBuilder rewrites `entity.property` tokens through the naming strategy but
not arbitrary raw-string SQL, so writing DB-side names directly is safer.

**`FOR UPDATE SKIP LOCKED`** — verified against
`typeorm.io/docs/query-builder/select-query-builder/`. In 1.x,
`pessimistic_partial_write` and `pessimistic_write_or_fail` were removed in
favor of `setLock` + `setOnLocked`:
```ts
async claimNextJob() {
  return this.dataSource.transaction(async (manager) => {
    const job = await manager.createQueryBuilder(Job, "job")
      .where("job.status = :status", { status: "pending" })
      .orderBy("job.created_at", "ASC")
      .setLock("pessimistic_write")
      .setOnLocked("skip_locked")   // -> FOR UPDATE SKIP LOCKED
      .limit(1)
      .getOne()
    if (!job) return null
    job.status = "processing"
    return manager.save(job)
  })
}
```
`setOnLocked("nowait")` → `FOR UPDATE NOWAIT` (replaces
`pessimistic_write_or_fail`). Postgres also accepts `pessimistic_read`,
`for_no_key_update`, `for_key_share` as `setLock` modes.

Sources: [Select using Query Builder](https://typeorm.io/docs/query-builder/select-query-builder/) ·
[Upgrading from 0.3 to 1.0](https://typeorm.io/docs/releases/1.0/upgrading-from-0.3/)

## 6. Testing with real Postgres

No 1.x-specific testing API changes found — `dataSource.runMigrations()`,
`dataSource.dropDatabase()`, `DataSourceOptions.dropSchema` all unchanged from
0.3.x.

```ts
// packages/database/src/testing/test-data-source.ts
export async function createTestDataSource(): Promise<DataSource> {
  const ds = new DataSource({
    ...dataSourceOptions,
    database: process.env.TEST_DB_NAME ?? "app_test",
    dropSchema: true,    // wipe schema on initialize() — test DBs only
    synchronize: false,  // still migrate explicitly to catch migration bugs
  })
  await ds.initialize()
  await ds.runMigrations()
  return ds
}
```

**Per-test isolation — prefer transaction-wrap-and-rollback over truncate** for
speed (no re-run of migrations/seed); fall back to truncate only when the test
itself needs a commit (e.g. testing `dataSource.transaction` boundaries):
```ts
let dataSource: DataSource
let queryRunner: QueryRunner

beforeAll(async () => { dataSource = await createTestDataSource() })

beforeEach(async () => {
  queryRunner = dataSource.createQueryRunner()
  await queryRunner.connect()
  await queryRunner.startTransaction()
})

afterEach(async () => {
  await queryRunner.rollbackTransaction()
  await queryRunner.release()
})

afterAll(async () => { await dataSource.destroy() })
```
Use `queryRunner.manager.getRepository(User)` in tests, not
`dataSource.manager`/`dataSource.getRepository()` directly — otherwise queries
run outside the per-test transaction and rollback won't undo them. For code
under test that opens its own nested transaction/savepoint, truncate-between-
tests is simpler than fighting savepoint semantics — choose per-suite.

Sources: [Data Source Options](https://typeorm.io/docs/data-source/data-source-options/) (`dropSchema`) ·
`dataSource.runMigrations()`/`QueryRunner` transaction APIs — stable since
0.3.x, no changes listed in 1.0 release notes.

## 7. Entity conventions

```ts
@Entity({ name: "users" })
@Index(["email"], { unique: true })
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({ type: "text" })
  email: string

  // text + CHECK preferred over pg native enum: adding/renaming an enum value
  // needs ALTER TYPE ... ADD VALUE, more migration friction than a CHECK.
  @Column({ type: "text" })
  @Check(`"status" IN ('active', 'suspended', 'deleted')`)
  status: "active" | "suspended" | "deleted"

  @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>

  // bigint comes back from pg as a string (JS number can't hold int8 range) —
  // type the TS field as string, not number.
  @Column({ type: "bigint" })
  viewCount: string

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date

  @DeleteDateColumn({ type: "timestamptz" })
  deletedAt: Date | null

  // No eager, no cascade by default — load relations explicitly via
  // `relations: {}` or QueryBuilder joins; cascade only where the child has
  // no independent lifecycle.
  @ManyToOne(() => Organization, { nullable: false })
  @JoinColumn({ name: "organization_id" })
  organization: Organization
}
```
- `@Entity({ name: 'users' })` is redundant once `SnakeNamingStrategy` is wired
  (it'd derive `users` from `User` anyway) — keep explicit for intentionally
  irregular table names.
- `@CreateDateColumn`/`@UpdateDateColumn`/`@DeleteDateColumn` take the same
  options as `@Column`; use `timestamptz` over the default `timestamp` to
  avoid implicit-UTC ambiguity on PG.
- Soft delete: `@DeleteDateColumn` + `.softRemove()`/`.restore()`; `find()`
  excludes soft-deleted rows by default — pass `withDeleted: true` to include.
- `@Unique(['organizationId', 'email'])` for semantic composite uniqueness vs
  a bare `@Index` for lookup speed only.
- pg `bigint`/`int8` → JS `string`: unchanged default behavior in the pg driver
  (avoids silent precision loss); no 1.x change found.

## Sources index

- [TypeORM 1.0 Release Notes](https://typeorm.io/docs/releases/1.0/release-notes/)
- [Upgrading from 0.3 to 1.0](https://typeorm.io/docs/releases/1.0/upgrading-from-0.3/)
- [TypeORM 1.0 is here (blog)](https://typeorm.io/blog/typeorm-1-0/)
- [Using CLI](https://typeorm.io/docs/using-cli/)
- [Creating migrations manually](https://typeorm.io/docs/migrations/creating/)
- [Executing and reverting migrations](https://typeorm.io/docs/migrations/executing/)
- [Data Source Options](https://typeorm.io/docs/data-source/data-source-options/)
- [Select using Query Builder](https://typeorm.io/docs/query-builder/select-query-builder/)
- [NamingStrategyInterface.ts](https://github.com/typeorm/typeorm/blob/master/src/naming-strategy/NamingStrategyInterface.ts)
- [DefaultNamingStrategy.ts](https://github.com/typeorm/typeorm/blob/master/src/naming-strategy/DefaultNamingStrategy.ts)
- [nestjs/typeorm README](https://github.com/nestjs/typeorm)
- [nestjs/typeorm decorators source](https://github.com/nestjs/typeorm/blob/master/lib/common/typeorm.decorators.ts)
- npm registry metadata: `typeorm@1.1.0`, `@nestjs/typeorm@11.0.3`, `typeorm-naming-strategies@4.1.0`, `@typeorm/codemod@1.0.3` (peerDependencies checked via `registry.npmjs.org`)
