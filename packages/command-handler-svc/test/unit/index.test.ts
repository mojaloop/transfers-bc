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


import { TransfersAggregate, IParticipantsServiceAdapter, ITransfersRepository, IAccountsBalancesAdapter, ISettlementsServiceAdapter, ISchedulingServiceAdapter} from "@mojaloop/transfers-bc-domain-lib";
import { MemoryMessageProducer, MemoryMessageConsumer, MemoryParticipantService, MemoryAuthenticatedHttpRequesterMock, MemoryTransferRepo, MemoryAccountsAndBalancesService, MemoryAuditService, MemorySettlementsService, MemorySchedulingService, MemoryConfigProvider } from "@mojaloop/transfers-bc-shared-mocks-lib";
import { ConsoleLogger, ILogger, LogLevel } from "@mojaloop/logging-bc-public-types-lib";
import { IMessageConsumer, IMessageProducer} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import { IAuthenticatedHttpRequester } from "@mojaloop/security-bc-public-types-lib";
import { Service } from "../../src/service";
import { IMetrics, MetricsMock } from "@mojaloop/platform-shared-lib-observability-types-lib";
import { IConfigProvider } from "@mojaloop/platform-configuration-bc-client-lib";
const express = require("express");


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

const mockedConfigProvider: IConfigProvider = new MemoryConfigProvider(logger);

const metricsMock: IMetrics = new MetricsMock();

const mockedAggregate: TransfersAggregate = new TransfersAggregate(
    logger,
    mockedTransferRepository,
    mockedParticipantService,
    mockedProducer,
    mockedAccountsAndBalancesService,
    metricsMock,
    mockedSettlementsService,
    mockedSchedulingService
);

// Express mock
const expressApp = {
    use: jest.fn(),
    listen: jest.fn()
}
jest.doMock('express', () => {
    return () => {
      return expressApp
    }
})


jest.mock('../../../transfers-config-lib/dist')

// express.json = jest.fn();
// express.urlencoded = jest.fn();
// express.Router = jest.fn().mockImplementation(() => { 
//     return routerSpy 
// });

jest.setTimeout(10000);

describe("Transfers Command Handler Service", () => {

    beforeAll(async () => {
        process.env = Object.assign(process.env, {
            PLATFORM_CONFIG_BASE_SVC_URL: "http://localhost:3100/"
        });
    });


    afterAll(async () => {
        jest.clearAllMocks();
    });

    test("should be able to run start and init all variables", async()=>{
        // Arrange
        const spyConsumerSetTopics = jest.spyOn(mockedConsumer, "setTopics");
        const spyConsumerConnect = jest.spyOn(mockedConsumer, "connect");
        const spyConsumerStart = jest.spyOn(mockedConsumer, "connect");
        const spyConsumerBackCallback = jest.spyOn(mockedConsumer, "setBatchCallbackFn");
        const spyProducerInit = jest.spyOn(mockedProducer, "connect");
        const spyAggregateInit = jest.spyOn(mockedAggregate, "init");

        // Act
        await Service.start(logger, mockedAuditService, mockedConsumer, mockedProducer, mockedParticipantService, mockedTransferRepository,
            mockedAccountsAndBalancesService, metricsMock, mockedSettlementsService, mockedSchedulingService, mockedConfigProvider, mockedAggregate);

        // Assert
        expect(spyConsumerSetTopics).toBeCalledTimes(1);
        expect(spyConsumerConnect).toBeCalledTimes(1);
        expect(spyConsumerStart).toBeCalledTimes(1);
        expect(spyConsumerBackCallback).toBeCalledTimes(1);
        // expect(spyProducerInit).toBeCalledTimes(1); // TODO: shouldn't we call init outside the if condition?
        // expect(spyAggregateInit).toBeCalledTimes(1);
        // expect(getSpy).toBeCalledWith("/health", "/metrics");
        // expect(app.listen).toBeCalledTimes(1);

    });

    test("should teardown instances when server stopped", async()=>{
        // Arrange
        const spyMockedConsumer = jest.spyOn(mockedConsumer, "destroy");
        const spyMockedProducer = jest.spyOn(mockedProducer, "destroy");
        // const spyMockedAggregate = jest.spyOn(mockedAggregate, "destroy");
        // await Service.start(logger, mockedAuditService, mockedConsumer, mockedProducer, mockedParticipantService, mockedTransferRepository,
        //     mockedAccountsAndBalancesService, metricsMock, mockedSettlementsService, mockedSchedulingService, mockedConfigProvider, mockedAggregate);

        // Act
        await Service.stop();

        // Assert
        expect(spyMockedConsumer).toBeCalledTimes(1);
        expect(spyMockedProducer).toBeCalledTimes(1);
        // expect(spyMockedAggregate).toBeCalledTimes(1);
        // expect(closeSpy).toBeCalledTimes(1);
    });


});

