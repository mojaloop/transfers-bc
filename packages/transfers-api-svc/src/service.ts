/*****
 License
 --------------
 Copyright © 2017 Bill & Melinda Gates Foundation
 The Mojaloop files are made available by the Bill & Melinda Gates Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list (alphabetical ordering) of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>

 * Arg Software
 - Jose Francisco Antunes <jfantunes@arg.software>
 - Rui Rocha <rui.rocha@arg.software>

 --------------
 ******/

"use strict";

import {existsSync} from "fs";
import {IAuditClient} from "@mojaloop/auditing-bc-public-types-lib";
import {ILogger, LogLevel} from "@mojaloop/logging-bc-public-types-lib";
import {
	AuditClient,
	KafkaAuditClientDispatcher,
	LocalAuditClientCryptoProvider,
} from "@mojaloop/auditing-bc-client-lib";
import {MongoTransfersRepo} from "@mojaloop/transfers-bc-implementations-lib";
import {KafkaLogger} from "@mojaloop/logging-bc-client-lib";
import {MLKafkaJsonConsumer, MLKafkaJsonProducerOptions} from "@mojaloop/platform-shared-lib-nodejs-kafka-client-lib";
import express, {Express} from "express";
import {Server} from "net";
import process from "process";
import { AuthenticatedHttpRequester } from "@mojaloop/security-bc-client-lib";
import {IConfigurationClient} from "@mojaloop/platform-configuration-bc-public-types-lib";
import {DefaultConfigProvider, IConfigProvider} from "@mojaloop/platform-configuration-bc-client-lib";
import {GetTransfersConfigSet} from "@mojaloop/transfers-bc-config-lib";

import {TransferAdminExpressRoutes} from "./routes/transfer_admin_routes";
import {ITransfersRepository} from "@mojaloop/transfers-bc-domain-lib";
import * as path from "path";

const BC_NAME = "transfers-bc";
const APP_NAME = "transfers-api-svc";
const APP_VERSION = process.env.npm_package_version || "0.0.0";

const PRODUCTION_MODE = process.env["PRODUCTION_MODE"] || false;
const LOG_LEVEL: LogLevel = (process.env["LOG_LEVEL"] as LogLevel) || LogLevel.DEBUG;

const KAFKA_URL = process.env["KAFKA_URL"] || "localhost:9092";
const MONGO_URL = process.env["MONGO_URL"] || "mongodb://root:example@localhost:27017/";

const KAFKA_AUDITS_TOPIC = process.env["KAFKA_AUDITS_TOPIC"] || "audits";
const KAFKA_LOGS_TOPIC = process.env["KAFKA_LOGS_TOPIC"] || "logs";
// const AUDIT_KEY_FILE_PATH = process.env["AUDIT_KEY_FILE_PATH"] || "/app/data/audit_private_key.pem";
const AUDIT_KEY_FILE_PATH = process.env["AUDIT_KEY_FILE_PATH"] || path.join(__dirname, "../dist/tmp_key_file");

const AUTH_N_SVC_BASEURL = process.env["AUTH_N_SVC_BASEURL"] || "http://localhost:3201";
const AUTH_N_SVC_TOKEN_URL = AUTH_N_SVC_BASEURL + "/token"; // TODO this should not be known here, libs that use the base should add the suffix

const SVC_CLIENT_ID = process.env["SVC_CLIENT_ID"] || "transfers-bc-api";
const SVC_CLIENT_SECRET = process.env["SVC_CLIENT_ID"] || "superServiceSecret";

const kafkaProducerOptions: MLKafkaJsonProducerOptions = {
	kafkaBrokerList: KAFKA_URL,
};

let globalLogger: ILogger;

// Express Server
const SVC_DEFAULT_HTTP_PORT = process.env["SVC_DEFAULT_HTTP_PORT"] || 3500;
let expressApp: Express;
let expressServer: Server;

// Transfer routes
let transferAdminRoutes: TransferAdminExpressRoutes;

export class Service {
	static logger: ILogger;
	static auditClient: IAuditClient;
	static transfersRepo: ITransfersRepository;
    static configClient: IConfigurationClient;

