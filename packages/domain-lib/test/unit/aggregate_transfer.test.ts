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


import { IParticipant, IParticipantAccount } from '@mojaloop/participant-bc-public-types-lib';
import { CommandMsg, IDomainMessage, MessageTypes } from "@mojaloop/platform-shared-lib-messaging-types-lib";
import { 
    TransferPreparedEvtPayload,
    TransferFulfiledEvt,
    TransferUnableToGetTransferByIdEvt,
    TransferHubNotFoundFailedEvt,
    TransferQueryResponseEvt,
    TransferUnableToGetSettlementModelEvt,
    TransferPayerNotFoundFailedEvt,
    TransferPayeeNotFoundFailedEvt,
    TransferHubAccountNotFoundFailedEvt,
    TransferPayerPositionAccountNotFoundFailedEvt,
    TransferPayeePositionAccountNotFoundFailedEvt,
    TransferPayerLiquidityAccountNotFoundFailedEvt,
    TransferPayeeLiquidityAccountNotFoundFailedEvt,
    TransferUnableCreateReminderEvt,
    TransferPrepareLiquidityCheckFailedEvt,
    TransferPreparedEvt,
    TransferCancelReservationFailedEvt,
    TransferNotFoundEvt,
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import { mockedHubParticipant, mockedPayeeParticipant, mockedPayerParticipant, mockedTransfer1 } from "@mojaloop/transfers-bc-shared-mocks-lib";
import { InvalidMessagePayloadError, InvalidMessageTypeError } from "../../src/errors";
import { createCommand, createTransferPreparedEvtPayload } from "../utils/helpers";
import { messageProducer, transfersRepo, participantService, accountsAndBalancesService, settlementsService, schedulingService, logger } from "../utils/mocked_variables";
import { IMetrics, MetricsMock } from "@mojaloop/platform-shared-lib-observability-types-lib";
import { AccountType, CommitTransferFulfilCmd, ITransfer, PrepareTransferCmd, TransferState, TransfersAggregate } from '../../src';
import { AccountsBalancesHighLevelRequestTypes } from '@mojaloop/accounts-and-balances-bc-public-types-lib';

jest.mock('crypto', () => ({
    ...jest.requireActual('crypto'),
    randomUUID: jest.fn(() => '123'),
}));

let aggregate: TransfersAggregate;

const mocks = new Map();

function mockProperty<T extends {}, K extends keyof any>(object: T, property: K, value: any) {
    const descriptor = Object.getOwnPropertyDescriptor(object, property);
    const mocksForThisObject = mocks.get(object) || {};
    mocksForThisObject[property] = descriptor;
    mocks.set(object, mocksForThisObject);
    Object.defineProperty(object, property, {
        get: jest.fn(() => {
          let userProfile = {} as Map<string, ITransfer>;
          userProfile.get = value;
          return userProfile;
        }),
        configurable: true,
    });

}

function undoMockProperty<T extends {}, K extends keyof T>(object: T, property: K) {
    Object.defineProperty(object, property, mocks.get(object)[property]);
}

const validTransferPostPayload = {
    "transferId": "0fbaf1a5-d82b-5bbf-9ffe-9d85fed9cfd8",
    "payerFsp": "bluebank",
    "payeeFsp": "greenbank",
    "amount": "1",
    "currencyCode": "USD",
    "ilpPacket": "AYICbQAAAAAAAAPoHGcuYmx1ZWJhbmsubXNpc2RuLmJsdWVfYWNjXzGCAkRleUowY21GdWMyRmpkR2x2Ymtsa0lqb2lPV1kxWkRrM09EUXRNMkUxTnkwMU9EWTFMVGxoWVRBdE4yUmtaVGMzT1RFMU5EZ3hJaXdpY1hWdmRHVkpaQ0k2SW1ZMU5UaGtORFE0TFRCbU1UQXROREF4TmkwNE9ESXpMVEU1TjJObU5qZ3haamhrWmlJc0luQmhlV1ZsSWpwN0luQmhjblI1U1dSSmJtWnZJanA3SW5CaGNuUjVTV1JVZVhCbElqb2lUVk5KVTBST0lpd2ljR0Z5ZEhsSlpHVnVkR2xtYVdWeUlqb2lZbXgxWlY5aFkyTmZNU0lzSW1aemNFbGtJam9pWW14MVpXSmhibXNpZlgwc0luQmhlV1Z5SWpwN0luQmhjblI1U1dSSmJtWnZJanA3SW5CaGNuUjVTV1JVZVhCbElqb2lUVk5KVTBST0lpd2ljR0Z5ZEhsSlpHVnVkR2xtYVdWeUlqb2laM0psWlc1ZllXTmpYekVpTENKbWMzQkpaQ0k2SW1keVpXVnVZbUZ1YXlKOWZTd2lZVzF2ZFc1MElqcDdJbU4xY25KbGJtTjVJam9pUlZWU0lpd2lZVzF2ZFc1MElqb2lNVEFpZlN3aWRISmhibk5oWTNScGIyNVVlWEJsSWpwN0luTmpaVzVoY21sdklqb2lSRVZRVDFOSlZDSXNJbWx1YVhScFlYUnZjaUk2SWxCQldVVlNJaXdpYVc1cGRHbGhkRzl5Vkhsd1pTSTZJa0pWVTBsT1JWTlRJbjE5AA",
    "condition": "STksBXN1-J5HnG_4owlzKnbmzCfiOlrKDPgiR-QZ7Kg",
    "expiration": "2023-07-22T05:05:11.304Z"
};

const validTransferPutPayload = {
    "transferId": "1fbaf1a5-d82b-5bbf-9ffe-9d85fed9cfd8",
    "payerFsp": "bluebank",
    "payeeFsp": "greenbank",
    "amount": "1",
    "currencyCode": "USD",
    "ilpPacket": "AYICbQAAAAAAAAPoHGcuYmx1ZWJhbmsubXNpc2RuLmJsdWVfYWNjXzGCAkRleUowY21GdWMyRmpkR2x2Ymtsa0lqb2lPV1kxWkRrM09EUXRNMkUxTnkwMU9EWTFMVGxoWVRBdE4yUmtaVGMzT1RFMU5EZ3hJaXdpY1hWdmRHVkpaQ0k2SW1ZMU5UaGtORFE0TFRCbU1UQXROREF4TmkwNE9ESXpMVEU1TjJObU5qZ3haamhrWmlJc0luQmhlV1ZsSWpwN0luQmhjblI1U1dSSmJtWnZJanA3SW5CaGNuUjVTV1JVZVhCbElqb2lUVk5KVTBST0lpd2ljR0Z5ZEhsSlpHVnVkR2xtYVdWeUlqb2lZbXgxWlY5aFkyTmZNU0lzSW1aemNFbGtJam9pWW14MVpXSmhibXNpZlgwc0luQmhlV1Z5SWpwN0luQmhjblI1U1dSSmJtWnZJanA3SW5CaGNuUjVTV1JVZVhCbElqb2lUVk5KVTBST0lpd2ljR0Z5ZEhsSlpHVnVkR2xtYVdWeUlqb2laM0psWlc1ZllXTmpYekVpTENKbWMzQkpaQ0k2SW1keVpXVnVZbUZ1YXlKOWZTd2lZVzF2ZFc1MElqcDdJbU4xY25KbGJtTjVJam9pUlZWU0lpd2lZVzF2ZFc1MElqb2lNVEFpZlN3aWRISmhibk5oWTNScGIyNVVlWEJsSWpwN0luTmpaVzVoY21sdklqb2lSRVZRVDFOSlZDSXNJbWx1YVhScFlYUnZjaUk2SWxCQldVVlNJaXdpYVc1cGRHbGhkRzl5Vkhsd1pTSTZJa0pWVTBsT1JWTlRJbjE5AA",
    "condition": "STksBXN1-J5HnG_4owlzKnbmzCfiOlrKDPgiR-QZ7Kg",
    "expiration": "2023-07-22T05:05:11.304Z"
};

let validTransfer: ITransfer;

describe("Domain - Unit Tests for Command Handler", () => {

    beforeAll(async () => {
        const metricsMock: IMetrics = new MetricsMock();
        aggregate = new TransfersAggregate(
            logger,
            transfersRepo as any,
            participantService,
            messageProducer,
            accountsAndBalancesService,
            metricsMock,
            settlementsService,
            schedulingService
        );
    });

    beforeEach(async () => {
        validTransfer = {
            createdAt: 1695659528072,
            updatedAt: 1695659531251,
            transferId: "0fbaf1a5-d82b-5bbf-9ffe-9d85fed9cfd8",
            payeeFspId: "greenbank",
            payerFspId: "bluebank",
            amount: "10.5",
            currencyCode: "USD",
            ilpPacket: "AYICSwAAAAAAAABkFGcuZ3JlZW5iYW5rLm1zaXNkbi4xggIqZXlKMGNtRnVjMkZqZEdsdmJrbGtJam9pTUdaaVlXWXhZVFV0WkRneVlpMDFZbUptTFRsbVptVXRPV1E0TldabFpEbGpabVE0SWl3aWNYVnZkR1ZKWkNJNklqSXlORE5tWkdKbExUVmtaV0V0TTJGaVpDMWhNakV3TFRNM09EQmxOMlkwWmpGbU5TSXNJbkJoZVdWbElqcDdJbkJoY25SNVNXUkpibVp2SWpwN0luQmhjblI1U1dSVWVYQmxJam9pVFZOSlUwUk9JaXdpY0dGeWRIbEpaR1Z1ZEdsbWFXVnlJam9pTVNJc0ltWnpjRWxrSWpvaVozSmxaVzVpWVc1ckluMTlMQ0p3WVhsbGNpSTZleUp3WVhKMGVVbGtTVzVtYnlJNmV5SndZWEowZVVsa1ZIbHdaU0k2SWsxVFNWTkVUaUlzSW5CaGNuUjVTV1JsYm5ScFptbGxjaUk2SWpFaUxDSm1jM0JKWkNJNkltSnNkV1ZpWVc1ckluMTlMQ0poYlc5MWJuUWlPbnNpWTNWeWNtVnVZM2tpT2lKVlUwUWlMQ0poYlc5MWJuUWlPaUl4SW4wc0luUnlZVzV6WVdOMGFXOXVWSGx3WlNJNmV5SnpZMlZ1WVhKcGJ5STZJa1JGVUU5VFNWUWlMQ0pwYm1sMGFXRjBiM0lpT2lKUVFWbEZVaUlzSW1sdWFYUnBZWFJ2Y2xSNWNHVWlPaUpDVlZOSlRrVlRVeUo5ZlEA",				// move to opaque object
            condition: "VFWFNc85U0f23hniAuTmwk6XVVlR0llxRZ-xqPrCShk",
            fulfilment: "on1meDEOvLmjYTvujP438_lhaMCi8V0wx0uUvjp8vT0",
            expirationTimestamp: new Date("2023-09-19T06:23:25.908Z").getTime(),
            transferState: TransferState.RESERVED,
            completedTimestamp: 1695659531014,
            extensionList: null,
            errorInformation:  null,
            settlementModel: "DEFAULT",
            hash: "FMXpM1VNkEQKj8WGEgNXC5HpohnLJ/afDMFEYHHuUXw"
        }
    })
    afterEach(async () => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        jest.clearAllMocks();
    });

    // #region _prepareTransferStart
    test("should not process command if command message type does not equal COMMAND", async () => {
        // Arrange
        const command: CommandMsg = createCommand(null, "fake msg name", null, MessageTypes.DOMAIN_EVENT);

        jest.spyOn(messageProducer, "send");

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([]);

    });

    // test("should throw error when trying to process command", async () => {
    //     // Arrange
    //     const command: CommandMsg = createCommand(null, null, null, MessageTypes.COMMAND);

    //     jest.spyOn(messageProducer, "send")

    //     // Act & Assert
    //     await expect(aggregate.processCommandBatch([command])).rejects.toThrowError();
    // });

    test("should now process command if not of type command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, "fake msg name", null);

        jest.spyOn(messageProducer, "send");

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "payload": {
                "errorDescription": `Command type is unknown: ${command.msgName}`, 
                "payerFspId": undefined, 
                "transferId": command.payload.transferId
            }
        })]);

    });

    test("should throw TransferUnableToGetTransferByIdEvt error processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        mockProperty(aggregate, "_transfersCache", () => { throw Error(); })

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferUnableToGetTransferByIdEvt.name,
            "payload": {
                "errorDescription": `Unable to get transfer record for transferId: ${command.payload.transferId} from repository`, 
                "payerFspId": undefined, 
                "transferId": command.payload.transferId
            }
        })]);

        undoMockProperty(aggregate, "_transfersCache" as any)
    });
    
    test("should throw TransferUnableToGetTransferByIdEvt error processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        mockProperty(aggregate, "_transfersCache", () => { throw Error(); })

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferUnableToGetTransferByIdEvt.name,
            "payload": {
                "errorDescription": `Unable to get transfer record for transferId: ${command.payload.transferId} from repository`, 
                "payerFspId": undefined, 
                "transferId": command.payload.transferId
            }
        })]);

        undoMockProperty(aggregate, "_transfersCache" as any)
    });

    test("should ignore when transfer with RECEIVED state is found processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        mockProperty(aggregate, "_transfersCache", () => {
            validTransfer.transferState = TransferState.RECEIVED;
            return validTransfer;
        })
          
        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([]);

        undoMockProperty(aggregate, "_transfersCache" as any)
    });

    test("should ignore when transfer with RESERVED state is found processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        mockProperty(aggregate, "_transfersCache", () => { return validTransfer; })
          
        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([]);

        undoMockProperty(aggregate, "_transfersCache" as any)
    });

    test("should return transfer when transfer with COMMITTED state is found processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        mockProperty(aggregate, "_transfersCache", () => {
            validTransfer.transferState = TransferState.COMMITTED;
            return validTransfer; 
        })
          
        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferQueryResponseEvt.name,
            "payload": {
                "completedTimestamp": validTransfer.completedTimestamp,
                "extensionList": validTransfer.extensionList,
                "fulfilment": validTransfer.fulfilment,
                "transferId": validTransfer.transferId,
                "transferState": validTransfer.transferState
            }
        })]);

        undoMockProperty(aggregate, "_transfersCache" as any)
    });

    
    test("should return transfer when transfer with ABORTED state is found processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        mockProperty(aggregate, "_transfersCache", () => {
            validTransfer.transferState = TransferState.ABORTED;
            return validTransfer; 
        })
          
        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferQueryResponseEvt.name,
            "payload": {
                "completedTimestamp": validTransfer.completedTimestamp,
                "extensionList": validTransfer.extensionList,
                "fulfilment": validTransfer.fulfilment,
                "transferId": validTransfer.transferId,
                "transferState": validTransfer.transferState
            }
        })]);

        undoMockProperty(aggregate, "_transfersCache" as any)
    });

    test("should return error getting settlement model id processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(settlementsService, "getSettlementModelId")
            .mockImplementationOnce(() => { throw Error(); })
         
        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferUnableToGetSettlementModelEvt.name,
            "payload": expect.objectContaining({
                "errorDescription": `Unable to get settlementModel for transferId: ${command.payload.transferId}`,
                "transferId": command.payload.transferId
            })
        })]);

    });

    test("should return error getting settlement model id processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(settlementsService, "getSettlementModelId")
            .mockImplementationOnce(() => { throw Error(); })
         
        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferUnableToGetSettlementModelEvt.name,
            "payload": expect.objectContaining({
                "errorDescription": `Unable to get settlementModel for transferId: ${command.payload.transferId}`,
                "transferId": command.payload.transferId
            })
        })]);

    });
    
    test("should throw when hub participant is not found processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferHubNotFoundFailedEvt.name,
            "payload": {
                "errorDescription": `Hub not found hub for transfer ${command.payload.transferId}`, 
                "payerFspId": undefined, 
                "transferId": command.payload.transferId
            }
        })]);
    });

    test("should throw when payer participant is not found processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferPayerNotFoundFailedEvt.name,
            "payload": {
                "errorDescription": `Payer participant not found ${command.payload.payerFsp} for transfer ${command.payload.transferId}`, 
                "payerFspId": command.payload.payerFsp, 
                "transferId": command.payload.transferId
            }
        })]);
    });

    test("should throw when payee participant is not found processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferPayeeNotFoundFailedEvt.name,
            "payload": {
                "errorDescription": `Payee participant not found ${command.payload.payeeFsp} for transfer ${command.payload.transferId}`, 
                "payeeFspId": command.payload.payeeFsp, 
                "transferId": command.payload.transferId
            }
        })]);
    });

    test("should throw when hub participant has no matching hub account processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);
        const hubParticipantWithNoAccounts = { ...mockedHubParticipant };
        hubParticipantWithNoAccounts.participantAccounts = hubParticipantWithNoAccounts.participantAccounts.filter((value: IParticipantAccount) => (value.type as string) !== AccountType.HUB && value.currencyCode !== command.payload.currencyCode);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(hubParticipantWithNoAccounts)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferHubAccountNotFoundFailedEvt.name,
            "payload": {
                "errorDescription": `Hub account not found for transfer ${command.payload.transferId}`, 
                "transferId": command.payload.transferId
            }
        })]);
    });

    test("should throw when payer participant has no matching position account processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);
        const payerParticipantWithNoAccounts = { ...mockedPayerParticipant };
        payerParticipantWithNoAccounts.participantAccounts = payerParticipantWithNoAccounts.participantAccounts.filter((value: IParticipantAccount) => (value.type as string) !== AccountType.POSITION);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(payerParticipantWithNoAccounts)
            .mockResolvedValueOnce(mockedPayeeParticipant);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferPayerPositionAccountNotFoundFailedEvt.name,
            "payload": {
                "errorDescription": `Payer position account not found: transferId: ${command.payload.transferId}, payer: ${command.payload.payerFsp}`,
                "payerFspId": command.payload.payerFsp,
                "transferId": command.payload.transferId
            }
        })]);
    });

    test("should throw when payer participant has no matching liquidity account processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);
        const payerParticipantWithNoAccounts = { ...mockedPayerParticipant };
        payerParticipantWithNoAccounts.participantAccounts = payerParticipantWithNoAccounts.participantAccounts.filter((value: IParticipantAccount) => (value.type as string) !== AccountType.SETTLEMENT);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(payerParticipantWithNoAccounts)
            .mockResolvedValueOnce(mockedPayeeParticipant);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferPayerLiquidityAccountNotFoundFailedEvt.name,
            "payload": {
                "errorDescription": `Payer liquidity account not found: transferId: ${command.payload.transferId}, payer: ${command.payload.payerFsp}`,
                "payerFspId": command.payload.payerFsp,
                "transferId": command.payload.transferId
            }
        })]);
    });
    
    test("should throw when payee participant has no matching position account processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);
        const payeeParticipantWithNoAccounts = { ...mockedPayeeParticipant };
        payeeParticipantWithNoAccounts.participantAccounts = [];

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(payeeParticipantWithNoAccounts);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferPayeePositionAccountNotFoundFailedEvt.name,
            "payload": {
                "errorDescription": `Payee position account not found: transferId: ${command.payload.transferId}, payee: ${command.payload.payeeFsp}`,
                "payeeFspId": command.payload.payeeFsp,
                "transferId": command.payload.transferId
            }
        })]);
    });
    
    
    test("should throw when payee participant has no matching liquidity account processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);
        const payeeParticipantWithNoAccounts = { ...mockedPayeeParticipant };
        payeeParticipantWithNoAccounts.participantAccounts = payeeParticipantWithNoAccounts.participantAccounts.filter((value: IParticipantAccount) => (value.type as string) !== AccountType.SETTLEMENT);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(payeeParticipantWithNoAccounts);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferPayeeLiquidityAccountNotFoundFailedEvt.name,
            "payload": {
                "errorDescription": `Payee liquidity account not found: transferId: ${command.payload.transferId}, payee: ${command.payload.payeeFsp}`,
                "payeeFspId": command.payload.payeeFsp,
                "transferId": command.payload.transferId
            }
        })]);
    });
    // #region
    
    // #region _prepareTransferContinue
    test("should throw when trying to schedule a reminder processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant);

        jest.spyOn(schedulingService, "createSingleReminder")
            .mockImplementationOnce(() => { throw Error(); })

        // Act
        await aggregate.processCommandBatch([command]);

        await Promise.resolve();

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferUnableCreateReminderEvt.name,
            "payload": {
                "errorDescription": `Unable to create reminder for transferId: ${command.payload.transferId}`,
                "transferId": command.payload.transferId
            }
        })]);
    });

    // test("should throw when not finding a the originalCmdMsg in batchCommand list processing PrepareTransferCmd command", async () => {
    //     // Arrange
    //     const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

    //     jest.spyOn(messageProducer, "send");

    //     jest.spyOn(participantService, "getParticipantInfo")
    //         .mockResolvedValueOnce(mockedHubParticipant)
    //         .mockResolvedValueOnce(mockedPayerParticipant)
    //         .mockResolvedValueOnce(mockedPayeeParticipant);

    //     jest.spyOn(accountsAndBalancesService, "processHighLevelBatch")
    //         .mockResolvedValueOnce([{
    //             requestType: 0, 
    //             requestId: '123', 
    //             success: true, errorMessage: null
    //         }]);

    //     Object.defineProperty(aggregate, "_batchCommands", {
    //         get: jest.fn(() => {
    //           let userProfile = {} as Map<string, IDomainMessage>;
    //           userProfile.set = () => { return undefined as any };
    //           userProfile.get = () => { return undefined; };
    //           userProfile.clear = () => { return undefined };
    //           return userProfile;
    //         }),
    //         configurable: true,
    //       });

    //     // Act & Assert
    //     try {
    //         await expect(aggregate.processCommandBatch([command])).rejects.toBeTruthy();
    //     } catch(e: unknown) {
    //         expect(e).toContainEqual("UnhandledPromiseRejection")
    //     }

    // });

    test("should throw transfer not found error processing PrepareTransferCmd command continue when processHighLevelBatch", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant);

        jest.spyOn(accountsAndBalancesService, "processHighLevelBatch")
            .mockResolvedValueOnce([{
                requestType: 0, 
                requestId: '123', 
                success: true,
                errorMessage: null
            }])

        jest.spyOn(transfersRepo, "getTransferById")
            .mockImplementationOnce(() => { throw Error(); })

        const descriptor = Object.getOwnPropertyDescriptor(aggregate, "_transfersCache");
        const mocksForThisObject = mocks.get(aggregate) || {};
        mocksForThisObject["_transfersCache"] = descriptor;
        mocks.set(aggregate, mocksForThisObject);

        Object.defineProperty(aggregate, "_transfersCache", {
            get: jest.fn(() => {
              let userProfile = {} as Map<string, IDomainMessage>;
              userProfile.set = () => { return undefined as any };
              userProfile.get = () => { return undefined; };
              userProfile.clear = () => { return undefined };
              return userProfile;
            }),
            configurable: true,
        });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([
            expect.objectContaining({
                "msgName": TransferUnableToGetTransferByIdEvt.name,
                "payload": {
                    "errorDescription": `Unable to get transfer record for transferId: ${command.payload.transferId} from repository - error: null`, 
                    "payerFspId": undefined, 
                    "transferId": command.payload.transferId
                }
            }),
            expect.objectContaining({
                "msgName": TransferCancelReservationFailedEvt.name,
                "payload": {
                    "errorDescription": `Unable to cancel reservation with transferId: ${command.payload.transferId}`, 
                    "transferId": command.payload.transferId
                }
            })
        ]);

        undoMockProperty(aggregate, "_transfersCache" as any)
    });


    test("should throw liquidity check failed with request error message processing PrepareTransferCmd command continue when processHighLevelBatch is unsuccessful", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);
        const request = {
            requestType: 0, 
            requestId: '123', 
            success: false,
            errorMessage: "random error message"
        };

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant);

        jest.spyOn(accountsAndBalancesService, "processHighLevelBatch")
            .mockResolvedValueOnce([request])
        
        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferPrepareLiquidityCheckFailedEvt.name,
            "payload": {
                "errorDescription": request.errorMessage,
                "payerFspId": command.payload.payerFsp,
                "transferId": command.payload.transferId,
                "amount": command.payload.amount,
                "currency": command.payload.currencyCode
            }
        })]);
    });

    test("should successfully process PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant);

        jest.spyOn(accountsAndBalancesService, "processHighLevelBatch")
            .mockResolvedValueOnce([{
                requestType: 0, 
                requestId: '123', 
                success: true,
                errorMessage: null
            }])


        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferPreparedEvt.name,
            "payload": command.payload
        })]);
    });
    // #endregion

    // #region _fulfilTransferStart
    test("should throw when trying to retrieve a transfer from the repo processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPutPayload, CommitTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockImplementationOnce(() => { throw Error(); });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferUnableToGetTransferByIdEvt.name,
            "payload": {
                "errorDescription": `Unable to get transfer record for transferId: ${command.payload.transferId} from repository`,
                "transferId": command.payload.transferId
            }
        })]);

    });

    test("should throw when not finding corresponding transfer and not able to cancel transfer processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPutPayload, CommitTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferCancelReservationFailedEvt.name,
            "payload": {
                "errorDescription": `Unable to cancel reservation with transferId: ${command.payload.transferId}`,
                "transferId": command.payload.transferId
            }
        })]);

    });

    // test("should throw when not finding corresponding transfer processing CommitTransferFulfilCmd command", async () => {
    //     // Arrange
    //     const command: CommandMsg = createCommand(validTransferPutPayload, CommitTransferFulfilCmd.name, null);

    //     jest.spyOn(messageProducer, "send");

    //     jest.spyOn(transfersRepo, "getTransferById")
    //         .mockResolvedValue(null);

    //     jest.spyOn(participantService, "getParticipantInfo")
    //         .mockResolvedValueOnce(mockedHubParticipant)
    //         .mockResolvedValueOnce(mockedPayerParticipant)
    //         .mockResolvedValueOnce(mockedPayeeParticipant);
        
    //     jest.spyOn(accountsAndBalancesService, "processHighLevelBatch")
    //         .mockResolvedValueOnce([{
    //             requestType: AccountsBalancesHighLevelRequestTypes.cancelReservationAndCommit,
    //             requestId: '123',
    //             success: true,
    //             errorMessage: null
    //         }]);

    //     // Act
    //     await aggregate.processCommandBatch([command]);

    //     // Assert
    //     expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
    //         "msgName": TransferNotFoundEvt.name,
    //         "payload": {
    //             "errorDescription": `Unable to cancel reservation with transferId: ${command.payload.transferId}`,
    //             "transferId": command.payload.transferId
    //         }
    //     })]);

    // });
    // #endregion

    // #region _fulfilTTransferContinue
    test("should successfully process CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPutPayload, CommitTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPutPayload.transferId } as any);

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant);
        
        jest.spyOn(accountsAndBalancesService, "processHighLevelBatch")
            .mockResolvedValueOnce([{
                requestType: AccountsBalancesHighLevelRequestTypes.cancelReservationAndCommit,
                requestId: '123',
                success: true,
                errorMessage: null
            }]);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferFulfiledEvt.name,
        })]);

    });
    // #endregion
});
