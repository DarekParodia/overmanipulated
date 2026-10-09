// Registry of every content file the game loads, keyed by its path in this package. Add new
// level and story files here; `bun run validate:content` fails on any file in levels/ or
// stories/ that is missing from this registry, or registered under the wrong path.
import l0Level from '../levels/l0-greybox.json';
import l1Level from '../levels/l1-burza.json';
import l4Level from '../levels/l4-zdrowie.json';
import l0Stories from '../stories/l0-greybox.json';
import l1Stories from '../stories/l1-burza.json';
import l4Stories from '../stories/l4-zdrowie.json';

export const LEVEL_FILES: Readonly<Record<string, unknown>> = {
  'levels/l0-greybox.json': l0Level,
  'levels/l1-burza.json': l1Level,
  'levels/l4-zdrowie.json': l4Level,
};

export const STORY_FILES: Readonly<Record<string, unknown>> = {
  'stories/l0-greybox.json': l0Stories,
  'stories/l1-burza.json': l1Stories,
  'stories/l4-zdrowie.json': l4Stories,
};
