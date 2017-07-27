'use strict';

describe('js-parser', function() {
  const {tagJavaScriptFile} = require('..');
  it('parses samples properly', function() {
    tagJavaScriptFile('test/samples/001.VariableDeclarator.js');
    tagJavaScriptFile('test/samples/002.CallExpression.js');
  });
});
