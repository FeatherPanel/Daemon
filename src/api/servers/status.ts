import { Request, Response } from "express";
import net from "net";

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

		let { containerId, port } = req.body;

		if (
			!containerId ||
			typeof containerId !== "string" ||
			!port ||
			typeof port !== "number"
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

		let inspect = await server.container.inspect();

		if (inspect.State.Restarting) {
			return res.status(200).json({
				status: "success",
				message: "Server is restarting",
				data: "restarting",
			});
		} else if (inspect.State.Running) {
			let client = new net.Socket();
			let isOnline = false;

			client.connect(port, "127.0.0.1", () => {
				client.destroy();
				isOnline = true;
			});

			client.on("error", () => {
				client.destroy();
			});

			setTimeout(() => {
				if (isOnline) {
					return res.status(200).json({
						status: "success",
						message: "Server is online",
						data: "online",
					});
				} else {
					return res.status(200).json({
						status: "success",
						message: "Server is running",
						data: "running",
					});
				}
			}, 1000);
		} else {
			return res.status(200).json({
				status: "success",
				message: "Server is offline",
				data: "offline",
			});
		}
	},
};
