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

import { CommandMsg } from "@mojaloop/platform-shared-lib-messaging-types-lib";
import { IParticipant } from "@mojaloop/participant-bc-public-types-lib";
import { TransferErrorEvtPayload, TransferPreparedEvtPayload, TransferPrepareRequestedEvt, TransferPrepareRequestedEvtPayload} from "@mojaloop/platform-shared-lib-public-messages-lib";
import { InvalidParticipantIdError} from "../../src/errors";
import { TransferState } from '../../src/types';
import { createCommand,  createTransferPreparedEvtPayload } from "../utils/helpers";
import { aggregate, transferRepo, messageProducer, participantService } from "../utils/mocked_variables";
import { mockedTransfer1 } from "@mojaloop/transfers-bc-shared-mocks-lib";

describe("Domain - Unit Tests for Transfer Events", () => {

    afterEach(async () => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        jest.clearAllMocks();
    });

    //#region handleTransferPreparedEvt

    test("handleTransferPreparedEvt - should publish error command if participant is invalid", async () => {
        // Arrange
        const mockedTransfer = mockedTransfer1 as any as any;

        const payload: TransferPrepareRequestedEvtPayload = createTransferPreparedEvtPayload(mockedTransfer);

        const requesterFspId = "payer";
        const destinationFspId = "payee";
        const fspiopOpaqueState = {
            requesterFspId,
            destinationFspId,
        };

        const command: CommandMsg = createCommand(payload, TransferPrepareRequestedEvt.name,fspiopOpaqueState);

        const errorMsg = InvalidParticipantIdError.name;

        const errorPayload: TransferErrorEvtPayload = {
			errorMsg,
			destinationFspId,
            requesterFspId,
            transferId: payload.transferId,
            sourceEvent : TransferPrepareRequestedEvt.name,
		};

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce({ id: "not matching", type: "DFSP", isActive: false} as IParticipant as any);

        jest.spyOn(messageProducer, "send");

        // Act
        await aggregate.handleTransferCommand(command);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith(expect.objectContaining({
            "payload": errorPayload,
        }));

    });

    test("handleTransferPreparedEvt - should add transfer to transfer repo", async () => {
        // Arrange
        const mockedTransfer = mockedTransfer1 as any as any;
        const payload:TransferPrepareRequestedEvtPayload = createTransferPreparedEvtPayload(mockedTransfer);

        const payerFspId = "payer";
        const payeeFspId = "payee";
        const fspiopOpaqueState = {
            payerFspId,
            payeeFspId,
        };

        const command: CommandMsg = createCommand(payload, TransferPrepareRequestedEvt.name,fspiopOpaqueState);

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce({ id: "payer", type: "DFSP", isActive: true} as IParticipant as any)
            .mockResolvedValueOnce({ id: "payee", type: "DFSP", isActive: true} as IParticipant as any);

        jest.spyOn(transferRepo, "addTransfer")
            .mockResolvedValueOnce(mockedTransfer.transferId);

        jest.spyOn(messageProducer, "send");

        // Act
        await aggregate.handleTransferCommand(command);

        // Assert
        expect(transferRepo.addTransfer).toHaveBeenCalled();
        expect(transferRepo.addTransfer).toHaveBeenCalledWith(expect.objectContaining({
            transferId: mockedTransfer.transferId,
            status: TransferState.RESERVED
        }));

    });

    test("handleTransferPreparedEvt - should publish TransferRequestAcceptedEvt if event runs successfully", async () => {
        // Arrange
        const mockedTransfer = mockedTransfer1 as any;
        const payload:TransferPrepareRequestedEvtPayload = createTransferPreparedEvtPayload(mockedTransfer);

        const payerFspId = "payer";
        const payeeFspId = "payee";
        const fspiopOpaqueState = {
            payerFspId,
            payeeFspId,
        };

        const command: CommandMsg = createCommand(payload, TransferPrepareRequestedEvt.name,fspiopOpaqueState);

        const responsePayload : TransferPreparedEvtPayload= {
            transferId: mockedTransfer.transferId,
            payeeFsp: mockedTransfer.transferId,
            payerFsp: mockedTransfer.transferId,
            amount: mockedTransfer.transferId,
            currencyCode: mockedTransfer.transferId,
            ilpPacket: mockedTransfer.transferId,
            condition: mockedTransfer.transferId,
            expiration: mockedTransfer.expirationTimestamp,
            extensionList: mockedTransfer.extensionList
        };

        jest.spyOn(transferRepo, "addTransfer")
            .mockResolvedValueOnce("inserted transfer id");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce({ id: payerFspId, type: "DFSP", isActive: true} as IParticipant as any)
            .mockResolvedValueOnce({ id: payeeFspId, type: "DFSP", isActive: true} as IParticipant as any);

        jest.spyOn(messageProducer, "send");

        // Act
        await aggregate.handleTransferCommand(command);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith(expect.objectContaining({
            "payload": responsePayload,
        }));

    });

    //#endregion


  
});



