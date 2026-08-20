import 'reflect-metadata';

import { OPTIONAL_DEPS_METADATA, SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module.js';

/**
 * Guards the failure that took production down on 2026-08-20.
 *
 * `E2eeReportEvidenceService` took its franking key ring as a defaulted constructor param whose
 * declared type was an *interface*. `emitDecoratorMetadata` cannot emit an interface, so it
 * records `Object`, and Nest then tries to resolve `Object` as a provider token — ignoring the
 * default value entirely. The app crash-looped on boot with "Nest can't resolve dependencies of
 * the E2eeReportEvidenceService (DataSource, ?)".
 *
 * Nothing in `pnpm verify` caught it: typecheck, lint and every unit test passed, because unit
 * tests construct services directly and never build the DI graph. The integration suites that do
 * boot the app are skipped without a database, so they are not part of the pre-push gate.
 *
 * This test walks the real module graph and asserts the invariant statically — no database, no
 * app boot, runs in milliseconds. A constructor param that Nest cannot resolve to a token must
 * carry `@Optional()` or `@Inject(...)`.
 */

// Nest's own metadata is untyped; this test reads the raw reflect-metadata it stores, so the
// constructor signature is deliberately unconstrained.
type Ctor = new (...args: never[]) => unknown;

function isCtor(value: unknown): value is Ctor {
  return typeof value === 'function';
}

/** Every module class reachable from `AppModule`, including `AppModule` itself. */
function collectModules(root: Ctor): Set<Ctor> {
  const seen = new Set<Ctor>();
  const queue: Ctor[] = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    const imports: unknown[] = (Reflect.getMetadata('imports', current) as unknown[]) ?? [];
    for (const imported of imports) {
      // A dynamic module is `{ module: SomeModule, ... }`; a static one is the class itself.
      const candidate = isCtor(imported)
        ? imported
        : typeof imported === 'object' && imported !== null && 'module' in imported
          ? imported.module
          : undefined;
      if (isCtor(candidate)) queue.push(candidate);
    }
  }
  return seen;
}

/** Every class-valued provider declared by the given modules. */
function collectProviders(modules: Iterable<Ctor>): Ctor[] {
  const providers: Ctor[] = [];
  for (const module of modules) {
    const declared: unknown[] = (Reflect.getMetadata('providers', module) as unknown[]) ?? [];
    for (const provider of declared) {
      // Skip `{ provide, useValue/useFactory/useClass }` — those carry an explicit token.
      if (isCtor(provider)) providers.push(provider);
    }
  }
  return providers;
}

describe('Nest DI graph', () => {
  const modules = collectModules(AppModule);
  const providers = collectProviders(modules);

  it('reaches the application modules and their providers', () => {
    // A sanity floor: if the traversal silently found nothing, every assertion below would
    // vacuously pass and the guard would be worthless.
    expect(modules.size).toBeGreaterThan(5);
    expect(providers.length).toBeGreaterThan(20);
  });

  it('has no constructor param Nest cannot resolve to a token', () => {
    const unresolvable: string[] = [];

    for (const provider of providers) {
      const paramTypes: unknown[] =
        (Reflect.getMetadata('design:paramtypes', provider) as unknown[]) ?? [];
      // `@Optional()` stores bare parameter indices; `@Inject()` stores `{ index, param }`.
      const optional: number[] =
        (Reflect.getMetadata(OPTIONAL_DEPS_METADATA, provider) as number[]) ?? [];
      const injected: { index: number }[] =
        (Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, provider) as { index: number }[]) ?? [];

      paramTypes.forEach((paramType, index) => {
        // `Object` is what `emitDecoratorMetadata` writes for an interface, a union, or an
        // otherwise non-emittable type — precisely the tokens Nest cannot look up.
        if (paramType !== Object) return;
        if (optional.includes(index)) return;
        if (injected.some((entry) => entry.index === index)) return;
        unresolvable.push(`${provider.name} constructor param ${String(index)}`);
      });
    }

    expect(unresolvable).toEqual([]);
  });
});
