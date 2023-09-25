// /**
//  License
//  --------------
//  Copyright © 2021 Mojaloop Foundation

//  The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License.

//  You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0

//  Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

//  Contributors
//  --------------
//  This is the official list (alphabetical ordering) of the Mojaloop project contributors for this file.
//  Names of the original copyright holders (individuals or organizations)
//  should be listed with a '' in the first column. People who have
//  contributed from an organization can be listed under the organization
//  that actually holds the copyright for their contributions (see the
//  Gates Foundation organization for an example). Those individuals should have
//  their names indented and be marked with a '-'. Email address can be added
//  optionally within square brackets <email>.

//  * Gates Foundation
//  - Name Surname <name.surname@gatesfoundation.com>

//  * Arg Software
//  - José Antunes <jose.antunes@arg.software>
//  - Rui Rocha <rui.rocha@arg.software>

//  --------------
// **/

// "use strict";

// // TODO: fix tests
// describe("Empty - RE-ENABLE", () => {
//     test("Empty - RE-ENABLE", async () => {
//         expect(true).toBeTruthy();
//     });
// });






// import { CommandMsg } from "@mojaloop/platform-shared-lib-messaging-types-lib";
// import { IParticipant, IParticipantAccount } from "@mojaloop/participant-bc-public-types-lib";
// import { TransferFulfiledEvtPayload, TransferErrorEvtPayload, TransferPreparedEvtPayload, TransferPrepareRequestedEvt, TransferPrepareRequestedEvtPayload} from "@mojaloop/platform-shared-lib-public-messages-lib";
// import { InvalidParticipantIdError, NoSuchAccountError, NoSuchParticipantError, RequiredParticipantIsNotActive} from "../../src/errors";
// import { TransferState } from '../../src/types';
// import { createCommand,  createTransferFulfiledEvtPayload,  createTransferPreparedEvtPayload } from "../utils/helpers";
// import { aggregate, transferRepo, messageProducer, participantService, accountsAndBalancesService } from "../utils/mocked_variables";
// import { mockedTransfer1, mockedTransfer2 } from "@mojaloop/transfers-bc-shared-mocks-lib";
// import {
// 	PrepareTransferCmd,
// 	TransfersAggregate,
// 	CommitTransferFulfilCmd
// } from "@mojaloop/transfers-bc-domain-lib";
// import { NoSuchTransferError } from "@mojaloop/transfers-bc-implementations-lib";

// const mockedParticipantAccountHub = {
//     id: "1",
//     type: "HUB_RECONCILIATION",
//     currencyCode: "EUR",
//     debitBalance: 100,
//     creditBalance: 100,
// } as unknown as IParticipantAccount

// const mockedParticipantAccountHubNonExisting = {
//     id: "1",
//     type: "HUB_WRONG_TYPE",
//     currencyCode: "EUR",
//     debitBalance: 100,
//     creditBalance: 100,
// } as unknown as IParticipantAccount

// const mockedParticipantAccountPosition = {
//     id: "1",
//     type: "POSITION",
//     currencyCode: "EUR",
//     debitBalance: 100,
//     creditBalance: 100,
// } as unknown as IParticipantAccount

// const mockedParticipantAccountSettlement = {
//     id: "1",
//     type: "SETTLEMENT",
//     currencyCode: "EUR",
//     debitBalance: 100,
//     creditBalance: 100,
// } as unknown as IParticipantAccount

// describe("Domain - Unit Tests for Transfer Events", () => {

//     afterEach(async () => {
//         jest.restoreAllMocks();
//     });

//     afterAll(async () => {
//         jest.clearAllMocks();
//     });

//     //#region handleTransferPreparedEvt
//     test("handleTransferPreparedEvt - should publish error command if participants list is empty", async () => {
//         // Arrange
//         const mockedTransfer = mockedTransfer1 as any;

//         const payload: TransferPrepareRequestedEvtPayload = createTransferPreparedEvtPayload(mockedTransfer);

//         const requesterFspId = "payer";
//         const destinationFspId = "payee";
//         const fspiopOpaqueState = {
//             requesterFspId,
//             destinationFspId,
//         };

//         const command: CommandMsg = createCommand(payload, PrepareTransferCmd.name, fspiopOpaqueState);

//         const errorMsg = NoSuchParticipantError.name;

