import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";

import { FP_CONTENT_URL, MODRINTH_API } from "../../../constants";
import { getServer } from "../../../utils/docker";
import { validToken } from "../../../utils/token";

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

		let server = await getServer(containerId);
		if (!server)
			return res.status(400).json({
				status: "error",
				message: "Server not found",
				error: "SERVER_NOT_FOUND",
			});

		let game = server.labels["featherpanel.server.game"];

		if (game === "minecraft") {
			const { id, type, version } = req.body;

			if (
				!id ||
				!type ||
				!version ||
				typeof id !== "string" ||
				typeof type !== "string" ||
				typeof version !== "string"
			)
				return res.status(400).json({
					status: "error",
					message: "Bad request",
					error: "BAD_REQUEST",
				});

			fetch(`${MODRINTH_API}/project/${id}/version/${version}`)
				.then((res) => res.json())
				.then(async (json) => {
					if (
						json.files &&
						Array.isArray(json.files) &&
						json.files.length > 0
					) {
						const file = json.files[0];

						if (!file.url) {
							return res.status(400).json({
								status: "error",
								message: "Invalid plugin",
								error: "INVALID_PLUGIN",
							});
						}

						if (type === "mod") {
							// Create directory
							try {
								fs.mkdirSync(
									path.join(
										server!.mountPath,
										"files",
										"mods"
									),
									{
										recursive: true,
									}
								);
							} catch {}

							// Download file
							const { body: fileContent } = await fetch(file.url);
							const filePath = path.join(
								server!.mountPath,
								"files",
								"mods",
								file.filename
							);

							await finished(
								// @ts-ignore
								Readable.fromWeb(fileContent).pipe(
									fs.createWriteStream(filePath)
								)
							);

							return res.json({
								status: "success",
								message: "Mod installed",
							});
						} else if (type === "plugin") {
							// Create directory
							try {
								fs.mkdirSync(
									path.join(
										server!.mountPath,
										"files",
										"plugins"
									),
									{ recursive: true }
								);
							} catch {}

							// Download file
							const { body: fileContent } = await fetch(file.url);
							const filePath = path.join(
								server!.mountPath,
								"files",
								"plugins",
								file.filename
							);

							try {
								await finished(
									// @ts-ignore
									Readable.fromWeb(fileContent).pipe(
										fs.createWriteStream(filePath)
									)
								);
							} catch {
								return res.status(500).json({
									status: "error",
									message: "Internal server error",
									error: "INTERNAL_SERVER_ERROR",
								});
							}

							return res.json({
								status: "success",
								message: "Plugin installed",
							});
						} else if (type === "datapack") {
							// Create directory
							try {
								fs.mkdirSync(
									path.join(
										server!.mountPath,
										"files",
										"world",
										"datapacks"
									),
									{ recursive: true }
								);
							} catch {}

							// Download file
							const { body: fileContent } = await fetch(file.url);
							const filePath = path.join(
								server!.mountPath,
								"files",
								"world",
								"datapacks",
								file.filename
							);

							try {
								await finished(
									// @ts-ignore
									Readable.fromWeb(fileContent).pipe(
										fs.createWriteStream(filePath)
									)
								);
							} catch {
								return res.status(500).json({
									status: "error",
									message: "Internal server error",
									error: "INTERNAL_SERVER_ERROR",
								});
							}

							return res.json({
								status: "success",
								message: "Datapack installed",
							});
						} else if (type === "modpack") {
							// Random tmp directory name
							let tmp = Buffer.from(
								Math.random().toString(16).slice(2),
								"hex"
							).toString("hex");

							// Create tmp directory
							try {
								fs.mkdirSync(
									path.join(server!.mountPath, "tmp-" + tmp),
									{
										recursive: true,
									}
								);
							} catch {}

							// Download modpack file
							const { body: fileContent } = await fetch(file.url);
							const filePath = path.join(
								server!.mountPath,
								"tmp-" + tmp,
								file.filename
							);

							try {
								await finished(
									// @ts-ignore
									Readable.fromWeb(fileContent).pipe(
										fs.createWriteStream(filePath)
									)
								);

								// Download install script
								fs.writeFileSync(
									path.join(
										server!.mountPath,
										"tmp-" + tmp,
										"mrpack-install.sh"
									),
									await (
										await fetch(
											`${FP_CONTENT_URL}/minecraft/mrpack-install.sh`
										)
									).text()
								);

								// Create pre init script
								fs.writeFileSync(
									path.join(
										server!.mountPath,
										"pre-init.d",
										`mrpack-install-${tmp}.sh`
									),
									"#!/bin/bash\n" +
										`chmod +x /app/tmp-${tmp}/mrpack-install.sh\n` +
										`./app/tmp-${tmp}/mrpack-install.sh "/app/tmp-${tmp}/${file.filename}" /app/files server true true\n` +
										`rm -rf /app/tmp-${tmp}\n` +
										`rm -- "$0"`
								);

								res.json({
									status: "success",
									message: "Modpack installed",
								});
							} catch {
								return res.status(500).json({
									status: "error",
									message: "Internal server error",
									error: "INTERNAL_SERVER_ERROR",
								});
							}
						} else {
							return res.status(500).json({
								status: "error",
								message: "Internal server error",
								error: "INTERNAL_SERVER_ERROR",
							});
						}
					} else {
						return res.status(400).json({
							status: "error",
							message: "Invalid plugin",
							error: "INVALID_PLUGIN",
						});
					}
				});
		} else {
			return res.status(400).json({
				status: "error",
				message: "You can't install plugins on this server",
				error: "PLUGIN_INSTALL_NOT_SUPPORTED",
			});
		}
	},
};
