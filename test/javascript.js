'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

describe('js-parser extract expected tags from', function() {
  const {tagJavaScriptFile} = require('..');

  const sampleDir = 'test/samples';
  fs.readdirSync(sampleDir)
    .filter(f => f.endsWith('.js'))
    .forEach(f => it(path.basename(f), testTagExtraction(`${sampleDir}/${f}`)));

  function testTagExtraction(aSrcFile) {
    return async function() {
      const expectTags = require(path.resolve(aSrcFile + '.tags'));
      expectTags.forEach(t => t.path = aSrcFile);

      assert.deepEqual(await tagJavaScriptFile(aSrcFile), expectTags);
    };
  }
});
