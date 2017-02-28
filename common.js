"use strict";
// vim:ft=javascript:ts=2:sw=2:et:

/* global exports, require, process */
const fs = require('fs');

exports.readFile = function readFile(aSourceFile) {
  return new Promise((resolve, reject) => {
    fs.readFile(aSourceFile, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data.toString().replace(/^#!.*/, ''));  // remove shebang
      }
    });
  });
};

exports.exitWithError = function exitWithError(aError) {
  console.error(`${aError}`);
  process.exit(aError.errno);
};

exports.printSymbol =
function printSymbol({type, name, path, line, col, ref}) {
  console.log(`${type},${name},${path},${line}:${col},${ref}`);
};