//         const errorPayload: TransferErrorEvtPayload = {
// 			errorMsg,
// 			destinationFspId,
//             requesterFspId,
//             transferId: payload.transferId,
//             sourceEvent : PrepareTransferCmd.name,
// 		};

//         jest.spyOn(transferRepo, "addTransfer")
//         .mockResolvedValueOnce(mockedTransfer.id);

//         jest.spyOn(participantService, "getParticipantsInfo")
//             .mockResolvedValueOnce([]);

//         jest.spyOn(messageProducer, "send");

//         // Act
//         await aggregate.handleTransferCommand(command);

//         // Assert
//         expect(messageProducer.send).toHaveBeenCalledWith(expect.objectContaining({
//             "payload": errorPayload,
//         }));

//     });

//     test("handleTransferPreparedEvt - should publish error command if participant is invalid", async () => {
//         // Arrange
//         const mockedTransfer = mockedTransfer1 as any;

//         const payload: TransferPrepareRequestedEvtPayload = createTransferPreparedEvtPayload(mockedTransfer);

//         const requesterFspId = "payer";
//         const destinationFspId = "payee";
//         const fspiopOpaqueState = {
//             requesterFspId,
//             destinationFspId,
//         };

//         const command: CommandMsg = createCommand(payload, PrepareTransferCmd.name, fspiopOpaqueState);

//         const errorMsg = InvalidParticipantIdError.name;

//         const errorPayload: TransferErrorEvtPayload = {
// 			errorMsg,
// 			destinationFspId,
//             requesterFspId,
//             transferId: payload.transferId,
//             sourceEvent : PrepareTransferCmd.name,
// 		};

//         jest.spyOn(transferRepo, "addTransfer")
//         .mockResolvedValueOnce(mockedTransfer.id);

//         jest.spyOn(participantService, "getParticipantsInfo")
//         .mockResolvedValueOnce([{ id: "not matching", type: "DFSP", isActive: false} as IParticipant as any]);

//         jest.spyOn(messageProducer, "send");

//         // Act
//         await aggregate.handleTransferCommand(command);

//         // Assert
//         expect(messageProducer.send).toHaveBeenCalledWith(expect.objectContaining({
//             "payload": errorPayload,
//         }));

//     });

//     test("handleTransferPreparedEvt - should publish error command if participant is not active", async () => {
//         // Arrange
//         const mockedTransfer = mockedTransfer1 as any;

//         const payload: TransferPrepareRequestedEvtPayload = createTransferPreparedEvtPayload(mockedTransfer);

//         const requesterFspId = "payer";
//         const destinationFspId = "payee";
//         const fspiopOpaqueState = {
//             requesterFspId,
//             destinationFspId,
//         };

//         const command: CommandMsg = createCommand(payload, PrepareTransferCmd.name, fspiopOpaqueState);

//         const errorMsg = RequiredParticipantIsNotActive.name;

//         const errorPayload: TransferErrorEvtPayload = {
// 			errorMsg,
// 			destinationFspId,
//             requesterFspId,
//             transferId: payload.transferId,
//             sourceEvent : PrepareTransferCmd.name,
// 		};

//         jest.spyOn(transferRepo, "addTransfer")
//         .mockResolvedValueOnce(mockedTransfer.id);

//         jest.spyOn(participantService, "getParticipantsInfo")
//         .mockResolvedValueOnce([
//             { id: "payee", type: "DFSP", isActive: false} as IParticipant as any,
//         ]);

//         jest.spyOn(messageProducer, "send");

//         // Act
//         await aggregate.handleTransferCommand(command);

//         // Assert
//         expect(messageProducer.send).toHaveBeenCalledWith(expect.objectContaining({
//             "payload": errorPayload,
//         }));

//     });


//     test("handleTransferPreparedEvt - should error on not finding all accounts", async () => {
//         // Arrange
//         const mockedTransfer = mockedTransfer1 as any;

//         const payload: TransferPrepareRequestedEvtPayload = createTransferPreparedEvtPayload(mockedTransfer);

//         const requesterFspId = "payer";
//         const destinationFspId = "payee";
//         const fspiopOpaqueState = {
//             requesterFspId,
//             destinationFspId,
//         };

//         const command: CommandMsg = createCommand(payload, PrepareTransferCmd.name, fspiopOpaqueState);

//         const errorMsg = NoSuchAccountError.name;

