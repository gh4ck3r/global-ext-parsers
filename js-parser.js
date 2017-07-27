// vim:ft=javascript:ts=2:sw=2:et:
'use strict';

/* global module, require, process */

const {readFile, exitWithError} = require('./common.js');

const [DEBUG, VERBOSE, DUMPAST] = (function() {
  const options = process.argv.slice(2).filter(v => v.startsWith('--'));
  const debug = options.includes('--debug');
  const verbose = debug && options.includes('--verbose');
  const dumpast = debug && options.includes('--ast');
  return [debug, verbose, dumpast];
})();

const esprima = require('esprima');
const ANSI = require('ansi-string');

module.exports = {
  tagJavaScript,
  tagJavaScriptFile
};

const DEF = 'D';
const REF = 'R';
const NOTHING = 'N';

function tagJavaScript(aSourceCodes, aPath, aLineOffset = 0, aColumnOffset = 0) {
  if (!aSourceCodes || !aPath) {
    throw new TypeError('Source code and its path must be given.');
  }

  let ast;
  try {
    ast = parseJS(aSourceCodes);
  } catch(e) {
    const {lineNumber, description} = e;
    console.error((lineNumber && description) ?
      ANSI.red`Syntax Error: ${aPath} at line ${lineNumber + aLineOffset} : ${description}` :
      ANSI.red`${e}`);
    process.exit(10);
  }

  return tagAST(ast, aSourceCodes, aPath, aLineOffset, aColumnOffset);
}

function tagJavaScriptFile(aPath) {
  return readFile(aPath)
    .catch(exitWithError)
    .then(src => tagJavaScript(src, aPath));
}

function parseJS(aSourceCodes) {
  let ast;
  const option = {loc: true, tolerant: true};
  try {
    ast = esprima.parse(aSourceCodes, option);
    decorateAST(ast);
  } catch(e) {
    option.sourceType = 'module';
    ast = esprima.parse(aSourceCodes, option);
  }
  return ast;
}

function tagAST(aAST, aSourceCodes, aFile, aLineOffset = 0, aColumnOffset = 0) {
  const tags = [];
  if (!aAST) return tags;

  const sources = aSourceCodes.split('\n');

  if (DUMPAST) {
    ANSI.green.stderr();
    console.log('Entire AST');
    dump(aAST);
    ANSI.reset.stderr();
  }

  // https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API
  for (const identifier of aAST.descendants('Identifier')) {
    try {
      if (!identifier.tagType) {
        ANSI.red.stderr();
        const {tagInfo: {name, line, column}, path} = identifier;
        console.error(`Unknown Identifier : ${name} at ${aFile} ${line}:${column+1},${sources[line-1]}`);
        console.error('  AST Path :', path);
        ANSI.reset.stderr();
      }

      for (const node of identifier.tags) {
        const {tagInfo} = node;
        tagInfo.path    = aFile;
        tagInfo.ref     = sources[tagInfo.line-1];
        tagInfo.line   += aLineOffset;
        tagInfo.column += 1 + aColumnOffset;
        tags.push(tagInfo);
        if (DEBUG) {
          console.log(ANSI.yellow('    AST Path :', identifier.path));
        }
      }
    } catch(e) {
      if (DEBUG) {
        ANSI.red.stderr();
        console.error('===============================');
        console.error('aFile:', aFile);
        console.error('AST Path :', identifier.path);
        console.error('-------------------------------');
        console.error(e);
        console.error('===============================');
        ANSI.reset.stderr();
      }
      throw e;
    }
  }

  return tags;
}

