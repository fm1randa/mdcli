import { createRequire } from 'node:module';
import type TableConstructor from 'cli-table3';

const require = createRequire(import.meta.url);

let TableClass: TableConstructor | undefined;

export function newTable(
  options?: ConstructorParameters<TableConstructor>[0],
): InstanceType<TableConstructor> {
  TableClass ??= require('cli-table3') as TableConstructor;
  return new TableClass(options);
}
