import fs from "fs";
import path from "path";

export function validToken(token: any) {
	if (typeof token !== "string") return false;

	let config;
	if (fs.existsSync(path.join(__dirname, "..", "..", "config.json"))) {
		try {
			config = JSON.parse(
				fs.readFileSync(
					path.join(__dirname, "..", "..", "config.json"),
					"utf8"
				)
			);
		} catch (err) {
			return false;
		}
	} else {
		return false;
	}

	if (!config.daemonToken || typeof config.daemonToken !== "string")
		return false;
	if (
		token === config.daemonToken ||
		token.split(" ")[1] === config.daemonToken
	)
		return true;
	return false;
}