function determineTagType(aIdNode) {
  const {type, name} = aIdNode;
  if (type !== 'Identifier') return NOTHING;

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
    case 'ClassDeclaration.id':
    case 'ConditionalExpression.consequent':
    case 'ExportDefaultDeclaration.declaration':
    case 'FunctionDeclaration.id':
    case 'FunctionExpression.id':
    case 'ImportNamespaceSpecifier.local':
    case 'LabeledStatement.label':
      aIdNode.tag = DEF;
      return DEF;

    // Conditional definitions
    case 'ExportSpecifier.exported':        // export { foo, bar, baz}
      return parentNode.local.name === name ? NOTHING : DEF;
    case 'MethodDefinition.key':
      return name === 'constructor' ? NOTHING : DEF;
    case 'ImportSpecifier.local':
      return parentNode.imported.name !== name ? DEF : REF;
    case 'Property.key':
      if (parentNode.shorthand) {
        // shorthand is always reference
        // It'll reported as REF by 'Property.value'
        return NOTHING;
      } else {
        const [ ancestorNode, prop ] = aIdNode.getAncestor('VariableDeclarator');
        if (ancestorNode) {
          switch (prop) {
            case 'init':
              if (parentNode.key !== parentNode.value) return DEF;  // for variable declara
              break;
            case 'id':
              if (parentNode.key === parentNode.value) return DEF;  // for variable declara
              break;
          }
        }
      }
      return REF;
    case 'VariableDeclarator.id': {
      let [ ancestorNode, prop ] = aIdNode.getAncestor('ForInStatement');
      if (ancestorNode && prop === 'left') return NOTHING;
      [ ancestorNode, prop ] = aIdNode.getAncestor('ForStatement');
      if (ancestorNode && prop === 'init') return NOTHING;
      return DEF;
    }
    case 'BinaryExpression.left':
    case 'BinaryExpression.right':
    case 'UpdateExpression.argument':
    case 'UnaryExpression.argument': {
      if (isForStatementInternalId(aIdNode)) return NOTHING;
      return REF;
    }
    case 'ForStatement.update': {
      if (isForStatementDefinedVariable(parentNode, name)) return NOTHING;
      return REF;
    }
    case 'ArrayPattern.elements': // An array-destructuring pattern.
      return DEF;

    // References
    case 'ArrayExpression.elements':
    case 'ArrowFunctionExpression.body':
    case 'AssignmentExpression.right':
    case 'BreakStatement.label':
    case 'CallExpression.arguments':
    case 'CallExpression.callee':
    case 'ClassDeclaration.superClass':
    case 'ConditionalExpression.alternate':
    case 'ConditionalExpression.test':
    case 'ContinueStatement.label':
    case 'DoWhileStatement.test':
    case 'ForInStatement.right':
    case 'ForOfStatement.right':
    case 'ForStatement.test':
    case 'IfStatement.test':
    case 'ImportDefaultSpecifier.local':
    case 'ImportSpecifier.imported':
    case 'LogicalExpression.left':
    case 'LogicalExpression.right':
    case 'MemberExpression.object':
    case 'MemberExpression.property':
    case 'NewExpression.arguments':
    case 'NewExpression.callee':
    case 'Property.value':
    case 'ReturnStatement.argument':
    case 'SequenceExpression.expressions':
    case 'SpreadElement.argument':
    case 'SwitchCase.test':
    case 'SwitchStatement.discriminant':
    case 'TaggedTemplateExpression.tag':
    case 'TemplateLiteral.expressions':
    case 'ThrowStatement.argument':
    case 'VariableDeclarator.init':
    case 'WhileStatement.test':
    case 'YieldExpression.argument':
    case 'ExpressionStatement.expression':
      return REF;

    // Ignored symbols
    case 'ArrowFunctionExpression.params':  // Locally defined
    case 'AssignmentExpression.left':       // This is just assignment
    case 'AssignmentPattern.left':
    case 'CatchClause.param':
    case 'ClassExpression.id':
    case 'ExportSpecifier.local':
    case 'ForInStatement.left':
    case 'ForOfStatement.left':             // 'b' of 'for (b of buffer)'
    case 'FunctionExpression.params':       // Locally defined
    case 'RestElement.argument':
    case 'FunctionDeclaration.params':
      return NOTHING;

    // Possibly verbose definition from here
  }
  return;
}

function *subAstNodeProps(aAstNode) {
  if (!(isNode(aAstNode) || aAstNode instanceof Array)) return;
  for (let prop in aAstNode) {
    switch(prop) {
      case 'type':
      case 'loc':
        break;
      case 'errors':
        if (VERBOSE) {  // XXX : This spits out import export statement as error
          ANSI.red.stderr();
          console.error('==========================================');
          console.error('aAstNode.error : ', aAstNode.errors[0]);
          dump(aAstNode.errors[0]);
          console.error('------------------------------------------');
          console.error('aAstNode: ', aAstNode);
          console.error('==========================================');
          ANSI.reset.stderr();
        }
        break;
      default: {
        const subAST = aAstNode[prop];
        if (isNode(subAST) || subAST instanceof Array) {
          yield prop;
        }
        break;
      }
    }
  }
}

// interface Node always have 'type' property
function isNode(aObj) {
  return aObj instanceof Object && aObj.hasOwnProperty('type');
}

function dump(aObj) {
  console.info(JSON.stringify(aObj, null, 2));
}

// XXX : Think about make this a hidden method of ForStatement node
function isForStatementDefinedVariable(aForStatementNode, aName) {
  const {type, init} = aForStatementNode;
  console.assert(type === 'ForStatement');

  return  init &&
          init.type === 'VariableDeclaration' &&
          init.declarations
            .filter(e => e.type === 'VariableDeclarator')
            .some(e => {
              const {id :{type, name}} = e;
              return type === 'Identifier' && name === aName;
            });
}

