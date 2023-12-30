import { Request, Response } from "express";
import fs from "fs";
import path from "path";

import { getServer } from "../../utils/docker";
import { validToken } from "../../utils/token";

module.exports = {
	methods: ["PATCH"],
	patch: async (req: Request, res: Response) => {
		if (!validToken(req.headers.authorization))
			return res.status(401).json({
				status: "error",
				message: "Access token is missing or invalid",
				error: "UNAUTHORIZED",
			});

		let { containerId, runType, jarFile, txtFile } = req.body;

		if (
			!containerId ||
			typeof containerId !== "string" ||
			!runType ||
			typeof runType !== "string" ||
			(runType === "jar" &&
				(!jarFile ||
					typeof jarFile !== "string" ||
					!new RegExp(
						/^(?!\.)(?!com[0-9]$)(?!con$)(?!lpt[0-9]$)(?!nul$)(?!prn$)[^\ \|\*\?\\\:\<\>\&\$\"]*[^\ \.\|\*\?\\\:\<\>\$\"]+(\.jar)$/gi
					).test(jarFile))) ||
			(runType === "txt" &&
				(!txtFile ||
					typeof txtFile !== "string" ||
					!new RegExp(
						/^(?!\.)(?!com[0-9]$)(?!con$)(?!lpt[0-9]$)(?!nul$)(?!prn$)[^\ \|\*\?\\\:\<\>\&\$\"]*[^\ \.\|\*\?\\\:\<\>\$\"]+(\.txt)$/gi
					).test(txtFile)))
		)
			return res.status(400).json({
				status: "error",
				message: "Bad request",
				error: "BAD_REQUEST",
			});

		let server = await getServer(containerId);
		if (!server)
			return res.status(400).json({
				status: "error",
				message: "Server not found",
				error: "SERVER_NOT_FOUND",
			});

		let game = server.labels["featherpanel.server.game"];

		if (game === "minecraft") {
			let startCommand = "";

			if (runType === "jar") {
				startCommand = `java -Xms${server.labels["featherpanel.server.ram"]}M -jar ${jarFile} nogui`;
			} else {
				startCommand = `java -Xms${server.labels["featherpanel.server.ram"]}M ${txtFile} "@" nogui`;
			}

			try {
				let runSh = fs
					.readFileSync(
						path.join(server.mountPath, "run.sh"),
						"utf-8"
					)
					.split("\n");

				if (runSh[runSh.length - 1].trim() === "") runSh.pop();
				runSh[runSh.length - 1] = startCommand;

				fs.writeFileSync(
					path.join(server.mountPath, "run.sh"),
					runSh.join("\n")
				);
			} catch {
				return res.status(500).json({
					status: "error",
					message: "Internal server error",
					error: "INTERNAL_SERVER_ERROR",
				});
			}

			return res.json({
				status: "success",
				message: "Server startup script updated",
				data: {
					startCommand,
				},
			});
		} else {
			return res.status(400).json({
				status: "error",
				message: "Server game not supported",
				error: "SERVER_GAME_NOT_SUPPORTED",
			});
		}
	},
};
