import "./utils/power";

import bodyParser from "body-parser";
import colors from "colors";
import cors from "cors";
import express from "express";
import fs from "fs";
import http from "http";
import https from "https";
import multer from "multer";
import fetch from "node-fetch";
import path from "path";
import requireAll from "require-all";
import serveStatic from "serve-static";
import { Server } from "socket.io";

import { API, FPD_COMMAND, IS_DEBUG, VERSION } from "./constants";
import { checkDocker, daemonConfig } from "./scripts/config";
import logger from "./utils/logger";

let config: any = {};
if (fs.existsSync(path.join(__dirname, "..", "config.json"))) {
	if (IS_DEBUG) logger.debug("Reading config.json...");
	try {
		config = JSON.parse(
			fs
				.readFileSync(path.join(__dirname, "..", "config.json"))
				.toString()
		);
	} catch (error) {
		if (IS_DEBUG) logger.debug("Failed to parse config.json.");
		if (IS_DEBUG) logger.debug("ERROR:", error);
	}
}

if (!fs.existsSync(path.join(__dirname, "..", "config.json"))) {
	logger.debug("config.json not found.");
	logger.debug("Running daemon configuration...");
	daemonConfig();
} else {
	(async () => {
		/* Docker */
		await checkDocker();

		/* API */
		if (IS_DEBUG) logger.debug("Connecting to API...");
		await fetch(`${API}/daemon/connect`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${config.daemonToken}`,
			},
			body: JSON.stringify({
				id: config.nodeId,
				ssl: config.ssl,
				sftpPort: config.sftpPort,
			}),
		})
			.then((res) => res.json())
			.then((json) => {
				if (!json.status || json.status !== "success") {
					if (json.error && json.error == "UNAUTHORIZED") {
						logger.error(
							"Le token du daemon est invalide. Veuillez vérifier le token dans le fichier config.json."
						);
					} else if (json.error && json.error == "NODE_NOT_FOUND") {
						logger.error(
							`Cette machine n'est pas enregistrée dans la base de données. Veuillez relancer la configuration du daemon avec la commande ${colors.cyan.bold(
								FPD_COMMAND + " config"
							)}.`
						);
					} else {
						logger.error(
							"Une erreur est survenue lors de la tentative de connexion à l'API. Veuillez vérifier votre URL et votre token dans le fichier config.json."
						);
					}

					if (IS_DEBUG) logger.debug("ERROR:", json);

					console.log();
					process.exit(1);
				}
			})
			.catch((error) => {
				logger.error(
					"Une erreur est survenue lors de la tentative de connexion à l'API. Veuillez vérifier votre URL et votre token dans le fichier config.json."
				);
				if (IS_DEBUG) logger.debug("ERROR:", error);

				console.log();
				process.exit(1);
			});

		/* Purge tmp */
		logger.debug("Purging tmp folder...");
		try {
			if (fs.existsSync(path.join(__dirname, "..", "tmp")))
				fs.rmSync(path.join(__dirname, "..", "tmp"), {
					recursive: true,
				});
			fs.mkdirSync(path.join(__dirname, "..", "tmp"));
		} catch {
			logger.error(
				"Une erreur est survenue lors de la tentative de purge du dossier tmp."
			);
			console.log();
			process.exit(1);
		}

		/* Daemon server */
		logger.debug("Starting daemon server...");
		const app = express();
		const upload = multer();
		app.use(
			serveStatic(path.join(__dirname, "..", "public"), {
				maxAge: "1y",
				dotfiles: "ignore",
			})
		);
		app.use(bodyParser.json());
		app.use(bodyParser.urlencoded({ extended: true }));
		app.use(
			cors({
				origin: "*",
				methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
				allowedHeaders: ["Content-Type", "Authorization"],
			})
		);

		app.all("*", upload.any(), async (req, res) => {
			console.log();
			logger.info(`Request: ${req.method.green} ${req.originalUrl.cyan}`);
			logger.info(
				`Body: ${
					JSON.stringify(req.body).replace(
						/"password":"(.*)"/g,
						'"password":"********"'
					).gray
				}`
			);
			logger.info(`Headers: ${JSON.stringify(req.headers).gray}`);
			logger.info(`User: ${(req.ip || "unknown").magenta}`);
			console.log();

			const events = requireAll({
				dirname: path.join(__dirname, "api"),
				filter: /(.+)\.ts$/,
				recursive: true,
			});

			const urlDecomposed = req.originalUrl.split("/");
			urlDecomposed.shift();

			let lastEvent = events;
			for (let urlPart of urlDecomposed) {
				if (typeof lastEvent === "undefined") {
					res.status(404).json({
						status: "error",
						message: "Resource not found",
						error: "NOT_FOUND",
					});
					return;
				}

				if (lastEvent[urlPart]) {
					const event = lastEvent[urlPart][req.method.toLowerCase()];

					if (event && typeof event === "function") {
						try {
							event(req, res);
						} catch {
							res.status(404).json({
								status: "error",
								message: "Resource not found",
								error: "NOT_FOUND",
							});
						}
						return;
					}

					if (lastEvent[urlPart]["methods"]) {
						if (req.method.toLowerCase() === "options") {
							res.header(
								"Allow",
								lastEvent[urlPart]["methods"].join(",")
							);
							res.header(
								"Access-Control-Allow-Methods",
								lastEvent[urlPart]["methods"].join(",") +
									",OPTIONS"
							);
							res.header(
								"Access-Control-Allow-Headers",
								"Content-Type, Authorization"
							);
							res.header("Access-Control-Allow-Origin", "*");
							res.status(200);
							res.send();
							return;
						}

						return res.status(405).json({
							status: "error",
							message: "Method Not Allowed",
							allowedMethods: lastEvent[urlPart]["methods"],
						});
					}
				}

				lastEvent = lastEvent[urlPart];
			}

			res.status(404).json({
				status: "error",
				message: "Resource not found",
				error: "NOT_FOUND",
			});
		});

		let server: https.Server | http.Server;
		if (
			config.ssl &&
			fs.existsSync(path.join(__dirname, "..", "ssl", "key.pem")) &&
			fs.existsSync(path.join(__dirname, "..", "ssl", "cert.pem"))
		) {
			server = https
				.createServer(
					{
						key: fs.readFileSync(
							path.join(__dirname, "..", "ssl", "key.pem")
						),
						cert: fs.readFileSync(
							path.join(__dirname, "..", "ssl", "cert.pem")
						),
					},
					app
				)
				.listen(1024, async () => {
					console.log(
						"\
			 ______         _   _                 _____                 _ \r\n\
			|  ____|       | | | |               |  __ \\               | |\r\n\
			| |__ ___  __ _| |_| |__   ___ _ __  | |__) |_ _ _ __   ___| |\r\n\
			|  __/ _ \\/ _` | __| '_ \\ / _ \\ '__| |  ___/ _` | '_ \\ / _ \\ |\r\n\
			| | |  __/ (_| | |_| | | |  __/ |    | |  | (_| | | | |  __/ |\r\n\
			|_|  \\___|\\__,_|\\__|_| |_|\\___|_|    |_|   \\__,_|_| |_|\\___|_|\r\n\
					".america
					);
					console.log(
						`\tv${VERSION}\t\t`.yellow +
							"https://featherpanel.natoune.fr".cyan +
							"\r\n\n"
					);

					logger.info(
						`FeatherDaemon est lancé sur le port ${
							"1024".yellow
						} avec SSL`
					);
				});
		} else {
			server = http.createServer(app).listen(1024, async () => {
				console.log(
					"\
 ______         _   _                 _____                 _ \r\n\
|  ____|       | | | |               |  __ \\               | |\r\n\
| |__ ___  __ _| |_| |__   ___ _ __  | |__) |_ _ _ __   ___| |\r\n\
|  __/ _ \\/ _` | __| '_ \\ / _ \\ '__| |  ___/ _` | '_ \\ / _ \\ |\r\n\
| | |  __/ (_| | |_| | | |  __/ |    | |  | (_| | | | |  __/ |\r\n\
|_|  \\___|\\__,_|\\__|_| |_|\\___|_|    |_|   \\__,_|_| |_|\\___|_|\r\n\
		".america
				);
				console.log(
					`\tv${VERSION}\t\t`.yellow +
						"https://featherpanel.natoune.fr".cyan +
						"\r\n\n"
				);

				logger.info(
					`FeatherDaemon est lancé sur le port ${"1024".yellow}`
				);
			});
		}

		/* Socket */
		const io = new Server(server, {
			cors: {
				origin: "*",
			},
		});
		io.on("connection", (socket) => {
			socket.onAny((event, ...args) => {
				console.log();
				logger.info(
					`[WS] ${socket.handshake.address.magenta} - ${
						event.cyan
					} - ${JSON.stringify(args).gray}`
				);
				console.log();

				const events = requireAll({
					dirname: path.join(__dirname, "ws"),
					filter: /(.+)\.ts$/,
					recursive: true,
				});

				let lastEvent = events;
				for (let urlPart of event.split("/")) {
					if (typeof lastEvent === "undefined") {
						socket.emit("error", {
							status: "error",
							message: "Resource not found",
							error: "NOT_FOUND",
						});
						return;
					}

					if (lastEvent[urlPart]) {
						const event = lastEvent[urlPart];

						if (typeof event === "function") {
							try {
								event(socket, ...args);
							} catch {
								socket.emit("error", {
									status: "error",
									message: "Resource not found",
									error: "NOT_FOUND",
								});
							}
							return;
						}
					}

					lastEvent = lastEvent[urlPart];
				}

				socket.emit("error", {
					status: "error",
					message: "Resource not found",
					error: "NOT_FOUND",
				});

				return;
			});
		});

		/* SFTP */
		import("./sftp/index");
	})();
}
