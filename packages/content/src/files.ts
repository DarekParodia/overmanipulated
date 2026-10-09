// Registry of every content file the game loads, keyed by its path in this package. Add new
// level and story files here; `bun run validate:content` fails on any file in levels/ or
// stories/ that is missing from this registry, or registered under the wrong path.
import l0Level from '../levels/l0-greybox.json';
import l1Level from '../levels/l1-burza.json';
import l5Level from '../levels/l5-deepfake.json';
import l0Stories from '../stories/l0-greybox.json';
import l1Stories from '../stories/l1-burza.json';
import l5Stories from '../stories/l5-deepfake.json';

export const LEVEL_FILES: Readonly<Record<string, unknown>> = {
  'levels/l0-greybox.json': l0Level,
  'levels/l1-burza.json': l1Level,
  'levels/l5-deepfake.json': l5Level,
};

export const STORY_FILES: Readonly<Record<string, unknown>> = {
  'stories/l0-greybox.json': l0Stories,
  'stories/l1-burza.json': l1Stories,
  'stories/l5-deepfake.json': l5Stories,
};
