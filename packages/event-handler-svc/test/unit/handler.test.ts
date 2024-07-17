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

import { 
    MemoryAuditService,
    mockedTransferPreparePayload,
    mockedTransferFulfilPayload,
    mockedTransferQueryPayload,
    mockedTransferRejectPayload,
    mockedBulkTransferPreparePayload,
    mockedBulkTransferFulfilPayload,
    mockedBulkTransferQueryPayload,
    mockedBulkTransferRejectedPayload,
    mockedTransferTimeoutPayload,
} from "@mojaloop/transfers-bc-shared-mocks-lib";
import { ConsoleLogger, ILogger, LogLevel } from "@mojaloop/logging-bc-public-types-lib";
import { MessageTypes } from "@mojaloop/platform-shared-lib-messaging-types-lib";
import { TransfersEventHandler } from "../../src/handler";
import { IMetrics, MetricsMock } from "@mojaloop/platform-shared-lib-observability-types-lib";
import { 
    TransferPrepareRequestedEvt,
    TransferFulfilRequestedEvt,
    TransferRejectRequestedEvt,
    TransferQueryReceivedEvt,
    TransferTimeoutEvt,
    BulkTransferPrepareRequestedEvt,
    BulkTransferFulfilRequestedEvt,
    BulkTransferRejectRequestedEvt,
    BulkTransferQueryReceivedEvt,
    TransfersBCTopics
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import { 
    PrepareTransferCmd,
    CommitTransferFulfilCmd, 
    RejectTransferCmd,
    QueryTransferCmd,
    PrepareBulkTransferCmd,
    CommitBulkTransferFulfilCmd,
    RejectBulkTransferCmd,
    QueryBulkTransferCmd,
    TimeoutTransferCmd,
} from "../../../domain-lib/src/commands";


const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.FATAL);

const mockedAuditService = new MemoryAuditService(logger);

const messageConsumerMock = {
    setTopics: jest.fn(),
    setBatchCallbackFn: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    startAndWaitForRebalance: jest.fn().mockResolvedValue(undefined),
};
const messageProducerMock = {
    connect: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue(undefined),
};
const metricsMock: IMetrics = new MetricsMock();


