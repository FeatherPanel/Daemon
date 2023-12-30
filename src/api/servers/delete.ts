import { Request, Response } from "express";

import { getServer } from "../../utils/docker";
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

		const { containerId } = req.body;

		if (!containerId || typeof containerId !== "string")
			return res.status(400).json({
				status: "error",
				message: "Bad request",
				error: "BAD_REQUEST",
			});

		let server = await getServer(req.body.containerId);
		if (!server)
			return res.status(200).json({
				status: "success",
				message: "Server deleted",
			});

		if ((await server.container.inspect()).State.Running)
			await server.container.stop();

		server.destroy();

		res.status(200).json({
			status: "success",
			message: "Server deleted",
		});
	},
};
