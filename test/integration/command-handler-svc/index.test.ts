/**
 License
 --------------
 Copyright © 2021 Mojaloop Foundation

 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License.

 You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list (alphabetical ordering) of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>

 * Arg Software
 - José Antunes <jose.antunes@arg.software>
 - Rui Rocha <rui.rocha@arg.software>

 --------------
**/

"use strict";
import { KafkaConsumer } from "@mojaloop/transfers-bc-shared-mocks-lib";
import { ConsoleLogger, ILogger, LogLevel } from "@mojaloop/logging-bc-public-types-lib";
import { Service } from "../../../packages/command-handler-svc/src/service";
import {
    TransfersBCTopics,
    TransferFulfilRequestedEvt,
    TransferPrepareRequestedEvt,
    TransferRejectRequestedEvt,
	TransferQueryReceivedEvt,
    TransferTimeoutEvt
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import { CommitTransferFulfilCmd, PrepareTransferCmd, QueryTransferCmd, RejectTransferCmd, TimeoutTransferCmd } from "../../../packages/domain-lib/dist";

const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.FATAL);

const consumer = new KafkaConsumer([TransfersBCTopics.DomainRequests, TransfersBCTopics.DomainEvents])

jest.setTimeout(60000);

describe("Transfers Command Handler - Integration", () => {

    beforeAll(async () => {
        process.env = Object.assign(process.env, {
            PLATFORM_CONFIG_BASE_SVC_URL: "http://localhost:3100/"
        });
        
        await Service.start();
        await consumer.init();
    });

    beforeEach(async () => {
        await consumer.clearEvents();
    });

    afterAll(async () => {
        await Service.stop();
        await consumer.destroy();
    });

    test("should process the batch command if receiving a command message", async () => {
        // Arrange
		const command = new PrepareTransferCmd ({
            bulkTransferId: null,
            transferId: "transferId",
            payeeFsp: "payeeFsp",
            payerFsp: "payerFsp",
            amount: "amount.amount",
            currencyCode: "amount.currency",
            ilpPacket: "ilpPacket",
            condition: "condition",
            expiration: 123,
            extensionList: null,
            prepare: {} as any
		});

                
        // Act
        await consumer.sendMessage(command);

        await new Promise((r) => setTimeout(r, 5000));

        const messages = consumer.getEvents();

        await new Promise((r) => setTimeout(r, 2000));


        // Assert
        expect(messages[0].msgName).toBe(PrepareTransferCmd.name);

    });


    test("should ignore if message is not of type command", async () => {
        // Arrange
		const command = new PrepareTransferCmd ({
            bulkTransferId: null,
            transferId: "transferId",
            payeeFsp: "payeeFsp",
            payerFsp: "payerFsp",
            amount: "amount.amount",
            currencyCode: "amount.currency",
            ilpPacket: "ilpPacket",
            condition: "condition",
            expiration: 123,
            extensionList: null,
            prepare: {} as any
		});

        command.msgType = "nonexisting type" as any;

        // Act
        await consumer.sendMessage(command);

        await new Promise((r) => setTimeout(r, 5000));

        const messages = consumer.getEvents();

        await new Promise((r) => setTimeout(r, 2000));


        // Assert
        expect(messages[0].msgName).toBe(PrepareTransferCmd.name);
        expect(messages.length).toBe(1);

    });
});


