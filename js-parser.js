#!/usr/bin/env node
"use strict";

const fs = require('fs');
const esprima = require('esprima');

const sourceFiles = process.argv.slice(2);
if (sourceFiles.length === 0) {
  console.warn(`No args`);
  process.exit(1);
}

sourceFiles.forEach(file => {
  readFile(file)
    .catch(exitWithError)
    .then(parseJS)
    .then(getASTParser(file));
});

function readFile(aSourceFile) {
  return new Promise((resolve, reject) => {
    fs.readFile(aSourceFile, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data.toString().replace(/^#!.*/, ''));  // remove shebang
      }
    });
  });
}

function parseJS(aSourceCode) {
  let ast;
  const option = {loc: true};
  try {
    ast = esprima.parse(aSourceCode, option);
  } catch(e) {
    option.sourceType = "module";
    ast = esprima.parse(aSourceCode, option);
  }
  return {sourceCode: aSourceCode, ast};
}

function tokenize(aSourceCode) {
  try {
    return esprima.tokenize(aSourceCode, {loc: true});
  } catch(e) {
    return esprima.tokenize(aSourceCode, {sourceType: "module", loc: true});
  }
}

function exitWithError(aError) {
  console.error(`${aError}`);
  process.exit(aError.errno);
}

function getASTParser(aFile) {
  let sources;
  return function (aParseInfo) {
    sources = aParseInfo.sourceCode.split("\n");
    return parseAST(aParseInfo.ast);
  };

  // https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API
  function parseAST(aAST, aParent = null) {
    const {type, name, loc: {start: {line, column}}} = aAST;

    if (type === "Identifier") {
      const prop = Object.getOwnPropertyNames(aParent)
                         .find(prop => aParent[prop] instanceof Array ?
                             aParent[prop].includes(aAST) :
                             aParent[prop] === aAST);

      const idType = getIdType(aParent.type, prop, aAST);
      if (idType === 'D' || idType === 'R')
        console.log(`${idType},${name},${aFile},${line}:${column+1},${sources[line-1]}`);
      else if (idType === 'U') {
        console.error('\x1b[31;1m');  // ANSI code red
        console.error(`Unknown Identifier : ${name} at ${aFile} ${line}:${column+1},${sources[line-1]}`);
        console.error(`  aParentType : ${aParent.type}.${prop}`);
        console.error(`\x1b[0m`);     // Reset ANSI code
      }

    } else {
      const parseSubAST = aSubAST => parseAST(aSubAST, aAST);
      for (let prop in aAST) {
        if (prop === "type") continue;
        else if (prop === "loc") continue;
        else if (!aAST[prop]) continue;
        else if (aAST[prop].hasOwnProperty("type")) {
          parseSubAST(aAST[prop]);
        } else if (aAST[prop] instanceof Array) {
          aAST[prop].forEach(parseSubAST);
        }
      }
    }
  }
}

function dump(aObj) {
  console.info(JSON.stringify(aObj, null, 2));
}

const getIdType = (aParentType, aIdProp, aAST) => {
  const {type, name, loc: {start: {line, column}}} = aAST;
  switch(aParentType) {
    default:
      return 'U';
  }
};
