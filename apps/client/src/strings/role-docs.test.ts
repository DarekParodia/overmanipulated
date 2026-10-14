// S7-47: the role and ability docs match the code. The design document, the contest guide for
// the jury and the glossary name every role and ability exactly as the game shows them (pl.ts),
// and the numbers they quote are the ones in constants.ts.
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ABILITIES, ABILITY, RESCUE_ADD_MS, ROLE_PERKS, ROLES } from '@redakcja/shared';
import { pl } from './pl.ts';

const ROOT = join(import.meta.dir, '../../../..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const DOCS = {
  design: read('docs/design-document.pl.md'),
  howToPlay: read('docs/contest/how-to-play.pl.md'),
  glossary: read('agents/glossary.md'),
};

/** The text of a markdown section, from its heading to the next heading of the same level. */
function section(doc: string, heading: string): string {
  const start = doc.indexOf(heading);
  expect(start).toBeGreaterThanOrEqual(0);
  const level = heading.split(' ')[0] ?? '#';
  const rest = doc.slice(start + heading.length);
  const end = rest.search(new RegExp(`\\n${level} `));
  return end === -1 ? rest : rest.slice(0, end);
}

describe('role and ability docs (S7-47)', () => {
  const designRoles = section(DOCS.design, '### Role');
  const guideRoles = section(DOCS.howToPlay, '## Role i zdolności');

  it('name every role and every ability as pl.ts does', () => {
    for (const role of ROLES) {
      const name = pl.vocab.roles[role];
      expect(designRoles).toContain(`| ${name} |`);
      expect(guideRoles).toContain(`| ${name} |`);
      expect(DOCS.glossary).toContain(`| ${name} | \`${role}\``);
    }
    for (const ability of ABILITIES) {
      const name = pl.vocab.abilities[ability];
      expect(designRoles).toContain(`**${name}:**`);
      expect(guideRoles).toContain(`**${name}:**`);
      expect(DOCS.glossary).toContain(`| ${name} | \`${ability}\``);
    }
    expect(designRoles).toContain('**Koło ratunkowe:**');
    expect(guideRoles).toContain('**Koło ratunkowe:**');
    expect(designRoles).toContain(`„${pl.lobbyRoles.noRole}”`);
  });

  it('quote the numbers of constants.ts', () => {
    // Every number the docs print is derived from the constant it comes from, so retuning a
    // constant without updating the docs fails here.
    const faster = (factor: number) => `${Math.round((1 - factor) * 100)}% szybciej`;
    const seconds = (ms: number) => ms / 1000;
    const specialist = [
      ROLE_PERKS.photoEditor.workFactor,
      ROLE_PERKS.archivist.workFactor,
      ROLE_PERKS.reporter.workFactor,
    ];
    const cooldowns = new Set(ABILITIES.map((ability) => ABILITY[ability].cooldownMs));
    // The docs quote a single cooldown for every ability.
    expect(cooldowns.size).toBe(1);
    const [cooldownMs] = [...cooldowns];
    for (const text of [designRoles, guideRoles]) {
      for (const factor of specialist) {
        expect(text).toContain(faster(factor));
      }
      expect(text).toContain(faster(ROLE_PERKS.generalist.workFactor));
      expect(text).toContain(`+${seconds(ABILITY.extendDeadline.addMs)} sekund`);
      expect(text).toContain(`+${seconds(RESCUE_ADD_MS)} sekund`);
      expect(text).toContain(`${seconds(ABILITY.fieldCall.callMs)} sekundach`);
      expect(text).toContain(`${seconds(cooldownMs ?? 0)} sekund`);
    }
    expect(designRoles).toContain(`do ${ABILITY.passFolder.rangeTiles} pól`);
  });

  it('give the ability key on every device and drop the old editor rules', () => {
    const controls = section(DOCS.design, '### Sterowanie');
    expect(controls).toContain('R to zdolność roli');
    expect(controls).toContain('RB');
    expect(section(DOCS.howToPlay, '## Sterowanie')).toContain('| Zdolność roli | R | RB |');
    expect(DOCS.design).not.toContain('Przy 3 graczach');
    expect(DOCS.design).not.toContain('jednego zgłoszenia na poziom');
  });
});
