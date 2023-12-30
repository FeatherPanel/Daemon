import { Request, Response } from "express";

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

		let start = req.body.start || Date.now();
		res.status(200).json({
			status: "success",
			message: "Pong!",
			data: {
				start: start,
				end: Date.now(),
				responseTime: Date.now() - start,
			},
		});
	},
};
