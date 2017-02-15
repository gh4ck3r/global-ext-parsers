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
    console.error(`\x1b[31;1mSyntax Error: ${aFile} at line ${lineNumber} : ${description}\x1b[0m`);
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
  function parseAST(aAST, aParent = null) {
    const {type, name, loc: {start: {line, column}}} = aAST;

    if (type === "Identifier") {
      const prop = Object.getOwnPropertyNames(aParent)
                         .find(prop => aParent[prop] instanceof Array ?
                             aParent[prop].includes(aAST) :
                             aParent[prop] === aAST);

      const idType = getIdType(aParent, prop, aAST);  // XXX aParent[prop] === aAST ??
      if (idType === DEF || idType === REF)
        console.log(`${idType},${name},${aFile},${line}:${column+1},${sources[line-1]}`);
      else if (idType === UNKNOWN) {
        console.error('\x1b[31;1m');  // ANSI code red
        console.error(`Unknown Identifier : ${name} at ${aFile} ${line}:${column+1},${sources[line-1]}`);
        console.error(`  aParentType : ${aParent.type}.${prop}`);
        console.error(`\x1b[0m`);     // Reset ANSI code
      }
    } else {
      const parseSubAST = aSubAST => parseAST(aSubAST, aAST);
      const errorHandler = parseErrorHandler(aFile, false);
      const notNullOrUndefined = v => v;
      for (let prop in aAST) {
        if (prop === "type") continue;
        else if (prop === "loc") continue;
        else if (!aAST[prop]) continue;
        else if (aAST[prop].hasOwnProperty("type")) {
          parseSubAST(aAST[prop]);
        } else if (aAST[prop] instanceof Array) {
          const arr = aAST[prop].filter(notNullOrUndefined);
          if (prop === "errors") {
            // FIXME : This spit out even import statement
            //arr.forEach(errorHandler);
          } else {
//try {
            arr.forEach(parseSubAST);
//} catch(e) {
//  console.error("====================");
//  console.error(e);
//  console.error(aFile);
//  console.error(prop, aAST);
//  console.error("====================");
//}
          }
        }
      }
    }
  }
}

function dump(aObj) {
  console.info(JSON.stringify(aObj, null, 2));
}

const getIdType = (aParent, aIdProp, aAST) => {
  const {type, name, loc: {start: {line, column}}} = aAST;
  switch(`${aParent.type}.${aIdProp}`) {
    // Definitions
    case "CallExpression.callee":
    case "ClassDeclaration.id":
    case "ConditionalExpression.consequent":
    case "ExportDefaultDeclaration.declaration":
    case "FunctionDeclaration.id":
    case "FunctionExpression.id":
    case "VariableDeclarator.id":
    case "LabeledStatement.label":
    case "ImportNamespaceSpecifier.local":
      return DEF;

    // Conditional definitions
    case "MethodDefinition.key":
      return name === "constructor" ? undefined : DEF;
    case "ExportSpecifier.exported":        // export { foo, bar, baz}
      return aParent.local.name === name ? undefined : DEF;

    // References
    case "ArrayExpression.elements":
    case "ArrowFunctionExpression.body":
    case "AssignmentExpression.right":
    case "BinaryExpression.left":
    case "BinaryExpression.right":
    case "CallExpression.arguments":
    case "ClassDeclaration.superClass":
    case "ConditionalExpression.alternate":
    case "ConditionalExpression.test":
    case "ForInStatement.right":
    case "ForOfStatement.right":
    case "IfStatement.test":
    case "ImportDefaultSpecifier.local":
    case "ImportSpecifier.local":
    case "LogicalExpression.left":
    case "LogicalExpression.right":
    case "MemberExpression.object":
    case "MemberExpression.property":
    case "NewExpression.arguments":
    case "NewExpression.callee":
    case "Property.value":
    case "ReturnStatement.argument":
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
    case "ForStatement.test":
    case "SequenceExpression.expressions":
    case "ForStatement.update":
    case "DoWhileStatement.test":
    case "BreakStatement.label":
    case "ContinueStatement.label":
    case "ImportSpecifier.imported":
      return REF;

    // Ignored symbols
    case "ForInStatement.left":
    case "ArrayPattern.elements":
    case "ArrowFunctionExpression.params":  // Locally defined
    case "AssignmentExpression.left":       // This is just assignment
    case "AssignmentPattern.left":
    case "CatchClause.param":
    case "FunctionExpression.params":       // Locally defined
    case "RestElement.argument":
    case "ForOfStatement.left":             // "b" of "for (b of buffer)"
    case "ExportSpecifier.local":
      return;

    // Possibly verbose definition from here
    case "FunctionDeclaration.params":
    case "Property.key":
      return DEF;
  }
  return UNKNOWN;
};
