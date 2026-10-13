// Worker thread: runs the jobs it is sent and posts the results back.
import { type Job, runJob } from './jobs.ts';

declare const self: Worker;

self.onmessage = (event: MessageEvent<Job[]>) => {
  self.postMessage(event.data.map(runJob));
};
