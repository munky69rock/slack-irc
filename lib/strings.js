'use strict';

module.exports = {
  insertSpace(text) {
    return text.split('').join('\u200B');
  },
  emphasize(text) {
    return `*${text}*`;
  },
  isEmphasized(text) {
    return /^\*.*\*$/.test(text);
  },
  weaken(text) {
    return `_ ${text} _`;
  },
  isWeakened(text) {
    return /^_.*_$/.test(text);
  },
  normalize(text) {
    return text.replace(/^[_\*]/, '').replace(/[_\*]$/, '');
  },
  stripColorCode(text) {
    return text.replace(/[\x01-\x1F\x7F]\d+/g, '');
  }
};

