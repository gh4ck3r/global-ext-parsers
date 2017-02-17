#!/usr/bin/env node
"use strict";

const fs = require('fs');
const esprima = require('esprima');

const argv = process.argv.slice(2);
const options = argv.filter(v => v.startsWith("--"));

const DEBUG = options.includes("--debug");
const ANSI = {
  red:    "\x1b[31;1m",
  green:  "\x1b[32;1m",
  yellow: "\x1b[33;1m",
  reset:  "\x1b[0m",
};

const sourceFiles = argv.filter(v => !options.includes(v));
if (sourceFiles.length === 0) {
  console.warn(`No args`);
  process.exit(1);
}

sourceFiles.forEach(file => {
  readFile(file)
    .catch(exitWithError)
    .then(parseJS)
    .catch(parseErrorHandler(file))
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
  const option = {loc: true, tolerant: true};
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

function parseErrorHandler(aFile, aExit = true) {
  return function(aError) {
    const {lineNumber, description} = aError;
    console.error(ANSI.red, `Syntax Error: ${aFile} at line ${lineNumber} : ${description}`, ANSI.reset);
//    console.error(aError);
    if (aExit) process.exit(10);
  };
}

const DEF = 'D';
const REF = 'R';
const UNKNOWN = 'U';

function getASTParser(aFile) {
  let sources;
  return function (aParseInfo) {
    sources = aParseInfo.sourceCode.split("\n");
    return parseAST(aParseInfo.ast);
  };

  // https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API
  function parseAST(aAST, aParent = null, aParentProp = null, aIdx = 0) {
    const {type, name, loc: {start: {line, column}}} = aAST;

    if (type === "Identifier") {
      const idType = (function() {
        try {
          return getIdType(aParent, aParentProp, aIdx);
        } catch(e) {
          if (DEBUG) {
            console.error(ANSI.red, "===============================");
            console.error("aParent:", aParent);
            console.error("aParentProp:", aParentProp);
            console.error("===============================");
            console.error(e);
            console.error("===============================", ANSI.reset);
          }
          throw e;
        }
      })();
      if (idType === DEF || idType === REF) {
        console.log(`${idType},${name},${aFile},${line}:${column+1},${sources[line-1]}`);
        if (DEBUG) {
          console.log(ANSI.yellow, `    ${aParent.type}.${aParentProp}`, ANSI.reset);
        }
      }
      else if (idType === UNKNOWN) {
        console.error(ANSI.red);  // ANSI code red
        console.error(`Unknown Identifier : ${name} at ${aFile} ${line}:${column+1},${sources[line-1]}`);
        console.error(`  aParentType : ${aParent.type}.${aParentProp}`);
        console.error(ANSI.reset);     // Reset ANSI code
      }
    } else {
      const parseSubAST = (aSubAST, aPropName, aIdx) => parseAST(aSubAST, aAST, aPropName, aIdx);
      const errorHandler = parseErrorHandler(aFile, false);
      const notNullOrUndefined = v => v;
      for (let prop in aAST) {
        if (prop === "type") continue;
        else if (prop === "loc") continue;
        else if (!aAST[prop]) continue;
        else if (aAST[prop].hasOwnProperty("type")) {
          parseSubAST(aAST[prop], prop);
        } else if (aAST[prop] instanceof Array) {
          const arr = aAST[prop].filter(notNullOrUndefined);
          if (prop === "errors") {
            // FIXME : This spit out even import statement
            //arr.forEach(errorHandler);
          } else {
            for (let idx in arr) parseSubAST(arr[idx], prop, idx);
          }
        }
      }
    }
  }
}

function dump(aObj) {
  console.info(JSON.stringify(aObj, null, 2));
}

const getIdType = (aParent, aIdProp, aIdx) => {
  const {type, name, loc: {start: {line, column}}} = (function() {
    const ast = aParent[aIdProp];
    return ast instanceof Array ? ast[aIdx] : ast;
  })();
  switch(`${aParent.type}.${aIdProp}`) {
    // Definitions
    case "CallExpression.callee":
    case "ClassDeclaration.id":
    case "ConditionalExpression.consequent":
    case "ExportDefaultDeclaration.declaration":
    case "FunctionDeclaration.id":
    case "FunctionExpression.id":
    case "ImportNamespaceSpecifier.local":
    case "LabeledStatement.label":
    case "VariableDeclarator.id":
      return DEF;

    // Conditional definitions
    case "ExportSpecifier.exported":        // export { foo, bar, baz}
      return aParent.local.name === name ? undefined : DEF;
    case "MethodDefinition.key":
      return name === "constructor" ? undefined : DEF;
    case "ImportSpecifier.local":
      return aParent.imported.name !== name ? DEF : REF;

    // References
    case "ArrayExpression.elements":
    case "ArrowFunctionExpression.body":
    case "AssignmentExpression.right":
    case "BinaryExpression.left":
    case "BinaryExpression.right":
    case "BreakStatement.label":
    case "CallExpression.arguments":
    case "ClassDeclaration.superClass":
    case "ConditionalExpression.alternate":
    case "ConditionalExpression.test":
    case "ContinueStatement.label":
    case "DoWhileStatement.test":
    case "ForInStatement.right":
    case "ForOfStatement.right":
    case "ForStatement.test":
    case "ForStatement.update":
    case "IfStatement.test":
    case "ImportDefaultSpecifier.local":
    case "ImportSpecifier.imported":
    case "LogicalExpression.left":
    case "LogicalExpression.right":
    case "MemberExpression.object":
    case "MemberExpression.property":
    case "NewExpression.arguments":
    case "NewExpression.callee":
    case "Property.value":
    case "ReturnStatement.argument":
    case "SequenceExpression.expressions":
    case "SpreadElement.argument":
    case "SwitchCase.test":
    case "SwitchStatement.discriminant":
    case "TaggedTemplateExpression.tag":
    case "TemplateLiteral.expressions":
    case "ThrowStatement.argument":
    case "UnaryExpression.argument":
    case "UpdateExpression.argument":
    case "VariableDeclarator.init":
    case "WhileStatement.test":
      return REF;

    // Ignored symbols
    case "ArrayPattern.elements":
    case "ArrowFunctionExpression.params":  // Locally defined
    case "AssignmentExpression.left":       // This is just assignment
    case "AssignmentPattern.left":
    case "CatchClause.param":
    case "ExportSpecifier.local":
    case "ForInStatement.left":
    case "ForOfStatement.left":             // "b" of "for (b of buffer)"
    case "FunctionExpression.params":       // Locally defined
    case "RestElement.argument":
      return;

    // Possibly verbose definition from here
    case "FunctionDeclaration.params":
    case "Property.key":
      return DEF;
  }
  return UNKNOWN;
};
