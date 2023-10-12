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

import {
	TransfersAggregate,
	IParticipantsServiceAdapter,
	ITransfersRepository,
	IAccountsBalancesAdapter,
    ISettlementsServiceAdapter,
    ISchedulingServiceAdapter,
    IBulkTransfersRepository
} from "@mojaloop/transfers-bc-domain-lib";
import { 
    ParticipantAdapter,
    MongoTransfersRepo,
    MongoBulkTransfersRepo,
    GrpcAccountsAndBalancesAdapter,
    SettlementsAdapter,
    SchedulingAdapter 
} from "@mojaloop/transfers-bc-implementations-lib";
import {existsSync} from "fs";
import express, {Express} from "express";
import {Server} from "net";
import {IAuditClient} from "@mojaloop/auditing-bc-public-types-lib";
import {ILogger, LogLevel} from "@mojaloop/logging-bc-public-types-lib";
import {
	AuditClient,
	KafkaAuditClientDispatcher,
	LocalAuditClientCryptoProvider
} from "@mojaloop/auditing-bc-client-lib";
import {KafkaLogger} from "@mojaloop/logging-bc-client-lib";
import {
	MLKafkaJsonConsumer,
	MLKafkaJsonProducer,
	MLKafkaJsonConsumerOptions,
	MLKafkaJsonProducerOptions
} from "@mojaloop/platform-shared-lib-nodejs-kafka-client-lib";
import {IMessageConsumer, IMessageProducer} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import process from "process";
import {TransfersCommandHandler} from "./handler";
import {
	AuthenticatedHttpRequester,
    LoginHelper
} from "@mojaloop/security-bc-client-lib";
import {IAuthenticatedHttpRequester} from "@mojaloop/security-bc-public-types-lib";
import {IMetrics} from "@mojaloop/platform-shared-lib-observability-types-lib";
import {PrometheusMetrics} from "@mojaloop/platform-shared-lib-observability-client-lib";

import {IConfigurationClient} from "@mojaloop/platform-configuration-bc-public-types-lib";
import {DefaultConfigProvider, IConfigProvider} from "@mojaloop/platform-configuration-bc-client-lib";
import {GetTransfersConfigSet} from "@mojaloop/transfers-bc-config-lib";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJSON = require("../package.json");

const BC_NAME = "transfers-bc";
const APP_NAME = "command-handler-svc";
const APP_VERSION = packageJSON.version;
const PRODUCTION_MODE = process.env["PRODUCTION_MODE"] || false;
const LOG_LEVEL: LogLevel = process.env["LOG_LEVEL"] as LogLevel || LogLevel.DEBUG;

const KAFKA_URL = process.env["KAFKA_URL"] || "localhost:9092";
const MONGO_URL = process.env["MONGO_URL"] || "mongodb://root:mongoDbPas42@localhost:27017/";

// const REDIS_HOST = process.env["REDIS_HOST"] || "localhost";
// const REDIS_PORT = (process.env["REDIS_PORT"] && parseInt(process.env["REDIS_PORT"])) || 6379;

const KAFKA_AUDITS_TOPIC = process.env["KAFKA_AUDITS_TOPIC"] || "audits";
const KAFKA_LOGS_TOPIC = process.env["KAFKA_LOGS_TOPIC"] || "logs";
const AUDIT_KEY_FILE_PATH = process.env["AUDIT_KEY_FILE_PATH"] || path.join(__dirname, "../dist/tmp_key_file");

const AUTH_N_SVC_BASEURL = process.env["AUTH_N_SVC_BASEURL"] || "http://localhost:3201";
const AUTH_N_SVC_TOKEN_URL = AUTH_N_SVC_BASEURL + "/token"; // TODO this should not be known here, libs that use the base should add the suffix

// const AUTH_N_TOKEN_ISSUER_NAME = process.env["AUTH_N_TOKEN_ISSUER_NAME"] || "http://localhost:3201/";
// const AUTH_N_TOKEN_AUDIENCE = process.env["AUTH_N_TOKEN_AUDIENCE"] || "mojaloop.vnext.default_audience";
// const AUTH_N_SVC_JWKS_URL = process.env["AUTH_N_SVC_JWKS_URL"] || `${AUTH_N_SVC_BASEURL}/.well-known/jwks.json`;
//
// const AUTH_Z_SVC_BASEURL = process.env["AUTH_Z_SVC_BASEURL"] || "http://localhost:3202";