//         const errorPayload: TransferErrorEvtPayload = {
// 			errorMsg,
// 			destinationFspId,
//             requesterFspId,
//             transferId: payload.transferId,
//             sourceEvent : PrepareTransferCmd.name,
// 		};

//         jest.spyOn(transferRepo, "addTransfer")
//             .mockResolvedValueOnce("inserted transfer id");

//         jest.spyOn(participantService, "getParticipantsInfo")
//             .mockResolvedValueOnce([
//                 { id: "hub", type: "HUB", isActive: true, approved: true, participantAccounts: [mockedParticipantAccountHubNonExisting] } as IParticipant as any,
//                 { id: requesterFspId, type: "DFSP", isActive: true, approved: true, participantAccounts: [mockedParticipantAccountPosition, mockedParticipantAccountSettlement] } as IParticipant as any,
//                 { id: destinationFspId, type: "DFSP", isActive: true, approved: true, participantAccounts: [mockedParticipantAccountPosition, mockedParticipantAccountSettlement] } as IParticipant as any
//             ]);

//         jest.spyOn(messageProducer, "send");

//         // Act
//         await aggregate.handleTransferCommand(command);

//         // Assert
//         expect(messageProducer.send).toHaveBeenCalledWith(expect.objectContaining({
//             "payload": errorPayload,
//         }));

//     });

//     test("handleTransferPreparedEvt - should add transfer to transfer repo", async () => {
//         // Arrange
//         const mockedTransfer = mockedTransfer1 as any;
//         const payload:TransferPrepareRequestedEvtPayload = createTransferPreparedEvtPayload(mockedTransfer);

//         const payerFspId = "payer";
//         const payeeFspId = "payee";
//         const fspiopOpaqueState = {
//             payerFspId,
//             payeeFspId,
//         };

//         const command: CommandMsg = createCommand(payload, PrepareTransferCmd.name, fspiopOpaqueState);

//         jest.spyOn(participantService, "getParticipantsInfo")
//             .mockResolvedValueOnce([
//                 { id: "payer", type: "DFSP", isActive: true} as IParticipant as any,
//                 { id: "payee", type: "DFSP", isActive: true} as IParticipant as any
//         ])

//         jest.spyOn(transferRepo, "addTransfer")
//             .mockResolvedValueOnce(mockedTransfer.transferId);

//         jest.spyOn(messageProducer, "send");

//         // Act
//         await aggregate.handleTransferCommand(command);

//         // Assert
//         expect(transferRepo.addTransfer).toHaveBeenCalled();
//         expect(transferRepo.addTransfer).toHaveBeenCalledWith(expect.objectContaining({
//             transferId: mockedTransfer.transferId,
//             transferState: TransferState.RECEIVED
//         }));

//     });

//     test("handleTransferPreparedEvt - should publish TransferRequestAcceptedEvt if event runs successfully", async () => {
//         // Arrange
//         const mockedTransfer = mockedTransfer1 as any;
//         const payload:TransferPrepareRequestedEvtPayload = createTransferPreparedEvtPayload(mockedTransfer);

//         const payerFspId = "payer";
//         const payeeFspId = "payee";
//         const fspiopOpaqueState = {
//             payerFspId,
//             payeeFspId,
//         };

//         const command: CommandMsg = createCommand(payload, PrepareTransferCmd.name, fspiopOpaqueState);

//         const responsePayload: TransferPreparedEvtPayload = {
//             transferId: mockedTransfer.transferId,
//             payeeFsp: mockedTransfer.payeeFspId,
//             payerFsp: mockedTransfer.payerFspId,
//             amount: mockedTransfer.amount,
//             currencyCode: mockedTransfer.currencyCode,
//             ilpPacket: mockedTransfer.ilpPacket,
//             condition: mockedTransfer.condition,
//             expiration: mockedTransfer.expirationTimestamp,
//             extensionList: mockedTransfer.extensionList
//         };

//         jest.spyOn(transferRepo, "addTransfer")
//             .mockResolvedValueOnce("inserted transfer id");

//         jest.spyOn(participantService, "getParticipantsInfo")
//             .mockResolvedValueOnce([
//                 { id: "hub", type: "HUB", isActive: true, approved: true, participantAccounts: [mockedParticipantAccountHub] } as IParticipant as any,
//                 { id: payerFspId, type: "DFSP", isActive: true, approved: true, participantAccounts: [mockedParticipantAccountHub, mockedParticipantAccountPosition, mockedParticipantAccountSettlement] } as IParticipant as any,
//                 { id: payeeFspId, type: "DFSP", isActive: true, approved: true, participantAccounts: [mockedParticipantAccountHub, mockedParticipantAccountPosition, mockedParticipantAccountSettlement] } as IParticipant as any
//             ]);

