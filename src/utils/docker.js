"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Server = exports.getServer = exports.checkForImage = exports.docker = void 0;
var child_process_1 = require("child_process");
var dockerode_1 = __importDefault(require("dockerode"));
var os_1 = __importDefault(require("os"));
var stream_1 = require("stream");
var constants_1 = require("../constants");
var string_1 = require("./string");
var Servers = new Map();
exports.docker = new dockerode_1.default({
    socketPath: (os_1.default.platform() === "linux" ? "/" : "//./pipe/") + "var/run/docker.sock",
});
function checkForImage(imageName, _callback) {
    return __awaiter(this, void 0, void 0, function () {
        var image, pullImage;
        var _this = this;
        return __generator(this, function (_a) {
            image = exports.docker.getImage(imageName);
            if (!image) {
                pullImage = (0, child_process_1.spawn)("docker", ["pull", imageName]);
                pullImage.on("error", function (err) { return __awaiter(_this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        return [2 /*return*/, _callback(err)];
                    });
                }); });
                pullImage.on("close", function (code) { return __awaiter(_this, void 0, void 0, function () {
                    var image;
                    return __generator(this, function (_a) {
                        if (code !== 0)
                            return [2 /*return*/, _callback("Error while pulling image")];
                        image = exports.docker.getImage(imageName);
                        if (!image)
                            return [2 /*return*/, _callback("Error while pulling image")];
                        return [2 /*return*/, _callback(null)];
                    });
                }); });
            }
            return [2 /*return*/, _callback(null)];
        });
    });
}
exports.checkForImage = checkForImage;
function getServer(containerId) {
    return __awaiter(this, void 0, void 0, function () {
        var server, server_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    server = Servers.get(containerId);
                    if (!server) return [3 /*break*/, 1];
                    server.refresh();
                    return [2 /*return*/, server];
                case 1:
                    server_1 = new Server(containerId);
                    return [4 /*yield*/, server_1.init()];
                case 2:
                    if (!(_a.sent()))
                        return [2 /*return*/, undefined];
                    return [2 /*return*/, server_1];
            }
        });
    });
}
exports.getServer = getServer;
var Server = /** @class */ (function () {
    function Server(containerId) {
        this.serverId = "";
        this.labels = {};
        this.container = exports.docker.getContainer("");
        this.volume = exports.docker.getVolume("");
        this.mountPath = "";
        this.logStream = new stream_1.Stream.PassThrough();
        this.attachStream = new stream_1.Stream.PassThrough();
        this.initialized = false;
        this.running = false;
        this.containerId = containerId;
    }
    Server.prototype.init = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        if (this.initialized)
                            return [2 /*return*/, true];
                        this.container = exports.docker.getContainer(this.containerId);
                        if (this.container.id !== this.containerId)
                            return [2 /*return*/, false];
                        return [4 /*yield*/, this.container.inspect()];
                    case 1:
                        if (!(_d.sent()).Config.Image.includes("featherpanel/"))
                            return [2 /*return*/, false];
                        _a = this;
                        return [4 /*yield*/, this.container.inspect()];
                    case 2:
                        _a.serverId = (_d.sent()).Config.Labels["featherpanel.server.id"];
                        if (!this.serverId || !this.serverId.match(/^[A-Z]{6}$/))
                            return [2 /*return*/, false];
                        this.volume = exports.docker.getVolume(this.serverId);
                        return [4 /*yield*/, exports.docker.listVolumes({ filters: { name: [this.serverId] } })];
                    case 3:
                        if ((_d.sent())
                            .Volumes.length === 0)
                            return [2 /*return*/, false];
                        _b = this;
                        return [4 /*yield*/, this.volume.inspect()];
                    case 4:
                        _b.mountPath = (_d.sent()).Mountpoint;
                        _c = this;
                        return [4 /*yield*/, this.container.inspect()];
                    case 5:
                        _c.labels = (_d.sent()).Config.Labels;
                        this.initialized = true;
                        this.refresh();
                        Servers.set(this.containerId, this);
                        return [2 /*return*/, true];
                }
            });
        });
    };
    Server.prototype.refresh = function (forceRefresh) {
        if (forceRefresh === void 0) { forceRefresh = false; }
        return __awaiter(this, void 0, void 0, function () {
            var inspect, _a, _b;
            var _this = this;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!this.initialized)
                            return [2 /*return*/];
                        return [4 /*yield*/, this.container.inspect()];
                    case 1:
                        inspect = _c.sent();
                        if (!((!this.running && inspect.State.Running) || forceRefresh)) return [3 /*break*/, 4];
                        this.logStream.removeAllListeners();
                        this.attachStream.removeAllListeners();
                        _a = this;
                        return [4 /*yield*/, this.container.logs({
                                follow: true,
                                stdout: true,
                                stderr: true,
                                tail: 0,
                            })];
                    case 2:
                        _a.logStream = _c.sent();
                        _b = this;
                        return [4 /*yield*/, this.container.attach({
                                stream: true,
                                stdout: true,
                                stderr: true,
                                stdin: true,
                            })];
                    case 3:
                        _b.attachStream = _c.sent();
                        this.logStream.on("data", function (data) {
                            fetch("".concat(constants_1.API, "/daemon/servers/logs"), {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    Authorization: "Bearer ".concat(constants_1.CONFIG.daemonToken),
                                },
                                body: JSON.stringify({
                                    containerId: _this.containerId,
                                    logs: (0, string_1.unicode_utf8)(data.toString("utf-8")),
                                }),
                            }).catch(function () { });
                        });
                        _c.label = 4;
                    case 4:
                        // Server stopped
                        if (!inspect.State.Running && this.running) {
                            this.logStream.removeAllListeners();
                            this.attachStream.removeAllListeners();
                        }
                        this.running = inspect.State.Running;
                        return [2 /*return*/];
                }
            });
        });
    };
    Server.prototype.destroy = function () {
        var _this = this;
        if (!this.initialized)
            return;
        this.logStream.removeAllListeners();
        this.attachStream.removeAllListeners();
        this.initialized = false;
        this.running = false;
        this.container.remove({ force: true })
            .then(function () {
            _this.volume.remove({ force: true }).catch(function () { });
        })
            .catch(function () { });
        Servers.delete(this.containerId);
    };
    return Server;
}());
exports.Server = Server;
