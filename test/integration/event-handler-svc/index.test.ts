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
import { Service } from "../../../packages/event-handler-svc/src/service";
import {
    TransfersBCTopics,
    TransferFulfilRequestedEvt,
    TransferPrepareRequestedEvt,
    TransferRejectRequestedEvt,
	TransferQueryReceivedEvt,
    TransferTimeoutEvt,
    BulkTransferPrepareRequestedEvt,
    BulkTransferFulfilRequestedEvt,
    BulkTransferRejectRequestedEvt,
    BulkTransferQueryReceivedEvt
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import { 
    CommitTransferFulfilCmd,
    PrepareTransferCmd,
    QueryTransferCmd,
    RejectTransferCmd,
    TimeoutTransferCmd,
    PrepareBulkTransferCmd,
    CommitBulkTransferFulfilCmd,
    RejectBulkTransferCmd,
    QueryBulkTransferCmd
} from "../../../packages/domain-lib/dist";

const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.FATAL);

const consumer = new KafkaConsumer([TransfersBCTopics.DomainRequests, TransfersBCTopics.DomainEvents])

jest.setTimeout(60000);

describe("Transfers Event Handler - Integration", () => {

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

    test("should send PrepareTransferCmd from a TransferPrepareRequestedEvt", async () => {
        // Arrange
        const message = new TransferPrepareRequestedEvt({
            transferId: "transferId",
            payeeFsp: "payeeFsp",
            payerFsp: "payerFsp",
            amount: "amount.amount",
            currencyCode: "amount.currency",
            ilpPacket: "ilpPacket",
            condition: "condition",
            expiration: 123,
            extensionList: null
        });
        
        message.fspiopOpaqueState = { "test": "empty", prepareSendTimestamp: 123 }
        
        // Act
        await consumer.sendMessage(message);

        await new Promise((r) => setTimeout(r, 2000));

        const messages = consumer.getEvents();

        // Assert
        expect(messages[0].msgName).toBe(TransferPrepareRequestedEvt.name);
        expect(messages[1].msgName).toBe(PrepareTransferCmd.name);

    });

    test("should send CommitTransferFulfilCmd from a TransferFulfilRequestedEvt", async () => {
        // Arrange
        const message = new TransferFulfilRequestedEvt({
            transferId: "transferId",
            transferState: "ACCEPTED",
            fulfilment: "randomfullfilment",
            completedTimestamp: 123456789,
            notifyPayee: false,
            extensionList: null
        });
        
        message.fspiopOpaqueState = { "test": "empty", committedSendTimestamp: 123 }
        
        // Act
        await consumer.sendMessage(message);

        await new Promise((r) => setTimeout(r, 2000));

        const messages = consumer.getEvents();

        // Assert
        expect(messages[0].msgName).toBe(TransferFulfilRequestedEvt.name);
        expect(messages[1].msgName).toBe(CommitTransferFulfilCmd .name);

    });
        
    test("should send RejectTransferCmd from a TransferRejectRequestedEvt", async () => {
        // Arrange
        const message = new TransferRejectRequestedEvt({
            transferId: "transferId",
            errorInformation: {
                errorCode: "randomcode",
                errorDescription: "random error description"
            }
        });
                
        // Act
        await consumer.sendMessage(message);

        await new Promise((r) => setTimeout(r, 2000));

        const messages = consumer.getEvents();

        // Assert
        expect(messages[0].msgName).toBe(TransferRejectRequestedEvt.name);
        expect(messages[1].msgName).toBe(RejectTransferCmd.name);

    });
    
    test("should send QueryTransferCmd from a TransferQueryReceivedEvt", async () => {
        // Arrange
        const message = new TransferQueryReceivedEvt({
            transferId: "transferId"
        });
        
        // Act
        await consumer.sendMessage(message);

        await new Promise((r) => setTimeout(r, 2000));

        const messages = consumer.getEvents();

        // Assert
        expect(messages[0].msgName).toBe(TransferQueryReceivedEvt.name);
        expect(messages[1].msgName).toBe(QueryTransferCmd.name);

    });
        
    test("should send TimeoutTransferCmd from a TransferTimeoutEvt", async () => {
        // Arrange
        const message = new TransferTimeoutEvt({
            transferId: "transferId"
        });
        
        // Act
        await consumer.sendMessage(message);

        await new Promise((r) => setTimeout(r, 2000));

        const messages = consumer.getEvents();

        // Assert
        expect(messages[0].msgName).toBe(TransferTimeoutEvt.name);
        expect(messages[1].msgName).toBe(TimeoutTransferCmd.name);

    });

    test("should send PrepareBulkTransferCmd from a BulkTransferPrepareRequestedEvt", async () => {
        // Arrange
        const message = new BulkTransferPrepareRequestedEvt({
            bulkTransferId: "bulkTransferId",
            bulkQuoteId: "bulkQuoteId",
            payeeFsp: "payeeFsp",
            payerFsp: "payerFsp",
            individualTransfers: [],
			expiration: 2697585442210,
			extensionList: null
        });
        
        // Act
        await consumer.sendMessage(message);

        await new Promise((r) => setTimeout(r, 2000));

        const messages = consumer.getEvents();

        // Assert
        expect(messages[0].msgName).toBe(BulkTransferPrepareRequestedEvt.name);
        expect(messages[1].msgName).toBe(PrepareBulkTransferCmd.name);

    });

    test("should send CommitBulkTransferFulfilCmd from a BulkTransferFulfilRequestedEvt", async () => {
        // Arrange
        const message = new BulkTransferFulfilRequestedEvt({
            bulkTransferId: "bulkTransferId",
            completedTimestamp: 2697585442210,
            bulkTransferState: "PENDING",
            individualTransferResults: [],
            extensionList: null
        });
        
        // Act
        await consumer.sendMessage(message);

        await new Promise((r) => setTimeout(r, 2000));

        const messages = consumer.getEvents();

        // Assert
        expect(messages[0].msgName).toBe(BulkTransferFulfilRequestedEvt.name);
        expect(messages[1].msgName).toBe(CommitBulkTransferFulfilCmd.name);

    });

    test("should send RejectBulkTransferCmd from a BulkTransferRejectRequestedEvt", async () => {
        // Arrange
        const message = new BulkTransferRejectRequestedEvt({
            bulkTransferId: "bulkTransferId",
            errorInformation: {
                errorCode: "errorCode",
                errorDescription: "errorDescription",
                extensionList: null,
            }
        });
        
        // Act
        await consumer.sendMessage(message);

        await new Promise((r) => setTimeout(r, 2000));

        const messages = consumer.getEvents();

        // Assert
        expect(messages[0].msgName).toBe(BulkTransferRejectRequestedEvt.name);
        expect(messages[1].msgName).toBe(RejectBulkTransferCmd.name);

    });

    test("should send QueryBulkTransferCmd from a BulkTransferQueryReceivedEvt", async () => {
        // Arrange
        const message = new BulkTransferQueryReceivedEvt({
            bulkTransferId: "bulkTransferId",
        });
        
        // Act
        await consumer.sendMessage(message);

        await new Promise((r) => setTimeout(r, 2000));

        const messages = consumer.getEvents();

        // Assert
        expect(messages[0].msgName).toBe(BulkTransferQueryReceivedEvt.name);
        expect(messages[1].msgName).toBe(QueryBulkTransferCmd.name);

    });
});


