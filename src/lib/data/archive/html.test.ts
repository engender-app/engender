/* HTML note bodies, as an imported journal actually holds them (phase 7
   ticket 09). The dangerous case is the ordinary one: most notes carry no
   markup at all, so a reader that mishandles the few that do looks
   correct on almost the whole journal. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { htmlToText } from './html.ts';

test('a note with no markup at all is returned unchanged', () => {
  assert.equal(htmlToText('woke up early, felt fine'), 'woke up early, felt fine');
  assert.equal(htmlToText(''), '');
});

test('bold and italic markup leaves the words behind, not the tags', () => {
  assert.equal(htmlToText('today was <b>good</b>, mostly'), 'today was good, mostly');
  assert.equal(htmlToText('<i>finally</i> <strong>slept</strong>'), 'finally slept');
});

test('a list becomes one line per item, marked as a list', () => {
  assert.equal(htmlToText('<ul><li>bloods</li><li>call the clinic</li></ul>'), '- bloods\n- call the clinic');
});

test('breaks and paragraphs become line breaks', () => {
  assert.equal(htmlToText('first line<br>second line'), 'first line\nsecond line');
  assert.equal(htmlToText('<p>one</p><p>two</p>'), 'one\ntwo');
  assert.equal(htmlToText('one<br/><br/>two'), 'one\n\ntwo');
});

test('entities are decoded, including the ones a bare reader leaves in place', () => {
  assert.equal(htmlToText('me &amp; her'), 'me & her');
  assert.equal(htmlToText('&lt;not a tag&gt;'), '<not a tag>');
  assert.equal(htmlToText('she said &quot;yes&quot;'), 'she said "yes"');
  assert.equal(htmlToText('don&#39;t'), "don't");
  assert.equal(htmlToText('a&nbsp;gap'), 'a gap');
  assert.equal(htmlToText('&#x41;&#66;'), 'AB');
});

test('an entity that is not one is left alone rather than half-decoded', () => {
  assert.equal(htmlToText('50&percnt; sure &amp'), '50&percnt; sure &amp');
});

test('a decoded entity is not then read as markup', () => {
  // The decode has to happen after the tags are gone, or "&lt;b&gt;" turns
  // into a tag that is then stripped, and the person's own text disappears.
  assert.equal(htmlToText('&lt;b&gt;shouty&lt;/b&gt;'), '<b>shouty</b>');
});

test('runs of blank lines and surrounding whitespace are trimmed', () => {
  assert.equal(htmlToText('<p>one</p><br><br><br><p>two</p>'), 'one\n\ntwo');
  assert.equal(htmlToText('  <p> spaced </p>  '), 'spaced');
});

test('a script or style body is dropped rather than read as text', () => {
  assert.equal(htmlToText('before<script>alert(1)</script>after'), 'beforeafter');
  assert.equal(htmlToText('before<style>p{color:red}</style>after'), 'beforeafter');
});
