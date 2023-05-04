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

import { TransfersAggregate, IParticipantsServiceAdapter, ITransfersRepository, IAccountsBalancesAdapter} from "@mojaloop/transfers-bc-domain-lib";
import { MemoryMessageProducer, MemoryMessageConsumer, MemoryParticipantService, MemoryAuthenticatedHttpRequesterMock, MemoryTransferRepo, MemoryAccountsAndBalancesService, MemoryAuditService } from "@mojaloop/transfers-bc-shared-mocks-lib";
import { ConsoleLogger, ILogger, LogLevel } from "@mojaloop/logging-bc-public-types-lib";
import { IMessageConsumer, IMessageProducer} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import { IAuthenticatedHttpRequester } from "@mojaloop/security-bc-client-lib";
import { Service } from "../../src/service";
const express = require("express");


const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.FATAL);

const mockedProducer: IMessageProducer = new MemoryMessageProducer(logger);

const mockedConsumer : IMessageConsumer = new MemoryMessageConsumer();

const mockedParticipantService:IParticipantsServiceAdapter = new MemoryParticipantService(logger);

const mockedAuditService = new MemoryAuditService(logger);

const mockedAccountsAndBalancesService: IAccountsBalancesAdapter = new MemoryAccountsAndBalancesService(logger);

const mockedTransferRepository: ITransfersRepository = new MemoryTransferRepo(logger);

const mockedAuthRequester: IAuthenticatedHttpRequester = new MemoryAuthenticatedHttpRequesterMock(logger,"fake token");

const mockedAggregate: TransfersAggregate = new TransfersAggregate(
    logger,
    mockedTransferRepository,
    mockedParticipantService,
    mockedProducer,
    mockedAccountsAndBalancesService
);

// Express mock
const useSpy = jest.fn();
const closeSpy = jest.fn();
const listenSpy = jest.fn().mockReturnValue({ close: closeSpy });
const routerSpy = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
};


jest.mock('express', () => {
  return () => ({
    listen: listenSpy,
    close: jest.fn(),
    use: useSpy
    });
});

express.json = jest.fn();
express.urlencoded = jest.fn();
express.Router = jest.fn().mockImplementation(() => { return routerSpy });

describe("Transfers Command Handler Service", () => {

    beforeAll(async () => {

    });

    
    afterAll(async () => {
        jest.clearAllMocks();
    });

    test("should be able to run start and init all variables", async()=>{
        // Arrange
        const spyConsumerSetTopics = jest.spyOn(mockedConsumer, "setTopics");
        const spyConsumerConnect = jest.spyOn(mockedConsumer, "connect");
        const spyConsumerStart = jest.spyOn(mockedConsumer, "connect");
        const spyConsumerCallback = jest.spyOn(mockedConsumer, "setCallbackFn");
        const spyProducerInit = jest.spyOn(mockedProducer, "connect");
        const spyAggregateInit = jest.spyOn(mockedAggregate, "init");

        // Act
        await Service.start(logger, mockedAuditService, mockedConsumer, mockedProducer, mockedParticipantService, mockedTransferRepository, 
            mockedAccountsAndBalancesService, mockedAggregate);

        // Assert
        expect(spyConsumerSetTopics).toBeCalledTimes(1);
        expect(spyConsumerConnect).toBeCalledTimes(1);
        expect(spyConsumerStart).toBeCalledTimes(1);
        expect(spyConsumerCallback).toBeCalledTimes(1);
        expect(spyProducerInit).toBeCalledTimes(1);
        expect(spyAggregateInit).toBeCalledTimes(1);
        expect(useSpy).toBeCalledWith("/admin", routerSpy);
        expect(listenSpy).toBeCalledTimes(1);

    });

    test("should teardown instances when server stopped", async()=>{
        // Arrange
        const spyMockedConsumer = jest.spyOn(mockedConsumer, "destroy");
        const spyMockedProducer = jest.spyOn(mockedProducer, "destroy");
        // const spyMockedAggregate = jest.spyOn(mockedAggregate, "destroy");
        await Service.start(logger, mockedAuditService, mockedConsumer, mockedProducer, mockedParticipantService, mockedTransferRepository, 
            mockedAccountsAndBalancesService, mockedAggregate);

        // Act
        await Service.stop();

        // Assert
        expect(spyMockedConsumer).toBeCalledTimes(1);
        expect(spyMockedProducer).toBeCalledTimes(1);
        // expect(spyMockedAggregate).toBeCalledTimes(1);
        expect(closeSpy).toBeCalledTimes(1);
    });


});