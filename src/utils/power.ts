import logger from "./logger";

process.on("SIGINT", () => {
	console.log();
	process.exit(0);
});

process.on("exit", (code: number = 0) => {
	console.log();

	if (code !== 0)
		logger.error(("Le daemon s'est arrêté avec le code " + code).red);
	else logger.info("Arrêt de FeatherDaemon.".red);

	console.log();
});
