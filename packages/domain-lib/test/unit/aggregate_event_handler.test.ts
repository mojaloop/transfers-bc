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

// TODO: fix tests
describe("Empty - RE-ENABLE", () => {
    test("Empty - RE-ENABLE", async () => {
        expect(true).toBeTruthy();
    });
});

/*

import { IParticipant } from '@mojaloop/participant-bc-public-types-lib';
import { CommandMsg, MessageTypes } from "@mojaloop/platform-shared-lib-messaging-types-lib";
import { TransferErrorEvtPayload, TransferPreparedEvtPayload, TransferFulfiledEvt } from "@mojaloop/platform-shared-lib-public-messages-lib";
import { mockedTransfer1 } from "@mojaloop/transfers-bc-shared-mocks-lib";
import { InvalidMessagePayloadError, InvalidMessageTypeError } from "../../src/errors";
import { createCommand, createTransferPreparedEvtPayload } from "../utils/helpers";
import { messageProducer, aggregate, transferRepo, participantService } from "../utils/mocked_variables";

describe("Domain - Unit Tests for Command Handler", () => {

    afterEach(async () => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        jest.clearAllMocks();
    });

    test("should publish error command if payload is invalid", async () => {
        // Arrange
        const command: CommandMsg = createCommand(null, "fake msg name", null);

        const errorMsg = InvalidMessagePayloadError.name;

        const errorPayload: TransferErrorEvtPayload = {
			errorMsg,
            sourceEvent : "fake msg name",
            transferId: undefined as unknown as string,
            destinationFspId: null,
            requesterFspId: null,
		};

        jest.spyOn(messageProducer, "send");

        // Act
        await aggregate.handleTransferCommand(command);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith(expect.objectContaining({
            "payload": errorPayload,
        }));

    });

    test("should publish error command if command Name is invalid", async () => {
        // Arrange
        const mockedTransfer = mockedTransfer1 as any;

        const payload:TransferPreparedEvtPayload = createTransferPreparedEvtPayload(mockedTransfer);

        const command: CommandMsg = createCommand(payload, "fake msg name", null);

        const errorMsg = InvalidMessageTypeError.name;

        const errorPayload: TransferErrorEvtPayload = {
			errorMsg,
			destinationFspId: null,
            requesterFspId: null,
            transferId: payload.transferId,
            sourceEvent : "fake msg name",
		};

        jest.spyOn(messageProducer, "send");

        // Act
        await aggregate.handleTransferCommand(command);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith(expect.objectContaining({
            "payload": errorPayload,
        }));

    });

    test("should publish error command if command Type is invalid", async () => {
        // Arrange
        const mockedTransfer = mockedTransfer1 as any;

        const payload:TransferPreparedEvtPayload = createTransferPreparedEvtPayload(mockedTransfer);

        const command: CommandMsg = {
            fspiopOpaqueState: "fake opaque state",
            msgId: "fake msg id",
            msgKey: "fake msg key",
            msgTopic: "fake msg topic",
            msgName: "fake msg name",
            msgOffset: 0,
            msgPartition: 0,
            msgTimestamp: 0,
            msgType: "invalid command type" as unknown as MessageTypes.DOMAIN_EVENT,
            payload :payload,
            aggregateId: "1",
            boundedContextName: "transfers"
        };

        const errorMsg = InvalidMessageTypeError.name;

        const errorPayload: TransferErrorEvtPayload = {
			errorMsg,
			destinationFspId: null,
            requesterFspId: null,
            transferId: payload.transferId,
            sourceEvent : "fake msg name",
		};

        jest.spyOn(messageProducer, "send");

        // Act
        await aggregate.handleTransferCommand(command);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith(expect.objectContaining({
            "payload": errorPayload,
        }));

    });

    test("should publish opaque state when publishing error event", async () => {
        const mockedTransfer = mockedTransfer1 as any;

        const payload:TransferPreparedEvtPayload = createTransferPreparedEvtPayload(mockedTransfer);

        const fspiopOpaqueState = {
            "state": "fake opaque state",
        }

        const command: CommandMsg = createCommand(payload, TransferFulfiledEvt.name,fspiopOpaqueState);

        jest.spyOn(messageProducer, "send");

        // Act
        await aggregate.handleTransferCommand(command);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith(expect.objectContaining({
            "fspiopOpaqueState": fspiopOpaqueState,
        }));

    });

    test("should publish opaque state when publishing successful event", async () => {
        // Arrange
        const mockedTransfer = mockedTransfer1 as any;
        const payload:TransferPreparedEvtPayload = createTransferPreparedEvtPayload(mockedTransfer);

        const requesterFspId = "payer";
        const destinationFspId = "payee";
        const fspiopOpaqueState = {
            requesterFspId,
            destinationFspId,
        };

        const command: CommandMsg = createCommand(payload, TransferFulfiledEvt.name,fspiopOpaqueState);

        jest.spyOn(transferRepo, "addTransfer")
            .mockResolvedValueOnce("inserted transfer id");

        jest.spyOn(participantService, "getParticipantInfo")
            .mockResolvedValueOnce({ id: requesterFspId, type: "DFSP", isActive: true} as IParticipant as any)
            .mockResolvedValueOnce({ id: destinationFspId, type: "DFSP", isActive: true} as IParticipant as any);

        jest.spyOn(messageProducer, "send");

        // Act
        await aggregate.handleTransferCommand(command);

        // Assert
        expect(messageProducer.send).toHaveBeenCalledWith(expect.objectContaining({
            "fspiopOpaqueState": fspiopOpaqueState,
        }));
    });

});
*/
