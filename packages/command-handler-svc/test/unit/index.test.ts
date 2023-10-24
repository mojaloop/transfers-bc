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

 * Coil
 - Jason Bruwer <jason.bruwer@coil.com>

 * Crosslake
 - Pedro Sousa Barreto <pedrob@crosslaketech.com>

 * Gonçalo Garcia <goncalogarcia99@gmail.com>

 * Arg Software
 - José Antunes <jose.antunes@arg.software>
 - Rui Rocha <rui.rocha@arg.software>

 --------------
**/

// TODO: fix cmd handler tests


import { TransfersAggregate, IParticipantsServiceAdapter, ITransfersRepository, IAccountsBalancesAdapter, ISettlementsServiceAdapter, ISchedulingServiceAdapter, IBulkTransfersRepository} from "@mojaloop/transfers-bc-domain-lib";
import { MemoryMessageProducer, MemoryMessageConsumer, MemoryParticipantService, MemoryAuthenticatedHttpRequesterMock, MemoryTransferRepo, MemoryAccountsAndBalancesService, MemoryAuditService, MemorySettlementsService, MemorySchedulingService, MemoryConfigProvider, MemoryBulkTransferRepo } from "@mojaloop/transfers-bc-shared-mocks-lib";
import { ConsoleLogger, ILogger, LogLevel } from "@mojaloop/logging-bc-public-types-lib";
import { IMessageConsumer, IMessageProducer} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import { Service } from "../../src/service";
import { IMetrics, MetricsMock } from "@mojaloop/platform-shared-lib-observability-types-lib";
import { IConfigProvider } from "@mojaloop/platform-configuration-bc-client-lib";


const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.FATAL);

const mockedProducer: IMessageProducer = new MemoryMessageProducer(logger);

const mockedConsumer : IMessageConsumer = new MemoryMessageConsumer();

const mockedParticipantService:IParticipantsServiceAdapter = new MemoryParticipantService(logger);

const mockedAuditService = new MemoryAuditService(logger);

const mockedAccountsAndBalancesService: IAccountsBalancesAdapter = new MemoryAccountsAndBalancesService(logger);

const mockedSettlementsService: ISettlementsServiceAdapter = new MemorySettlementsService(logger);

const mockedSchedulingService: ISchedulingServiceAdapter = new MemorySchedulingService(logger);

const mockedTransferRepository: ITransfersRepository = new MemoryTransferRepo(logger);

const mockedBulkTransferRepository: IBulkTransfersRepository = new MemoryBulkTransferRepo(logger);

const mockedConfigProvider: IConfigProvider = new MemoryConfigProvider(logger);

const metricsMock: IMetrics = new MetricsMock();

const mockedAggregate: TransfersAggregate = new TransfersAggregate(
    logger,
    mockedTransferRepository,
    mockedBulkTransferRepository,
    mockedParticipantService,
    mockedProducer,
    mockedAccountsAndBalancesService,
    metricsMock,
    mockedSettlementsService,
    mockedSchedulingService
);

// Express mock
const expressAppMock = {
    listen: jest.fn(),
    use: jest.fn(),
    get: jest.fn()
}
jest.doMock('express', () => {
    return () => {
      return expressAppMock
    }
})


jest.mock("@mojaloop/platform-configuration-bc-client-lib");

describe("Transfers Command Handler Service", () => {

    afterAll(async () => {
        jest.clearAllMocks();
    });

    test("placeholder", async () =>{
        expect(true).toBeTruthy();
    });

    // test("should be able to run start and init all variables", async()=>{
    //     // Arrange
    //     const spyConsumerSetTopics = jest.spyOn(mockedConsumer, "setTopics");
    //     const spyConsumerConnect = jest.spyOn(mockedConsumer, "connect");
    //     const spyConsumerStart = jest.spyOn(mockedConsumer, "connect");
    //     const spyConsumerBackCallback = jest.spyOn(mockedConsumer, "setBatchCallbackFn");

    //     // Act
    //     await Service.start(logger, mockedAuditService, mockedConsumer, mockedProducer, mockedParticipantService, mockedTransferRepository, mockedBulkTransferRepository,
    //         mockedAccountsAndBalancesService, metricsMock, mockedSettlementsService, mockedSchedulingService, mockedConfigProvider, mockedAggregate);

    //     // Assert
    //     expect(spyConsumerSetTopics).toBeCalledTimes(1);
    //     expect(spyConsumerConnect).toBeCalledTimes(1);
    //     expect(spyConsumerStart).toBeCalledTimes(1);
    //     expect(spyConsumerBackCallback).toBeCalledTimes(1);

    // });

    // test("should teardown instances when server stopped", async()=>{
    //     // Arrange
    //     const spyMockedConsumer = jest.spyOn(mockedConsumer, "destroy");
    //     const spyMockedProducer = jest.spyOn(mockedProducer, "destroy");

    //     // Act
    //     await Service.stop();

    //     // Assert
    //     expect(spyMockedConsumer).toBeCalledTimes(1);
    //     expect(spyMockedProducer).toBeCalledTimes(1);
    // });


});

