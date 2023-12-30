import conf from "../config.json";
import pkg from "../package.json";

export const CONFIG = conf;
export const VERSION = pkg.version;
export const API = CONFIG.panelUrl + "/api/v1";
export const FPD_COMMAND = process.platform === "win32" ? "fpd" : "./fpd";
export const IS_DEBUG =
	process.env.NODE_ENV === "development" || process.argv.includes("--debug");
export const FP_CONTENT_URL = "https://featherpanel.natoune.fr";
export const MODRINTH_API = "https://api.modrinth.com/v2";
