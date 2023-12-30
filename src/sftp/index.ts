import { generateKeyPairSync } from "crypto";
import fs from "fs";
import path from "path";
import { Server, utils as sshUtils } from "ssh2";

import config from "../../config.json";
import { API, IS_DEBUG } from "../constants";
import { getServer } from "../utils/docker";
import logger from "./logger";

const STATUS_CODE = sshUtils.sftp.STATUS_CODE;

if (
	!fs.existsSync(path.join(__dirname, "..", "..", "keys", "sftp.key")) ||
	!fs.existsSync(path.join(__dirname, "..", "..", "keys", "sftp.cert"))
) {
	logger.info("Generating SFTP keys...");

	try {
		let keys = generateKeyPairSync("rsa", {
			modulusLength: 4096,
			publicKeyEncoding: {
				type: "pkcs1",
				format: "pem",
			},
			privateKeyEncoding: {
				type: "pkcs1",
				format: "pem",
			},
		});

		if (!fs.existsSync(path.join(__dirname, "..", "..", "keys")))
			fs.mkdirSync(path.join(__dirname, "..", "..", "keys"));

		fs.writeFileSync(
			path.join(__dirname, "..", "..", "keys", "sftp.key"),
			keys.privateKey
		);

		fs.writeFileSync(
			path.join(__dirname, "..", "..", "keys", "sftp.cert"),
			keys.publicKey
		);
	} catch (err: Error | any) {
		logger.error(
			"Une erreur est survenue lors de la génération des clés SSH"
		);
		if (IS_DEBUG) logger.error(err);
	}
}

let privateKey = sshUtils.parseKey(
	fs.readFileSync(path.join(__dirname, "..", "..", "keys", "sftp.key"))
);

if (privateKey instanceof Error) {
	logger.error(
		"Une erreur est survenue lors de la lecture de la clé SSH privée"
	);
	if (IS_DEBUG) logger.error(privateKey.toString());
	process.exit(1);
}

let sftpServer = new Server({
	hostKeys: [privateKey.getPrivatePEM()],
});