const ACCOUNTS_BALANCES_COA_SVC_URL = process.env["ACCOUNTS_BALANCES_COA_SVC_URL"] || "localhost:3300";
const PARTICIPANTS_SVC_URL = process.env["PARTICIPANTS_SVC_URL"] || "http://localhost:3010";
const SETTLEMENTS_SVC_URL = process.env["SETTLEMENTS_SVC_URL"] || "http://localhost:3600";
const SCHEDULING_SVC_URL = process.env["SCHEDULING_SVC_URL"] || "http://localhost:1234/reminders";

const SVC_CLIENT_ID = process.env["SVC_CLIENT_ID"] || "transfers-bc-command-handler-svc";
const SVC_CLIENT_SECRET = process.env["SVC_CLIENT_ID"] || "superServiceSecret";
// const USE_REDIS_TRANSFERS_REPO = (process.env["USE_REDIS_TRANSFERS_REPO"] && process.env["USE_REDIS_TRANSFERS_REPO"].toUpperCase()=="TRUE") || false;

const CONSUMER_BATCH_SIZE = (process.env["CONSUMER_BATCH_SIZE"] && parseInt(process.env["CONSUMER_BATCH_SIZE"])) || 100;
const CONSUMER_BATCH_TIMEOUT_MS = (process.env["CONSUMER_BATCH_TIMEOUT_MS"] && parseInt(process.env["CONSUMER_BATCH_TIMEOUT_MS"])) || 100;

const kafkaConsumerOptions: MLKafkaJsonConsumerOptions = {
	kafkaBrokerList: KAFKA_URL,
	kafkaGroupId: `${BC_NAME}_${APP_NAME}`,
    batchSize: CONSUMER_BATCH_SIZE,
    batchTimeoutMs: CONSUMER_BATCH_TIMEOUT_MS
};

