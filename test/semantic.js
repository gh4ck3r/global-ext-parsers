'use strict';

const assert = require('assert');

const {tagJavaScript} = require('..');

describe('Node.js', function() {
  describe('Assignment from require', function() {
    it('makes not define but reference indeed', function() {
      const expectedTags = tagJavaScript(
        'const foo = require("./foo");',
        'foo.js');
      const fooTags = expectedTags.filter(({name}) => name === 'foo'); 
      assert.strictEqual(fooTags.length, 1);
      assert.strictEqual(fooTags[0].type, 'R');
    });

    it('is define if required module is differ from variable name',
      function() {
        const expectedTags = tagJavaScript(
          'const filesystem = require("fs");',
          'foo.js');

        const fooTags = expectedTags.filter(({name}) => name === 'filesystem');
        assert.strictEqual(fooTags.length, 1);
        assert.strictEqual(fooTags[0].type, 'D');
      });

    it('is define when argument of require is not a literal', function() {
      const expectedTags = tagJavaScript(
        'const name = "./foo", foo = require(name);',
        'foo.js');

      const fooTags = expectedTags.filter(({name}) => name === 'foo');
      assert.strictEqual(fooTags.length, 1);
      assert.strictEqual(fooTags[0].type, 'D');
    });
  });
});
