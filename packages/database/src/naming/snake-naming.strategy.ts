import { DefaultNamingStrategy } from 'typeorm';
import type { NamingStrategyInterface, Table, View } from 'typeorm';

/**
 * snake_case naming strategy for TypeORM 1.x.
 *
 * No built-in snake_case strategy ships in 1.x — `DefaultNamingStrategy` snake_cases only
 * the table name and leaves columns camelCase with hashed constraint names. The community
 * `typeorm-naming-strategies` package is not 1.x-compatible (its latest release declares
 * `peerDependencies: { typeorm: "^0.2.0 || ^0.3.0" }`). See
 * `docs/research/typeorm-postgres.md` §2 — this class is that research verified against the
 * actual installed `typeorm@1.1.0` `NamingStrategyInterface`/`DefaultNamingStrategy`
 * signatures (which differ slightly from earlier 0.3.x-era snippets: `foreignKeyName` takes
 * extra optional referenced-table/column params, `indexName` takes an optional `where`, and
 * `joinTableName` takes both property names, not just both table names).
 */
export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  override tableName(targetName: string, userSpecifiedName: string | undefined): string {
    return snakeCase(userSpecifiedName ?? targetName);
  }

  override columnName(
    propertyName: string,
    customName: string,
    embeddedPrefixes: string[],
  ): string {
    return snakeCase([...embeddedPrefixes, customName || propertyName].join('_'));
  }

  override relationName(propertyName: string): string {
    return snakeCase(propertyName);
  }

  override joinColumnName(relationName: string, referencedColumnName: string): string {
    return snakeCase(`${relationName}_${referencedColumnName}`);
  }

  override joinTableName(
    firstTableName: string,
    secondTableName: string,
    _firstPropertyName: string,
    _secondPropertyName: string,
  ): string {
    return snakeCase(`${firstTableName}_${secondTableName}`);
  }

  override joinTableColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ): string {
    return snakeCase(`${tableName}_${columnName || propertyName}`);
  }

  override joinTableInverseColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ): string {
    return this.joinTableColumnName(tableName, propertyName, columnName);
  }

  // Human-readable, deterministic constraint/index names instead of DefaultNamingStrategy's
  // hashed `PK_<hash>`/`IDX_<hash>` style — easier to read in `\d` / migration diffs.
  override indexName(
    tableOrName: Table | View | string,
    columnNames: string[],
    _where?: string,
  ): string {
    return truncate(`idx_${tableRef(tableOrName)}_${sortedSnakeJoin(columnNames)}`);
  }

  override primaryKeyName(tableOrName: Table | string, columnNames: string[]): string {
    return truncate(`pk_${tableRef(tableOrName)}_${sortedSnakeJoin(columnNames)}`);
  }

  override foreignKeyName(
    tableOrName: Table | string,
    columnNames: string[],
    _referencedTablePath?: string,
    _referencedColumnNames?: string[],
  ): string {
    return truncate(`fk_${tableRef(tableOrName)}_${sortedSnakeJoin(columnNames)}`);
  }

  override uniqueConstraintName(tableOrName: Table | string, columnNames: string[]): string {
    return truncate(`uq_${tableRef(tableOrName)}_${sortedSnakeJoin(columnNames)}`);
  }

  // `checkConstraintName`, `defaultConstraintName`, `exclusionConstraintName`,
  // `relationConstraintName`, `closureJunctionTableName`, `joinTableColumnDuplicationPrefix`,
  // and `prefixTableName` are inherited from `DefaultNamingStrategy` unmodified — hashed
  // names are fine for those (they're rarely read by a human).
}

function snakeCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

function tableRef(tableOrName: Table | View | string): string {
  return (typeof tableOrName === 'string' ? tableOrName : tableOrName.name).split('.').pop() ?? '';
}

function sortedSnakeJoin(columnNames: string[]): string {
  return [...columnNames].map(snakeCase).sort().join('_');
}

// PostgreSQL identifier length limit (NAMEDATALEN 64, usable 63 bytes).
function truncate(name: string): string {
  return name.length > 63 ? name.slice(0, 63) : name;
}
