import { Request, Response } from "express";
import fs from "fs";
import path from "path";

import logger from "../utils/logger";
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

		try {
			fs.unlinkSync(path.join(__dirname, "..", "..", "config.json"));
		} catch (e: any) {
			logger.error(e.toString());
		}

		res.status(200).json({
			status: "success",
			message: "Config deleted successfully",
		});

		logger.info("The daemon has been deleted from the panel");
		logger.info("The daemon will now exit");

		process.exit(0);
	},
};
