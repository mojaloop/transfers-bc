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

import { ILogger,ConsoleLogger, LogLevel} from "@mojaloop/logging-bc-public-types-lib";
import {  MongoBulkTransfersRepo, BulkTransferNotFoundError, UnableToGetBulkTransferError, UnableToAddBulkTransferError, UnableToDeleteTransferError, UnableToUpdateBulkTransferError  } from "../../../../../packages/implementations-lib/src";
import { Collection } from "mongodb";
import { mockProperty, mockedBulkTransfer1, undoMockProperty } from "@mojaloop/transfers-bc-shared-mocks-lib";

jest.mock('mongodb', () => ({
    ...jest.requireActual('mongodb'),
    insertOne: () => { 
        debugger
        throw Error(); 
    }
}));

const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.FATAL);

const DB_NAME = process.env.TRANSFERS_DB_TEST_NAME ?? "test";
const CONNECTION_STRING = process.env["MONGO_URL"] || "mongodb://root:mongoDbPas42@localhost:27017/";

let mongoTransfersRepo : MongoBulkTransfersRepo;


describe("Implementations - Mongo bulk transfers Repo Unit tests", () => {

    beforeAll(async () => {
        mongoTransfersRepo = new MongoBulkTransfersRepo(logger, CONNECTION_STRING, DB_NAME);
    });


    test("should throw error when trying to find a transfer with an existing id", async () => {
        // Arrange
        const bulkTransfer1 = mockedBulkTransfer1;

        mockProperty(mongoTransfersRepo, "bulkTransfers", jest.fn(() => {
            let userProfile = {} as Collection;
            userProfile.findOne = async () => { throw Error(); };
            return userProfile;
        }));

        // Act & Assert
        await expect(mongoTransfersRepo.addBulkTransfer(bulkTransfer1)).rejects.toThrowError(UnableToGetBulkTransferError);

        undoMockProperty(mongoTransfersRepo, "bulkTransfers" as any,)
    });

   
    test("should throw error when trying to insert a transfer with an existing id", async () => {
        // Arrange
        const bulkTransfer1 = mockedBulkTransfer1;

        mockProperty(mongoTransfersRepo, "bulkTransfers", jest.fn(() => {
            let userProfile = {} as Collection;
            userProfile.findOne = async () => { return null; };
            userProfile.insertOne = async () => { throw Error(); };
            return userProfile;
        }));

        // Act & Assert
        await expect(mongoTransfersRepo.addBulkTransfer(bulkTransfer1)).rejects.toThrowError(UnableToAddBulkTransferError);

        undoMockProperty(mongoTransfersRepo, "bulkTransfers" as any)
    });


    
    test("should throw error when trying to get a bulk transfer by id", async () => {
        // Arrange
        const bulkTransfer1 = mockedBulkTransfer1;

        mockProperty(mongoTransfersRepo, "bulkTransfers", jest.fn(() => {
            let userProfile = {} as Collection;
            userProfile.findOne = async () => { throw Error(); };
            return userProfile;
        }));

        // Act & Assert
        await expect(mongoTransfersRepo.getBulkTransferById(bulkTransfer1.bulkTransferId)).rejects.toThrowError(UnableToGetBulkTransferError);

        undoMockProperty(mongoTransfersRepo, "bulkTransfers" as any)
    });

    test("should throw error when trying to get bulk transfers", async () => {
        // Arrange
        mockProperty(mongoTransfersRepo, "bulkTransfers", jest.fn(() => {
            let userProfile = {} as any;
            userProfile.find = () => {
                return { 
                    toArray: async () => { throw Error(); }
                }
            }
            return userProfile;
        }));

        // Act & Assert
        await expect(mongoTransfersRepo.getBulkTransfers()).rejects.toThrowError(UnableToGetBulkTransferError);

        undoMockProperty(mongoTransfersRepo, "bulkTransfers" as any)
    });


    test("should throw error when trying to update transfer that was not found", async () => {
        // Arrange
        const bulkTransfer1 = mockedBulkTransfer1;

        mockProperty(mongoTransfersRepo, "bulkTransfers", jest.fn(() => {
            let userProfile = {} as any;
            userProfile.findOne = async () => { return null; };
            userProfile.bulkWrite = async () => { throw Error(); };
            return userProfile;
        }));

        // Act & Assert
        await expect(mongoTransfersRepo.updateBulkTransfer(bulkTransfer1)).rejects.toThrowError(BulkTransferNotFoundError);

        undoMockProperty(mongoTransfersRepo, "bulkTransfers" as any)
    });

    test("should throw error when trying to update existing transfer", async () => {
        // Arrange
        const bulkTransfer1 = mockedBulkTransfer1;

        mockProperty(mongoTransfersRepo, "bulkTransfers", jest.fn(() => {
            let userProfile = {} as any;
            userProfile.findOne = async () => { return bulkTransfer1; };
            userProfile.updateOne = async () => { throw Error(); };
            return userProfile;
        }));

        // Act & Assert
        await expect(mongoTransfersRepo.updateBulkTransfer(bulkTransfer1)).rejects.toThrowError(UnableToUpdateBulkTransferError);

        undoMockProperty(mongoTransfersRepo, "bulkTransfers" as any)
    });
});



