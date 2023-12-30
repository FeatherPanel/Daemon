import { Request, Response } from "express";
import os from "os";

import { VERSION } from "../constants";
import { validToken } from "../utils/token";

module.exports = {
	methods: ["POST"],
	post: async (req: Request, res: Response) => {
		if (!validToken(req.headers.authorization))
			return res.status(401).json({
				status: "error",
				message: "Access token is missing or invalid",
				error: "UNAUTHORIZED",
			});

		return res.status(200).json({
			status: "success",
			message: "System info",
			data: {
				os: {
					arch: os.arch(),
					cpus: os.cpus(),
					freemem: os.freemem(),
					hostname: os.hostname(),
					networkInterfaces: os.networkInterfaces(),
					platform: os.platform(),
					totalmem: os.totalmem(),
					type: os.type(),
					uptime: os.uptime(),
				},
				daemon: {
					version: VERSION,
				},
			},
		});
	},
};
