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
import crypto from "crypto";
import {ConsoleLogger, LogLevel} from "@mojaloop/logging-bc-public-types-lib";
import {IMessage, IMessageProducer} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {
	MLKafkaJsonProducer, MLKafkaJsonProducerOptions,
	MLKafkaJsonConsumer, MLKafkaJsonConsumerOptions
} from "@mojaloop/platform-shared-lib-nodejs-kafka-client-lib";
import {
	TransfersBCTopics,
	TransferPrepareRequestedEvt,
	TransferPrepareRequestedEvtPayload
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import {PrepareTransferCmd, PrepareTransferCmdPayload} from "@mojaloop/transfers-bc-domain-lib";

// change this to suit the test (ms), test kafka consumer groups tend to take time rebalancing
jest.setTimeout(60_000);

const KAFKA_URL = process.env["KAFKA_URL"] || "localhost:9092";

const logger = new ConsoleLogger();
logger.setLogLevel(LogLevel.INFO);
const kafkaProducerOptions: MLKafkaJsonProducerOptions = {
	kafkaBrokerList: KAFKA_URL
};
const kafkaConsumerOptions: MLKafkaJsonConsumerOptions = {
	kafkaBrokerList: KAFKA_URL,
	//sessionTimeoutMs: 10_000, // min is 6 secs, this should about it
	// kafkaGroupId: "transfers_integration_tests_" + Date.now()
	kafkaGroupId: "transfers_integration_tests"
};

let messageProducer: IMessageProducer;


describe("TransfersEventHandler Tests", () => {
	const producerLogger = new ConsoleLogger();
	producerLogger.setLogLevel(LogLevel.WARN);
	messageProducer = new MLKafkaJsonProducer(kafkaProducerOptions, producerLogger);

	beforeAll(async () => {
		// Setup
		await messageProducer.connect();
		//await new Promise(f => setTimeout(f, 500));
	});

	afterAll(async () => {
		// Cleanup
		await messageProducer.destroy();

		// wait for any final events from the consumers or producers
		await new Promise(f => setTimeout(f, 1000));
	});

	test("Send TransferPrepareRequestedEvt and get back PrepareTransferCmd", async () => {

		return new Promise<void>(async (resolve) => {
			const payload: TransferPrepareRequestedEvtPayload = {
				transferId: crypto.randomUUID(),
				amount: "100",
				currency: "EUR",
				payerId: "payer_fsp_id",
				payeeId: "payee_fsp_id",
				expirationTimestamp: Date.now() + 10_000,
				condition: "condition"
			};
			const msg = new TransferPrepareRequestedEvt(payload);

			const consumer = new MLKafkaJsonConsumer(kafkaConsumerOptions, logger);
			consumer.setTopics([TransfersBCTopics.DomainRequests]);

			consumer.setCallbackFn(async (message: IMessage) => {
				console.log("Msg received by consumer callback");
				if (message.msgName===PrepareTransferCmd.name) {
					expect(message.payload).toHaveProperty("transferId");
					expect(message.payload.transferId).toEqual(payload.transferId);

					// defer the resolve to after finishing this handlerFn, to allow the consumer to commit the offset
					setTimeout(()=>{
						consumer.destroy(true);
						resolve();
					}, 500);
				}
			});

			await consumer.connect();
			await consumer.start();

			// send the message
			await messageProducer.send(msg);
			await messageProducer.send(msg);
		});
	});

});