//         jest.spyOn(transferRepo, "updateTransfer")
//             .mockResolvedValue();

//         jest.spyOn(messageProducer, "send");

//         // Act
//         await aggregate.handleTransferCommand(command);

//         // Assert
//         expect(messageProducer.send).toHaveBeenCalledWith(expect.objectContaining({
//             "payload": responsePayload,
//         }));

//     });

//     //#endregion

//     //#region handleTransferFulfillEvt

//     test("handleTransferFulfillEvt - should publish error command if transfer to fulfill is not found", async () => {
//         // Arrange
//         const mockedTransfer = mockedTransfer1 as any;

//         const payload: TransferFulfiledEvtPayload = createTransferFulfiledEvtPayload(mockedTransfer);

//         const requesterFspId = "payer";
//         const destinationFspId = "payee";
//         const fspiopOpaqueState = {
//             requesterFspId,
//             destinationFspId,
//         };

//         const command: CommandMsg = createCommand(payload, CommitTransferFulfilCmd.name, fspiopOpaqueState);

//         const errorMsg = NoSuchTransferError.name;

//         const errorPayload: TransferErrorEvtPayload = {
// 			errorMsg,
// 			destinationFspId,
//             requesterFspId,
//             transferId: payload.transferId,
//             sourceEvent: CommitTransferFulfilCmd.name,
// 		};

//         jest.spyOn(messageProducer, "send");

//         jest.spyOn(transferRepo, "getTransferById")
//             .mockResolvedValueOnce(null);

//         // Act
//         await aggregate.handleTransferCommand(command);

//         // Assert
//         expect(messageProducer.send).toHaveBeenCalledWith(expect.objectContaining({
//             "payload": errorPayload,
//         }));
//     });

//     test("handleTransferFulfillEvt - should publish error command if transfer to fulfill is not found", async () => {
//         // Arrange
//         const mockedTransfer = mockedTransfer1 as any;

//         const payload: TransferFulfiledEvtPayload = createTransferFulfiledEvtPayload(mockedTransfer);

//         const requesterFspId = "payer";
//         const destinationFspId = "payee";
//         const fspiopOpaqueState = {
//             requesterFspId,
//             destinationFspId,
//         };

//         const command: CommandMsg = createCommand(payload, CommitTransferFulfilCmd.name, fspiopOpaqueState);

//         const errorMsg = NoSuchParticipantError.name;

//         const errorPayload: TransferErrorEvtPayload = {
// 			errorMsg,
// 			destinationFspId,
//             requesterFspId,
//             transferId: payload.transferId,
//             sourceEvent: CommitTransferFulfilCmd.name,
// 		};

//         jest.spyOn(messageProducer, "send");

//         jest.spyOn(transferRepo, "getTransferById")
//             .mockResolvedValueOnce(mockedTransfer1);

//         // Act
//         await aggregate.handleTransferCommand(command);

//         // Assert
//         expect(messageProducer.send).toHaveBeenCalledWith(expect.objectContaining({
//             "payload": errorPayload,
//         }));
//     });

//     test("handleTransferFulfillEvt - should publish error command if participant is invalid", async () => {
//         // Arrange
//         const mockedTransfer = mockedTransfer1 as any;

//         const payload: TransferFulfiledEvtPayload = createTransferFulfiledEvtPayload(mockedTransfer);

//         const requesterFspId = "payer";
//         const destinationFspId = "payee";
//         const fspiopOpaqueState = {
//             requesterFspId,
//             destinationFspId,
//         };

//         const command: CommandMsg = createCommand(payload, CommitTransferFulfilCmd.name, fspiopOpaqueState);

//         const errorMsg = InvalidParticipantIdError.name;

//         const errorPayload: TransferErrorEvtPayload = {
// 			errorMsg,
// 			destinationFspId,
//             requesterFspId,
//             transferId: payload.transferId,
//             sourceEvent: CommitTransferFulfilCmd.name,
// 		};

//         jest.spyOn(messageProducer, "send");

//         jest.spyOn(transferRepo, "getTransferById")
//             .mockResolvedValueOnce(mockedTransfer1);

