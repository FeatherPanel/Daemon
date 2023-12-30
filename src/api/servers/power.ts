import { Request, Response } from "express";
import { Server } from "socket.io";

import { API, CONFIG } from "../../constants";
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

		let { action, containerId } = req.body;

		if (
			!containerId ||
			typeof containerId !== "string" ||
			!action ||
			(action !== "start" &&
				action !== "stop" &&
				action !== "restart" &&
				action !== "kill")
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

		if (action === "start") {
			res.status(200).json({
				status: "success",
				message: "Server is starting...",
			});

			if (inspect.State.Running) return callback("online", containerId);

			server.container
				.start()
				.then(() => callback("online", containerId));
		} else if (action === "stop") {
			res.status(200).json({
				status: "success",
				message: "Server stopped successfully",
			});

			server.container
				.stop()
				.then(() => callback("offline", containerId));
		} else if (action === "restart") {
			res.status(200).json({
				status: "success",
				message: "Server restarted successfully",
			});

			server.container
				.restart()
				.then(() => callback("online", containerId));
		} else if (action === "kill") {
			res.status(200).json({
				status: "success",
				message: "Server killed successfully",
			});

			server.container
				.kill()
				.then(() => callback("offline", containerId))
				.catch(() => callback("offline", containerId));
		}
	},
};

async function callback(status: string, containerId: string) {
	fetch(`${API}/daemon/servers/status`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${CONFIG.daemonToken}`,
		},
		body: JSON.stringify({
			status,
			containerId,
		}),
	}).catch(() => {});

	let server = await getServer(containerId);
	if (server) server.refresh(true);
}
