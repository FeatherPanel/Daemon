import { Request, Response } from "express";
import fs from "fs";
import path from "path";

import { getServer } from "../../utils/docker";
import { validToken } from "../../utils/token";

const JAVA_VERSIONS: { [key: string]: string } = {
	"8": "temurin-8-jre-amd64",
	"11": "temurin-11-jre-amd64",
	"17": "temurin-17-jre-amd64",
	"21": "temurin-21-jre-amd64",
};

module.exports = {
	methods: ["POST"],
	post: async (req: Request, res: Response) => {
		if (!validToken(req.headers.authorization))
			return res.status(401).json({
				status: "error",
				message: "Access token is missing or invalid",
				error: "UNAUTHORIZED",
			});

		let { containerId, javaVersion } = req.body;

		if (
			!containerId ||
			typeof containerId !== "string" ||
			!javaVersion ||
			typeof javaVersion !== "string" ||
			!JAVA_VERSIONS[javaVersion]
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

		try {
			if (
				fs.existsSync(
					path.join(
						server!.mountPath,
						"pre-init.d",
						"update-java-alternatives.sh"
					)
				)
			)
				fs.unlinkSync(
					path.join(
						server!.mountPath,
						"pre-init.d",
						"update-java-alternatives.sh"
					)
				);

			fs.writeFileSync(
				path.join(
					server!.mountPath,
					"pre-init.d",
					`update-java-alternatives.sh`
				),
				"#!/bin/bash\n" +
					`update-java-alternatives -s ${JAVA_VERSIONS[javaVersion]}\n` +
					`rm -- "$0"`
			);

			res.json({
				status: "success",
				message: "Java version updated",
			});
		} catch {
			return res.status(500).json({
				status: "error",
				message: "Internal server error",
				error: "INTERNAL_SERVER_ERROR",
			});
		}
	},
};
