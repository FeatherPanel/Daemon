"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unicode_utf8 = void 0;
function unicode_utf8(str) {
    str = str
        .replaceAll("\u0001", "\r")
        .replaceAll(new RegExp(/\u0000[^\u0000]/, "g"), "")
        .replaceAll("\u0000", "");
    return str;
}
exports.unicode_utf8 = unicode_utf8;
