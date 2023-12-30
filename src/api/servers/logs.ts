import { Request, Response } from "express";

import { getServer } from "../../utils/docker";
import { unicode_utf8 } from "../../utils/string";
import { validToken } from "../../utils/token";

module.exports = {
	methods: ["POST"],
	post: async (req: Request, res: Response) => {
		if (!validToken(req.headers.authorization))
			return res.status(401).json({
				status: "error",
				message: "Access token is missing or invalid",
				error: "UNAUTHORIZED",
			});

		if (!req.body || typeof req.body.containerId !== "string")
			return res.status(400).json({
				status: "error",
				message: "Bad request",
				error: "BAD_REQUEST",
			});

		let server = await getServer(req.body.containerId);
		if (!server)
			return res.status(400).json({
				status: "error",
				message: "Invalid container id",
				error: "INVALID_CONTAINER_ID",
			});

		server.container
			.logs({
				follow: false,
				stdout: true,
				stderr: true,
				timestamps: false,
				tail: req.body.tail || 100,
			})
			.then((logs) => {
				res.status(200).json({
					status: "success",
					message: "Server logs retrieved successfully",
					data: unicode_utf8(logs.toString("utf-8")),
				});
			})
			.catch((err) => {
				console.log(err);

				res.status(500).json({
					status: "error",
					message: "Internal server error",
					error: "INTERNAL_SERVER_ERROR",
				});
			});
	},
};
