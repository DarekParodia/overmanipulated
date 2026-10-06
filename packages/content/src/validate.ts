// Validates all content files in levels/ and stories/ against the schemas. Run in CI.
// Importing the index parses every registered file; cross-file checks are added in S2-01.
import { LEVELS, STORIES } from './index.ts';

console.log(`content: ${LEVELS.length} level(s), ${STORIES.length} story(ies) valid`);
