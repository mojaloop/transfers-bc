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

import {
	AuditClient,
	KafkaAuditClientDispatcher,
	LocalAuditClientCryptoProvider,
} from "@mojaloop/auditing-bc-client-lib";
import {AuthenticatedHttpRequester, AuthorizationClient, TokenHelper} from "@mojaloop/security-bc-client-lib";
import {IAuthorizationClient, ITokenHelper} from "@mojaloop/security-bc-public-types-lib";
import {ILogger, LogLevel} from "@mojaloop/logging-bc-public-types-lib";
import {
    MLKafkaJsonConsumer,
    MLKafkaJsonConsumerOptions,
    MLKafkaJsonProducerOptions
} from "@mojaloop/platform-shared-lib-nodejs-kafka-client-lib";
import express, {Express} from "express";

import {IAuditClient} from "@mojaloop/auditing-bc-public-types-lib";
import {IMetrics} from "@mojaloop/platform-shared-lib-observability-types-lib";
import {IBulkTransfersRepository, ITransfersRepository} from "@mojaloop/transfers-bc-domain-lib";
import {KafkaLogger} from "@mojaloop/logging-bc-client-lib";
import {MongoBulkTransfersRepo, MongoTransfersRepo} from "@mojaloop/transfers-bc-implementations-lib";
import {PrometheusMetrics} from "@mojaloop/platform-shared-lib-observability-client-lib";
import {Server} from "net";
import {TransferAdminExpressRoutes} from "./routes/transfer_admin_routes";
import {existsSync} from "fs";
import process from "process";
import crypto from "crypto";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJSON = require("../package.json");

const BC_NAME = "transfers-bc";
const APP_NAME = "transfers-api-svc";
const APP_VERSION = packageJSON.version;

const PRODUCTION_MODE = process.env["PRODUCTION_MODE"] || false;
const LOG_LEVEL: LogLevel = (process.env["LOG_LEVEL"] as LogLevel) || LogLevel.DEBUG;

// Message Consumer/Publisher
const KAFKA_URL = process.env["KAFKA_URL"] || "localhost:9092";
const KAFKA_AUTH_ENABLED = process.env["KAFKA_AUTH_ENABLED"] && process.env["KAFKA_AUTH_ENABLED"].toUpperCase()==="TRUE" || false;
const KAFKA_AUTH_PROTOCOL = process.env["KAFKA_AUTH_PROTOCOL"] || "sasl_plaintext";
const KAFKA_AUTH_MECHANISM = process.env["KAFKA_AUTH_MECHANISM"] || "plain";
const KAFKA_AUTH_USERNAME = process.env["KAFKA_AUTH_USERNAME"] || "user";
const KAFKA_AUTH_PASSWORD = process.env["KAFKA_AUTH_PASSWORD"] || "password";

const MONGO_URL = process.env["MONGO_URL"] || "mongodb://root:mongoDbPas42@localhost:27017/";

const KAFKA_AUDITS_TOPIC = process.env["KAFKA_AUDITS_TOPIC"] || "audits";
const KAFKA_LOGS_TOPIC = process.env["KAFKA_LOGS_TOPIC"] || "logs";
const AUDIT_KEY_FILE_PATH = process.env["AUDIT_KEY_FILE_PATH"] || "/app/data/audit_private_key.pem";

const AUTH_N_SVC_BASEURL = process.env["AUTH_N_SVC_BASEURL"] || "http://localhost:3201";
const AUTH_N_SVC_TOKEN_URL = AUTH_N_SVC_BASEURL + "/token"; // TODO this should not be known here, libs that use the base should add the suffix
const AUTH_N_TOKEN_ISSUER_NAME = process.env["AUTH_N_TOKEN_ISSUER_NAME"] || "mojaloop.vnext.dev.default_issuer";
const AUTH_N_TOKEN_AUDIENCE = process.env["AUTH_N_TOKEN_AUDIENCE"] || "mojaloop.vnext.dev.default_audience";

const AUTH_N_SVC_JWKS_URL = process.env["AUTH_N_SVC_JWKS_URL"] || `${AUTH_N_SVC_BASEURL}/.well-known/jwks.json`;

const AUTH_Z_SVC_BASEURL = process.env["AUTH_Z_SVC_BASEURL"] || "http://localhost:3202";

const SVC_CLIENT_ID = process.env["SVC_CLIENT_ID"] || "transfers-bc-api-svc";
const SVC_CLIENT_SECRET = process.env["SVC_CLIENT_SECRET"] || "superServiceSecret";

