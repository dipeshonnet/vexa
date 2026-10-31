import assert from 'node:assert/strict';
import { TeamsCsrcGmeetPipeline, type TeamsCsrcTranscriptSegment } from './teams-csrc-gmeet-pipeline.js';

async function run(activationMs: number): Promise<TeamsCsrcTranscriptSegment[]> {
  let now = 0;
  const rows = new Map<string, TeamsCsrcTranscriptSegment>();
  const pipeline = new TeamsCsrcGmeetPipeline({
    lookbackMs: 0,
    flickerHoldMs: 0,
    buffer: { scheduleSubmissions: false, now: () => now, silenceRmsThreshold: 0 },
    transcribe: async () => ({
      text: 'Please preserve these recognized words.', language: 'en', duration: 4,
      segments: [{ text: 'Please preserve these recognized words.', start: 0, end: 4 }],
    }),
    onSegment: (segment) => {
      if (!segment.completed && !segment.text.trim()) rows.delete(segment.segmentId);
      else rows.set(segment.segmentId, { ...segment });
    },
  });
  pipeline.recordTransportEvent({ csrc: 201, active: true, tMs: activationMs });
  for (let i = 0; i < 8; i++) {
    now = i * 500;
    pipeline.feedMixedAudio(new Float32Array(8000).fill(0.1), now);
  }
  now = 4000;
  await pipeline.requestTranscription(201);
  assert.ok([...rows.values()].some(s => !s.completed && s.text), 'the recognized words appear as a draft');
  now = 6000;
  await pipeline.requestTranscription(201);
  pipeline.recordCaption('Named Participant', 6000);
  await pipeline.dispose();
  return [...rows.values()];
}

const uncertain = await run(2000);
assert.equal(uncertain.length, 1, 'speaker timing uncertainty must not retract recognized speech');
assert.equal(uncertain[0].text, 'Please preserve these recognized words.');
assert.equal(uncertain[0].completed, true, 'the draft becomes durable');
assert.equal(uncertain[0].speaker, 'Speaker', 'later identity evidence must not invent ownership for an uncertain interval');

const owned = await run(0);
assert.equal(owned.length, 1);
assert.equal(owned[0].completed, true);
assert.notEqual(owned[0].speaker, 'Speaker', 'owned speech keeps its existing attribution');
console.log('PASS: uncertain ownership preserves final words without guessing a speaker; owned speech still confirms.');
