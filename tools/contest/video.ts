// Gameplay video (S6-03 deliverable 5): a scripted two-player session recorded with Playwright
// `recordVideo` at a fixed 1366x768 viewport: lobby, briefing, carrying a folder, a station
// minigame, the desk verdict, a level event banner and the Kolegium. Output:
// docs/contest/gameplay.webm (+ gameplay.mp4 when ffmpeg exists) and a frame storyboard.
// The minigame result and the level end are sent through the `?debug` hook (a real level lasts
// minutes); everything else is real play through the keyboard.
import { mkdir, rename, rm } from 'node:fs/promises';
import { STORIES } from '../../packages/content/src/index.ts';
import { STATION_KINDS } from '../../packages/shared/src/index.ts';
import { launchBrowser, outPath, pl } from './lib/common.ts';
import {
  ALL_STARS,
  confirmBriefing,
  createRoom,
  faceTowards,
  gameInfo,
  joinRoom,
  openExtraPlayer,
  openPlayer,
  selectLevel,
  setReady,
  startAndBrief,
  walkTo,
} from './lib/session.ts';
import { startStack } from './lib/stack.ts';

const VIEWPORT = { width: 1366, height: 768 };
/**
 * The station bag (S7-20) deals each run anew, so the video takes the first level-1 folder on
 * the belt that Lupa obrazu decides with one proof, whichever story it is.
 */
const LUPA_STORIES = new Set(
  STORIES.filter(
    (s) =>
      s.id.startsWith('l1-') &&
      s.requiredStamps === 1 &&
      s.stamps.some((st) => st.station === 'imageSearch' && s.justifyingStamps.includes(st.id)),
  ).map((s) => s.id),
);

async function waitForFolder(host: Awaited<ReturnType<typeof openPlayer>>) {
  for (let i = 0; i < 240; i++) {
    const info = await gameInfo(host);
    const folder = info.folders.find(
      (f) => LUPA_STORIES.has(f.storyId) && f.location.kind === 'fixture',
    );
    const story = STORIES.find((s) => s.id === folder?.storyId);
    if (folder && story) {
      return { folder, info, story };
    }
    await host.page.waitForTimeout(500);
  }
  throw new Error('no folder for Lupa obrazu arrived');
}