function isForStatementInternalId(aIdNode) {
  const [ ancestorNode, prop ] = aIdNode.getAncestor('ForStatement');
  return ancestorNode &&
      ['test', 'update'].includes(prop) &&
      isForStatementDefinedVariable(ancestorNode, aIdNode.name);
}

function decorateAST(aAstNode) {
  Object.defineProperties(aAstNode, {
    descendants: {value: findDescendants},
    getAncestor: {value: astGetAncestorNode},
    path: {get: pathGetter},
    tagType: {configurable: true, get: function() { // lazyLoader
      const value = determineTagType(this);
      Object.defineProperty(this, 'tagType', {value});
      return value;
    }},
    tagInfo: {get: function() {
      const {tagType: type, name, loc: {start: {line, column}}} = this;
      return {type, name, line, column};
    }},
    tags: {get: function*() {
      const {tagType, name, parentNode} = this;
      switch (tagType) {
        case DEF:
        case REF:
          yield this;
          // fall through
        case NOTHING:
          break;
        default:
          return;
      }

      const selectors = [
        'querySelector',
        'querySelectorAll',
        'getElementById',
        'getElementsByClassName',
        'getElementsByName',
      ];
      if (selectors.includes(name) && parentNode.type === 'MemberExpression') {
        let callExpression = parentNode;
        while(callExpression.type === 'MemberExpression')
          callExpression = callExpression.parentNode;
        if (callExpression.type === 'CallExpression') {
          const selector = callExpression.arguments[0];
          if (['Literal', 'TemplateLiteral'].includes(selector.type)) {
            yield *tagInfoFromLiteral(selector, name.startsWith('querySelector'));
          }
        }
      }
    }},
  });

  for (let prop of subAstNodeProps(aAstNode)) {
    // There's a node that belongs to other parent nodes with other property
    // names. For such a case clone it with Object.assign()
    if (aAstNode[prop].hasOwnProperty('parentNode')) {
      aAstNode[prop] = Object.assign({}, aAstNode[prop]);
    }
    const subAST = aAstNode[prop];
    Object.defineProperties(subAST, {
      parentNode: {value: aAstNode},
      parentProp: {value: prop},
    });
    decorateAST(subAST);
  }

  function *findDescendants(...aTypes) {
    for (let prop of subAstNodeProps(this)) { // jshint ignore:line
      const subNode = this[prop];             // jshint ignore:line
      if (subNode) {
        if (aTypes.length === 0 || aTypes.includes(subNode.type)) {
          yield subNode;
        }
        yield *subNode.descendants(...aTypes);
      }
    }
  }

  function astGetAncestorNode(aType) {
    let {parentNode, parentProp} = this.parentNode; // jshint ignore:line
    while (parentNode &&
          (parentNode instanceof Array || parentNode.type !== aType)) {
      parentProp = parentNode.parentProp;
      parentNode = parentNode.parentNode;
    }
    return [parentNode, parentProp];
  }

  function pathGetter() {
    const path = [];
    for (let n = this; n.parentNode; n = n.parentNode) {
      const {parentNode, parentProp} = n;
      if (parentNode instanceof Array) {
        path.unshift(`[${parentProp}]`);
      } else {
        path.unshift(`{${parentNode.type}}.${parentProp}`);
      }
    }
    return path.join('');
  }
}

function* tagInfoFromLiteral(aLiteralNode, isSelector = false) {
  const {value, line, column} = (function(){
    switch(aLiteralNode.type) {
      case 'Literal': {
        const {value, loc:{start:{line, column}}} = aLiteralNode;
        return {value, line, column};
      }
      case 'TemplateLiteral': {
        const {value: {raw: value}, loc:{start:{line, column}}} =
          aLiteralNode.quasis[0];
        return {value, line, column};
      }
    }
  })();

  const idPtrn = isSelector ? /[.#]\b[\w-]+\b/g : /\b[\w-]+\b/g;
  const ids = value.match(idPtrn);
  if (ids) {
    for (const id of ids) {
      const splitStrings = value.split('\n');
      let nLineOffset = 0, nColOffset;
      for (nColOffset = splitStrings[nLineOffset].indexOf(id);
        nColOffset === -1;
        nColOffset = splitStrings[++nLineOffset].indexOf(id));
      const prefixLen = isSelector ? 1 : 0;
      yield { tagInfo: {
        type: REF,
        line: line + nLineOffset,
        column: nLineOffset ?
          prefixLen + nColOffset :
          // 1 for quotation mark that begins literal
          1 + column + prefixLen + nColOffset,
        name: id.slice(prefixLen),  // remove prefix '.' or '#'
      }};
    }
  }
}
