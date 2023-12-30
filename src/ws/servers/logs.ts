// import { Socket } from "socket.io";

// import { docker } from "../../utils/docker";
// import { validToken } from "../../utils/token";

// module.exports = async (socket: Socket, containerId: string) => {
// 	if (!validToken(socket.handshake.auth.token))
// 		return socket.emit("servers/logs", {
// 			status: "error",
// 			message: "Access token is missing or invalid",
// 			error: "UNAUTHORIZED",
// 		});

// 	if (typeof containerId !== "string")
// 		return socket.emit("servers/logs", {
// 			status: "error",
// 			message: "Invalid container ID",
// 			error: "INVALID_CONTAINER_ID",
// 		});

// 	let container = docker.getContainer(containerId);
// 	if (!container)
// 		return socket.emit("servers/logs", {
// 			status: "error",
// 			message: "Container not found",
// 			error: "CONTAINER_NOT_FOUND",
// 		});

// 	// get new messages from container but NOT history
// 	container.logs(
// 		{
// 			follow: true,
// 			stdout: true,
// 			stderr: true,
// 			timestamps: true,
// 			tail: 0,
// 		},
// 		(err, stream) => {
// 			if (err) {
// 				return socket.emit("servers/logs", {
// 					status: "error",
// 					message: "An error occured while getting logs",
// 					error: "DOCKER_ERROR",
// 				});
// 			}

// 			if (stream) {
// 				container.modem.demuxStream(stream, socket, process.stdout);
// 				stream.on("end", () => {
// 					socket.emit("servers/logs", {
// 						status: "error",
// 						message: "Stream ended",
// 						error: "STREAM_ENDED",
// 					});
// 				});
// 			}
// 		}
// 	);
// };