sftpServer.on("connection", (client, info) => {
	let user: {
		containerId: string;
		owner: boolean | undefined;
		permissions: string[] | undefined;
	} | null = null;
	let cwd = "/";
	let root: string;
	let openedDirs: {
		[key: string]: { path: string; sent: boolean };
	} = {};
	let openedFiles: {
		[key: string]: { path: string; read: boolean; wrote: boolean };
	} = {};
	let handleCount = 0;

	logger.info(`New SFTP connection from ${info.ip.magenta}`);

	client.on("authentication", async (ctx) => {
		if (ctx.method === "password") {
			let username = ctx.username;
			let password = ctx.password;

			logger.info(
				`Body: ${
					JSON.stringify({ username, password: "********" }).gray
				}`
			);
			logger.info(`User: ${info.ip.magenta}`);

			user = await fetch(`${API}/daemon/sftp`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${config.daemonToken}`,
				},
				body: JSON.stringify({
					username: username,
					password: password,
				}),
			})
				.then((res) => res.json())
				.then((res) => {
					if (res.status === "success" && res.data) return res.data;
					else return null;
				})
				.catch(() => null);

			if (!user) return ctx.reject(["password"]);

			let server = await getServer(user.containerId);
			if (!server) return ctx.reject(["password"]);

			root = path.join(server.mountPath, "files");

			logger.info(`User ${username.cyan} (${info.ip.magenta}) logged in`);

			ctx.accept();
		} else {
			ctx.reject(["password"]);
		}
	});

	client.on("ready", () => {
		client.on("session", (accept, reject) => {
			let session = accept();

			session.on("sftp", (accept, reject) => {
				let sftpStream = accept();

				sftpStream.on("REALPATH", (reqid, reqPath) => {
					try {
						const { clientPath, fsPath } = resolvePath(reqPath);

						let stats = fs.statSync(fsPath);
						if (!stats.isDirectory()) {
							return sftpStream.status(
								reqid,
								STATUS_CODE.NO_SUCH_FILE,
								`"${clientPath}" is not a directory`
							);
						}

						return sftpStream.name(reqid, [
							{
								filename: clientPath,
								longname: getLongName(reqPath, stats),
								attrs: {
									...stats,
									atime: stats.atimeMs,
									mtime: stats.mtimeMs,
								},
							},
						]);
					} catch {
						return sftpStream.status(
							reqid,
							STATUS_CODE.NO_SUCH_FILE,
							`"${path}" does not exist`
						);
					}
				});

				sftpStream.on("OPENDIR", (reqid, reqPath) => {
					try {
						openedDirs[reqPath] = {
							path: reqPath,
							sent: false,
						};

						return sftpStream.handle(reqid, Buffer.from(reqPath));
					} catch {
						return sftpStream.status(
							reqid,
							STATUS_CODE.NO_SUCH_FILE,
							`"${path}" does not exist`
						);
					}
				});

				sftpStream.on("READDIR", (reqid, reqPath) => {
					if (!hasPermission("server.files.list")) {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}

					if (openedDirs[reqPath.toString()].sent) {
						return sftpStream.status(
							reqid,
							STATUS_CODE.EOF,
							"End of directory"
						);
					}

					try {
						const { clientPath, fsPath } = resolvePath(reqPath);

						let fileNames = fs.readdirSync(fsPath);
						let files = fileNames.map((fileName) => {
							let filePath = path.join(fsPath, fileName);
							fs.accessSync(filePath, fs.constants.F_OK);

							let stats = fs.statSync(filePath);

							return {
								filename: getFileName(
									path.join(clientPath, fileName)
								),
								longname: getLongName(filePath, stats),
								attrs: {
									...stats,
									atime: stats.atimeMs / 1000,
									mtime: stats.mtimeMs / 1000,
								},
							};
						});

						if (openedDirs[reqPath.toString()].sent) {
							return sftpStream.status(
								reqid,
								STATUS_CODE.EOF,
								"End of directory"
							);
						}

						openedDirs[reqPath.toString()].sent = true;

						return sftpStream.name(reqid, files);
					} catch {
						return sftpStream.status(
							reqid,
							STATUS_CODE.NO_SUCH_FILE,
							`"${path}" does not exist`
						);
					}
				});

				sftpStream.on("CLOSE", (reqid, handle) => {
					if (openedDirs[handle.toString()])
						delete openedDirs[handle.toString()];

					if (openedFiles[handle.toString()])
						delete openedFiles[handle.toString()];

					return sftpStream.status(reqid, STATUS_CODE.OK);
				});

				sftpStream.on("STAT", (reqid, reqPath) => {
					if (!hasPermission("server.files.read")) {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}

					try {
						const { fsPath } = resolvePath(reqPath);

						let stats = fs.statSync(fsPath);

						return sftpStream.attrs(reqid, {
							atime: stats.atimeMs,
							gid: stats.gid,
							mode: stats.mode,
							mtime: stats.mtimeMs,
							size: stats.size,
							uid: stats.uid,
						});
					} catch {
						return sftpStream.status(
							reqid,
							STATUS_CODE.NO_SUCH_FILE,
							`"${path}" does not exist`
						);
					}
				});

				sftpStream.on("FSETSTAT", (reqid, handle, attrs) => {
					return sftpStream.status(reqid, STATUS_CODE.OK);
				});

				sftpStream.on("FSTAT", (reqid, handle) => {
					if (!hasPermission("server.files.read")) {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}

					try {
						let fd = parseInt(handle.toString());

						let stats = fs.fstatSync(fd);

						return sftpStream.attrs(reqid, {
							atime: stats.atimeMs,
							gid: stats.gid,
							mode: stats.mode,
							mtime: stats.mtimeMs,
							size: stats.size,
							uid: stats.uid,
						});
					} catch {
						return sftpStream.status(
							reqid,
							STATUS_CODE.NO_SUCH_FILE,
							`"${path}" does not exist`
						);
					}
				});

				sftpStream.on("LSTAT", (reqid, reqPath) => {
					if (!hasPermission("server.files.read")) {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}

					try {
						const { fsPath } = resolvePath(reqPath);

						let stats = fs.lstatSync(fsPath);

						return sftpStream.attrs(reqid, {
							atime: stats.atimeMs,
							gid: stats.gid,
							mode: stats.mode,
							mtime: stats.mtimeMs,
							size: stats.size,
							uid: stats.uid,
						});
					} catch {
						return sftpStream.status(
							reqid,
							STATUS_CODE.NO_SUCH_FILE,
							`"${path}" does not exist`
						);
					}
				});

				sftpStream.on("MKDIR", (reqid, reqPath, attrs) => {
					if (!hasPermission("server.files.write")) {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}

					try {
						const { clientPath, fsPath } = resolvePath(reqPath);

						if (fs.existsSync(fsPath)) {
							return sftpStream.status(
								reqid,
								STATUS_CODE.FAILURE,
								`"${clientPath}" already exists`
							);
						}
						fs.mkdirSync(fsPath, attrs.mode);

						return sftpStream.status(reqid, STATUS_CODE.OK);
					} catch {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}
				});

				sftpStream.on("OPEN", (reqid, reqPath, flags, attrs) => {
					try {
						const handle = Buffer.from((handleCount++).toString());
						openedFiles[handle.toString()] = {
							path: reqPath,
							read: false,
							wrote: false,
						};

						return sftpStream.handle(reqid, handle);
					} catch {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}
				});

				sftpStream.on("READ", (reqid, handle, offset, length) => {
					if (!hasPermission("server.files.read")) {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}

					try {
						if (!openedFiles[handle.toString()]) {
							return sftpStream.status(
								reqid,
								STATUS_CODE.FAILURE,
								`"${handle.toString()}" is not a valid handle`
							);
						}

						if (openedFiles[handle.toString()].read) {
							return sftpStream.status(
								reqid,
								STATUS_CODE.EOF,
								"End of file"
							);
						}

						const { fsPath } = resolvePath(
							openedFiles[handle.toString()].path
						);

						const stream = fs.createReadStream(fsPath, {
							flags: "r",
							start: offset,
							end: offset + length,
						});

						let data: Uint8Array = new Uint8Array(0);
						stream.on("data", (chunk: Buffer) => {
							data = new Uint8Array([...data, ...chunk]);
						});

						stream.on("close", () => {
							if (data.length === 0) {
								openedFiles[handle.toString()].read = true;
								return sftpStream.status(
									reqid,
									STATUS_CODE.EOF,
									"End of file"
								);
							}

							return sftpStream.data(reqid, Buffer.from(data));
						});
					} catch {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}
				});

				sftpStream.on("WRITE", (reqid, handle, offset, data) => {
					if (!hasPermission("server.files.write")) {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}

					try {
						if (!openedFiles[handle.toString()]) {
							return sftpStream.status(
								reqid,
								STATUS_CODE.FAILURE,
								`"${handle.toString()}" is not a valid handle`
							);
						}

						if (openedFiles[handle.toString()].wrote) {
							return sftpStream.status(
								reqid,
								STATUS_CODE.EOF,
								"End of file"
							);
						}

						const { fsPath } = resolvePath(
							openedFiles[handle.toString()].path
						);

						const stream = fs.createWriteStream(fsPath, {
							flags: "w",
							start: offset,
						});

						stream.write(data);
						stream.end();

						return stream.on("close", () => {
							return sftpStream.status(reqid, STATUS_CODE.OK);
						});
					} catch {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}
				});

				sftpStream.on("READLINK", (reqid, reqPath) => {
					if (!hasPermission("server.files.read")) {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}

					try {
						const { fsPath } = resolvePath(reqPath);

						let link = fs.readlinkSync(fsPath);

						return sftpStream.name(reqid, [
							{
								filename: link,
								longname: getLongName(reqPath),
								attrs: {
									atime: Date.now(),
									gid: 0,
									mode: 0o777,
									mtime: Date.now(),
									size: link.length,
									uid: 0,
									isDirectory: () => false,
									isFile: () => true,
									isBlockDevice: () => false,
									isCharacterDevice: () => false,
									isSymbolicLink: () => false,
									isFIFO: () => false,
									isSocket: () => false,
								},
							},
						]);
					} catch {
						return sftpStream.status(
							reqid,
							STATUS_CODE.FAILURE,
							`"${path}" does not exist`
						);
					}
				});

				sftpStream.on("REMOVE", (reqid, reqPath) => {
					if (!hasPermission("server.files.delete")) {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}

					try {
						const { fsPath } = resolvePath(reqPath);

						if (fs.statSync(fsPath).isDirectory())
							fs.rmSync(fsPath, { recursive: true, force: true });
						else fs.unlinkSync(fsPath);

						return sftpStream.status(reqid, STATUS_CODE.OK);
					} catch {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}
				});

				sftpStream.on("RENAME", (reqid, oldPath, newPath) => {
					if (!hasPermission("server.files.rename")) {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}

					try {
						const { fsPath: oldClientPath } = resolvePath(oldPath);
						const { fsPath: newClientPath } = resolvePath(newPath);

						fs.renameSync(oldClientPath, newClientPath);

						return sftpStream.status(reqid, STATUS_CODE.OK);
					} catch {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}
				});

				sftpStream.on("RMDIR", (reqid, reqPath) => {
					if (!hasPermission("server.files.delete")) {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}

					try {
						const { fsPath } = resolvePath(reqPath);

						fs.rmSync(fsPath, { recursive: true, force: true });

						return sftpStream.status(reqid, STATUS_CODE.OK);
					} catch {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}
				});

				sftpStream.on("SETSTAT", (reqid, reqPath, attrs) => {
					if (!hasPermission("server.files.write")) {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}

					try {
						const { fsPath } = resolvePath(reqPath);

						fs.chmodSync(fsPath, attrs.mode);

						return sftpStream.status(reqid, STATUS_CODE.OK);
					} catch {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}
				});

				sftpStream.on("SYMLINK", (reqid, linkPath, targetPath) => {
					if (!hasPermission("server.files.write")) {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}

					try {
						const { fsPath: linkClientPath } =
							resolvePath(linkPath);
						const { fsPath: targetClientPath } =
							resolvePath(targetPath);

						fs.symlinkSync(targetClientPath, linkClientPath);

						return sftpStream.status(reqid, STATUS_CODE.OK);
					} catch {
						return sftpStream.status(
							reqid,
							STATUS_CODE.PERMISSION_DENIED,
							`Permission denied`
						);
					}
				});
			});
		});
	});

	function resolvePath(reqPath: string | Buffer = ".") {
		if (Buffer.isBuffer(reqPath)) reqPath = reqPath.toString();

		const UNIX_SEP_REGEX = /\//g;
		const WIN_SEP_REGEX = /\\/g;

		const resolvedPath = reqPath.replace(WIN_SEP_REGEX, "/");

		const joinedPath = path.isAbsolute(resolvedPath)
			? path.normalize(resolvedPath)
			: path.join("/", cwd, resolvedPath);

		let fsPath = path
			.resolve(path.join(root, joinedPath))
			.replace(UNIX_SEP_REGEX, path.sep)
			.replace(WIN_SEP_REGEX, path.sep);

		if (fsPath.indexOf(root) !== 0)
			fsPath = path
				.join(root, path.sep)
				.replace(UNIX_SEP_REGEX, path.sep)
				.replace(WIN_SEP_REGEX, path.sep);

		const clientPath = joinedPath.replace(WIN_SEP_REGEX, "/");

		return {
			clientPath,
			fsPath,
		};
	}

	function getFileName(reqPath = ".") {
		const { clientPath } = resolvePath(reqPath);

		let fileName = clientPath.split(path.sep).pop();
		if (!fileName) fileName = path.sep;

		return fileName;
	}

	function getLongName(reqPath = ".", stats?: fs.Stats) {
		const { clientPath, fsPath } = resolvePath(reqPath);

		if (!stats) stats = fs.statSync(fsPath);

		function getPermFromChar(char: string) {
			switch (char) {
				case "0":
					return "---";
				case "1":
					return "--x";
				case "2":
					return "-w-";
				case "3":
					return "-wx";
				case "4":
					return "r--";
				case "5":
					return "r-x";
				case "6":
					return "rw-";
				case "7":
					return "rwx";
				default:
					return "---";
			}
		}

		let unixPerm = stats.mode.toString(8).slice(-3);
		let unixPermString = "";
		for (let i = 0; i < unixPerm.length; i++) {
			unixPermString += getPermFromChar(unixPerm[i]);
		}

		if (stats.isDirectory()) unixPermString = `d${unixPermString}`;
		else if (stats.isSymbolicLink()) unixPermString = `l${unixPermString}`;
		else unixPermString = `-${unixPermString}`;

		let fileName = clientPath.split("/").pop();
		if (!fileName) fileName = "/";

		let date = new Date(stats.mtimeMs)
			.toLocaleString("en-US", {
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
			})
			.replace(",", "");

		return `${unixPermString} ${stats.nlink} ${stats.uid} ${stats.gid} ${stats.size} ${date} ${fileName}`;
	}

	function hasPermission(permission: string) {
		return user?.permissions?.includes(permission) || user?.owner;
	}
});

sftpServer.listen(config.sftpPort || 2022, () => {
	logger.info(
		`SFTP server started on port ${
			(config.sftpPort.toString() || "2022").yellow
		}`
	);
});