export async function main() {
  const stack = await startStack({ briefingMs: 6000 });
  const browser = await launchBrowser();
  // The guest only fills a seat, in its own browser (see openExtraPlayer).
  const crowd = await launchBrowser();
  const tmp = outPath('.video-tmp');
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  try {
    // Every station's first-use help card already read (S7-95): the minigame shows straight away.
    const profile = { progress: ALL_STARS, tutorialDone: true, stationHelpSeen: STATION_KINDS };
    // The recorded player needs its own context with video enabled.
    const host = await openPlayer(
      browser,
      stack.baseUrl,
      'Zośka',
      { viewport: VIEWPORT, recordVideo: { dir: tmp, size: VIEWPORT } },
      profile,
    );
    const code = await createRoom(host);
    const guest = await openExtraPlayer(crowd, stack.baseUrl, 'Łukasz', profile);
    await joinRoom(guest, code);
    await selectLevel(host, 'l1-burza');
    await setReady(guest);
    await host.page.waitForTimeout(1500);
    await startAndBrief(host, [guest]);
    await host.page.waitForTimeout(2500);
    await confirmBriefing([host, guest]);

    // Carry the folder: conveyor -> Lupa obrazu -> desk.
    const { folder, info, story } = await waitForFolder(host);
    const verdictName = pl.vocab.verdicts[story.correctVerdict];
    const belt = info.fixtures.find((f) => f.id === folder.location.fixtureId);
    const lupa = info.fixtures.find((f) => f.station === 'imageSearch');
    const desk = info.fixtures.find((f) => f.kind === 'desk');
    if (!belt || !lupa || !desk) {
      throw new Error('level layout changed: conveyor, Lupa or desk missing');
    }
    await walkTo(host, { x: belt.col + 0.5, y: belt.row + 1.5 });
    await faceTowards(host, 'KeyW');
    await host.page.keyboard.press('KeyE');
    await host.page.waitForTimeout(600);
    await walkTo(host, { x: lupa.col + 0.5, y: lupa.row + 1.5 });
    await faceTowards(host, 'KeyW');
    await host.page.keyboard.press('KeyE');
    await host.page.waitForTimeout(400);
    await host.page.keyboard.down('Space');
    await host.page.getByRole('button', { name: pl.station.leave }).waitFor({ timeout: 15_000 });
    await host.page.keyboard.up('Space');
    await host.page.waitForTimeout(3500); // let the viewer read the minigame
    await host.page.evaluate(
      (id) =>
        (window as unknown as { __game: { send(c: unknown): void } }).__game.send({
          kind: 'minigameResult',
          stationId: id,
          success: true,
        }),
      lupa.id,
    );
    await host.page.waitForTimeout(1200);
    await host.page.keyboard.press('KeyE');
    await host.page.waitForTimeout(500);
    await walkTo(host, { x: desk.col + 0.5, y: desk.row - 0.5 });
    await faceTowards(host, 'KeyS');
    await host.page.keyboard.press('KeyE');
    await host.page.waitForTimeout(400);
    await host.page.keyboard.down('Space');
    await host.page.getByRole('button', { name: verdictName }).waitFor({ timeout: 10_000 });
    await host.page.keyboard.up('Space');
    await host.page.waitForTimeout(1500);
    await host.page
      .getByRole('button', { name: new RegExp(pl.vocab.stations.imageSearch) })
      .first()
      .click();
    await host.page.waitForTimeout(900);
    await host.page.getByRole('button', { name: verdictName }).click();
    await host.page.waitForTimeout(3500);
    await host.page.keyboard.press('Escape');

    // Level event banner, then the Kolegium (end of level sent through the hook).
    await host.page.evaluate(() => {
      (window as unknown as { __game: { emit(e: unknown): void } }).__game.emit({
        kind: 'levelEvent',
        event: 'bossCall',
        phase: 'start',
        folderIds: [],
      });
    });
    await host.page.waitForTimeout(3500);
    const l1 = STORIES.filter((s) => s.id.startsWith('l1-')).slice(0, 4);
    await host.page.evaluate(
      (stories) => {
        (window as unknown as { __game: { setState(s: unknown): void } }).__game.setState({
          levelEnd: {
            type: 'levelEnd',
            levelId: 'l1-burza',
            difficulty: 'normal',
            won: true,
            stars: 2,
            // Two stars on l1 need 205 (starThresholds below).
            score: 215,
            credibility: 90,
            results: stories.map((s, i) => ({
              folderId: `v${i}`,
              spawnKey: `s${i}`,
              storyId: s.id,
              outcome: i === 3 ? 'expired' : 'correct',
              reason: i === 3 ? 'expired' : 'correctImportant',
              verdict: i === 3 ? null : s.verdict,
              scoreDelta: i === 3 ? -5 : 20,
              credibilityDelta: i === 3 ? -5 : 5,
              justifyingStampIds: i === 3 ? [] : s.proof,
              requiredStamps: 1,
              bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
              missedStampIds: [],
            })),
            lossReason: null,
            starThresholds: { two: 205, three: 320 },
            maxScore: 375,
          },
        });
      },
      l1.map((s) => ({
        id: s.id,
        verdict: s.correctVerdict,
        proof: s.justifyingStamps.slice(0, 1),
      })),
    );
    await host.page.waitForTimeout(5000);
    await host.page.mouse.wheel(0, 700);
    await host.page.waitForTimeout(5000);

    const video = host.page.video();
    await host.context.close();
    await guest.context.close();
    const path = await video?.path();
    if (!path) {
      throw new Error('no video recorded');
    }
    await rename(path, outPath('gameplay.raw.webm'));
  } finally {
    await crowd.close();
    await browser.close();
    await stack.stop();
    await rm(tmp, { recursive: true, force: true });
  }

  // Re-encode small (VP9, ~25 fps) and an mp4 when ffmpeg exists.
  const run = (args: string[]) =>
    Bun.spawn(['ffmpeg', '-y', '-loglevel', 'error', ...args], { stderr: 'inherit' }).exited;
  const speed = process.env.CONTEST_VIDEO_SPEED ?? '1';
  const filter = `setpts=PTS/${speed},fps=25`;
  await run([
    '-i',
    outPath('gameplay.raw.webm'),
    '-vf',
    filter,
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    '0',
    '-crf',
    '36',
    '-an',
    outPath('gameplay.webm'),
  ]);
  await run([
    '-i',
    outPath('gameplay.raw.webm'),
    '-vf',
    `${filter},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
    '-c:v',
    'libx264',
    '-crf',
    '28',
    '-pix_fmt',
    'yuv420p',
    '-an',
    outPath('gameplay.mp4'),
  ]).catch(() => undefined);
  await rm(outPath('gameplay.raw.webm'), { force: true });
  // Storyboard: one frame every 8 seconds, in case the video is hard to play.
  await mkdir(outPath('storyboard'), { recursive: true });
  await run([
    '-i',
    outPath('gameplay.webm'),
    '-vf',
    'fps=1/8,scale=683:-1',
    outPath('storyboard/klatka-%02d.png'),
  ]).catch(() => undefined);
  console.log('video: docs/contest/gameplay.webm');
}

if (import.meta.main) {
  await main();
  process.exit(0);
}
