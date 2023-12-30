import { createHash } from "crypto";
import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import tar from "tar";

import { API, CONFIG } from "../../constants";
import { getServer } from "../../utils/docker";
import { validToken } from "../../utils/token";

module.exports = {
	methods: ["POST", "PUT", "DELETE"],
	post: async (req: Request, res: Response) => {
		if (!validToken(req.headers.authorization))
			return res.status(401).json({
				status: "error",
				message: "Access token is missing or invalid",
				error: "UNAUTHORIZED",
			});

		let { containerId, name, ignore } = req.body;

		let server = await getServer(containerId);
		if (!server)
			return res.status(400).json({
				status: "error",
				message: "Server not found",
				error: "SERVER_NOT_FOUND",
			});

		try {
			fs.mkdirSync(path.join(server.mountPath, "backups"));
		} catch {}

		let backupName = createHash("md5").update(name).digest("hex");
		let backupPath = path.join(
			server.mountPath,
			"backups",
			backupName + ".tar"
		);

		let files: string[] = [];
		ignore = ignore.filter((pattern: string) => pattern.trim() !== "");

		let error = false;
		const recursiveReaddir = (dir: string, sub: string = "") => {
			let files: string[] = [];
			fs.readdirSync(dir).forEach((file) => {
				let ignoreFile = false;
				ignore.forEach((pattern: string) => {
					if (file.match(pattern)) ignoreFile = true;
				});
				if (!ignoreFile) {
					let isDirectory = false;

					try {
						isDirectory = fs
							.statSync(path.join(dir, file))
							.isDirectory();
					} catch {
						error = true;
						return;
					}

					if (isDirectory)
						files = files.concat(
							recursiveReaddir(
								path.join(dir, file),
								path.join(sub, file)
							)
						);
					else files.push(path.join(sub, file));
				}
			});
			return files;
		};

		files = recursiveReaddir(path.join(server.mountPath, "files"));

		if (error)
			return res.status(500).json({
				status: "error",
				message: "Internal server error",
				error: "INTERNAL_SERVER_ERROR",
			});

		let archive = tar.c(
			{
				gzip: {
					level: 9,
					memLevel: 9,
				},
				cwd: path.join(server.mountPath, "files"),
			},
			files
		);

		archive.pipe(fs.createWriteStream(backupPath));

		archive.on("error", (err) => {
			fetch(`${API}/daemon/servers/backups`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${CONFIG.daemonToken}`,
				},
				body: JSON.stringify({
					status: "error",
					containerId,
				}),
			}).catch(() => {});
		});

		archive.on("finish", () => {
			fetch(`${API}/daemon/servers/backups`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${CONFIG.daemonToken}`,
				},
				body: JSON.stringify({
					status: "success",
					containerId,
				}),
			}).catch(() => {});
		});

		let size = 0;
		files.forEach((file) => {
			try {
				if (
					fs
						.statSync(path.join(server!.mountPath, "files", file))
						.isDirectory()
				)
					return;
				size += fs.statSync(
					path.join(server!.mountPath, "files", file)
				).size;
			} catch {}
		});

		res.status(200).json({
			status: "pending",
			message: "Backup started",
			data: {
				size,
			},
		});
	},
	put: async (req: Request, res: Response) => {
		if (!validToken(req.headers.authorization))
			return res.status(401).json({
				status: "error",
				message: "Access token is missing or invalid",
				error: "UNAUTHORIZED",
			});

		let { containerId, name } = req.body;

		let server = await getServer(containerId);
		if (!server)
			return res.status(400).json({
				status: "error",
				message: "Server not found",
				error: "SERVER_NOT_FOUND",
			});

		let backupName = createHash("md5").update(name).digest("hex");
		let backupPath = path.join(
			server.mountPath,
			"backups",
			backupName + ".tar"
		);

		try {
			fs.rmSync(path.join(server.mountPath, "files"), {
				recursive: true,
				maxRetries: 3,
			});
			fs.mkdirSync(path.join(server.mountPath, "files"));
		} catch {
			return res.status(500).json({
				status: "error",
				message: "Internal server error",
				error: "INTERNAL_SERVER_ERROR",
			});
		}

		res.status(200).json({
			status: "pending",
			message: "Backup restoration started",
		});

		tar.x({
			file: backupPath,
			cwd: path.join(server.mountPath, "files"),
		});
	},
	delete: async (req: Request, res: Response) => {
		if (!validToken(req.headers.authorization))
			return res.status(401).json({
				status: "error",
				message: "Access token is missing or invalid",
				error: "UNAUTHORIZED",
			});

		let { name, containerId } = req.body;

		let server = await getServer(containerId);
		if (!server)
			return res.status(400).json({
				status: "error",
				message: "Server not found",
				error: "SERVER_NOT_FOUND",
			});

		let backupName = createHash("md5").update(name).digest("hex");
		let backupPath = path.join(
			server.mountPath,
			"backups",
			backupName + ".tar"
		);

		try {
			fs.rmSync(backupPath, { force: true, maxRetries: 3 });
		} catch {}

		res.status(200).json({
			status: "success",
			message: "Backup deleted",
		});
	},
};
