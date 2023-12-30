import { Request, Response } from "express";
import fs from "fs";
import path from "path";

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

		let { containerId } = req.body;

		if (!containerId || typeof containerId !== "string")
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

		// Get CPU usage, RAM usage
		let inspect = await server.container.inspect();
		let stats = await server.container.stats({
			stream: false,
		});

		let cpuUsage = 0;
		let ramUsage = 0;
		let ramLimit = 0;
		let diskUsage = 0;
		let diskLimit = parseInt(
			inspect.Config.Labels["featherpanel.server.disk"]
		);
		let network = {
			rx: 0,
			tx: 0,
		};

		if (inspect.State.Running) {
			try {
				// CPU
				cpuUsage =
					((stats.cpu_stats.cpu_usage.total_usage -
						stats.precpu_stats.cpu_usage.total_usage) /
						(stats.cpu_stats.system_cpu_usage -
							stats.precpu_stats.system_cpu_usage)) *
					stats.cpu_stats.online_cpus *
					100;

				// RAM
				ramUsage = stats.memory_stats.usage;
				ramLimit = stats.memory_stats.limit;

				// Network
				network.rx = stats.networks.eth0.rx_bytes;
				network.tx = stats.networks.eth0.tx_bytes;
			} catch {}
		}

		// Disk
		const recursiveReaddir = (dir: string, sub: string = "") => {
			let files: string[] = [];
			fs.readdirSync(dir).forEach((file) => {
				let isDirectory = false;

				try {
					isDirectory = fs
						.statSync(path.join(dir, file))
						.isDirectory();
				} catch {}

				if (isDirectory)
					files = files.concat(
						recursiveReaddir(
							path.join(dir, file),
							path.join(sub, file)
						)
					);
				else files.push(path.join(sub, file));
			});
			return files;
		};

		try {
			let files = recursiveReaddir(path.join(server.mountPath, "files"));

			files.forEach((file) => {
				try {
					if (
						fs
							.statSync(
								path.join(server!.mountPath, "files", file)
							)
							.isDirectory()
					)
						return;
					diskUsage += fs.statSync(
						path.join(server!.mountPath, "files", file)
					).size;
				} catch {}
			});
		} catch {}

		return res.status(200).json({
			status: "success",
			message: "Server stats fetched successfully",
			data: {
				cpuUsage,
				ramUsage,
				ramLimit,
				diskUsage,
				diskLimit,
				network,
			},
		});
	},
};
