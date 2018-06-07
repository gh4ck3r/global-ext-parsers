'use strict';

/* eslint no-unused-vars: off */
const v = 'val';
function foo(a = v) { }
function bar(a = undefined) { }
function baz(a = null) { }
