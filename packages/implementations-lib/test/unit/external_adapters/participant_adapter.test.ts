/*****
License
--------------
Copyright © 2020-2025 Mojaloop Foundation
The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - Name Surname <name.surname@mojaloop.io>

Contributors
--------------
This is the official list (alphabetical ordering) of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Arg Software
 - José Antunes <jose.antunes@arg.software>
 - Rui Rocha <rui.rocha@arg.software>
*****/

"use strict";

import { ConsoleLogger, ILogger, LogLevel } from "@mojaloop/logging-bc-public-types-lib";
import { ParticipantAdapter } from "../../../src/external_adapters/participant_adapter";

import { IParticipant, ParticipantTypes } from "@mojaloop/participant-bc-public-types-lib";
import { IAuthenticatedHttpRequester } from "@mojaloop/security-bc-public-types-lib";
import { MemoryAuthenticatedHttpRequesterMock } from "@mojaloop/transfers-bc-shared-mocks-lib";

const BASE_URL_PARTICIPANT_CLIENT: string = "http://localhost:1234";
const AUTH_TOKEN_ENPOINT = "http://localhost:3101/authTokenEndpoint";
const HTTP_CLIENT_TIMEOUT_MS = 10_000;

const getParticipantByIdSpy = jest.fn();
const getParticipantsByIdsSpy = jest.fn();

const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.FATAL);
let authenticatedHttpRequesterMock: IAuthenticatedHttpRequester;

jest.mock("@mojaloop/participants-bc-client-lib", () => {
  return {
    ParticipantsHttpClient: jest.fn().mockImplementation(() => {
      return {
        getParticipantById: getParticipantByIdSpy,
        getParticipantsByIds: getParticipantsByIdsSpy,
      };
    }),
  };
});

let participantAdapter: ParticipantAdapter;

describe("Implementations - ParticipantAdapter Unit Tests", () => {
  beforeAll(async () => {
    authenticatedHttpRequesterMock = new MemoryAuthenticatedHttpRequesterMock(logger, AUTH_TOKEN_ENPOINT);
    participantAdapter = new ParticipantAdapter(
      logger,
      BASE_URL_PARTICIPANT_CLIENT,
      authenticatedHttpRequesterMock,
      HTTP_CLIENT_TIMEOUT_MS
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    jest.clearAllMocks();
  });

    // Get IParticipant.
    test("getParticipantByIdSpy - should receive null if IParticipant doesnt exist", async () => {
        // Arrange
        const participantId: string = "nonExistingParticipantId";
        getParticipantByIdSpy.mockResolvedValueOnce(null);

        // Act
        const participantInfo = await participantAdapter.getParticipantInfo(participantId);

        // Assert
        expect(participantInfo).toBeNull();
    });

    test("getParticipantById - should get IParticipant info", async () => {
        // Arrange
        const participantId: string = "existingParticipantId";
        const IParticipant: Partial<IParticipant> = {
            id: participantId,
            name: "existingParticipantName",
            isActive: true,
            createdBy: "existingParticipantCreatedBy",
            type: ParticipantTypes.DFSP,
            createdDate: 1232131,
            approved: true,
            approvedBy: "existingParticipantApprovedBy",
            approvedDate: 1232131,
            description: "existingParticipantDescription",
        };
        getParticipantByIdSpy.mockResolvedValueOnce(IParticipant);

        // Act
        const participantInfo = await participantAdapter.getParticipantInfo(participantId);

        // Assert
        expect(participantInfo).toEqual(IParticipant);
    });

    test("getParticipantById - should return null if getting an error while getting IParticipant info", async () => {
        // Arrange
        const participantId: string = "nonExistingParticipantId";
        getParticipantByIdSpy.mockRejectedValueOnce(null);

        // Act
        const participantInfo = await participantAdapter.getParticipantInfo(participantId);

        // Assert
        expect(participantInfo).toBeNull();
    });

    test("getParticipantsByIdSpy - should get participants info", async () => {
        // Arrange
        const participantId1: string = "existingParticipantId1";
        const participantId2: string = "existingParticipantId2";
        const participant1: Partial<IParticipant> = {
            id: participantId1,
            name: "existingParticipantName1",
            isActive: true,
            createdBy: "existingParticipantCreatedBy1",
            type: ParticipantTypes.DFSP,
            createdDate: 1232131,
            approved: true,
            approvedBy: "existingParticipantApprovedBy1",
            approvedDate: 1232131,
            description: "existingParticipantDescription1",
        };
        const participant2: Partial<IParticipant> = {
            id: participantId2,
            name: "existingParticipantName2",
            isActive: true,
            createdBy: "existingParticipantCreatedBy2",
            type: ParticipantTypes.DFSP,
            createdDate: 1232131,
            approved: true,
            approvedBy: "existingParticipantApprovedBy2",
            approvedDate: 1232131,
            description: "existingParticipantDescription2",
        };

        getParticipantsByIdsSpy.mockResolvedValueOnce([participant1, participant2]);

        // Act
        const participantsInfo = await participantAdapter.getParticipantsInfo([participantId1, participantId2]);

        // Assert
        expect(participantsInfo).toEqual([participant1, participant2]);
    });

    test("getParticipantsById - should return null if getting an error while getting IParticipant info", async () => {
        // Arrange

        getParticipantsByIdsSpy.mockRejectedValueOnce(new Error("Error"));

        // Act
        const participantInfo = await participantAdapter.getParticipantsInfo([
            "nonExistingParticipantId",
            "nonExistingParticipantId2",
        ]);

        // Assert
        expect(participantInfo).toBeNull();
    });
});
