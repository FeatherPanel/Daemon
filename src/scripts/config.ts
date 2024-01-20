import colors from "colors";
import Docker from "dockerode";
import { Confirm, Input, NumberPrompt } from "enquirer";
import fs from "fs";
import fetch from "node-fetch";
import os from "os";
import path from "path";

const docker = new Docker({
	socketPath:
		(os.platform() === "linux" ? "/" : "//./pipe/") + "var/run/docker.sock",
});

const FPD_COMMAND = process.platform === "win32" ? "fpd" : "./fpd";
const IS_DEBUG =
	process.env.NODE_ENV === "development" || process.argv.includes("--debug");

export async function daemonConfig() {
	let config: any = {};

	await checkDocker();

	let [ip, ipLoc] = await fetch(
		"http://ip-api.com/json?fields=query,city,country",
		{
			method: "GET",
		}
	)
		.then((resp) => resp.json())
		.then((resp: any) => [resp.query, resp.city + ", " + resp.country])
		.catch((error: any) => {
			if (IS_DEBUG) console.debug("ERROR:", error);
			console.log(
				colors.red(
					"Impossible de récupérer votre adresse IP publique. Veuillez la rentrer manuellement."
				)
			);
			return new Input({
				name: "ip",
				message: "Entrez votre adresse IP publique",
			})
				.run()
				.then((answer: any) => [answer, ""])
				.catch(() => process.exit(0));
		});

	let name = await new Input({
		name: "name",
		message: "Définissez un nom pour cette machine",
		initial: os.hostname(),
	})
		.run()
		.then((answer: any) => answer)
		.catch(() => process.exit(0));

	let sftpPort = await new NumberPrompt({
		name: "sftpPort",
		message: "Entrez le port SFTP",
		initial: 2022,
	})
		.run()
		.then((answer: any) => answer)
		.catch(() => process.exit(0));

	let useSSL = await new Confirm({
		name: "useSSL",
		message:
			"Voulez-vous utiliser SSL ? Si oui, vous devez configurer un certificat ou utiliser un reverse proxy (voir https://featherpanel.natoune.fr/docs/daemon/ssl)",
	})
		.run()
		.then((answer: any) => answer)
		.catch(() => process.exit(0));

	let panelUrl = await new Input({
		name: "panelUrl",
		message: "Entrez l'URL de votre panel",
		initial: "https://featherpanel.natoune.fr/demo",
	})
		.run()
		.then((answer: any) => answer)
		.catch(() => process.exit(0));

	let daemonToken = await new Input({
		name: "daemonToken",
		message:
			"Entrez l'identifiant de daemon secret de votre panel (voir https://featherpanel.natoune.fr/docs/daemon/get-token)",
	})
		.run()
		.then((answer: any) => answer)
		.catch(() => process.exit(0));

	let location = await new Input({
		name: "location",
		message: "Entrez l'emplacement de cette machine (ex: Paris, France)",
		initial: ipLoc,
	})
		.run()
		.then((answer: any) => answer)
		.catch(() => process.exit(0));

	config = {
		dockerExec: config.dockerExec,
		sftpPort: sftpPort,
		ssl: useSSL,
		panelUrl: panelUrl,
		daemonToken: daemonToken,
	};

	await fetch(`${config.panelUrl + "/api/v1"}/daemon/register`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${config.daemonToken}`,
		},
		body: JSON.stringify({
			name: name,
			address: ip,
			daemonPort: 1024,
			sftpPort: config.sftpPort,
			location: location,
			ssl: config.ssl,
		}),
	})
		.then((resp) => resp.json())
		.then((resp: any) => {
			if (resp.status == "success" && resp.data && resp.data.id) {
				console.log(
					colors.green.bold(
						"\r\nLe daemon a été enregistré avec succès !\r\n"
					)
				);

				console.log(
					colors.cyan(
						`Vous pouvez maintenant démarer le daemon avec la commande ${colors.cyan.bold(
							FPD_COMMAND + " start"
						)}`
					)
				);
				console.log(
					colors.cyan(
						`Tapez ${colors.cyan.bold(
							FPD_COMMAND + " help"
						)} pour plus d'informations.\r\n`
					)
				);

				console.log(
					`Documentation: ${colors.cyan.bold(
						"https://featherpanel.natoune.fr/docs/daemon"
					)}`
				);

				config.nodeId = resp.data.id;
				fs.writeFileSync(
					path.join(__dirname, "..", "..", "config.json"),
					JSON.stringify(config, null, 2)
				);
			} else {
				if (resp.error && resp.error == "UNAUTHORIZED")
					console.log(
						colors.red.bold(
							"\r\nLe token entré est invalide. Veuillez le vérifier et réessayer."
						)
					);
				else if (resp.error && resp.error == "NODE_ALREADY_EXISTS")
					console.log(
						colors.red.bold(
							"\r\nUne machine avec ce nom existe déjà. Veuillez en choisir un autre."
						)
					);
				else
					console.log(
						colors.red.bold(
							"\r\nUne erreur est survenue lors de la tentative de connexion à l'API. Veuillez vérifier votre URL et votre token."
						)
					);

				if (IS_DEBUG) console.debug("ERROR:", resp);
				console.log();
				process.exit(1);
			}
		})
		.catch((error: any) => {
			console.log(
				colors.red.bold(
					"\r\nUne erreur est survenue lors de la tentative de connexion à l'API. Veuillez vérifier votre URL et votre token."
				)
			);

			if (IS_DEBUG) console.debug("ERROR:", error);
			console.log();
			process.exit(1);
		});
}

export async function checkDocker() {
	if (IS_DEBUG) console.debug("Checking Docker connection...");

	try {
		await docker.info();
		await docker.listContainers({ all: true });
	} catch (error) {
		console.error(
			"Une erreur est survenue lors de la tentative de connexion à Docker."
				.red
		);
		console.error(
			"Vérifiez que Docker est lancé ou essayez de relancer le daemon avec les permissions administrateur."
				.red
		);

		if (IS_DEBUG) console.debug("ERROR:", error);
		console.log();
		process.exit(1);
	}
}