// Express Server
const SVC_DEFAULT_HTTP_PORT = process.env["SVC_DEFAULT_HTTP_PORT"] || 3500;

const SERVICE_START_TIMEOUT_MS= (process.env["SERVICE_START_TIMEOUT_MS"] && parseInt(process.env["SERVICE_START_TIMEOUT_MS"])) || 60_000;

const INSTANCE_NAME = `${BC_NAME}_${APP_NAME}`;
const INSTANCE_ID = `${INSTANCE_NAME}__${crypto.randomUUID()}`;

// kafka common options
const kafkaProducerCommonOptions:MLKafkaJsonProducerOptions = {
    kafkaBrokerList: KAFKA_URL,
    producerClientId: `${INSTANCE_ID}`,
};
const kafkaConsumerCommonOptions:MLKafkaJsonConsumerOptions ={
    kafkaBrokerList: KAFKA_URL
};
if(KAFKA_AUTH_ENABLED){
    kafkaProducerCommonOptions.authentication = kafkaConsumerCommonOptions.authentication = {
        protocol: KAFKA_AUTH_PROTOCOL as "plaintext" | "ssl" | "sasl_plaintext" | "sasl_ssl",
        mechanism: KAFKA_AUTH_MECHANISM as "PLAIN" | "GSSAPI" | "SCRAM-SHA-256" | "SCRAM-SHA-512",
        username: KAFKA_AUTH_USERNAME,
        password: KAFKA_AUTH_PASSWORD
    };
}

let globalLogger: ILogger;

export class Service {
	static logger: ILogger;
    static app: Express;
    static expressServer: Server;
	static auditClient: IAuditClient;
	static transfersRepo: ITransfersRepository;
	static bulkTransfersRepo: IBulkTransfersRepository;
    static tokenHelper: ITokenHelper;
    static metrics:IMetrics;
    static authorizationClient: IAuthorizationClient;
    static startupTimer: NodeJS.Timeout;

	static async start(
		logger?: ILogger,
		auditClient?: IAuditClient,
		transfersRepo?: ITransfersRepository,
		bulkTransfersRepo?: IBulkTransfersRepository,
        metrics?:IMetrics,
        authorizationClient?: IAuthorizationClient
	): Promise<void> {
		console.log(`Service starting with PID: ${process.pid}`);

        this.startupTimer = setTimeout(()=>{
            throw new Error("Service start timed-out");
        }, SERVICE_START_TIMEOUT_MS);


		if (!logger) {
			logger = new KafkaLogger(
				BC_NAME,
				APP_NAME,
				APP_VERSION,
                kafkaProducerCommonOptions,
				KAFKA_LOGS_TOPIC,
				LOG_LEVEL
			);
			await (logger as KafkaLogger).init();
		}
		globalLogger = this.logger = logger;

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
                kafkaProducerCommonOptions,
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

        if (!bulkTransfersRepo) {
			const DB_NAME_BULK_TRANSFERS = process.env.BULK_TRANSFERS_DB_NAME ?? "transfers";

			bulkTransfersRepo = new MongoBulkTransfersRepo(
				logger,
				MONGO_URL,
				DB_NAME_BULK_TRANSFERS
			);

			await bulkTransfersRepo.init();
			logger.info("Bulk Transfer Registry Repo Initialized");
		}
		this.bulkTransfersRepo = bulkTransfersRepo;

        // authorization client
        if (!authorizationClient) {
            // create the instance of IAuthenticatedHttpRequester
            const authRequester = new AuthenticatedHttpRequester(logger, AUTH_N_SVC_TOKEN_URL);
            authRequester.setAppCredentials(SVC_CLIENT_ID, SVC_CLIENT_SECRET);

            const messageConsumer = new MLKafkaJsonConsumer(
                {
                    ...kafkaProducerCommonOptions,
                    kafkaGroupId: `${INSTANCE_ID}_authz_client`
                }, logger.createChild("authorizationClientConsumer")
            );

            // setup privileges - get priv/role associations
            authorizationClient = new AuthorizationClient(
                BC_NAME,
                APP_VERSION,
                AUTH_Z_SVC_BASEURL,
                logger.createChild("AuthorizationClient"),
                authRequester,
                messageConsumer
            );

            await (authorizationClient as AuthorizationClient).fetch();
            // init message consumer to automatically update on role changed events
            await (authorizationClient as AuthorizationClient).init();
       }
        this.authorizationClient = authorizationClient;


        // token helper
        this.tokenHelper = new TokenHelper(
            AUTH_N_SVC_JWKS_URL,
            logger,
            AUTH_N_TOKEN_ISSUER_NAME,
            AUTH_N_TOKEN_AUDIENCE,
            new MLKafkaJsonConsumer({...kafkaProducerCommonOptions, autoOffsetReset: "earliest", kafkaGroupId: `${INSTANCE_ID}_tokenHelper`}, logger) // for jwt list - no groupId
        );
        await this.tokenHelper.init();

        // metrics client
        if(!metrics){
            const labels: Map<string, string> = new Map<string, string>();
            labels.set("bc", BC_NAME);
            labels.set("app", APP_NAME);
            labels.set("version", APP_VERSION);
            PrometheusMetrics.Setup({prefix:"", defaultLabels: labels}, this.logger);
            metrics = PrometheusMetrics.getInstance();
        }
        this.metrics = metrics;

        await this.setupExpress();

        // remove startup timeout
        clearTimeout(this.startupTimer);
	}