const kafkaProducerOptions: MLKafkaJsonProducerOptions = {
	kafkaBrokerList: KAFKA_URL
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let globalLogger: ILogger;

// Express Server
const SVC_DEFAULT_HTTP_PORT = process.env["SVC_DEFAULT_HTTP_PORT"] || 3501;

const DB_NAME_TRANSFERS = "transfers";
const PARTICIPANTS_CLIENT_CACHE_MS = 10_000;

const SERVICE_START_TIMEOUT_MS = 60_000;

export class Service {
	static logger: ILogger;
    static app: Express;
    static expressServer: Server;
	static auditClient: IAuditClient;
	static messageConsumer: IMessageConsumer;
	static messageProducer: IMessageProducer;
	static handler: TransfersCommandHandler;
	static aggregate: TransfersAggregate;
	static participantService: IParticipantsServiceAdapter;
	static transfersRepo: ITransfersRepository;
    static bulkTransfersRepo: IBulkTransfersRepository;
	static accountAndBalancesAdapter: IAccountsBalancesAdapter;
    static metrics:IMetrics;
	static settlementsAdapter: ISettlementsServiceAdapter;
	static schedulingAdapter: ISchedulingServiceAdapter;
    static configClient: IConfigurationClient;
    static startupTimer: NodeJS.Timeout;

    static async start(
        logger?: ILogger,
        auditClient?: IAuditClient,
        messageConsumer?: IMessageConsumer,
        messageProducer?: IMessageProducer,
        participantAdapter?: IParticipantsServiceAdapter,
        transfersRepo?: ITransfersRepository,
        bulkTransfersRepo?: IBulkTransfersRepository,
        accountAndBalancesAdapter?: IAccountsBalancesAdapter,
        metrics?:IMetrics,
        settlementsAdapter?: ISettlementsServiceAdapter,
        schedulingAdapter?: ISchedulingServiceAdapter,
        configProvider?: IConfigProvider,
        aggregate?: TransfersAggregate
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
                LocalAuditClientCryptoProvider.createRsaPrivateKeyFileSync(AUDIT_KEY_FILE_PATH, 2048);
            }
            const auditLogger = logger.createChild("auditDispatcher");
            auditLogger.setLogLevel(LogLevel.INFO);

            const cryptoProvider = new LocalAuditClientCryptoProvider(AUDIT_KEY_FILE_PATH);
            const auditDispatcher = new KafkaAuditClientDispatcher(kafkaProducerOptions, KAFKA_AUDITS_TOPIC, auditLogger);
            // NOTE: to pass the same kafka logger to the audit client, make sure the logger is started/initialised already
            auditClient = new AuditClient(BC_NAME, APP_NAME, APP_VERSION, cryptoProvider, auditDispatcher);
            await auditClient.init();
        }
        this.auditClient = auditClient;

        if(!messageConsumer){
            const consumerHandlerLogger = logger.createChild("handlerConsumer");
            consumerHandlerLogger.setLogLevel(LogLevel.INFO);
            messageConsumer = new MLKafkaJsonConsumer(kafkaConsumerOptions, consumerHandlerLogger);
        }
        this.messageConsumer = messageConsumer;

        if (!messageProducer) {
            const producerLogger = logger.createChild("producerLogger");
            producerLogger.setLogLevel(LogLevel.INFO);
            messageProducer = new MLKafkaJsonProducer(kafkaProducerOptions, producerLogger);
            await messageProducer.connect();
        }
        this.messageProducer = messageProducer;

        if (!transfersRepo) {
            // if(USE_REDIS_TRANSFERS_REPO) {
            //     transfersRepo = new RedisTransfersRepo(logger, REDIS_HOST, REDIS_PORT);
            // }else{
                transfersRepo = new MongoTransfersRepo(logger,MONGO_URL, DB_NAME_TRANSFERS);
            // }

            await transfersRepo.init();
            logger.info("Transfer Registry Repo Initialized");
        }
        this.transfersRepo = transfersRepo;

        if (!bulkTransfersRepo) {
                bulkTransfersRepo = new MongoBulkTransfersRepo(logger,MONGO_URL, DB_NAME_TRANSFERS);

            await bulkTransfersRepo.init();
            logger.info("Transfer Registry Repo Initialized");
        }
        this.bulkTransfersRepo = bulkTransfersRepo;

        if (!participantAdapter) {
            const authRequester:IAuthenticatedHttpRequester = new AuthenticatedHttpRequester(logger, AUTH_N_SVC_TOKEN_URL);
            authRequester.setAppCredentials(SVC_CLIENT_ID, SVC_CLIENT_SECRET);
            participantAdapter = new ParticipantAdapter(this.logger, PARTICIPANTS_SVC_URL, authRequester, PARTICIPANTS_CLIENT_CACHE_MS);
        }
        this.participantService = participantAdapter;

        if(!accountAndBalancesAdapter) {
            // TODO put these credentials in env var
            const loginHelper = new LoginHelper(AUTH_N_SVC_TOKEN_URL, logger);
            loginHelper.setAppCredentials(SVC_CLIENT_ID, SVC_CLIENT_SECRET);

            accountAndBalancesAdapter = new GrpcAccountsAndBalancesAdapter(ACCOUNTS_BALANCES_COA_SVC_URL, loginHelper, logger);
            await accountAndBalancesAdapter.init();
        }
        this.accountAndBalancesAdapter = accountAndBalancesAdapter;

        if(!metrics){
            const labels: Map<string, string> = new Map<string, string>();
            labels.set("bc", BC_NAME);
            labels.set("app", APP_NAME);
            labels.set("version", APP_VERSION);
            PrometheusMetrics.Setup({prefix:"", defaultLabels: labels}, this.logger);
            metrics = PrometheusMetrics.getInstance();
        }
        this.metrics = metrics;


		if (!settlementsAdapter) {
            const authRequester:IAuthenticatedHttpRequester = new AuthenticatedHttpRequester(logger, AUTH_N_SVC_TOKEN_URL);
            authRequester.setAppCredentials(SVC_CLIENT_ID, SVC_CLIENT_SECRET);
			settlementsAdapter = new SettlementsAdapter(logger, SETTLEMENTS_SVC_URL, authRequester);
            await (settlementsAdapter as SettlementsAdapter).init();
		}
		this.settlementsAdapter = settlementsAdapter;

		if (!schedulingAdapter) {
			schedulingAdapter = new SchedulingAdapter(logger, SCHEDULING_SVC_URL);
		}
		this.schedulingAdapter = schedulingAdapter;

        if (!aggregate) {
            aggregate = new TransfersAggregate(this.logger, this.transfersRepo, this.bulkTransfersRepo, this.participantService, this.messageProducer, this.accountAndBalancesAdapter, this.metrics, this.settlementsAdapter, this.schedulingAdapter);
        }
        this.aggregate = aggregate;

        // create handler and start it
        this.handler = new TransfersCommandHandler(this.logger, this.auditClient, this.messageConsumer, this.metrics, this.aggregate);
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
            this.app.get("/health", (req: express.Request, res: express.Response) => {return res.send({ status: "OK" }); });
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
                globalLogger.info(`Transfer Command Handler Service started, version: ${this.configClient.applicationVersion}`);
                resolve();
            });

        });
    }


    static async stop() {
        if (this.expressServer) this.expressServer.close();
		if (this.handler) await this.handler.stop();
		if (this.messageConsumer) await this.messageConsumer.destroy(true);
		if (this.messageProducer) await this.messageProducer.destroy();
        if (this.configClient) await this.configClient.destroy();
		if (this.auditClient) await this.auditClient.destroy();
		if (this.logger && this.logger instanceof KafkaLogger) await this.logger.destroy();
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
