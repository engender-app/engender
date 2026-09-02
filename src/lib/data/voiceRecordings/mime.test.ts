import assert from 'node:assert/strict';
import { test } from 'vitest';
import { voiceFileName } from './names.ts';
import { audioMimeOf } from './mime.ts';

test("a recording this app made is named as what it is", () => {
  assert.equal(audioMimeOf(voiceFileName('4d0f7e2a-0000-4000-8000-000000000000')), 'audio/webm');
});

test('an imported recording is named as its own container, not as a webm', () => {
  assert.equal(audioMimeOf('abc.m4a'), 'audio/mp4');
  assert.equal(audioMimeOf('abc.3gp'), 'audio/3gpp');
  assert.equal(audioMimeOf('abc.OGG'), 'audio/ogg');
  assert.equal(audioMimeOf('abc.amr'), 'audio/amr');
});

test('a name that says nothing recognisable declares nothing, leaving the browser to sniff', () => {
  assert.equal(audioMimeOf('abc.qqq'), '');
  assert.equal(audioMimeOf('abc'), '');
  assert.equal(audioMimeOf(''), '');
});