    static setupExpress(): Promise<void> {
        return new Promise<void>(resolve => {
            this.app = express();
            this.app.use(express.json()); // for parsing application/json
            this.app.use(express.urlencoded({extended: true})); // for parsing application/x-www-form-urlencoded

            // Add health and metrics http routes - before others (to avoid authZ middleware)
            this.app.get("/health", (req: express.Request, res: express.Response) => {
                return res.send({ status: "OK" });
            });
            this.app.get("/metrics", async (req: express.Request, res: express.Response) => {
                const strMetrics = await (this.metrics as PrometheusMetrics).getMetricsForPrometheusScrapper();
                return res.send(strMetrics);
            });

            // Add admin and client http routes
            const transferAdminRoutes = new TransferAdminExpressRoutes(this.logger, this.transfersRepo, this.bulkTransfersRepo, this.tokenHelper, this.authorizationClient);

            this.app.use("/", transferAdminRoutes.mainRouter);

            this.app.use((req, res) => {
                // catch all
                res.send(404);
            });

            let portNum = SVC_DEFAULT_HTTP_PORT;
            if (process.env["SVC_HTTP_PORT"] && !isNaN(parseInt(process.env["SVC_HTTP_PORT"]))) {
                portNum = parseInt(process.env["SVC_HTTP_PORT"]);
            }

            this.expressServer = this.app.listen(portNum, () => {
                globalLogger.info(`🚀Server ready at port: ${SVC_DEFAULT_HTTP_PORT}`);
                globalLogger.info(`Transfer Admin server v: ${APP_VERSION} started`);
                resolve();
            });
        });
    }

	static async stop() {
        if (this.expressServer) {
            this.logger.debug("Closing express server");
            await new Promise((resolve) => {
                this.expressServer.close(() => {
                    resolve(true);
                });
            });
        }
        if (this.auditClient) {
            this.logger.debug("Tearing down audit client");
            await this.auditClient.destroy();
        }
        if (this.transfersRepo) {
            this.logger.debug("Tearing down transfers repository");
            await this.transfersRepo.destroy();
        }
        if (this.bulkTransfersRepo) {
            this.logger.debug("Tearing down bulk transfers repository");
            await this.bulkTransfersRepo.destroy();
        }
        if (this.logger && this.logger instanceof KafkaLogger) {
            await (this.logger as KafkaLogger).destroy();
        }
	}
}

/**
 * process termination and cleanup
 */

/* istanbul ignore next */
async function _handle_int_and_term_signals(signal: NodeJS.Signals): Promise<void> {
    console.info(`Service - ${signal} received - cleaning up...`);
    let clean_exit = false;
    setTimeout(() => {
        clean_exit || process.exit(99);
    }, 5000);

    // call graceful stop routine
    await Service.stop();

    clean_exit = true;
    process.exit();
}

//catches ctrl+c event
/* istanbul ignore next */
process.on("SIGINT", _handle_int_and_term_signals);
//catches program termination event
/* istanbul ignore next */
process.on("SIGTERM", _handle_int_and_term_signals);

//do something when app is closing
/* istanbul ignore next */
process.on("exit", async () => {
    globalLogger.info("Microservice - exiting...");
});
/* istanbul ignore next */
process.on("uncaughtException", (err: Error) => {
    globalLogger.error(err);
    console.log("UncaughtException - EXITING...");
    process.exit(999);
});
