import { Request, Response } from "express";
import { Server } from "socket.io";

import { getServer } from "../../utils/docker";
import { validToken } from "../../utils/token";

module.exports = {
	methods: ["POST"],
	post: async (req: Request, res: Response, io: Server) => {
		if (!validToken(req.headers.authorization))
			return res.status(401).json({
				status: "error",
				message: "Access token is missing or invalid",
				error: "UNAUTHORIZED",
			});

		const { command, containerId } = req.body;

		if (
			!containerId ||
			typeof containerId !== "string" ||
			!command ||
			typeof command !== "string"
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

		server.attachStream.write(command + "\n");

		res.status(200).json({
			status: "success",
			message: "Command sent",
		});
	},
};
