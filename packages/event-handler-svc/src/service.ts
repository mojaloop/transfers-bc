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

 * Crosslake
 - Pedro Sousa Barreto <pedrob@crosslaketech.com>

 --------------
 ******/

"use strict";


import {IAuditClient} from "@mojaloop/auditing-bc-public-types-lib";
import {ILogger, LogLevel} from "@mojaloop/logging-bc-public-types-lib";
import {
    AuthenticatedHttpRequester,
} from "@mojaloop/security-bc-client-lib";
import {KafkaLogger} from "@mojaloop/logging-bc-client-lib";
import {
	MLKafkaJsonConsumer,
	MLKafkaJsonProducer,
	MLKafkaJsonConsumerOptions,
	MLKafkaJsonProducerOptions
} from "@mojaloop/platform-shared-lib-nodejs-kafka-client-lib";
import {IMessageConsumer, IMessageProducer} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import process from "process";
import express, {Express} from "express";
import {Server} from "net";
import {TransfersEventHandler} from "./handler";
import {IMetrics} from "@mojaloop/platform-shared-lib-observability-types-lib";
import {PrometheusMetrics} from "@mojaloop/platform-shared-lib-observability-client-lib";

import {IConfigurationClient} from "@mojaloop/platform-configuration-bc-public-types-lib";
import {DefaultConfigProvider, IConfigProvider} from "@mojaloop/platform-configuration-bc-client-lib";
import {GetTransfersConfigSet} from "@mojaloop/transfers-bc-config-lib";
import crypto from "crypto";
import {OpenTelemetryClient} from "@mojaloop/platform-shared-lib-observability-client-lib";
import {RedisTimeoutAdapter} from "@mojaloop/transfers-bc-implementations-lib";
import {ITimeoutAdapter} from "@mojaloop/transfers-bc-domain-lib";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJSON = require("../package.json");

const BC_NAME = "transfers-bc";
const APP_NAME = "event-handler-svc";
const APP_VERSION = packageJSON.version;
const PRODUCTION_MODE = process.env["PRODUCTION_MODE"] || false;
const LOG_LEVEL: LogLevel = process.env["LOG_LEVEL"] as LogLevel || LogLevel.DEBUG;
const INSTANCE_NAME = `${BC_NAME}_${APP_NAME}`;
const INSTANCE_ID = `${INSTANCE_NAME}__${crypto.randomUUID()}`;

// Message Consumer/Publisher
const KAFKA_URL = process.env["KAFKA_URL"] || "localhost:9092";
const KAFKA_AUTH_ENABLED = process.env["KAFKA_AUTH_ENABLED"] && process.env["KAFKA_AUTH_ENABLED"].toUpperCase()==="TRUE" || false;
const KAFKA_AUTH_PROTOCOL = process.env["KAFKA_AUTH_PROTOCOL"] || "sasl_plaintext";
const KAFKA_AUTH_MECHANISM = process.env["KAFKA_AUTH_MECHANISM"] || "plain";
const KAFKA_AUTH_USERNAME = process.env["KAFKA_AUTH_USERNAME"] || "user";
const KAFKA_AUTH_PASSWORD = process.env["KAFKA_AUTH_PASSWORD"] || "password";

const KAFKA_LOGS_TOPIC = process.env["KAFKA_LOGS_TOPIC"] || "logs";

const AUTH_N_SVC_BASEURL = process.env["AUTH_N_SVC_BASEURL"] || "http://localhost:3201";
const AUTH_N_SVC_TOKEN_URL = AUTH_N_SVC_BASEURL + "/token"; // TODO this should not be known here, libs that use the base should add the suffix

const SVC_CLIENT_ID = process.env["SVC_CLIENT_ID"] || "transfers-bc-event-handler-svc";
const SVC_CLIENT_SECRET = process.env["SVC_CLIENT_SECRET"] || "superServiceSecret";

const CONSUMER_BATCH_SIZE = (process.env["CONSUMER_BATCH_SIZE"] && parseInt(process.env["CONSUMER_BATCH_SIZE"])) || 250;
const CONSUMER_BATCH_TIMEOUT_MS = (process.env["CONSUMER_BATCH_TIMEOUT_MS"] && parseInt(process.env["CONSUMER_BATCH_TIMEOUT_MS"])) || 5;

const REDIS_HOST = process.env["REDIS_HOST"] || "localhost";
const REDIS_PORT = (process.env["REDIS_PORT"] && parseInt(process.env["REDIS_PORT"])) || 6379;

const TIMEOUT_LOOP_INTERVAL_SECS = (process.env["TIMEOUT_LOOP_INTERVAL_SECS"] && parseInt(process.env["TIMEOUT_LOOP_INTERVAL_SECS"])) || 5;

const SERVICE_START_TIMEOUT_MS= (process.env["SERVICE_START_TIMEOUT_MS"] && parseInt(process.env["SERVICE_START_TIMEOUT_MS"])) || 60_000;

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