	static async start(
		logger?: ILogger,
		auditClient?: IAuditClient,
		transfersRepo?: ITransfersRepository,
        configProvider?: IConfigProvider,
	): Promise<void> {
		console.log(`Service starting with PID: ${process.pid}`);


		if (!logger) {
			logger = new KafkaLogger(
				BC_NAME,
				APP_NAME,
				APP_VERSION,
				kafkaProducerOptions,
				KAFKA_LOGS_TOPIC,
				LOG_LEVEL
			);
			await (logger as KafkaLogger).init();
		}
		globalLogger = this.logger = logger;

        /// start config client - this is not mockable (can use STANDALONE MODE if desired)
        if(!configProvider) {
            // create the instance of IAuthenticatedHttpRequester
            const authRequester = new AuthenticatedHttpRequester(logger, AUTH_N_SVC_TOKEN_URL);
            authRequester.setAppCredentials(SVC_CLIENT_ID, SVC_CLIENT_SECRET);

            const messageConsumer = new MLKafkaJsonConsumer({
                kafkaBrokerList: KAFKA_URL,
                kafkaGroupId: `${APP_NAME}_${Date.now()}` // unique consumer group - use instance id when possible
            }, this.logger.createChild("configClient.consumer"));
            configProvider = new DefaultConfigProvider(logger, authRequester, messageConsumer);
        }

        this.configClient = GetTransfersConfigSet(configProvider, BC_NAME, APP_NAME, APP_VERSION);
        await this.configClient.init();
        await this.configClient.bootstrap(true);
        await this.configClient.fetch();

		/// start auditClient
		if (!auditClient) {
			if (!existsSync(AUDIT_KEY_FILE_PATH)) {
				if (PRODUCTION_MODE) process.exit(9);
				// create e tmp file
				LocalAuditClientCryptoProvider.createRsaPrivateKeyFileSync(
					AUDIT_KEY_FILE_PATH,
					2048
				);
			}
			const auditLogger = logger.createChild("auditDispatcher");
			auditLogger.setLogLevel(LogLevel.INFO);

			const cryptoProvider = new LocalAuditClientCryptoProvider(
				AUDIT_KEY_FILE_PATH
			);
			const auditDispatcher = new KafkaAuditClientDispatcher(
				kafkaProducerOptions,
				KAFKA_AUDITS_TOPIC,
				auditLogger
			);
			// NOTE: to pass the same kafka logger to the audit client, make sure the logger is started/initialised already
			auditClient = new AuditClient(
				BC_NAME,
				APP_NAME,
				APP_VERSION,
				cryptoProvider,
				auditDispatcher
			);
			await auditClient.init();
		}
		this.auditClient = auditClient;

		if (!transfersRepo) {
			const DB_NAME_TRANSFERS = process.env.TRANSFERS_DB_NAME ?? "transfers";

			transfersRepo = new MongoTransfersRepo(
				logger,
				MONGO_URL,
				DB_NAME_TRANSFERS
			);

			await transfersRepo.init();
			logger.info("Transfer Registry Repo Initialized");
		}

		this.transfersRepo = transfersRepo;

		// Start express server
		expressApp = express();
		expressApp.use(express.json()); // for parsing application/json
		expressApp.use(express.urlencoded({extended: true})); // for parsing application/x-www-form-urlencoded

		// Add admin and client http routes
		transferAdminRoutes = new TransferAdminExpressRoutes(transfersRepo, logger);
		expressApp.use("", transferAdminRoutes.mainRouter);

		expressApp.use((req, res) => {
			// catch all
			res.send(404);
		});

		expressServer = expressApp.listen(SVC_DEFAULT_HTTP_PORT, () => {
			globalLogger.info(
				`🚀Server ready at: http://localhost:${SVC_DEFAULT_HTTP_PORT}`
			);
			globalLogger.info("Transfer Admin server started");
		});
	}

	static async stop() {
		if (expressServer) {
			expressServer.close();
		}
		if (this.auditClient) {
			await this.auditClient.destroy();
		}
		if (this.logger && this.logger instanceof KafkaLogger) {
			await this.logger.destroy();
		}
	}
}

/**
 * process termination and cleanup
 */

async function _handle_int_and_term_signals(
	signal: NodeJS.Signals
): Promise<void> {
	console.info(`Service - ${signal} received - cleaning up...`);
	let clean_exit = false;
	setTimeout(() => {
		clean_exit || process.abort();
	}, 5000);

	// call graceful stop routine
	await Service.stop();

	clean_exit = true;
	process.exit();
}

//catches ctrl+c event
process.on("SIGINT", _handle_int_and_term_signals);
//catches program termination event
process.on("SIGTERM", _handle_int_and_term_signals);

//do something when app is closing
process.on("exit", async () => {
	console.info("Microservice - exiting...");
});
process.on("uncaughtException", (err: Error) => {
	console.error(err, "UncaughtException - EXITING...");
	process.exit(999);
});
