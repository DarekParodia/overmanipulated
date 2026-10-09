// Registry of every content file the game loads, keyed by its path in this package. Add new
// level and story files here; `bun run validate:content` fails on any file in levels/ or
// stories/ that is missing from this registry, or registered under the wrong path.
import l0Level from '../levels/l0-greybox.json';
import l1Level from '../levels/l1-burza.json';
import l2Level from '../levels/l2-wybory.json';
import l0Stories from '../stories/l0-greybox.json';
import l1Stories from '../stories/l1-burza.json';
import l2Stories from '../stories/l2-wybory.json';

export const LEVEL_FILES: Readonly<Record<string, unknown>> = {
  'levels/l0-greybox.json': l0Level,
  'levels/l1-burza.json': l1Level,
  'levels/l2-wybory.json': l2Level,
};

export const STORY_FILES: Readonly<Record<string, unknown>> = {
  'stories/l0-greybox.json': l0Stories,
  'stories/l1-burza.json': l1Stories,
  'stories/l2-wybory.json': l2Stories,
};