describe('Event Handler - Unit Tests for TransfersBC Event Handler', () => {
    let transfersEventHandler:any;

    beforeEach(() => {
        transfersEventHandler = new TransfersEventHandler(logger, mockedAuditService, messageConsumerMock as any, messageProducerMock as any, metricsMock);
    });

    it('should connect message producer and start message consumer', async () => {
        messageProducerMock.connect.mockResolvedValue(undefined);
        messageConsumerMock.setTopics.mockImplementation(() => {});
        messageConsumerMock.setBatchCallbackFn.mockImplementation(() => {});
        messageConsumerMock.connect.mockResolvedValue(undefined);
        messageConsumerMock.startAndWaitForRebalance.mockResolvedValue(undefined);

        await transfersEventHandler.start();

        expect(messageProducerMock.connect).toHaveBeenCalled();
        expect(messageConsumerMock.setTopics).toHaveBeenCalledWith([TransfersBCTopics.DomainRequests, TransfersBCTopics.DomainEvents, TransfersBCTopics.TimeoutEvents]);
        expect(messageConsumerMock.setBatchCallbackFn).toHaveBeenCalled();
        expect(messageConsumerMock.connect).toHaveBeenCalled();
        expect(messageConsumerMock.startAndWaitForRebalance).toHaveBeenCalled();
    });
 
    it('should process TransferPrepareRequestedEvt successfully', async () => {
        // Arrange
        const payload = {
            bulkTransferId: null,
            ...mockedTransferPreparePayload,
        };

        const fspiopOpaqueState = { 
            committedSendTimestamp: 123456789, 
            prepareSendTimestamp: 123456789,
            extensionList: {
                extension: [
                    { key: "exampleKey1", value: "exampleValue1" },
                    { key: "exampleKey2", value: "exampleValue2" }
                ]
            } 
        };

        const receivedMessages = [
            { 
                msgType: MessageTypes.DOMAIN_EVENT, 
                msgName: TransferPrepareRequestedEvt.name, 
                payload: payload, 
                fspiopOpaqueState: fspiopOpaqueState 
            },
        ];

        jest.spyOn(messageProducerMock, "send");

        // Act
        await transfersEventHandler._batchMsgHandler(receivedMessages);

        // Assert
        expect(messageProducerMock.send).toHaveBeenCalledWith([
            expect.objectContaining({
                msgName: PrepareTransferCmd.name,
                payload: payload,
                fspiopOpaqueState: fspiopOpaqueState
            })
        ]);
    });

    it('should process TransferFulfilRequestedEvt successfully', async () => {
        // Arrange
        const payload = {
            ...mockedTransferFulfilPayload,
        };

        const fspiopOpaqueState = { 
            committedSendTimestamp: 123456789, 
            prepareSendTimestamp: 123456789,
            extensionList: {
                extension: [
                    { key: "exampleKey1", value: "exampleValue1" },
                    { key: "exampleKey2", value: "exampleValue2" }
                ]
            },
            fullfilment: "abc"
        };

        const receivedMessages = [
            { 
                msgType: MessageTypes.DOMAIN_EVENT, 
                msgName: TransferFulfilRequestedEvt.name, 
                payload: payload, 
                fspiopOpaqueState: fspiopOpaqueState 
            },
        ];

        jest.spyOn(messageProducerMock, "send");

        // Act
        await transfersEventHandler._batchMsgHandler(receivedMessages);

        // Assert
        expect(messageProducerMock.send).toHaveBeenCalledWith([
            expect.objectContaining({
                msgName: CommitTransferFulfilCmd.name,
                payload: payload,
                fspiopOpaqueState: fspiopOpaqueState
            })
        ]);
    });

    it('should process TransferQueryReceivedEvt successfully', async () => {
        // Arrange
        const payload = {
            ...mockedTransferQueryPayload,
        };

        const fspiopOpaqueState = { 
            committedSendTimestamp: 123456789, 
            prepareSendTimestamp: 123456789,
            extensionList: {
                extension: [
                    { key: "exampleKey1", value: "exampleValue1" },
                    { key: "exampleKey2", value: "exampleValue2" }
                ]
            } 
        };

        const receivedMessages = [
            { 
                msgType: MessageTypes.DOMAIN_EVENT, 
                msgName: TransferQueryReceivedEvt.name, 
                payload: payload, 
                fspiopOpaqueState: fspiopOpaqueState
            },
        ];

        jest.spyOn(messageProducerMock, "send");

        // Act
        await transfersEventHandler._batchMsgHandler(receivedMessages);

        // Assert
        expect(messageProducerMock.send).toHaveBeenCalledWith([
            expect.objectContaining({
                msgName: QueryTransferCmd.name,
                payload: payload,
                fspiopOpaqueState: fspiopOpaqueState
            })
        ]);
    });

    it('should process TransferRejectRequestedEvt successfully', async () => {
        // Arrange
        const payload = {
            ...mockedTransferRejectPayload,
        };

        const fspiopOpaqueState = { 
            committedSendTimestamp: 123456789, 
            prepareSendTimestamp: 123456789,
            extensionList: {
                extension: [
                    { key: "exampleKey1", value: "exampleValue1" },
                    { key: "exampleKey2", value: "exampleValue2" }
                ]
            } 
        };

        const receivedMessages = [
            { 
                msgType: MessageTypes.DOMAIN_EVENT, 
                msgName: TransferRejectRequestedEvt.name, 
                payload: payload, 
                fspiopOpaqueState: fspiopOpaqueState 
            },
        ];

        jest.spyOn(messageProducerMock, "send");

        // Act
        await transfersEventHandler._batchMsgHandler(receivedMessages);

        // Assert
        expect(messageProducerMock.send).toHaveBeenCalledWith([
            expect.objectContaining({
                msgName: RejectTransferCmd.name,
                payload: payload,
                fspiopOpaqueState: fspiopOpaqueState
            })
        ]);
    });
    
    it('should process BulkTransferPrepareRequestedEvt successfully', async () => {
        // Arrange
        const payload = {
            ...mockedBulkTransferPreparePayload,
        };

        const fspiopOpaqueState = { 
            committedSendTimestamp: 123456789, 
            prepareSendTimestamp: 123456789,
            extensionList: {
                extension: [
                    { key: "exampleKey1", value: "exampleValue1" },
                    { key: "exampleKey2", value: "exampleValue2" }
                ]
            } 
        };

        const receivedMessages = [
            { 
                msgType: MessageTypes.DOMAIN_EVENT, 
                msgName: BulkTransferPrepareRequestedEvt.name, 
                payload: payload, 
                fspiopOpaqueState: fspiopOpaqueState
            },
        ];

        jest.spyOn(messageProducerMock, "send");

        // Act
        await transfersEventHandler._batchMsgHandler(receivedMessages);

        // Assert
        expect(messageProducerMock.send).toHaveBeenCalledWith([
            expect.objectContaining({
                msgName: PrepareBulkTransferCmd.name,
                payload: payload,
                fspiopOpaqueState: fspiopOpaqueState
            })
        ]);
    });
    
    it('should process BulkTransferFulfilRequestedEvt successfully', async () => {
        // Arrange
        const payload = {
            ...mockedBulkTransferFulfilPayload,
        };

        const fspiopOpaqueState = { 
            committedSendTimestamp: 123456789, 
            prepareSendTimestamp: 123456789,
            extensionList: {
                extension: [
                    { key: "exampleKey1", value: "exampleValue1" },
                    { key: "exampleKey2", value: "exampleValue2" }
                ]
            }
        };

        const receivedMessages = [
            { 
                msgType: MessageTypes.DOMAIN_EVENT, 
                msgName: BulkTransferFulfilRequestedEvt.name, 
                payload: payload, 
                fspiopOpaqueState: fspiopOpaqueState
            },
        ];

        jest.spyOn(messageProducerMock, "send");

        // Act
        await transfersEventHandler._batchMsgHandler(receivedMessages);

        // Assert
        expect(messageProducerMock.send).toHaveBeenCalledWith([
            expect.objectContaining({
                msgName: CommitBulkTransferFulfilCmd.name,
                payload: payload,
                fspiopOpaqueState: fspiopOpaqueState
            })
        ]);
    });

    it('should process BulkTransferQueryReceivedEvt successfully', async () => {
        // Arrange
        const payload = {
            ...mockedBulkTransferQueryPayload,
        };

        const fspiopOpaqueState = { 
            committedSendTimestamp: 123456789, 
            prepareSendTimestamp: 123456789,
            extensionList: {
                extension: [
                    { key: "exampleKey1", value: "exampleValue1" },
                    { key: "exampleKey2", value: "exampleValue2" }
                ]
            } 
        };

        const receivedMessages = [
            { 
                msgType: MessageTypes.DOMAIN_EVENT, 
                msgName: BulkTransferQueryReceivedEvt.name,
                payload: payload,
                fspiopOpaqueState: fspiopOpaqueState
            },
        ];

        jest.spyOn(messageProducerMock, "send");

        // Act
        await transfersEventHandler._batchMsgHandler(receivedMessages);

        // Assert
        expect(messageProducerMock.send).toHaveBeenCalledWith([
            expect.objectContaining({
                msgName: QueryBulkTransferCmd.name,
                payload: payload,
                fspiopOpaqueState: fspiopOpaqueState
            })
        ]);
    });

    
    it('should process BulkTransferRejectRequestedEvt successfully', async () => {
        // Arrange
        const payload = {
            ...mockedBulkTransferRejectedPayload,
        };

        const fspiopOpaqueState = { 
            committedSendTimestamp: 123456789, 
            prepareSendTimestamp: 123456789,
            extensionList: {
                extension: [
                    { key: "exampleKey1", value: "exampleValue1" },
                    { key: "exampleKey2", value: "exampleValue2" }
                ]
            } 
        };

        const receivedMessages = [
            { 
                msgType: MessageTypes.DOMAIN_EVENT, 
                msgName: BulkTransferRejectRequestedEvt.name, 
                payload: payload, 
                fspiopOpaqueState: fspiopOpaqueState 
            },
        ];

        jest.spyOn(messageProducerMock, "send");

        // Act
        await transfersEventHandler._batchMsgHandler(receivedMessages);

        // Assert
        expect(messageProducerMock.send).toHaveBeenCalledWith([
            expect.objectContaining({
                msgName: RejectBulkTransferCmd.name,
                payload: payload,
                fspiopOpaqueState: fspiopOpaqueState
            })
        ]);
    });

    it('should process TransferTimeoutEvt successfully', async () => {
        // Arrange
        const fspiopOpaqueState = { 
            committedSendTimestamp: 123456789, 
            prepareSendTimestamp: 123456789,
            extensionList: {
                extension: [
                    { key: "exampleKey1", value: "exampleValue1" },
                    { key: "exampleKey2", value: "exampleValue2" }
                ]
            } 
        };

        const payload = {
            ...mockedTransferTimeoutPayload,
            timeout: fspiopOpaqueState
        };

        const receivedMessages = [
            { 
                msgType: MessageTypes.DOMAIN_EVENT, 
                msgName: TransferTimeoutEvt.name, 
                payload: payload, 
                fspiopOpaqueState: fspiopOpaqueState 
            },
        ];

        jest.spyOn(messageProducerMock, "send");

        // Act
        await transfersEventHandler._batchMsgHandler(receivedMessages);

        // Assert
        expect(messageProducerMock.send).toHaveBeenCalledWith([
            expect.objectContaining({
                msgName: TimeoutTransferCmd.name,
                payload: payload,
                fspiopOpaqueState: fspiopOpaqueState
            })
        ]);
    });
});