const kafkaConsumerOptions: MLKafkaJsonConsumerOptions = {
    ...kafkaConsumerCommonOptions,
    kafkaGroupId: `${BC_NAME}_${APP_NAME}`,
    batchSize: CONSUMER_BATCH_SIZE,
    batchTimeoutMs: CONSUMER_BATCH_TIMEOUT_MS
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let globalLogger: ILogger;

// Express Server
const SVC_DEFAULT_HTTP_PORT = process.env["SVC_DEFAULT_HTTP_PORT"] || 3502;

export class Service {
	static logger: ILogger;
    static app: Express;
    static expressServer: Server;
	static messageConsumer: IMessageConsumer;
	static messageProducer: IMessageProducer;
	static handler: TransfersEventHandler;
    static metrics:IMetrics;
    static configClient: IConfigurationClient;
    static timeoutAdapter: ITimeoutAdapter;
    static startupTimer: NodeJS.Timeout;

	static async start(
		logger?: ILogger,
		auditClient?: IAuditClient,
		messageConsumer?: IMessageConsumer,
		messageProducer?: IMessageProducer,
        metrics?:IMetrics,
        configProvider?: IConfigProvider,
        timeoutAdapter?: ITimeoutAdapter
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

        /// start config client - this is not mockable (can use STANDALONE MODE if desired)
        if(!configProvider) {
            // create the instance of IAuthenticatedHttpRequester
            const authRequester = new AuthenticatedHttpRequester(logger, AUTH_N_SVC_TOKEN_URL);
            authRequester.setAppCredentials(SVC_CLIENT_ID, SVC_CLIENT_SECRET);

            const messageConsumer = new MLKafkaJsonConsumer({
                ...kafkaConsumerCommonOptions,
                kafkaGroupId: `${INSTANCE_ID}_config` // unique consumer group - use instance id when possible
            }, this.logger.createChild("configClient.consumer"));
            configProvider = new DefaultConfigProvider(logger, authRequester, messageConsumer);
        }

        this.configClient = GetTransfersConfigSet(configProvider, BC_NAME, APP_NAME, APP_VERSION);
        await this.configClient.init();
        await this.configClient.bootstrap(true);
        await this.configClient.fetch();

		if(!messageConsumer){
			const consumerHandlerLogger = logger.createChild("handlerConsumer");
			consumerHandlerLogger.setLogLevel(LogLevel.INFO);
			messageConsumer = new MLKafkaJsonConsumer(kafkaConsumerOptions, consumerHandlerLogger);
		}
		this.messageConsumer = messageConsumer;

		if (!messageProducer) {
			const producerLogger = logger.createChild("producerLogger");
			producerLogger.setLogLevel(LogLevel.INFO);
			messageProducer = new MLKafkaJsonProducer(kafkaProducerCommonOptions, producerLogger);
		}
		this.messageProducer = messageProducer;

        if (!timeoutAdapter) {
            timeoutAdapter = new RedisTimeoutAdapter(logger, REDIS_HOST, REDIS_PORT);
            await timeoutAdapter.init();
        }
        this.timeoutAdapter = timeoutAdapter;

        if(!metrics){
            const labels: Map<string, string> = new Map<string, string>();
            labels.set("bc", BC_NAME);
            labels.set("app", APP_NAME);
            labels.set("version", APP_VERSION);
            labels.set("instance_id", INSTANCE_ID);
            PrometheusMetrics.Setup({prefix:"", defaultLabels: labels}, this.logger);
            metrics = PrometheusMetrics.getInstance();
        }
        this.metrics = metrics;

        OpenTelemetryClient.Start(BC_NAME, APP_NAME, APP_VERSION, INSTANCE_ID, this.logger);

		// create handler and start it
		this.handler = new TransfersEventHandler(
            this.logger, this.messageConsumer, this.messageProducer, this.metrics,
            this.timeoutAdapter, TIMEOUT_LOOP_INTERVAL_SECS
        );
		await this.handler.start();

        await this.setupExpress();

        // remove startup timeout
        clearTimeout(this.startupTimer);
	}

    static setupExpress(): Promise<void> {
        return new Promise<void>(resolve => {
            this.app = express();
            this.app.use(express.json()); // for parsing application/json
            this.app.use(express.urlencoded({extended: true})); // for parsing application/x-www-form-urlencoded


            // Add health and metrics http routes
            this.app.get("/health", (req: express.Request, res: express.Response) => {
                return res.send({ status: "OK" });
            });

            this.app.get("/metrics", async (req: express.Request, res: express.Response) => {
                const strMetrics = await (this.metrics as PrometheusMetrics).getMetricsForPrometheusScrapper();
                return res.send(strMetrics);
            });

            this.app.use((req, res) => {
                // catch all
                res.send(404);
            });

            this.expressServer = this.app.listen(SVC_DEFAULT_HTTP_PORT, () => {
                globalLogger.info(`🚀Server ready at: http://localhost:${SVC_DEFAULT_HTTP_PORT}`);
                globalLogger.info(`Transfer Event Handler Service started, version: ${this.configClient.applicationVersion}`);
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
			if (this.handler) {
				this.logger.debug("Stoppping handler");
				await this.handler.stop();
			}
			if (this.messageConsumer) {
				this.logger.debug("Tearing down message consumer");
				await this.messageConsumer.destroy(true);
			}
			if (this.messageProducer) {
				this.logger.debug("Tearing down message producer");
				await this.messageProducer.destroy();
			}
			if (this.configClient) {
				this.logger.debug("Tearing down config client");
				await this.configClient.destroy();
			}
			if (this.timeoutAdapter) {
				this.logger.debug("Tearing down timeoutAdapter");
				await this.timeoutAdapter.destroy();
			}
			if (this.logger && this.logger instanceof KafkaLogger) {
				setTimeout(async ()=>{
					await (this.logger as KafkaLogger).destroy();
				}, 500);
			}

	}
}


/**
 * process termination and cleanup
 */

async function _handle_int_and_term_signals(signal: NodeJS.Signals): Promise<void> {
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