//         jest.spyOn(participantService, "getParticipantsInfo")
//             .mockResolvedValueOnce([{ id: "not matching", type: "DFSP", isActive: false} as IParticipant as any]);

//         // Act
//         await aggregate.handleTransferCommand(command);

//         // Assert
//         expect(messageProducer.send).toHaveBeenCalledWith(expect.objectContaining({
//             "payload": errorPayload,
//         }));
//     });

//     test("handleTransferFulfillEvt - should publish error command if participant is not active", async () => {
//         // Arrange
//         const mockedTransfer = mockedTransfer1 as any;

//         const payload: TransferFulfiledEvtPayload = createTransferFulfiledEvtPayload(mockedTransfer);

//         const requesterFspId = "payer";
//         const destinationFspId = "payee";
//         const fspiopOpaqueState = {
//             requesterFspId,
//             destinationFspId,
//         };

//         const command: CommandMsg = createCommand(payload, CommitTransferFulfilCmd.name, fspiopOpaqueState);

//         const errorMsg = RequiredParticipantIsNotActive.name;

//         const errorPayload: TransferErrorEvtPayload = {
// 			errorMsg,
// 			destinationFspId,
//             requesterFspId,
//             transferId: payload.transferId,
//             sourceEvent: CommitTransferFulfilCmd.name,
// 		};

//         jest.spyOn(messageProducer, "send");

//         jest.spyOn(transferRepo, "getTransferById")
//             .mockResolvedValueOnce(mockedTransfer1);

//         jest.spyOn(participantService, "getParticipantsInfo")
//             .mockResolvedValueOnce([
//                 { id: "payee", type: "DFSP", isActive: false} as IParticipant as any,
//             ]);


//         // Act
//         await aggregate.handleTransferCommand(command);

//         // Assert
//         expect(messageProducer.send).toHaveBeenCalledWith(expect.objectContaining({
//             "payload": errorPayload,
//         }));
//     });

//     test("handleTransferFulfillEvt - should publish TransferFulfiledEvt if event runs successfully", async () => {
//         // Arrange
//         const mockedTransfer = mockedTransfer1 as any;
//         const payload:TransferFulfiledEvtPayload = createTransferFulfiledEvtPayload(mockedTransfer);

//         const payerFspId = "payer";
//         const payeeFspId = "payee";
//         const fspiopOpaqueState = {
//             payerFspId,
//             payeeFspId,
//         };

//         const command: CommandMsg = createCommand(payload, CommitTransferFulfilCmd.name, fspiopOpaqueState);

//         const responsePayload: TransferFulfiledEvtPayload = {
//             transferId: payload.transferId,
//             transferState: payload.transferState as any,
//             fulfilment: payload.fulfilment,
//             completedTimestamp: payload.completedTimestamp,
//             extensionList: payload.extensionList,
//             payeeFspId: payload.payeeFspId,
//             payerFspId: payload.payerFspId,
//             amount: payload.amount,
//             currencyCode: payload.currencyCode,
//             settlementModel: payload.settlementModel,
//         };

//         jest.spyOn(transferRepo, "getTransferById")
//             .mockResolvedValueOnce(mockedTransfer1);

//         jest.spyOn(participantService, "getParticipantsInfo")
//             .mockResolvedValueOnce([
//                 { id: "hub", type: "HUB", isActive: true, approved: true, participantAccounts: [mockedParticipantAccountHub] } as IParticipant as any,
//                 { id: payerFspId, type: "DFSP", isActive: true, approved: true, participantAccounts: [mockedParticipantAccountHub, mockedParticipantAccountPosition, mockedParticipantAccountSettlement] } as IParticipant as any,
//                 { id: payeeFspId, type: "DFSP", isActive: true, approved: true, participantAccounts: [mockedParticipantAccountHub, mockedParticipantAccountPosition, mockedParticipantAccountSettlement] } as IParticipant as any
//             ]);

//         jest.spyOn(accountsAndBalancesService, "cancelReservationAndCommit")
//             .mockResolvedValue();

//         jest.spyOn(transferRepo, "updateTransfer")
//             .mockResolvedValue();

//         jest.spyOn(messageProducer, "send");

//         // Act
//         await aggregate.handleTransferCommand(command);

//         // Assert
//         expect(messageProducer.send).toHaveBeenCalledWith(expect.objectContaining({
//             "payload": responsePayload,
//         }));
//     });
//     //#endregion

// });




