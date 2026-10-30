import { describe, expect, test } from 'bun:test';
import { Command } from 'commander';
import { program } from '../src/program.js';

function preprocessShortOptions(argv: string[]): string[] {
  const result: string[] = [];
  for (const arg of argv) {
    const match = /^-([a-zA-Z])=(.+)$/.exec(arg);
    if (match) {
      result.push(`-${match[1]}`);
      result.push(match[2]);
    } else {
      result.push(arg);
    }
  }
  return result;
}

interface ShortOptionDef {
  commandPath: string[];
  shortFlag: string;
  longFlag: string | undefined;
}

function collectShortOptionsWithValues(cmd: Command, path: string[] = []): ShortOptionDef[] {
  const currentPath = [...path, cmd.name()];
  const options: ShortOptionDef[] = [];
  for (const option of cmd.options) {
    if (option.short && (option.required || option.optional)) {
      options.push({
        commandPath: currentPath,
        shortFlag: option.short,
        longFlag: option.long,
      });
    }
  }
  for (const sub of cmd.commands) {
    options.push(...collectShortOptionsWithValues(sub, currentPath));
  }
  return options;
}

describe('preprocessShortOptions', () => {
  test('strips = from -v=-46.33', () => {
    expect(preprocessShortOptions(['-v=-46.33'])).toEqual(['-v', '-46.33']);
  });

  test('strips = from -v=46.33', () => {
    expect(preprocessShortOptions(['-v=46.33'])).toEqual(['-v', '46.33']);
  });

  test('leaves -v 46.33 unchanged', () => {
    expect(preprocessShortOptions(['-v', '46.33'])).toEqual(['-v', '46.33']);
  });

  test('leaves --value=-46.33 unchanged (long option)', () => {
    expect(preprocessShortOptions(['--value=-46.33'])).toEqual(['--value=-46.33']);
  });

  test('leaves non-option args unchanged', () => {
    expect(preprocessShortOptions(['node', 'test', 'hello'])).toEqual(['node', 'test', 'hello']);
  });
});

describe('table-driven guard test', () => {
  const allShortOptions = collectShortOptionsWithValues(program);

  test('discovers short options with values across all commands', () => {
    expect(allShortOptions.length).toBeGreaterThan(10);
  });

  for (const opt of allShortOptions) {
    const cmdName = opt.commandPath.join(' ');
    test(`preprocess splits ${cmdName} ${opt.shortFlag}=testval correctly`, () => {
      const raw = [`node`, `cli`, ...opt.commandPath.slice(1), `${opt.shortFlag}=testval`];
      const processed = preprocessShortOptions(raw);
      const valueIndex = processed.indexOf('testval');
      expect(valueIndex).toBeGreaterThan(-1);
      expect(processed[valueIndex - 1]).toBe(opt.shortFlag);
    });
  }
});
