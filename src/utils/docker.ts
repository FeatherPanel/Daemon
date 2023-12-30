import { spawn } from "child_process";
import Docker from "dockerode";
import os from "os";
import { Stream } from "stream";

import { API, CONFIG } from "../constants";
import { unicode_utf8 } from "./string";

let Servers: Map<string, Server> = new Map();

export const docker = new Docker({
	socketPath:
		(os.platform() === "linux" ? "/" : "//./pipe/") + "var/run/docker.sock",
});

export async function checkForImage(
	imageName: string,
	_callback: (err: any) => void
) {
	let image = docker.getImage(imageName);

	if (!image) {
		let pullImage = spawn("docker", ["pull", imageName]);

		pullImage.on("error", async (err) => {
			return _callback(err);
		});

		pullImage.on("close", async (code) => {
			if (code !== 0) return _callback("Error while pulling image");

			let image = docker.getImage(imageName);

			if (!image) return _callback("Error while pulling image");

			return _callback(null);
		});
	}

	return _callback(null);
}

export async function getServer(
	containerId: string
): Promise<Server | undefined> {
	let server = Servers.get(containerId);

	if (server) {
		server.refresh();
		return server;
	} else {
		let server = new Server(containerId);
		if (!(await server.init())) return undefined;

		return server;
	}
}

export class Server {
	containerId: string;
	serverId = "";
	labels: { [key: string]: string } = {};

	container = docker.getContainer("");
	volume = docker.getVolume("");
	mountPath = "";

	logStream: NodeJS.ReadableStream = new Stream.PassThrough();
	attachStream: NodeJS.ReadWriteStream = new Stream.PassThrough();

	initialized = false;
	running = false;

	constructor(containerId: string) {
		this.containerId = containerId;
	}

	async init() {
		if (this.initialized) return true;

		this.container = docker.getContainer(this.containerId);
		if (this.container.id !== this.containerId) return false;

		if (
			!(await this.container.inspect()).Config.Image.includes(
				"featherpanel/"
			)
		)
			return false;

		this.serverId = (await this.container.inspect()).Config.Labels[
			"featherpanel.server.id"
		];
		if (!this.serverId || !this.serverId.match(/^[A-Z]{6}$/)) return false;

		this.volume = docker.getVolume(this.serverId);
		if (
			(await docker.listVolumes({ filters: { name: [this.serverId] } }))
				.Volumes.length === 0
		)
			return false;

		this.mountPath = (await this.volume.inspect()).Mountpoint;

		this.labels = (await this.container.inspect()).Config.Labels;

		this.initialized = true;
		this.refresh();

		Servers.set(this.containerId, this);

		return true;
	}

	async refresh(forceRefresh = false) {
		if (!this.initialized) return;

		let inspect = await this.container!.inspect();

		// Server started
		if ((!this.running && inspect.State.Running) || forceRefresh) {
			this.logStream.removeAllListeners();
			this.attachStream.removeAllListeners();

			this.logStream = await this.container!.logs({
				follow: true,
				stdout: true,
				stderr: true,
				tail: 0,
			});

			this.attachStream = await this.container!.attach({
				stream: true,
				stdout: true,
				stderr: true,
				stdin: true,
			});

			this.logStream.on("data", (data) => {
				fetch(`${API}/daemon/servers/logs`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${CONFIG.daemonToken}`,
					},
					body: JSON.stringify({
						containerId: this.containerId,
						logs: unicode_utf8(data.toString("utf-8")),
					}),
				}).catch(() => {});
			});
		}

		// Server stopped
		if (!inspect.State.Running && this.running) {
			this.logStream.removeAllListeners();
			this.attachStream.removeAllListeners();
		}

		this.running = inspect.State.Running;
	}

	destroy() {
		if (!this.initialized) return;

		this.logStream.removeAllListeners();
		this.attachStream.removeAllListeners();

		this.initialized = false;
		this.running = false;

		this.container!.remove({ force: true })
			.then(() => {
				this.volume!.remove({ force: true }).catch(() => {});
			})
			.catch(() => {});

		Servers.delete(this.containerId);
	}
}
