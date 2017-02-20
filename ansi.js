"use strict";
/* global exports, process */

// See more detail : https://en.wikipedia.org/wiki/ANSI_escape_code#CSI_codes
const props = {
  clear:  0,
  normal: 0,
  reset:  0,
  bold: 1,
  faint: 1,
  italic: 3,
  underline: 4,
  blink: 5,
  blink_rapid: 6,
  reverse: 7,
  inverse: 7,
  swap: 7,
  conceal: 8,
  cross_out: 9,
  strike_through: 9,
  black_dark: 30,
  red_dark: 31,
  green_dark: 32,
  yellow_dark:33,
  blue_dark:34,
  magenta_dark:35,
  cyna_dark:36,
  white_dark:37,
  black_bg_dark: 40,
  red_bg_dark: 41,
  green_bg_dark: 42,
  yellow_bg_dark:43,
  blue_bg_dark:44,
  magenta_bg_dark:45,
  cyna_bg_dark:46,
  white_bg_dark:47,
  default_bg_dark:49,
  black: 90,
  red: 91,
  green: 92,
  yellow:93,
  blue:94,
  magenta:95,
  cyna:96,
  white:97,
  black_bg: 100,
  red_bg: 101,
  green_bg: 102,
  yellow_bg:103,
  blue_bg:104,
  magenta_bg:105,
  cyna_bg:106,
  white_bg:107,
  default_bg:109,
};

for (let p in props) {
  Object.defineProperty(exports, p, {get: ansiCodeAdder(props[p])});
}

const ansiBegin = "\x1b[";
const ansiEnd = 'm';
const ansiReset = `${ansiBegin}${props.reset}${ansiEnd}`;

function ansiCodeAdder(aCode, aBuffer = []) {
  let boundTagAnsi = null;
  return function() {
    aBuffer.push(aCode);
    //console.error("push : ", aCode);
    if (!boundTagAnsi) {
      boundTagAnsi = tagAnsi.bind(aBuffer);

      for (let p in props) {
        Object.defineProperty(boundTagAnsi, p,
            {get: ansiCodeAdder(props[p], aBuffer)});
      }

      for (let p of ["stdout", "stderr"]) {
        boundTagAnsi[p] = flushAnsiCode(p);
      }
    }

    return boundTagAnsi;
  };

  function flushAnsiCode(aStream) {
    const stream = process[aStream];
    const output = stream.isTTY ? ansiBegin + aBuffer.join(';') + ansiEnd : '';
    return function() {stream.write(output);};
  }
}

function tagAnsi(strings, ...args) {
  const str = [`${ansiBegin}${this.join(';')}${ansiEnd}`]; // jshint ignore:line
  this.length = 0; // jshint ignore:line

  let separator = '';
  if (arguments.length === 0) { // For permanent apply to stdout
  } else if (Array.isArray(strings) && strings.length === args.length+1) {
    // for tagged template literal
    strings.forEach((elem, idx) => str.push(elem, args[idx]));
    if (str[0].startsWith(ansiBegin)) str.push(ansiReset);
    separator = '';
  } else { // Normal objects
    try {
      // Prevent unnecessary space while join below
      str[0] += strings.toString() || "";
    } catch (e) {}
    args.forEach(a => str.push(a.toString()));
    if (str[0].startsWith(ansiBegin)) str.push(ansiReset);
    separator = ' ';
  }

  return str.join(separator);
}
