import colors from "colors";
import fs from "fs";
import path from "path";

import { FPD_COMMAND, VERSION } from "../constants";
import { daemonConfig } from "./config";

const commands: {
	name: string;
	description: string;
	longDescription?: string;
	parameters: {
		name: string;
		description?: string;
		optional?: boolean;
		boolean?: boolean;
	}[];
}[] = [
	{
		name: "help",
		description: "Affiche l'aide.",
		longDescription:
			"Affiche toutes les commandes ou l'aide d'une commande spécifique de FeatherDaemon CLI.",
		parameters: [
			{
				name: "command",
				optional: true,
				description: "La commande à afficher.",
			},
		],
	},
	{
		name: "start",
		description: "Démarre le daemon.",
		parameters: [],
	},
	{
		name: "config",
		description: "Démarrer la configuration du daemon.",
		longDescription:
			"Démarrer l'assitant de configuration de base du daemon.",
		parameters: [],
	},
];

export function printHelp(command: string = "") {
	if (command.length > 0) {
		let cmd = commands.find((cmd) => cmd.name === command);
		if (!cmd) {
			console.log(colors.red.bold("Commande inconnue."));
			console.log();
			printHelp();
			return;
		}

		console.log(
			colors.magenta.bold(
				`Commande : ${colors.cyan.bold(FPD_COMMAND)} ${colors.cyan(
					cmd.name
				)}`
			)
		);
		console.log();
		console.log(colors.gray(cmd.longDescription || cmd.description));
		console.log();

		if (cmd.parameters.length === 0) return;

		console.log(colors.magenta.bold("Paramètres :"));

		const maxLength =
			Math.max(
				...cmd.parameters.map((param) => {
					let baseLength = param.name.length + 3; // --name
					if (param.optional) baseLength += 12; // (optionnel)
					if (!param.boolean) baseLength += param.name.length + 3; // [--name=<NAME>]

					return baseLength;
				})
			) + 1;

		for (let param of cmd.parameters) {
			let str = `  --${param.name}`;
			let colorCodeLength = 0;

			if (!param.boolean) str += `=<${param.name.toUpperCase()}>`;

			if (param.optional) {
				colorCodeLength +=
					colors.gray(" (optionnel)").length - " (optionnel)".length;
				str += colors.gray(" (optionnel)");
			}

			console.log(
				colors.cyan(str.padEnd(maxLength + colorCodeLength, " ")),
				param.description ? `- ${param.description}` : ""
			);
		}

		console.log();

		return;
	}

	console.log(colors.magenta.bold("Commandes :"));

	const maxLength =
		Math.max(
			...commands.map(
				(cmd) =>
					cmd.name.length +
					cmd.parameters
						.map((param: any) => {
							let baseLength = param.name.length + 3; // --name
							if (param.optional) baseLength += 2; // [--name]
							if (!param.boolean)
								baseLength += param.name.length + 3; // [--name=<NAME>]

							return baseLength;
						})
						.reduce((a: number, b: number) => a + b, 0)
			)
		) +
		2 +
		FPD_COMMAND.length +
		1;

	for (let cmd of commands) {
		let str = `  ${FPD_COMMAND} ${cmd.name}`;
		let colorCodeLength = colors.cyan(str).length - str.length;
		str = colors.cyan(str);

		// Required parameters first
		let params = cmd.parameters.sort((a, b) => {
			if (a.optional && !b.optional) return 1;
			if (!a.optional && b.optional) return -1;
			return 0;
		});

		for (let param of params) {
			if (param.optional) str += ` [--${param.name}`;
			else str += ` --${param.name}`;

			if (!param.boolean) str += `=<${param.name.toUpperCase()}>`;

			if (param.optional) str += "]";
		}

		console.log(
			str.padEnd(maxLength + colorCodeLength, " "),
			colors.gray("- " + cmd.description)
		);
	}

	console.log();
}

let args = process.argv.slice(2);

console.log();
console.log(
	colors.magenta.bold("FeatherDaemon CLI"),
	colors.yellow("v" + VERSION)
);
console.log();

if (!fs.existsSync(path.join(__dirname, "..", "..", "config.json"))) {
	daemonConfig();
} else if (args.length === 0) {
	printHelp();
} else {
	switch (args[0]) {
		case "help":
			printHelp(args[1]);
			break;

		case "start":
			if (!fs.existsSync(path.join(__dirname, "..", "..", "index.js"))) {
				console.log(
					colors.red.bold(
						"L'installation de FeatherDaemon ne s'est pas déroulée correctement."
					)
				);
				console.log();
				printHelp("start");
				break;
			}
			require("../index");
			break;

		case "config":
			daemonConfig();
			break;

		default:
			printHelp();
	}
}
