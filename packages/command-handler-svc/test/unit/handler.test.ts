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
    MemoryMessageProducer,
    MemoryAuditService,
    MemoryParticipantService,
    MemoryAccountsAndBalancesService,
    MemorySettlementsService,
    MemorySchedulingService,
    MemoryTransferRepo,
    MemoryBulkTransferRepo 
} from "@mojaloop/transfers-bc-shared-mocks-lib";
import { ConsoleLogger, ILogger, LogLevel } from "@mojaloop/logging-bc-public-types-lib";
import {
    IMessageProducer,
    MessageTypes,
} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import { TransfersCommandHandler } from "../../src/handler";
import { IMetrics, MetricsMock } from "@mojaloop/platform-shared-lib-observability-types-lib";
import { TransfersBCTopics } from "@mojaloop/platform-shared-lib-public-messages-lib";
import { 
    IAccountsBalancesAdapter,
    IBulkTransfersRepository,
    IParticipantsServiceAdapter,
    ISchedulingServiceAdapter,
    ISettlementsServiceAdapter,
    ITransfersRepository,
    TransfersAggregate 
} from "@mojaloop/transfers-bc-domain-lib";

const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.FATAL);

const mockedAuditService = new MemoryAuditService(logger);

const messageConsumerMock = {
    setTopics: jest.fn(),
    setBatchCallbackFn: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    startAndWaitForRebalance: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn(),
};

const mockedMessageProducer: IMessageProducer = new MemoryMessageProducer(logger);


const mockedParticipantService:IParticipantsServiceAdapter = new MemoryParticipantService(logger);

const mockedAccountsAndBalancesService: IAccountsBalancesAdapter = new MemoryAccountsAndBalancesService(logger);

const mockedSettlementsService: ISettlementsServiceAdapter = new MemorySettlementsService(logger);

const mockedSchedulingService: ISchedulingServiceAdapter = new MemorySchedulingService(logger);

const mockedTransferRepository: ITransfersRepository = new MemoryTransferRepo(logger);

const mockedBulkTransferRepository: IBulkTransfersRepository = new MemoryBulkTransferRepo(logger);

const metricsMock: IMetrics = new MetricsMock();

const mockedAggregate: TransfersAggregate = new TransfersAggregate(
    logger,
    mockedTransferRepository,
    mockedBulkTransferRepository,
    mockedParticipantService,
    mockedMessageProducer,
    mockedAccountsAndBalancesService,
    metricsMock,
    mockedSettlementsService,
    mockedSchedulingService,
);

describe('Command Handler - Unit Tests for TransfersBC Command Handler', () => {
    let transfersCommandHandler:any;

    beforeEach(() => {
        transfersCommandHandler = new TransfersCommandHandler(logger, mockedAuditService, messageConsumerMock as any, metricsMock, mockedAggregate);
    });

    it('should set topics, set batch callback, connect, and start message consumer', async () => {
        // Arrange & Act
        await transfersCommandHandler.start();

        // Assert
        expect(messageConsumerMock.setTopics).toHaveBeenCalledWith([TransfersBCTopics.DomainRequests]);
        expect(messageConsumerMock.setBatchCallbackFn).toHaveBeenCalled();
        expect(messageConsumerMock.connect).toHaveBeenCalled();
        expect(messageConsumerMock.startAndWaitForRebalance).toHaveBeenCalled();
    });

    it('should process batch messages successfully', async () => {
        // Arrange
        const receivedMessages = [
            { msgType: MessageTypes.COMMAND },
            { msgType: MessageTypes.COMMAND }
        ];

        jest.spyOn(mockedAggregate, "processCommandBatch").mockImplementationOnce(async () => {});

        // Act
        await transfersCommandHandler._batchMsgHandler(receivedMessages);

        // Assert
        expect(mockedAggregate.processCommandBatch).toHaveBeenCalledWith(receivedMessages);
    });

    it('should not do anything if there are no messages of type COMMAND', async () => {
        // Arrange & Act
        const receivedMessages = [
            { msgType: MessageTypes.DOMAIN_EVENT },
            { msgType: MessageTypes.DOMAIN_EVENT }
        ];

        jest.spyOn(mockedAggregate, "processCommandBatch");

        // Act
        await transfersCommandHandler._batchMsgHandler(receivedMessages);

        // Assert
        expect(mockedAggregate.processCommandBatch).not.toHaveBeenCalled();
    });

    it('should successfully stop the handler', async () => {
        // Arrange & Act
        await transfersCommandHandler.stop();

        // Assert
        expect(messageConsumerMock.stop).toHaveBeenCalled();
    });
});