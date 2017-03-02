"use strict";
// vim:ft=javascript:ts=2:sw=2:et:

/* global module, require, process */
const fs = require('fs');
module.exports = {
  readFile,
  exitWithError,
  printTag,
};

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

function exitWithError(aError) {
  console.error(`${aError}`);
  process.exit(aError.errno);
}

function printTag({type, name, path, line, column, ref}) {
  console.log(`${type},${name},${path},${line}:${column},${ref}`);
}

