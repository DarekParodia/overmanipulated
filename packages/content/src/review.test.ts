import { describe, expect, it } from 'bun:test';
import { countReviewed, unreviewedIssues } from './review.ts';

describe('countReviewed', () => {
  it('counts the stories with reviewed: true per story file', () => {
    const counts = countReviewed([
      {
        file: 'stories/l1-burza.json',
        data: [
          { id: 'l1-a', reviewed: true },
          { id: 'l1-b', reviewed: false },
          { id: 'l1-c', reviewed: true },
        ],
      },
      { file: 'stories/l2-wybory.json', data: [{ id: 'l2-a', reviewed: false }] },
    ]);
    expect(counts).toEqual([
      { file: 'stories/l1-burza.json', total: 3, reviewed: 2 },
      { file: 'stories/l2-wybory.json', total: 1, reviewed: 0 },
    ]);
  });

  it('counts a missing or non-true reviewed field as not reviewed', () => {
    const counts = countReviewed([
      {
        file: 'stories/l0-greybox.json',
        data: [
          { id: 'l0-a' },
          { id: 'l0-b', reviewed: 'true' },
          { id: 'l0-c', reviewed: 1 },
          { id: 'l0-d', reviewed: true },
        ],
      },
    ]);
    expect(counts).toEqual([{ file: 'stories/l0-greybox.json', total: 4, reviewed: 1 }]);
  });

  it('counts entries that are not objects in the total, never as reviewed', () => {
    const counts = countReviewed([{ file: 'stories/l0-greybox.json', data: [null, 'l0-a', 3] }]);
    expect(counts).toEqual([{ file: 'stories/l0-greybox.json', total: 3, reviewed: 0 }]);
  });

  it('counts a file that is not an array as empty', () => {
    const counts = countReviewed([{ file: 'stories/l0-greybox.json', data: { reviewed: true } }]);
    expect(counts).toEqual([{ file: 'stories/l0-greybox.json', total: 0, reviewed: 0 }]);
  });

  it('returns no counts for no story files', () => {
    expect(countReviewed([])).toEqual([]);
  });
});

describe('unreviewedIssues', () => {
  it('reports one error per file with unreviewed stories, with the count', () => {
    const issues = unreviewedIssues([
      { file: 'stories/l0-greybox.json', total: 17, reviewed: 0 },
      { file: 'stories/l1-burza.json', total: 20, reviewed: 18 },
      { file: 'stories/l2-wybory.json', total: 18, reviewed: 18 },
    ]);
    expect(issues).toEqual([
      {
        severity: 'error',
        file: 'stories/l0-greybox.json',
        path: '',
        message: '17 of 17 stories not reviewed; --require-reviewed needs all of them',
      },
      {
        severity: 'error',
        file: 'stories/l1-burza.json',
        path: '',
        message: '2 of 20 stories not reviewed; --require-reviewed needs all of them',
      },
    ]);
  });

  it('uses the singular for a file with one story', () => {
    const issues = unreviewedIssues([{ file: 'stories/l0-greybox.json', total: 1, reviewed: 0 }]);
    expect(issues.map((issue) => issue.message)).toEqual([
      '1 of 1 story not reviewed; --require-reviewed needs all of them',
    ]);
  });

  it('is empty when every story is reviewed', () => {
    expect(
      unreviewedIssues([
        { file: 'stories/l0-greybox.json', total: 17, reviewed: 17 },
        { file: 'stories/l1-burza.json', total: 0, reviewed: 0 },
      ]),
    ).toEqual([]);
  });
});
