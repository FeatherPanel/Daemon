import { Request, Response } from "express";

module.exports = {
	methods: ["GET", "POST"],
	get: async (req: Request, res: Response) => {
		res.status(200).json({
			status: "success",
			message: "Hello world!",
		});
	},
	post: async (req: Request, res: Response) => {
		let start = Date.now();

		await new Promise((resolve) => setTimeout(resolve, 20000));

		res.status(200).json({
			status: "success",
			message: "Hello world!",
			data: {
				time: Date.now() - start,
				humanTime: "20 seconds",
			},
		});
	},
};
