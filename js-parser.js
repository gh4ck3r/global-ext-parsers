#!/usr/bin/env node
"use strict";

const fs = require('fs');
const esprima = require('esprima');
const ANSI = require("./ansi.js");

const argv = process.argv.slice(2);
const options = argv.filter(v => v.startsWith("--"));

const DEBUG = options.includes("--debug");
const VERBOSE = DEBUG && options.includes("--verbose");
const DUMPAST = DEBUG && options.includes("--ast");

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
    console.error(ANSI.red`Syntax Error: ${aFile} at line ${lineNumber} : ${description}`);
    if (aExit) process.exit(10);
  };
}

const DEF = 'D';
const REF = 'R';
const UNKNOWN = 'U';

function getASTParser(aFile) {
  let sources;

  return function(aParseInfo) {
    sources = aParseInfo.sourceCode.split("\n");

    if (DUMPAST) {
      ANSI.green.stderr();
      console.error("Entire AST");
      dump(aParseInfo.ast);
      ANSI.reset.stderr();
    }

    return parseAST(aParseInfo.ast);
  };

  // https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API
  function parseAST(aAstNode) {
    if (aAstNode.type === "Identifier") {
      try {
        printIdInfo(aAstNode);
      } catch(e) {
        if (DEBUG) {
          ANSI.red.stderr();
          console.error("===============================");
          console.error("aFile:", aFile);
          console.error("AST Path :", dumpPath(aAstNode));
          console.error("-------------------------------");
          console.error(e);
          console.error("===============================");
          ANSI.reset.stderr();
        }
        throw e;
      }
    } else {
      const errorHandler = parseErrorHandler(aFile, false);
      for (let prop of subAstProps(aAstNode)) {
        // There's a node that belongs to other parent nodes. For such a case
        // make theses two properties configurable to make it overwritten. That
        // makes it keeps exact parent node and property where it comes through
        // while traverse AST.
        Object.defineProperties(aAstNode[prop], {
          parentNode: {configurable: true, value: aAstNode},
          parentProp: {configurable: true, value: prop},
        });
        parseAST(aAstNode[prop]);
      }
    }
  }

  function printIdInfo(aIdNode) {
    const {name, loc: {start: {line, column}}} = aIdNode;
    const idType = deterineIdType(aIdNode);
    switch (idType) {
      case DEF:
      case REF:
        console.log(`${idType},${name},${aFile},${line}:${column+1},${sources[line-1]}`);
        if (DEBUG) {
          console.log(ANSI.yellow("    AST Path :", dumpPath(aIdNode)));
        }
        break;
      case UNKNOWN:
        ANSI.red.stderr();
        console.error(`Unknown Identifier : ${name} at ${aFile} ${line}:${column+1},${sources[line-1]}`);
        console.error("  AST Path :", dumpPath(aIdNode));
        ANSI.reset.stderr();
        break;
    }
  }
}

function deterineIdType(aIdNode) {
  const {type, name, loc: {start: {line, column}}} = aIdNode;

  const {parentNode, parentProp} = (function getNonArrayParent() {
    let {parentNode, parentProp} = aIdNode;
    while (parentNode instanceof Array) {
      parentProp = parentNode.parentProp;
      parentNode = parentNode.parentNode;
    }
    return {parentNode, parentProp};
  })();

  switch(`${parentNode.type}.${parentProp}`) {
    // Definitions
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
      return parentNode.local.name === name ? undefined : DEF;
    case "MethodDefinition.key":
      return name === "constructor" ? undefined : DEF;
    case "ImportSpecifier.local":
      return parentNode.imported.name !== name ? DEF : REF;

    // References
    case "ArrayExpression.elements":
    case "ArrowFunctionExpression.body":
    case "AssignmentExpression.right":
    case "BinaryExpression.left":
    case "BinaryExpression.right":
    case "BreakStatement.label":
    case "CallExpression.arguments":
    case "CallExpression.callee":
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
    case "FunctionDeclaration.params":
      return;

    // Possibly verbose definition from here
    case "Property.key":
      return DEF;
  }
  return UNKNOWN;
}

function *subAstProps(aAstNode) {
  for (let prop in aAstNode) {
    switch(prop) {
      case "type":
      case "loc":
        break;
      case "errors":
        if (VERBOSE) {  // XXX : This spits out import export statement as error
          ANSI.red.stderr();
          console.error("==========================================");
          console.error("aAstNode.error : ", aAstNode.errors[0]);
          dump(aAstNode.errors[0]);
          console.error("------------------------------------------");
          console.error("aAstNode: ", aAstNode);
          console.error("==========================================");
          ANSI.reset.stderr();
        }
        break;
      default:
        const subAST = aAstNode[prop];
        if (isNode(subAST) || subAST instanceof Array) {
          yield prop;
        }
        break;
    }
  }
}

// interface Node always have "type" property
function isNode(aObj) {
  return aObj instanceof Object && aObj.hasOwnProperty('type');
}

function dumpPath(aNode) {
  const path = [];
  for (let n = aNode;n.parentNode;n = n.parentNode) {
    const {parentNode, parentProp} = n;
    if (parentNode instanceof Array) {
      path.unshift(`[${parentProp}]`);
    } else {
      path.unshift(`{${parentNode.type}}.${parentProp}`);
    }
  }
  return path.join('');
}

function dump(aObj) {
  console.info(JSON.stringify(aObj, null, 2));
}

