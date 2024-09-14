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


import { HUB_PARTICIPANT_ID, IParticipantAccount } from '@mojaloop/participant-bc-public-types-lib';
import { CommandMsg, MessageTypes } from "@mojaloop/platform-shared-lib-messaging-types-lib";
import { 
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
    TransferUnableToUpdateEvt,
    TransferRejectRequestProcessedEvt,
    TransferCancelReservationAndCommitFailedEvt,
    TransferBCUnableToAddBulkTransferToDatabaseEvt,
    BulkTransferPreparedEvt,
    BulkTransferNotFoundEvt,
    TransferUnableToGetBulkTransferByIdEvt,
    BulkTransferFulfiledEvt,
    BulkTransferRejectRequestProcessedEvt,
    BulkTransferQueryResponseEvt,
    TransferHubIdMismatchEvt,
    TransferHubNotApprovedEvt,
    TransferHubNotActiveEvt,
    TransferPayerIdMismatchEvt,
    TransferPayerNotApprovedEvt,
    TransferPayerNotActiveEvt,
    TransferPayeeIdMismatchEvt,
    TransferPayeeNotApprovedEvt,
    TransferPayeeNotActiveEvt
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import { mockedHubParticipant, mockedPayeeParticipant, mockedPayerParticipant } from "@mojaloop/transfers-bc-shared-mocks-lib";
import { createCommand } from "../utils/helpers";
import { 
    messageProducer,
    transfersRepo,
    bulkTransfersRepo,
    participantService,
    accountsAndBalancesService,
    settlementsService,
    schedulingService,
    logger, 
    interopFspiopValidator
} from "../utils/mocked_variables";
import { IMetrics, MetricsMock } from "@mojaloop/platform-shared-lib-observability-types-lib";
import { 
    CommitTransferFulfilCmd,
    PrepareTransferCmd,
    QueryTransferCmd,
    RejectTransferCmd,
    TimeoutTransferCmd,
    PrepareBulkTransferCmd,
    TransfersAggregate,
    CommitBulkTransferFulfilCmd,
    RejectBulkTransferCmd,
    QueryBulkTransferCmd, 
    PrepareBulkTransferCmdPayload,
    QueryTransferCmdPayload
} from '../../src';
import { AccountsBalancesHighLevelRequestTypes } from '@mojaloop/accounts-and-balances-bc-public-types-lib';
import { LogLevel } from '@mojaloop/logging-bc-public-types-lib';
import { waitForExpect } from '@mojaloop/transfers-bc-shared-mocks-lib';
import { AccountType, BulkTransferState, IBulkTransfer, ITransfer, TransferErrorCodeNames, TransferState } from '@mojaloop/transfers-bc-public-types-lib';
import { QueryBulkTransferCmdPayload } from '../../dist';

logger.setLogLevel(LogLevel.DEBUG);

jest.mock('crypto', () => ({
    ...jest.requireActual('crypto'),
    randomUUID: jest.fn(() => '123'),
}));



let aggregate: TransfersAggregate;

const validTransferPostPayload = {
    "transferId": "1fbaf1a5-d82b-5bbf-9ffe-9d85fed9cfd8",
    "payerFsp": "bluebank",
    "payeeFsp": "greenbank",
    "amount": "1",
    "currencyCode": "USD",
    "ilpPacket": "AYICbQAAAAAAAAPoHGcuYmx1ZWJhbmsubXNpc2RuLmJsdWVfYWNjXzGCAkRleUowY21GdWMyRmpkR2x2Ymtsa0lqb2lPV1kxWkRrM09EUXRNMkUxTnkwMU9EWTFMVGxoWVRBdE4yUmtaVGMzT1RFMU5EZ3hJaXdpY1hWdmRHVkpaQ0k2SW1ZMU5UaGtORFE0TFRCbU1UQXROREF4TmkwNE9ESXpMVEU1TjJObU5qZ3haamhrWmlJc0luQmhlV1ZsSWpwN0luQmhjblI1U1dSSmJtWnZJanA3SW5CaGNuUjVTV1JVZVhCbElqb2lUVk5KVTBST0lpd2ljR0Z5ZEhsSlpHVnVkR2xtYVdWeUlqb2lZbXgxWlY5aFkyTmZNU0lzSW1aemNFbGtJam9pWW14MVpXSmhibXNpZlgwc0luQmhlV1Z5SWpwN0luQmhjblI1U1dSSmJtWnZJanA3SW5CaGNuUjVTV1JVZVhCbElqb2lUVk5KVTBST0lpd2ljR0Z5ZEhsSlpHVnVkR2xtYVdWeUlqb2laM0psWlc1ZllXTmpYekVpTENKbWMzQkpaQ0k2SW1keVpXVnVZbUZ1YXlKOWZTd2lZVzF2ZFc1MElqcDdJbU4xY25KbGJtTjVJam9pUlZWU0lpd2lZVzF2ZFc1MElqb2lNVEFpZlN3aWRISmhibk5oWTNScGIyNVVlWEJsSWpwN0luTmpaVzVoY21sdklqb2lSRVZRVDFOSlZDSXNJbWx1YVhScFlYUnZjaUk2SWxCQldVVlNJaXdpYVc1cGRHbGhkRzl5Vkhsd1pTSTZJa0pWVTBsT1JWTlRJbjE5AA",
    "condition": "STksBXN1-J5HnG_4owlzKnbmzCfiOlrKDPgiR-QZ7Kg",
    "expiration": 1715939691772
};

const validTransferPostContinuePayload = {
    "transferId": "1fbaf1a5-d82b-5bbf-9ffe-9d85fed9cfd8",
    "payerFsp": "bluebank",
    "payeeFsp": "greenbank",
    "amount": "1",
    "currencyCode": "USD",
    "ilpPacket": "AYICbQAAAAAAAAPoHGcuYmx1ZWJhbmsubXNpc2RuLmJsdWVfYWNjXzGCAkRleUowY21GdWMyRmpkR2x2Ymtsa0lqb2lPV1kxWkRrM09EUXRNMkUxTnkwMU9EWTFMVGxoWVRBdE4yUmtaVGMzT1RFMU5EZ3hJaXdpY1hWdmRHVkpaQ0k2SW1ZMU5UaGtORFE0TFRCbU1UQXROREF4TmkwNE9ESXpMVEU1TjJObU5qZ3haamhrWmlJc0luQmhlV1ZsSWpwN0luQmhjblI1U1dSSmJtWnZJanA3SW5CaGNuUjVTV1JVZVhCbElqb2lUVk5KVTBST0lpd2ljR0Z5ZEhsSlpHVnVkR2xtYVdWeUlqb2lZbXgxWlY5aFkyTmZNU0lzSW1aemNFbGtJam9pWW14MVpXSmhibXNpZlgwc0luQmhlV1Z5SWpwN0luQmhjblI1U1dSSmJtWnZJanA3SW5CaGNuUjVTV1JVZVhCbElqb2lUVk5KVTBST0lpd2ljR0Z5ZEhsSlpHVnVkR2xtYVdWeUlqb2laM0psWlc1ZllXTmpYekVpTENKbWMzQkpaQ0k2SW1keVpXVnVZbUZ1YXlKOWZTd2lZVzF2ZFc1MElqcDdJbU4xY25KbGJtTjVJam9pUlZWU0lpd2lZVzF2ZFc1MElqb2lNVEFpZlN3aWRISmhibk5oWTNScGIyNVVlWEJsSWpwN0luTmpaVzVoY21sdklqb2lSRVZRVDFOSlZDSXNJbWx1YVhScFlYUnZjaUk2SWxCQldVVlNJaXdpYVc1cGRHbGhkRzl5Vkhsd1pTSTZJa0pWVTBsT1JWTlRJbjE5AA",
    "condition": "STksBXN1-J5HnG_4owlzKnbmzCfiOlrKDPgiR-QZ7Kg",
    "expiration": 1715939691772
};

const validTransferPutPayload = {
    "transferId": "1fbaf1a5-d82b-5bbf-9ffe-9d85fed9cfd8",
    "completedTimestamp": 1715939691772,
    "transferState": "COMMITTED",
    "fulfilment": null,
    "extensionList": null
};

const validTransferGetPayload: QueryTransferCmdPayload = {
    transferId: "0fbee1f3-c58e-9afe-8cdd-7e65eea2fca9",
    requesterFspId: "bluebank",
    destinationFspId: "greenbank",
};


const validBulkTransferPostPayload: PrepareBulkTransferCmdPayload = {
    "bulkTransferId": "0fbee1f3-c58e-9afe-8cdd-7e65eea2fca9",
    "bulkQuoteId": "0fbee1f3-c58e-5afe-8cdd-6e65eea2fca9",
    "payeeFsp": "greenbank",
    "payerFsp": "bluebank",
    "individualTransfers": [
        {
            "transferId": "0fbee2f3-c58e-5afe-8cdd-6e95eea2fca9",
            "transferAmount": {
                "currency": "USD",
                "amount": "10"
            },
            payerIdType: '',
            payeeIdType: '',
            transferType: '',
            extensions: [],
        }
    ],
    "expiration": 1715939691772,
};

const validBulkTransferGetPayload: QueryBulkTransferCmdPayload = {
    bulkTransferId: "0fbee1f3-c58e-9afe-8cdd-7e65eea2fca9",
    requesterFspId: "bluebank",
    destinationFspId: "greenbank",
};

const validBulkTransferPutPayload = {
    bulkTransferId: "0fbee1f3-c58e-9afe-8cdd-7e65eea2fca9",
	completedTimestamp: 1695659531251,
	bulkTransferState: BulkTransferState.PROCESSING,
    individualTransferResults: [{
        "transferId": "0fbee2f3-c58e-5afe-8cdd-6e95eea2fca9",
        fulfilment: null,
        errorInformation: null,
        extensionList: null
    }]
};

const validRejectTransferPostPayload = {
    "transferId": "2fbaf1a5-d82b-5bbf-9ffe-9d85fed9cfd8",
    "errorInformation": {
        "errorCode": "123456",
        "errorDescription": "random error description",
        "extensionList": null
    }
};

const validRejectBulkTransferPostPayload = {
    "bulkTransferId": "3fbaf1a5-d82b-5bbf-9ffe-9d85fed9cfd8",
    "errorInformation": {
        "errorCode": "123456",
        "errorDescription": "random error description",
        "extensionList": null
    }
};

let validTransfer: ITransfer;
let validBulkTransfer: IBulkTransfer;
 
const metricsMock: IMetrics = new MetricsMock();

describe("Domain - Unit Tests for Command Handler", () => {

    beforeEach(async () => {

        aggregate = new TransfersAggregate(
            logger,
            transfersRepo,
            bulkTransfersRepo,
            participantService,
            messageProducer,
            accountsAndBalancesService,
            metricsMock,
            settlementsService,
            schedulingService,
            interopFspiopValidator
        );

        validTransfer = {
            createdAt: 1695659528072,
            updatedAt: 1695659531251,
            transferId: "1fbaf1a5-d82b-5bbf-9ffe-9d85fed9cfd8",
            bulkTransferId: null,
            payeeFspId: "greenbank",
            payerFspId: "bluebank",
            amount: "10.5",
            currencyCode: "USD",
            expirationTimestamp: new Date("2023-09-19T06:23:25.908Z").getTime(),
            transferState: TransferState.RESERVED,
            completedTimestamp: 1695659531014,
            extensions: [],
            settlementModel: "DEFAULT",
            hash: "FMXpM1VNkEQKj8WGEgNXC5HpohnLJ/afDMFEYHHuUXw",
            payerIdType: "MSISDN",
            payeeIdType: "IBAN",
            transferType: "DEPOSIT",
            errorCode:  null,
            inboundProtocolType: "FSPIOP_v1_1",
            inboundProtocolOpaqueState: null,
        }

        const now = Date.now();

        validBulkTransfer = {
            createdAt: now,
            updatedAt: now,
            bulkTransferId: "1bdc3ae0-d8a9-4c2c-befb-810c1a5bd01c",
            bulkQuoteId: "3adc3be0-d8a9-4c2c-befb-810c1a5bd01c",
            payeeFsp: "greenbank",
            payerFsp: "bluebank",
            completedTimestamp: 1697585442210,
            individualTransfers: [ {
                transferId: "0fbee2f3-c58e-5afe-8cdd-6e95eea2fca9",
                transferAmount: {
                    currency: "USD",
                    amount: "10"
                },
            }],
            expiration: 2697585442210,
            transfersPreparedProcessedIds: [],
            transfersNotProcessedIds: [],
            transfersFulfiledProcessedIds: [],
            status: BulkTransferState.RECEIVED,
            errorCode: null,
            inboundProtocolType: "FSPIOP_v1_1",
            inboundProtocolOpaqueState: null,
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

    test("should now process command if not of type command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, "fake msg name", null);

        jest.spyOn(messageProducer, "send");

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "payload": {
                "errorCode": TransferErrorCodeNames.COMMAND_TYPE_UNKNOWN, 
                "payerFspId": undefined, 
                "transferId": command.payload.transferId
            }
        })]);

    });

    test("should throw TransferUnableToGetTransferByIdEvt error processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockImplementation(() => { throw Error(); })

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferUnableToGetTransferByIdEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.UNABLE_TO_GET_TRANSFER, 
                "transferId": command.payload.transferId
            }
        })]);
    });
    
    // test("should throw TransferUnableToGetTransferByIdEvt error processing PrepareTransferCmd command", async () => {
    //     // Arrange
    //     const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

    //     jest.spyOn(messageProducer, "send");

    //     // Act
    //     await aggregate.processCommandBatch([command]);

    //     // Assert
    //     expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
    //         "msgName": TransferUnableToGetTransferByIdEvt.name,
    //         "payload": {
    //             "errorCode": TransferErrorCodeNames.UNABLE_TO_GET_TRANSFER, 
    //             "payerFspId": undefined, 
    //             "transferId": command.payload.transferId
    //         }
    //     })]);

    // });

    test("should ignore when transfer with RECEIVED state is found processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        validTransfer.transferState = TransferState.RECEIVED;

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValueOnce(validTransfer);
        
        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([]);
        });

    });

    test("should ignore when transfer with RESERVED state is found processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValueOnce(validTransfer);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([]);
        });

    });

    test("should return transfer when transfer with COMMITTED state is found processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        validTransfer.transferState = TransferState.COMMITTED;

        jest.spyOn(messageProducer, "send");
          
        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValueOnce(validTransfer);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferQueryResponseEvt.name,
                "payload": {
                    "completedTimestamp": validTransfer.completedTimestamp,
                    "transferId": validTransfer.transferId,
                    "transferState": validTransfer.transferState
                }
            })]);
        });

    });

    
    test("should return transfer when transfer with ABORTED state is found processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        validTransfer.transferState = TransferState.ABORTED;

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValueOnce(validTransfer);
        
        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferQueryResponseEvt.name,
                "payload": {
                    "completedTimestamp": validTransfer.completedTimestamp,
                    "transferId": validTransfer.transferId,
                    "transferState": validTransfer.transferState
                }
            })]);
        });

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
                "errorCode": TransferErrorCodeNames.UNABLE_TO_GET_TRANSFER_SETTLEMENT_MODEL,
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
                "errorCode": TransferErrorCodeNames.UNABLE_TO_GET_TRANSFER_SETTLEMENT_MODEL,
                "transferId": command.payload.transferId
            })
        })]);

    });
    
    test("should throw when hub participant is not found processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        validBulkTransfer.bulkTransferId = validBulkTransferPutPayload.bulkTransferId;
        validBulkTransfer.transfersPreparedProcessedIds = [];

        jest.spyOn(messageProducer, "send");
        
        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferHubNotFoundFailedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.HUB_NOT_FOUND, 
                    "payerFspId": undefined, 
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });
 
    test("should throw when hub participant has id mismatch processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce({ ...mockedHubParticipant, id: "mismatched_id" });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferHubIdMismatchEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.HUB_PARTICIPANT_ID_MISMATCH, 
                    "hubId": HUB_PARTICIPANT_ID,
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });

    test("should throw when hub participant is not approved processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce({ ...mockedHubParticipant, approved: false });
        
        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferHubNotApprovedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.HUB_PARTICIPANT_NOT_APPROVED, 
                    "hubId": HUB_PARTICIPANT_ID,
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });

    test("should throw when hub participant is not active processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce({ ...mockedHubParticipant, isActive: false });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferHubNotActiveEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.HUB_PARTICIPANT_NOT_ACTIVE, 
                    "hubId": HUB_PARTICIPANT_ID,
                    "transferId": command.payload.transferId
                }
            })]);
        });
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
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayerNotFoundFailedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_FOUND, 
                    "payerFspId": command.payload.payerFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });

    test("should throw when payer participant has id mismatch processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce({ ...mockedPayerParticipant, id: "mismatched_id" });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayerIdMismatchEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYER_PARTICIPANT_ID_MISMATCH, 
                    "payerFspId": command.payload.payerFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });

    test("should throw when payer participant is not approved processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce({ ...mockedPayerParticipant, approved: false });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayerNotApprovedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_APPROVED, 
                    "payerFspId": command.payload.payerFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });

    test("should throw when payer participant is not active processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce({ ...mockedPayerParticipant, isActive: false });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayerNotActiveEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_ACTIVE, 
                    "payerFspId": command.payload.payerFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });
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
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayeeNotFoundFailedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_FOUND, 
                    "payeeFspId": command.payload.payeeFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });

    test("should throw when payee participant has id mismatch processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce({ ...mockedPayeeParticipant, id: "mismatched_id" });
    

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayeeIdMismatchEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYEE_PARTICIPANT_ID_MISMATCH, 
                    "payeeFspId": command.payload.payeeFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });

    test("should throw when payee participant is not approved processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce({ ...mockedPayeeParticipant, approved: false });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayeeNotApprovedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_APPROVED, 
                    "payeeFspId": command.payload.payeeFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });

    test("should throw when payee participant is not active processing PrepareTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce({ ...mockedPayeeParticipant, isActive: false });
        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayeeNotActiveEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_ACTIVE, 
                    "payeeFspId": command.payload.payeeFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });
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
                "errorCode": TransferErrorCodeNames.HUB_NOT_FOUND, 
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
                "errorCode": TransferErrorCodeNames.PAYER_POSITION_ACCOUNT_NOT_FOUND, 
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
                "errorCode": TransferErrorCodeNames.PAYER_LIQUIDITY_ACCOUNT_NOT_FOUND, 
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
                "errorCode": TransferErrorCodeNames.PAYEE_POSITION_ACCOUNT_NOT_FOUND, 
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
                "errorCode": TransferErrorCodeNames.PAYEE_LIQUIDITY_ACCOUNT_NOT_FOUND, 
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
                "errorCode": TransferErrorCodeNames.UNABLE_TO_CREATE_TRANSFER_REMINDER, 
                "transferId": command.payload.transferId
            }
        })]);
    });

    // test("should throw transfer not found error processing PrepareTransferCmd command continue when processHighLevelBatch", async () => {
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
    //             success: true,
    //             errorMessage: null
    //         }])

    //     jest.spyOn(transfersRepo, "getTransferById")
    //         .mockResolvedValueOnce(null)
    //         .mockImplementationOnce(() => { throw Error(); })
        
    //     // Act
    //     await aggregate.processCommandBatch([command]);

    //     // Assert
    //     await waitForExpect(async () => {
    //         expect(messageProducer.send).toHaveBeenCalledWith([
    //             expect.objectContaining({
    //                 "msgName": TransferUnableToGetTransferByIdEvt.name,
    //                 "payload": {
    //                     "errorCode": TransferErrorCodeNames.UNABLE_TO_GET_TRANSFER, 
    //                     "payerFspId": undefined, 
    //                     "transferId": command.payload.transferId
    //                 }
    //             }),
    //             expect.objectContaining({
    //                 "msgName": TransferCancelReservationFailedEvt.name,
    //                 "payload": {
    //                     "errorCode": TransferErrorCodeNames.UNABLE_TO_CANCEL_TRANSFER_RESERVATION, 
    //                     "transferId": command.payload.transferId
    //                 }
    //             })
    //         ]);
    //     });

    // });


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
                "errorCode": TransferErrorCodeNames.TRANSFER_LIQUIDITY_CHECK_FAILED, 
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

        const cmd = new PrepareTransferCmd({
            bulkTransferId: null,
            transferId: validTransferPostPayload.transferId,
            amount: validTransferPostPayload.amount,
            currencyCode: validTransferPostPayload.currencyCode,
            payeeFsp: validTransferPostPayload.payeeFsp,
            payerFsp: validTransferPostPayload.payerFsp,
            expiration: validTransferPostPayload.expiration,
            payerIdType: command.payload.payerIdType,
            payeeIdType: command.payload.payeeIdType,
            transferType: command.payload.transferType,
            extensions: command.payload.extensions,
        });

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
            "payload": expect.objectContaining({
                "transferId": cmd.payload.transferId,
                "payerFsp": cmd.payload.payerFsp,
                "payeeFsp": cmd.payload.payeeFsp,
                "currencyCode": cmd.payload.currencyCode,
                "expiration": cmd.payload.expiration,
            })
        })]);
    });
    // #endregion

    // #region _fulfilTransferStart
    test("should throw when trying to retrieve a transfer from the repo processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);
        
        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockImplementationOnce(() => { throw Error(); });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferUnableToGetTransferByIdEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.UNABLE_TO_GET_TRANSFER, 
                "transferId": command.payload.transferId
            }
        })]);

    });

    test("should throw when not finding corresponding transfer and not able to cancel transfer processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);
        
        jest.spyOn(messageProducer, "send");

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferCancelReservationFailedEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.UNABLE_TO_CANCEL_TRANSFER_RESERVATION, 
                "transferId": command.payload.transferId
            }
        })]);

    });

    test("should throw when hub participant is not found and not able to cancel transfer processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });
        
        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(null)
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
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferCancelReservationFailedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.UNABLE_TO_CANCEL_TRANSFER_RESERVATION,
                    "transferId": command.payload.transferId
                }
            })]);
        });

    });

    test("should throw when hub participant is not found processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });
        
        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(null)
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

        jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferHubNotFoundFailedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.HUB_NOT_FOUND,
                    "payerFspId": undefined, 
                    "transferId": command.payload.transferId
                }
            })]);
        });

    });

    test("should throw when hub participant has id mismatch processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });
        
        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce({ ...mockedHubParticipant, id: "mismatched_id" })
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

        jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferHubIdMismatchEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.HUB_PARTICIPANT_ID_MISMATCH,
                    "hubId": HUB_PARTICIPANT_ID,
                    "transferId": command.payload.transferId
                }
            })]);
        });

    });
    
    test("should throw when hub participant is not approved processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });
        
        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce({ ...mockedHubParticipant, approved: false })
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

        jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferHubNotApprovedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.HUB_PARTICIPANT_NOT_APPROVED,
                    "hubId": HUB_PARTICIPANT_ID,
                    "transferId": command.payload.transferId
                }
            })]);
        });

    });
    
    test("should throw when hub participant is not active processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });
        
        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce({ ...mockedHubParticipant, isActive: false })
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

        jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferHubNotActiveEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.HUB_PARTICIPANT_NOT_ACTIVE,
                    "hubId": HUB_PARTICIPANT_ID,
                    "transferId": command.payload.transferId
                }
            })]);
        });

    });
    
    test("should throw when payer participant is not found processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });
        
        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(null)
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

        jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayerNotFoundFailedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_FOUND,
                    "payerFspId": command.payload.payerFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });

    });
    
    test("should throw when payer participant has id mismatch processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });
        
        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce({ ...mockedPayerParticipant, id: "mismatched_id" })
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

        jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayerIdMismatchEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYER_PARTICIPANT_ID_MISMATCH,
                    "payerFspId": command.payload.payerFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });

    });

    test("should throw when payer participant is not approved processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });
        
        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce({ ...mockedPayerParticipant, approved: false })
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

        jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayerNotApprovedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_APPROVED,
                    "payerFspId": command.payload.payerFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });

    });
    
    test("should throw when payer participant is not active processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });
        
        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce({ ...mockedPayerParticipant, isActive: false })
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

        jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayerNotActiveEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_ACTIVE,
                    "payerFspId": command.payload.payerFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });

    });

    test("should throw when payee participant is not found processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });
        
        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(null)
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

        jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayeeNotFoundFailedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_FOUND,
                    "payeeFspId": command.payload.payeeFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });

    });

    test("should throw when payee participant has id mismatch processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });
        
        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce({ ...mockedPayeeParticipant, id: "mismatched_id" })
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

        jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayeeIdMismatchEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYEE_PARTICIPANT_ID_MISMATCH,
                    "payeeFspId": command.payload.payeeFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });

    });

    test("should throw when payee participant is not approved processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });
        
        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce({ ...mockedPayeeParticipant, approved: false })
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

        jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayeeNotApprovedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_APPROVED,
                    "payeeFspId": command.payload.payeeFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });

    });
      
    test("should throw when payee participant is not active processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });
        
        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce({ ...mockedPayeeParticipant, isActive: false })
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

        jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayeeNotActiveEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_ACTIVE,
                    "payeeFspId": command.payload.payeeFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });

    });
      
    // test("should throw when hub participant has no matching hub account processing CommitTransferFulfilCmd command", async () => {
    //     // Arrange
    //     const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);
    //     const hubParticipantWithNoAccounts = { ...mockedHubParticipant };
    //     hubParticipantWithNoAccounts.participantAccounts = hubParticipantWithNoAccounts.participantAccounts.filter((value: IParticipantAccount) => (value.type as string) !== AccountType.HUB && value.currencyCode !== command.payload.currencyCode);

    //     jest.spyOn(messageProducer, "send");

    //     jest.spyOn(transfersRepo, "getTransferById")
    //         .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });
        
    //     jest.spyOn(participantService, "getParticipantInfo")
    //         .mockResolvedValueOnce(hubParticipantWithNoAccounts)
    //         .mockResolvedValueOnce(mockedPayerParticipant)
    //         .mockResolvedValueOnce(mockedPayeeParticipant)
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

    //     jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

    //     // Act
    //     await aggregate.processCommandBatch([command]);

    //     // Assert
    //     await waitForExpect(async () => {
    //         expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
    //             "msgName": TransferHubAccountNotFoundFailedEvt.name,
    //             "payload": {
    //                 "errorDescription": `Hub account not found for transfer ${command.payload.transferId}`, 
    //                 "transferId": command.payload.transferId
    //             }
    //         })]);
    //     });

    // });

    test("should throw when payer participant has no matching position account processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);
        const payerParticipantWithNoAccounts = { ...mockedPayerParticipant };
        payerParticipantWithNoAccounts.participantAccounts = payerParticipantWithNoAccounts.participantAccounts.filter((value: IParticipantAccount) => (value.type as string) !== AccountType.POSITION);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });
        
        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(payerParticipantWithNoAccounts)
            .mockResolvedValueOnce(mockedPayeeParticipant)
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

        jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayerPositionAccountNotFoundFailedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYER_POSITION_ACCOUNT_NOT_FOUND,
                    "payerFspId": command.payload.payerFsp,
                    "transferId": command.payload.transferId
                }
            })]);
        });

    });
    
    test("should throw when payer participant has no matching position account processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);
        const payerParticipantWithNoAccounts = { ...mockedPayerParticipant };
        payerParticipantWithNoAccounts.participantAccounts = payerParticipantWithNoAccounts.participantAccounts.filter((value: IParticipantAccount) => (value.type as string) !== AccountType.POSITION);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });
        
        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(payerParticipantWithNoAccounts)
            .mockResolvedValueOnce(mockedPayeeParticipant)
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

        jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayerPositionAccountNotFoundFailedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYER_POSITION_ACCOUNT_NOT_FOUND,
                    "payerFspId": command.payload.payerFsp,
                    "transferId": command.payload.transferId
                }
            })]);
        });

    });

    test("should throw when payer participant has no matching liquidity account processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);
        const payerParticipantWithNoAccounts = { ...mockedPayerParticipant };
        payerParticipantWithNoAccounts.participantAccounts = payerParticipantWithNoAccounts.participantAccounts.filter((value: IParticipantAccount) => (value.type as string) !== AccountType.SETTLEMENT);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });
        
        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(payerParticipantWithNoAccounts)
            .mockResolvedValueOnce(mockedPayeeParticipant)
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

        jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayerLiquidityAccountNotFoundFailedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYER_LIQUIDITY_ACCOUNT_NOT_FOUND,
                    "payerFspId": command.payload.payerFsp,
                    "transferId": command.payload.transferId
                }
            })]);
        });

    });

    test("should throw when payee participant has no matching position account processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);
        const payeeParticipantWithNoAccounts = { ...mockedPayeeParticipant };
        payeeParticipantWithNoAccounts.participantAccounts = payeeParticipantWithNoAccounts.participantAccounts.filter((value: IParticipantAccount) => (value.type as string) !== AccountType.POSITION);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });
        
        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(payeeParticipantWithNoAccounts)
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

        jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayeePositionAccountNotFoundFailedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYEE_POSITION_ACCOUNT_NOT_FOUND,
                    "payeeFspId": command.payload.payeeFsp,
                    "transferId": command.payload.transferId
                }
            })]);
        });

    });

    test("should throw when payee participant has no matching liquidity account processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);
        const payeeParticipantWithNoAccounts = { ...mockedPayeeParticipant };
        payeeParticipantWithNoAccounts.participantAccounts = payeeParticipantWithNoAccounts.participantAccounts.filter((value: IParticipantAccount) => (value.type as string) !== AccountType.SETTLEMENT);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });
        
        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(payeeParticipantWithNoAccounts)
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

        jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayeeLiquidityAccountNotFoundFailedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYEE_LIQUIDITY_ACCOUNT_NOT_FOUND,
                    "payeeFspId": command.payload.payeeFsp,
                    "transferId": command.payload.transferId
                }
            })]);
        });

    });

    test("should throw when hub participant account is not found and not able to cancel transfer processing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);
        const hubParticipantWithNoAccounts = { ...mockedHubParticipant };
        hubParticipantWithNoAccounts.participantAccounts = hubParticipantWithNoAccounts.participantAccounts.filter((value: IParticipantAccount) => (value.type as string) !== AccountType.HUB && value.currencyCode !== command.payload.currencyCode);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });
        
        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(hubParticipantWithNoAccounts)
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
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferCancelReservationFailedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.UNABLE_TO_CANCEL_TRANSFER_RESERVATION,
                    "transferId": command.payload.transferId
                }
            })]);
        });

    });
    // #endregion

    // #region _fulfilTTransferContinue
    test("should throw error for no success continuing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant)
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant);
        
        jest.spyOn(accountsAndBalancesService, "processHighLevelBatch")
            .mockResolvedValueOnce([{
                requestType: AccountsBalancesHighLevelRequestTypes.cancelReservationAndCommit,
                requestId: '123',
                success: false,
                errorMessage: null
            }]);
            
        jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferCancelReservationAndCommitFailedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.UNABLE_TO_CANCEL_TRANSFER_RESERVATION_AND_COMMIT,
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });
    
    test("should throw error while canceling transfer when not being able to process CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant);
        
        jest.spyOn(accountsAndBalancesService, "processHighLevelBatch")
            .mockResolvedValueOnce([{
                requestType: AccountsBalancesHighLevelRequestTypes.cancelReservationAndCommit,
                requestId: '123',
                success: false,
                errorMessage: null
            }]);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferCancelReservationFailedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.UNABLE_TO_CANCEL_TRANSFER_RESERVATION,
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });

    test("should throw error for no success continuing CommitTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, CommitTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant)
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant);
        
        jest.spyOn(accountsAndBalancesService, "processHighLevelBatch")
            .mockResolvedValueOnce([{
                requestType: AccountsBalancesHighLevelRequestTypes.cancelReservationAndCommit,
                requestId: '123',
                success: false,
                errorMessage: null
            }]);
            
        jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferCancelReservationAndCommitFailedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.UNABLE_TO_CANCEL_TRANSFER_RESERVATION_AND_COMMIT,
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });
    
    test("should successfully process CommitTransferFulfilCmd command", async () => {
          // Arrange
          const successAggregate = new TransfersAggregate(
            logger,
            transfersRepo,
            bulkTransfersRepo,
            participantService,
            messageProducer,
            accountsAndBalancesService,
            metricsMock,
            settlementsService,
            schedulingService,
            interopFspiopValidator
        );

        const commandPrepareTransfer: CommandMsg = createCommand(validTransferPostPayload, PrepareTransferCmd.name, null);

        const cmdPrepareTransfer = new PrepareTransferCmd({
            bulkTransferId: null,
            transferId: validTransferPostPayload.transferId,
            amount: validTransferPostPayload.amount,
            currencyCode: validTransferPostPayload.currencyCode,
            payeeFsp: validTransferPostPayload.payeeFsp,
            payerFsp: validTransferPostPayload.payerFsp,
            expiration: validTransferPostPayload.expiration,
            payerIdType: commandPrepareTransfer.payload.payerIdType,
            payeeIdType: commandPrepareTransfer.payload.payeeIdType,
            transferType: commandPrepareTransfer.payload.transferType,
            extensions: commandPrepareTransfer.payload.extensions,
        });

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
        await successAggregate.processCommandBatch([commandPrepareTransfer]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferPreparedEvt.name,
            "payload": expect.objectContaining({
                "transferId": cmdPrepareTransfer.payload.transferId,
                "payerFsp": cmdPrepareTransfer.payload.payerFsp,
                "payeeFsp": cmdPrepareTransfer.payload.payeeFsp,
                "currencyCode": cmdPrepareTransfer.payload.currencyCode,
                "expiration": cmdPrepareTransfer.payload.expiration,
            })
        })]);
        
        // Arrange
        const command: CommandMsg = createCommand(validTransferPutPayload, CommitTransferFulfilCmd.name, null);

        const cmd = new CommitTransferFulfilCmd({
            transferId: validTransferPostContinuePayload.transferId,
            transferState: validTransferPutPayload.transferState,
            completedTimestamp: validTransferPutPayload.completedTimestamp,
            notifyPayee: false,
        });

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });

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
        await successAggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferFulfiledEvt.name,
                "payload": expect.objectContaining({
                    "transferId": cmd.payload.transferId,
                    "completedTimestamp": cmd.payload.completedTimestamp,
                })
            })]);
        });

    });
    // #endregion

    // #region _prepareBulkTransferStart
    test("should throw TransferBCUnableToAddBulkTransferToDatabaseEvt error processing PrepareBulkTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validBulkTransferPostPayload, PrepareBulkTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(bulkTransfersRepo, "addBulkTransfer")
            .mockImplementationOnce(() => { throw Error(); })

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferBCUnableToAddBulkTransferToDatabaseEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.UNABLE_TO_ADD_BULK_TRANSFER,
                "bulkTransferId": command.payload.bulkTransferId
            }
        })]);

    }); 
    // #region

    // #region _prepareBulkTransferContinue
    test("should throw error while fetching bulk transfer processing PrepareBulkTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validBulkTransferPostPayload, PrepareBulkTransferCmd.name, null);

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

        jest.spyOn(bulkTransfersRepo, "getBulkTransferById")
            .mockResolvedValue(null);
            
        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": BulkTransferNotFoundEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.BULK_TRANSFER_NOT_FOUND,
                    "bulkTransferId": validBulkTransferPostPayload.bulkTransferId
                }
            })]);
        });
    });

    test("should throw error if found bulk transfers is null processing PrepareBulkTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validBulkTransferPostPayload, PrepareBulkTransferCmd.name, null);

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

        jest.spyOn(bulkTransfersRepo, "getBulkTransferById")
            .mockImplementationOnce(() => { throw Error(); });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferUnableToGetBulkTransferByIdEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.UNABLE_TO_GET_BULK_TRANSFER,
                    "bulkTransferId": validBulkTransferPostPayload.bulkTransferId
                }
            })]);
        });
    });
    
    test("should throw error if fulfil has zero individual transfers processing PrepareBulkTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validBulkTransferPostPayload, PrepareBulkTransferCmd.name, null);

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

        jest.spyOn(bulkTransfersRepo, "getBulkTransferById")
            .mockResolvedValue(validBulkTransfer);
        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferNotFoundEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.UNABLE_TO_GET_TRANSFERS_FROM_BULK_TRANSFER,
                    "transferId": validBulkTransfer.bulkTransferId
                }
            })]);
        });
    });
    // #region

    // #region _fulfilBulkTransferStart
    test("should throw TransferUnableToGetBulkTransferByIdEvt error processing CommitBulkTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validBulkTransferPutPayload, CommitBulkTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(bulkTransfersRepo, "getBulkTransferById")
            .mockImplementationOnce(() => { throw Error(); })

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferUnableToGetBulkTransferByIdEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.UNABLE_TO_GET_BULK_TRANSFER,
                "bulkTransferId": command.payload.bulkTransferId
            }
        })]);

    }); 

    test("should throw BulkTransferNotFoundEvt error processing CommitBulkTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validBulkTransferPutPayload, CommitBulkTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(bulkTransfersRepo, "getBulkTransferById")
            .mockResolvedValue(null);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": BulkTransferNotFoundEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.BULK_TRANSFER_NOT_FOUND,
                "bulkTransferId": command.payload.bulkTransferId
            }
        })]);

    }); 
    // #region
    
    // #region _fulfilBulkTransferContinue
    test("should throw when retrieving a null bulk transfer processing continue CommitBulkTransferFulfilCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validBulkTransferPutPayload, CommitBulkTransferFulfilCmd.name, null);

        jest.spyOn(messageProducer, "send");

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
            
        jest.spyOn(bulkTransfersRepo, "getBulkTransferById")
            .mockResolvedValue(validBulkTransfer)
            .mockResolvedValue(null);
            
        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validBulkTransfer.individualTransfers[0], bulkTransferId: validBulkTransferPutPayload.bulkTransferId, currencyCode: "USD" } as unknown as ITransfer);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": BulkTransferNotFoundEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.BULK_TRANSFER_NOT_FOUND,
                    "bulkTransferId": command.payload.bulkTransferId
                }
            })]);
        });
        
    });

    test("should successfully process CommitBulkTransferFulfilCmd command", async () => {
        // Arrange
        const successAggregate = new TransfersAggregate(
            logger,
            transfersRepo,
            bulkTransfersRepo,
            participantService,
            messageProducer,
            accountsAndBalancesService,
            metricsMock,
            settlementsService,
            schedulingService,
            interopFspiopValidator
        );
                
        const commandBulkTransferPrepare: CommandMsg = createCommand(validBulkTransferPostPayload, PrepareBulkTransferCmd.name, null);

        const cmdBulkTransferPrepare = new PrepareBulkTransferCmd({
            bulkTransferId: validBulkTransferPostPayload.bulkTransferId,
            bulkQuoteId: validBulkTransferPostPayload.bulkQuoteId,
            payeeFsp: validBulkTransferPostPayload.payeeFsp,
            payerFsp: validBulkTransferPostPayload.payerFsp,
            individualTransfers: validBulkTransferPostPayload.individualTransfers,
            expiration: validBulkTransferPostPayload.expiration,
        })

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
            }]);

        // Act
        await successAggregate.processCommandBatch([commandBulkTransferPrepare]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": BulkTransferPreparedEvt.name,
                "payload": expect.objectContaining({
                    "bulkTransferId": cmdBulkTransferPrepare.payload.bulkTransferId,
                    "bulkQuoteId": cmdBulkTransferPrepare.payload.bulkQuoteId,
                    "expiration": cmdBulkTransferPrepare.payload.expiration,
                    "individualTransfers": [{
                        "transferId": cmdBulkTransferPrepare.payload.individualTransfers[0].transferId,
                        "amount": cmdBulkTransferPrepare.payload.individualTransfers[0].transferAmount.amount,
                        "currencyCode": cmdBulkTransferPrepare.payload.individualTransfers[0].transferAmount.currency,
                    }]
                })
            })]);
        });

                
        // Arrange
        const command: CommandMsg = createCommand(validBulkTransferPutPayload, CommitBulkTransferFulfilCmd.name, null);

        const cmd = new CommitBulkTransferFulfilCmd({
            bulkTransferId: validBulkTransferPutPayload.bulkTransferId,
            completedTimestamp: validBulkTransferPutPayload.completedTimestamp,
            bulkTransferState: validBulkTransferPutPayload.bulkTransferState as BulkTransferState.PROCESSING,
            individualTransferResults: validBulkTransferPutPayload.individualTransferResults,
        });

        jest.spyOn(messageProducer, "send");

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
            
        jest.spyOn(bulkTransfersRepo, "getBulkTransferById")
            .mockImplementationOnce(async () => validBulkTransfer)
            .mockImplementationOnce(() => { throw Error(); });

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ 
                ...validBulkTransfer.individualTransfers[0], 
                bulkTransferId: validBulkTransferPutPayload.bulkTransferId, 
                currencyCode: "USD",
                payerFspId: "bluebank",
                payeeFspId: "greenbank"
            } as unknown as ITransfer);

        jest.spyOn(bulkTransfersRepo, "updateBulkTransfer").mockResolvedValue();

        // Act
        await successAggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": BulkTransferFulfiledEvt.name,
                "payload": expect.objectContaining({
                    "bulkTransferId": cmd.payload.bulkTransferId,
                    "completedTimestamp": cmd.payload.completedTimestamp,
                    "bulkTransferState": cmd.payload.bulkTransferState,
                    "individualTransferResults": cmd.payload.individualTransferResults,
                })
            })]);
        });
        
    });
    // #region

    // #region _rejectTransfer
    test("should throw when trying to retrieve a transfer from the repo processing RejectTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, RejectTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockImplementationOnce(() => { throw Error(); });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferUnableToGetTransferByIdEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.UNABLE_TO_GET_TRANSFER,
                "transferId": command.payload.transferId
            }
        })]);

    });

    test("should throw when retrieving a null transfer processing RejectTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, RejectTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue(null);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferNotFoundEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.TRANSFER_NOT_FOUND,
                "transferId": command.payload.transferId
            }
        })]);

    });

    test("should throw when hub participant is not found processing RejectTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, RejectTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue(validTransfer);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferHubNotFoundFailedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.HUB_NOT_FOUND,
                    "payerFspId": undefined, 
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });

    test("should throw when hub participant has id mismatch processing RejectTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, RejectTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue(validTransfer);

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce({ ...mockedHubParticipant, id: "mismatched_id" });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferHubIdMismatchEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.HUB_PARTICIPANT_ID_MISMATCH,
                    "hubId": HUB_PARTICIPANT_ID,
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });
    
    test("should throw when hub participant is not approved processing RejectTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, RejectTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue(validTransfer);

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce({ ...mockedHubParticipant, approved: false });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferHubNotApprovedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.HUB_PARTICIPANT_NOT_APPROVED,
                    "hubId": HUB_PARTICIPANT_ID,
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });
    
    test("should throw when hub participant is not active processing RejectTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, RejectTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue(validTransfer);

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce({ ...mockedHubParticipant, isActive: false });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferHubNotActiveEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.HUB_PARTICIPANT_NOT_ACTIVE,
                    "hubId": HUB_PARTICIPANT_ID,
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });

    test("should throw when payer participant is not found processing RejectTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, RejectTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue(validTransfer);
            
        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayerNotFoundFailedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_FOUND,
                    "payerFspId": command.payload.payerFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });

    test("should throw when payer participant has id mismatch processing RejectTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, RejectTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue(validTransfer);

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce({ ...mockedPayerParticipant, id: "mismatched_id" });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayerIdMismatchEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYER_PARTICIPANT_ID_MISMATCH,
                    "payerFspId": command.payload.payerFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });
    
    test("should throw when payer participant is not approved processing RejectTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, RejectTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue(validTransfer);

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce({ ...mockedPayerParticipant, approved: false });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayerNotApprovedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_APPROVED,
                    "payerFspId": command.payload.payerFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });

    test("should throw when payer participant is not active processing RejectTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, RejectTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue(validTransfer);

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce({ ...mockedPayerParticipant, isActive: false });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayerNotActiveEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_ACTIVE,
                    "payerFspId": command.payload.payerFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });

    test("should throw when payee participant is not found processing RejectTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, RejectTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue(validTransfer);

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayeeNotFoundFailedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_FOUND,
                    "payeeFspId": command.payload.payeeFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });

    test("should throw when payee participant has id mismatch processing RejectTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, RejectTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue(validTransfer);

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce({ ...mockedPayeeParticipant, id: "mismatched_id" });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayeeIdMismatchEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYEE_PARTICIPANT_ID_MISMATCH,
                    "payeeFspId": command.payload.payeeFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });
    
    test("should throw when payee participant is not approved processing RejectTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, RejectTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue(validTransfer);

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce({ ...mockedPayeeParticipant, approved: false });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayeeNotApprovedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_APPROVED,
                    "payeeFspId": command.payload.payeeFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });
    
    test("should throw when payee participant is not active processing RejectTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, RejectTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue(validTransfer);

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce({ ...mockedPayeeParticipant, isActive: false });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferPayeeNotActiveEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_ACTIVE,
                    "payeeFspId": command.payload.payeeFsp, 
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });

    test("should throw when on cancelTransfer transfer is not found processing RejectTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, RejectTransferCmd.name, null);
        const hubParticipantWithNoAccounts = { ...mockedHubParticipant };
        hubParticipantWithNoAccounts.participantAccounts = hubParticipantWithNoAccounts.participantAccounts.filter((value: IParticipantAccount) => (value.type as string) !== AccountType.HUB && value.currencyCode !== command.payload.currencyCode);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue(validTransfer);

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(hubParticipantWithNoAccounts)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferCancelReservationFailedEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.UNABLE_TO_CANCEL_TRANSFER_RESERVATION,
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });
    
    test("should throw when on cancelTransfer transfer is able to update transfer processing RejectTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostPayload, RejectTransferCmd.name, null);
    
        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue(validTransfer)
            .mockResolvedValue(validTransfer);

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant)
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant);

        jest.spyOn(transfersRepo, "updateTransfer")
            .mockImplementationOnce(async () => { return; })
            .mockImplementationOnce(() => { throw Error(); });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferUnableToUpdateEvt.name,
                "payload": {
                    "errorCode": TransferErrorCodeNames.UNABLE_TO_UPDATE_TRANSFER,
                    "payerFspId": command.payload.payerFsp,
                    "transferId": command.payload.transferId
                }
            })]);
        });
    });

    test("should successfully process RejectTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validRejectTransferPostPayload, RejectTransferCmd.name, null);

        const cmd = new RejectTransferCmd({
            transferId: validRejectTransferPostPayload.transferId,
            errorInformation: validRejectTransferPostPayload.errorInformation,
        });

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue(validTransfer)
            .mockResolvedValue(validTransfer);

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant)
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant);

        jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferRejectRequestProcessedEvt.name,
                "payload": expect.objectContaining({
                    "transferId": cmd.payload.transferId,
                    "errorInformation": cmd.payload.errorInformation
                })
            })]);
        });
    });
    // #endregion

    // #region _rejectBulkTransfer
    test("should throw when trying to retrieve a transfer from the repo processing RejectBulkTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validBulkTransferPostPayload, RejectBulkTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(bulkTransfersRepo, "getBulkTransferById")
            .mockImplementationOnce(() => { throw Error(); });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferUnableToGetBulkTransferByIdEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.UNABLE_TO_GET_BULK_TRANSFER,
                "bulkTransferId": command.payload.bulkTransferId
            }
        })]);

    });

    test("should throw when not finding corresponding bulk transfer processing RejectBulkTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validBulkTransferPostPayload, RejectBulkTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(bulkTransfersRepo, "getBulkTransferById")
            .mockResolvedValueOnce(null);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": BulkTransferNotFoundEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.BULK_TRANSFER_NOT_FOUND,
                "bulkTransferId": command.payload.bulkTransferId
            }
        })]);

    });

    test("should throw when trying to retrieve all transfers from a bulk transfer processing RejectBulkTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validBulkTransferPostPayload, RejectBulkTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(bulkTransfersRepo, "getBulkTransferById")
            .mockResolvedValueOnce(validBulkTransfer);

        jest.spyOn(transfersRepo, "getTransfersByBulkId")
            .mockImplementationOnce(() => { throw Error(); });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferUnableToGetBulkTransferByIdEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.UNABLE_TO_GET_TRANSFERS_FROM_BULK_TRANSFER,
                "bulkTransferId": command.payload.bulkTransferId
            }
        })]);

    });

    test("should sucessfully process RejectBulkTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validRejectBulkTransferPostPayload, RejectBulkTransferCmd.name, null);

        const cmd = new RejectBulkTransferCmd({
            bulkTransferId: validRejectBulkTransferPostPayload.bulkTransferId,
            errorInformation: validRejectBulkTransferPostPayload.errorInformation,
        });

        jest.spyOn(messageProducer, "send");

        jest.spyOn(bulkTransfersRepo, "getBulkTransferById")
            .mockResolvedValueOnce(validBulkTransfer);

        jest.spyOn(transfersRepo, "getTransfersByBulkId")
            .mockResolvedValueOnce([validTransfer]);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, bulkTransferId: command.payload.bulkTransferId })

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant)
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant);

        jest.spyOn(transfersRepo, "updateTransfer").mockResolvedValue();

        jest.spyOn(bulkTransfersRepo, "updateBulkTransfer").mockResolvedValue();

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": BulkTransferRejectRequestProcessedEvt.name,
                "payload": expect.objectContaining({
                    "errorInformation": cmd.payload.errorInformation,
                    "bulkTransferId": cmd.payload.bulkTransferId
                })
            })]);
        });

    });
    // #endregion

    // #region _queryTransfer
    test("should throw when hub participant is not found processing QueryTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, QueryTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferHubNotFoundFailedEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.HUB_NOT_FOUND,
                "payerFspId": undefined, 
                "transferId": command.payload.transferId
            }
        })]);

    });

    test("should throw when hub participant has id mismatch processing QueryTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, QueryTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce({ ...mockedHubParticipant, id: "mismatched_id" });
            
        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferHubIdMismatchEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.HUB_PARTICIPANT_ID_MISMATCH,
                "hubId": HUB_PARTICIPANT_ID,
                "transferId": command.payload.transferId
            }
        })]);

    });

    test("should throw when hub participant is not approved processing QueryTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, QueryTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce({ ...mockedHubParticipant, approved: false });
            
        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferHubNotApprovedEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.HUB_PARTICIPANT_NOT_APPROVED,
                "hubId": HUB_PARTICIPANT_ID,
                "transferId": command.payload.transferId
            }
        })]);

    });
    
    test("should throw when hub participant is not active processing QueryTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, QueryTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce({ ...mockedHubParticipant, isActive: false });
            
        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferHubNotActiveEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.HUB_PARTICIPANT_NOT_ACTIVE,
                "hubId": HUB_PARTICIPANT_ID,
                "transferId": command.payload.transferId
            }
        })]);

    });

    test("should throw when payer participant is not found processing QueryTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferGetPayload, QueryTransferCmd.name, { requesterFspId: "bluebank", destinationFspId: "greenbank" });

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferPayerNotFoundFailedEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_FOUND,
                "payerFspId": command.payload.requesterFspId, 
                "transferId": command.payload.transferId
            }
        })]);
    });
    
    test("should throw when payer participant has id mismatch processing QueryTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferGetPayload, QueryTransferCmd.name, { requesterFspId: "bluebank", destinationFspId: "greenbank" });

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce({ ...mockedPayerParticipant, id: "mismatched_id" });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferPayerIdMismatchEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.PAYER_PARTICIPANT_ID_MISMATCH,
                "payerFspId": command.payload.requesterFspId, 
                "transferId": command.payload.transferId
            }
        })]);
    });
   
    test("should throw when payer participant is not approved processing QueryTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferGetPayload, QueryTransferCmd.name, { requesterFspId: "bluebank", destinationFspId: "greenbank" });

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce({ ...mockedPayerParticipant, approved: false });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferPayerNotApprovedEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_APPROVED,
                "payerFspId": command.payload.requesterFspId, 
                "transferId": command.payload.transferId
            }
        })]);
    });

    test("should throw when payer participant is not active processing QueryTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferGetPayload, QueryTransferCmd.name, { requesterFspId: "bluebank", destinationFspId: "greenbank" });

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce({ ...mockedPayerParticipant, isActive: false });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferPayerNotActiveEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_ACTIVE,
                "payerFspId": command.payload.requesterFspId, 
                "transferId": command.payload.transferId
            }
        })]);
    });
    
    test("should throw when payee participant is not found processing QueryTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferGetPayload, QueryTransferCmd.name, { requesterFspId: "bluebank", destinationFspId: "greenbank" });

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
                "errorCode": TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_FOUND,
                "payeeFspId": command.payload.destinationFspId, 
                "transferId": command.payload.transferId
            }
        })]);
    });

    test("should throw when payee participant has id mismatch processing QueryTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferGetPayload, QueryTransferCmd.name, { requesterFspId: "bluebank", destinationFspId: "greenbank" });

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce({ ...mockedPayeeParticipant, id: "mismatched_id" });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferPayeeIdMismatchEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.PAYEE_PARTICIPANT_ID_MISMATCH,
                "payeeFspId": command.payload.destinationFspId, 
                "transferId": command.payload.transferId
            }
        })]);
    });
    
    test("should throw when payee participant is not approved processing QueryTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferGetPayload, QueryTransferCmd.name, { requesterFspId: "bluebank", destinationFspId: "greenbank" });

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce({ ...mockedPayeeParticipant, approved: false });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferPayeeNotApprovedEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_APPROVED,
                "payeeFspId": command.payload.destinationFspId, 
                "transferId": command.payload.transferId
            }
        })]);
    });
        
    test("should throw when payee participant is not active processing QueryTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferGetPayload, QueryTransferCmd.name, { requesterFspId: "bluebank", destinationFspId: "greenbank" });

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce({ ...mockedPayeeParticipant, isActive: false });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferPayeeNotActiveEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_ACTIVE,
                "payeeFspId": command.payload.destinationFspId, 
                "transferId": command.payload.transferId
            }
        })]);
    });
    
    test("should throw when trying to find transfer when processing QueryTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferGetPayload, QueryTransferCmd.name, { requesterFspId: "bluebank", destinationFspId: "greenbank" });

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant);

        jest.spyOn(transfersRepo, "getTransferById")
            .mockImplementationOnce(() => { throw Error(); });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferUnableToGetTransferByIdEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.UNABLE_TO_GET_TRANSFER,
                "transferId": command.payload.transferId
            }
        })]);
    });
    
    test("should throw when get transfer is null processing QueryTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferGetPayload, QueryTransferCmd.name, { requesterFspId: "bluebank", destinationFspId: "greenbank" });

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant);

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue(null);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferNotFoundEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.TRANSFER_NOT_FOUND,
                "transferId": command.payload.transferId
            }
        })]);
    });

    test("should successfully process QueryTransferCmd command", async () => {
        // Arrange
        const requesterFspId = "bluebank";
        const destinationFspId = "greenbank";
        const command: CommandMsg = createCommand(validTransferGetPayload, QueryTransferCmd.name, { requesterFspId: "bluebank", destinationFspId: "greenbank" });

        const cmd = new QueryTransferCmd({
            transferId: validTransferPostContinuePayload.transferId,
            requesterFspId: requesterFspId,
            destinationFspId: destinationFspId
        });

        jest.spyOn(messageProducer, "send");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant);

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferId: validTransferPostContinuePayload.transferId });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": TransferQueryResponseEvt.name,
                "payload": expect.objectContaining({
                    "transferId": cmd.payload.transferId,
                    "transferState": TransferState.RESERVED
                })
            })]);
        });

    });
    
    // #endregion

    // #region _queryBulkTransfer
    test("should throw when trying to retrieve a bulk transfer processing continue QueryBulkTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validBulkTransferPostPayload, QueryBulkTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(bulkTransfersRepo, "getBulkTransferById")
            .mockImplementationOnce(() => { throw Error(); });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferUnableToGetBulkTransferByIdEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.UNABLE_TO_GET_BULK_TRANSFER,
                "bulkTransferId": command.payload.bulkTransferId
            }
        })]);

    });
    
    test("should throw when not finding corresponding bulk transfer processing QueryBulkTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validBulkTransferPostPayload, QueryBulkTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(bulkTransfersRepo, "getBulkTransferById")
            .mockResolvedValue(null);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": BulkTransferNotFoundEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.BULK_TRANSFER_NOT_FOUND,
                "bulkTransferId": command.payload.bulkTransferId
            }
        })]);

    });

    test("should throw when hub participant is not found processing QueryBulkTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validBulkTransferPostPayload, QueryBulkTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(bulkTransfersRepo, "getBulkTransferById")
            .mockResolvedValue(validBulkTransfer);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferHubNotFoundFailedEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.HUB_NOT_FOUND,
                "transferId": command.payload.bulkTransferId
            }
        })]);

    });

    test("should throw when payer participant is not found processing QueryBulkTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validBulkTransferGetPayload, QueryBulkTransferCmd.name, { fspiopOpaqueState: { requesterFspId: "bluebank", destinationFspId: "greenbank" } });

        jest.spyOn(messageProducer, "send");

        jest.spyOn(bulkTransfersRepo, "getBulkTransferById")
            .mockResolvedValue(validBulkTransfer);

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferPayerNotFoundFailedEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_FOUND,
                "payerFspId": command.payload.requesterFspId, 
                "transferId": command.payload.bulkTransferId
            }
        })]);
    });

    test("should throw when payee participant is not found processing QueryBulkTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validBulkTransferGetPayload, QueryBulkTransferCmd.name, { fspiopOpaqueState: { requesterFspId: "bluebank", destinationFspId: "greenbank" } });

        jest.spyOn(messageProducer, "send");

        jest.spyOn(bulkTransfersRepo, "getBulkTransferById")
            .mockResolvedValue(validBulkTransfer);

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferPayeeNotFoundFailedEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_FOUND, 
                "payeeFspId": command.payload.destinationFspId, 
                "transferId": command.payload.bulkTransferId
            }
        })]);
    });

    test("should throw when trying to find bulk transfer when processing QueryBulkTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validBulkTransferGetPayload, QueryBulkTransferCmd.name, { fspiopOpaqueState: { requesterFspId: "bluebank", destinationFspId: "greenbank" } });

        jest.spyOn(messageProducer, "send");

        jest.spyOn(bulkTransfersRepo, "getBulkTransferById")
            .mockResolvedValue(validBulkTransfer);

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant);

        jest.spyOn(transfersRepo, "getTransfersByBulkId")
            .mockImplementationOnce(() => { throw Error(); });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferUnableToGetBulkTransferByIdEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.UNABLE_TO_GET_BULK_TRANSFER,
                "bulkTransferId": command.payload.bulkTransferId
            }
        })]);
    });
    
    test("should throw when get bulk transfer is null processing QueryBulkTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validBulkTransferGetPayload, QueryBulkTransferCmd.name, { fspiopOpaqueState: { requesterFspId: "bluebank", destinationFspId: "greenbank" } });

        jest.spyOn(messageProducer, "send");

        jest.spyOn(bulkTransfersRepo, "getBulkTransferById")
            .mockResolvedValue(validBulkTransfer);

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant);

        jest.spyOn(transfersRepo, "getTransfersByBulkId")
            .mockResolvedValue([]);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferNotFoundEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.BULK_TRANSFERS_NO_ITEMS,
                "transferId": command.payload.bulkTransferId
            }
        })]);
    });

    test("should successfully process QueryBulkTransferCmd command", async () => {
        // Arrange
        const requesterFspId = "bluebank";
        const destinationFspId = "greenbank";
        const command: CommandMsg = createCommand(validBulkTransferGetPayload, QueryBulkTransferCmd.name, { fspiopOpaqueState: { requesterFspId: requesterFspId, destinationFspId: destinationFspId } });
        const cmd = new QueryBulkTransferCmd({
            bulkTransferId: validBulkTransferGetPayload.bulkTransferId,
            requesterFspId: requesterFspId,
            destinationFspId: destinationFspId
        });
        
        jest.spyOn(messageProducer, "send");

        jest.spyOn(bulkTransfersRepo, "getBulkTransferById")
            .mockResolvedValue({ ...validBulkTransfer, bulkTransferId: validBulkTransferGetPayload.bulkTransferId });

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce(mockedHubParticipant)
            .mockResolvedValueOnce(mockedPayerParticipant)
            .mockResolvedValueOnce(mockedPayeeParticipant);

        jest.spyOn(transfersRepo, "getTransfersByBulkId")
            .mockResolvedValue([{ ...validBulkTransfer, bulkTransferId: validBulkTransferGetPayload.bulkTransferId } as unknown as ITransfer]);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        await waitForExpect(async () => {
            expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
                "msgName": BulkTransferQueryResponseEvt.name,
                "payload": expect.objectContaining({
                    "bulkTransferId": cmd.payload.bulkTransferId,
                    "bulkTransferState": BulkTransferState.RECEIVED
                })
            })]);
        });
    });
    // #endregion

    // #region _timeoutTransfer
    test("should throw when trying to find transfer when processing TimeoutTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, TimeoutTransferCmd.name, null);

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockImplementationOnce(() => { throw Error(); });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([expect.objectContaining({
            "msgName": TransferUnableToGetTransferByIdEvt.name,
            "payload": {
                "errorCode": TransferErrorCodeNames.UNABLE_TO_GET_TRANSFER,
                "transferId": command.payload.transferId
            }
        })]);

    });
    // #endregion

    test("should not do anything if transfer is null processing TimeoutTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, TimeoutTransferCmd.name, { fspiopOpaqueState: { requesterFspId: "bluebank", destinationFspId: "greenbank" } });

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue(null);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([]);
    });

    
    test("should not do anything if transfer is null processing TimeoutTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, TimeoutTransferCmd.name, { fspiopOpaqueState: { requesterFspId: "bluebank", destinationFspId: "greenbank" } });

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue(null);

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith([]);
    });

    
    test("should not do anything if found transfer is COMMITTED processing TimeoutTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, TimeoutTransferCmd.name, { fspiopOpaqueState: { requesterFspId: "bluebank", destinationFspId: "greenbank" } });

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferState: TransferState.COMMITTED });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledTimes(0);
    });
    
    test("should not do anything if found transfer is ABORTED processing TimeoutTransferCmd command", async () => {
        // Arrange
        const command: CommandMsg = createCommand(validTransferPostContinuePayload, TimeoutTransferCmd.name, { fspiopOpaqueState: { requesterFspId: "bluebank", destinationFspId: "greenbank" }});

        jest.spyOn(messageProducer, "send");

        jest.spyOn(transfersRepo, "getTransferById")
            .mockResolvedValue({ ...validTransfer, transferState: TransferState.ABORTED });

        // Act
        await aggregate.processCommandBatch([command]);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledTimes(0);
    });

});
