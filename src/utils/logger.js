"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("colors");
var winston_1 = __importDefault(require("winston"));
var constants_1 = require("../constants");
var LOCALE = "fr-FR";
var Logger = /** @class */ (function () {
    function Logger() {
        this.logger = winston_1.default.createLogger({
            level: constants_1.IS_DEBUG ? "debug" : "info",
            format: winston_1.default.format.printf(function (info) {
                var date = new Date().toISOString();
                var level = info.level.toUpperCase();
                var message = info.message.replace(/\u001b\[\d{1,2}m/g, "");
                return "[".concat(date, "] [").concat(level, "]: ").concat(message);
            }),
            transports: [
                new winston_1.default.transports.File({
                    dirname: "logs",
                    filename: "daemon.log",
                }),
                new winston_1.default.transports.Console({
                    format: winston_1.default.format.printf(function (info) {
                        var level = info.level.toUpperCase();
                        switch (level) {
                            case "DEBUG":
                                level = level.gray;
                            case "INFO":
                                level = level.green;
                                break;
                            case "WARN":
                                level = level.yellow;
                                break;
                            case "ERROR":
                                level = level.red;
                                break;
                            default:
                                break;
                        }
                        var date = (new Date().toLocaleDateString(LOCALE) +
                            " " +
                            new Date().toLocaleTimeString(LOCALE)).grey;
                        return "[".concat(date, "] [").concat(level, "]: ").concat(info.message);
                    }),
                }),
            ],
        });
    }
    Logger.prototype.debug = function (message) {
        var _a;
        var meta = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            meta[_i - 1] = arguments[_i];
        }
        (_a = this.logger).debug.apply(_a, __spreadArray([message], meta, false));
    };
    Logger.prototype.info = function (message) {
        var _a;
        var meta = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            meta[_i - 1] = arguments[_i];
        }
        (_a = this.logger).info.apply(_a, __spreadArray([message], meta, false));
    };
    Logger.prototype.warn = function (message) {
        var _a;
        var meta = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            meta[_i - 1] = arguments[_i];
        }
        (_a = this.logger).warn.apply(_a, __spreadArray([message], meta, false));
    };
    Logger.prototype.error = function (message) {
        var _a;
        var meta = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            meta[_i - 1] = arguments[_i];
        }
        (_a = this.logger).error.apply(_a, __spreadArray([message], meta, false));
    };
    return Logger;
}());
exports.default = new Logger();
