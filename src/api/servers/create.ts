import checkDiskSpace from "check-disk-space";
import { execSync } from "child_process";
import { Container } from "dockerode";
import { Request, Response } from "express";
import fetch from "node-fetch";
import os from "os";

import { FP_CONTENT_URL } from "../../constants";
import { checkForImage, docker } from "../../utils/docker";
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

		if (
			!req.body ||
			typeof req.body.name !== "string" ||
			typeof req.body.owner !== "string" ||
			typeof req.body.game !== "object" ||
			typeof req.body.game.name !== "string" ||
			typeof req.body.game.data !== "object" ||
			typeof req.body.serverId !== "string" ||
			typeof req.body.port !== "number" ||
			typeof req.body.extraPorts !== "string" ||
			typeof req.body.cpu !== "number" ||
			typeof req.body.ram !== "number" ||
			typeof req.body.disk !== "number"
		)
			return res.status(400).json({
				status: "error",
				message: "Bad request",
				error: "BAD_REQUEST",
			});

		let name = req.body.name;
		let owner = req.body.owner;
		let game = req.body.game;
		let serverId = req.body.serverId;
		let port = req.body.port;
		let extraPorts = req.body.extraPorts;
		let cpu = req.body.cpu;
		let ram = req.body.ram;
		let disk = req.body.disk;

		if (cpu > os.cpus().length)
			return res.status(400).json({
				status: "error",
				message: "Not enough CPU cores",
				error: "NOT_ENOUGH_CPU_ON_NODE",
			});

		if (ram > os.totalmem())
			return res.status(400).json({
				status: "error",
				message: "Not enough RAM",
				error: "NOT_ENOUGH_RAM_ON_NODE",
			});

		let diskSpace = await checkDiskSpace(__dirname).then((diskSpace) => {
			return diskSpace.free;
		});

		if (disk > diskSpace)
			return res.status(400).json({
				status: "error",
				message: "Not enough disk space",
				error: "NOT_ENOUGH_DISK_ON_NODE",
			});

		if (game.name === "minecraft") {
			let portBindings: { [key: string]: any } = {
				"25565/tcp": [
					{
						HostPort: port.toString(),
					},
				],
			};
			extraPorts.split(",").forEach((port: string) => {
				portBindings[port + "/tcp"] = [
					{
						HostPort: port,
					},
				];
			});

			let BASE_GAME_URL = `${FP_CONTENT_URL}/minecraft/${game.data.type}/${game.data.version}`;
			if (game.data?.version2 && game.data.version2.toString().length > 0)
				BASE_GAME_URL += "/" + game.data.version2;
			if (game.data.version3 && game.data.version3.toString().length > 0)
				BASE_GAME_URL += "/" + game.data.version3;

			const INSTALL_URL = `${BASE_GAME_URL}/install.sh`;
			const RUN_URL = `${BASE_GAME_URL}/run.sh&ram=${ram}`;
			const JSON_URL = `${BASE_GAME_URL}/install.json&ram=${ram}`;

			const START_COMMAND = await fetch(JSON_URL)
				.then((res) => res.json())
				.then((res) => {
					if (res.status === "success" && res.data?.run)
						return res.data.run;
					else return "";
				});

			return checkForImage(
				"featherpanel/minecraft:latest",
				async (err: any) => {
					if (err) {
						res.status(500).json({
							status: "error",
							message: "Error while pulling image",
							error: "DOCKER_ERROR",
							debug: err.toString(),
						});

						execSync('docker pull "featherpanel/minecraft:latest"');

						return;
					}

					await docker.createVolume({
						Name: serverId,
					});

					let container = await docker
						.createContainer({
							Image: "featherpanel/minecraft:latest",
							name: serverId,
							Env: [
								`INSTALL_URL=${INSTALL_URL}`,
								`RUN_URL=${RUN_URL}`,
								`JAVA_VERSION=temurin-21-jre-amd64`,
							],
							Tty: true,
							OpenStdin: true,
							StdinOnce: false,
							Volumes: {
								"/app": {},
							},
							HostConfig: {
								PortBindings: portBindings,
								AutoRemove: false,
								RestartPolicy: {
									Name: "on-failure",
									MaximumRetryCount: 2,
								},
								CpuShares: Math.floor(1024 / (100 / cpu)),
								Memory: Math.floor(ram * 1024 * 1024),
								DiskQuota: Math.floor(
									disk * 1024 * 1024 * 1024
								),
								Mounts: [
									{
										Type: "volume",
										Source: serverId,
										Target: "/app",
										ReadOnly: false,
									},
								],
							},
							ExposedPorts: {
								"25565/tcp": {},
							},
							Labels: {
								"featherpanel.server.id": serverId,
								"featherpanel.server.owner":
									owner.toLowerCase(),
								"featherpanel.server.game": game.name,
								"featherpanel.server.name": name,
								"featherpanel.server.port": port.toString(),
								"featherpanel.server.extraPorts": extraPorts,
								"featherpanel.server.cpu": cpu.toString(),
								"featherpanel.server.ram": ram.toString(),
								"featherpanel.server.disk": (
									disk *
									1024 *
									1024 *
									1024
								).toString(),
							},
						})
						.then(async (container) => {
							return container;
						})
						.catch((err) => {
							return err;
						});

					if (container instanceof Container) {
						res.status(200).json({
							status: "success",
							message: "Server created successfully",
							data: {
								id: container.id,
								startCommand: START_COMMAND,
							},
						});

						await container.start();
					} else {
						res.status(500).json({
							status: "error",
							message: "Internal server error",
							error: "INTERNAL_SERVER_ERROR",
							debug: container.toString(),
						});
					}
				}
			);
		} else {
			res.status(400).json({
				status: "error",
				message: "Invalid game",
				error: "INVALID_GAME",
			});
		}
	},
};
