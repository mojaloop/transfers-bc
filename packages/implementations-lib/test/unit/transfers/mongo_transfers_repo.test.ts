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
import {  MongoTransfersRepo, NoSuchTransferError, TransferAlreadyExistsError, UnableToGetTransferError, UnableToAddTransferError, UnableToDeleteTransferError, UnableToUpdateTransferError  } from "../../../../../packages/implementations-lib/src";
import { MongoClient, Collection } from "mongodb";
import { mockedTransfer1, mockedTransfer2 } from "@mojaloop/transfers-bc-shared-mocks-lib";

jest.mock('mongodb', () => ({
    ...jest.requireActual('mongodb'),
    insertOne: () => { 
        debugger
        throw Error(); 
    }
}));

const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.FATAL);

const DB_NAME = process.env.ACCOUNT_LOOKUP_DB_TEST_NAME ?? "test";
const CONNECTION_STRING = process.env["MONGO_URL"] || "mongodb://root:mongoDbPas42@localhost:27017/";

let mongoTransfersRepo : MongoTransfersRepo;


const mocks = new Map();


function undoMockProperty<T extends {}, K extends keyof T>(object: T, property: K) {
    Object.defineProperty(object, property, mocks.get(object)[property]);
}

describe("Implementations - Mongo transfers Repo Unit tests", () => {

    beforeAll(async () => {
        mongoTransfersRepo = new MongoTransfersRepo(logger, CONNECTION_STRING, DB_NAME);
    });


    test("should throw error when trying to find a transfer with an existing id", async () => {
        // Arrange
        const transfer1 = mockedTransfer1;

        const descriptor = Object.getOwnPropertyDescriptor(mongoTransfersRepo, "transfers");
        const mocksForThisObject = mocks.get(mongoTransfersRepo) || {};
        mocksForThisObject["transfers"] = descriptor;
        mocks.set(mongoTransfersRepo, mocksForThisObject);

        Object.defineProperty(mongoTransfersRepo, "transfers", {
            get: jest.fn(() => {
                let userProfile = {} as Collection;
                userProfile.findOne = async () => { throw Error(); };
                return userProfile;
            }),
            configurable: true,
        });

        // Act & Assert
        await expect(mongoTransfersRepo.addTransfer(transfer1)).rejects.toThrowError(UnableToGetTransferError);

        undoMockProperty(mongoTransfersRepo, "transfers" as any,)
    });

   
    test("should throw error when trying to insert a transfer with an existing id", async () => {
        // Arrange
        const transfer1 = mockedTransfer1;

        const descriptor = Object.getOwnPropertyDescriptor(mongoTransfersRepo, "transfers");
        const mocksForThisObject = mocks.get(mongoTransfersRepo) || {};
        mocksForThisObject["transfers"] = descriptor;
        mocks.set(mongoTransfersRepo, mocksForThisObject);

        Object.defineProperty(mongoTransfersRepo, "transfers", {
            get: jest.fn(() => {
                let userProfile = {} as Collection;
                userProfile.findOne = async () => { return null; };
                userProfile.insertOne = async () => { throw Error(); };
                return userProfile;
            }),
            configurable: true,
        });

        // Act & Assert
        await expect(mongoTransfersRepo.addTransfer(transfer1)).rejects.toThrowError(UnableToAddTransferError);

        undoMockProperty(mongoTransfersRepo, "transfers" as any)
    });

    test("should throw error when trying to delete a transfer with an existing id", async () => {
        // Arrange
        const transfer1 = mockedTransfer1;

        const descriptor = Object.getOwnPropertyDescriptor(mongoTransfersRepo, "transfers");
        const mocksForThisObject = mocks.get(mongoTransfersRepo) || {};
        mocksForThisObject["transfers"] = descriptor;
        mocks.set(mongoTransfersRepo, mocksForThisObject);

        Object.defineProperty(mongoTransfersRepo, "transfers", {
            get: jest.fn(() => {
                let userProfile = {} as Collection;
                userProfile.deleteOne = async () => { throw Error(); };
                return userProfile;
            }),
            configurable: true,
        });

        // Act & Assert
        await expect(mongoTransfersRepo.removeTransfer(transfer1.transferId)).rejects.toThrowError(UnableToDeleteTransferError);

        undoMockProperty(mongoTransfersRepo, "transfers" as any)
    });

    
    test("should throw error when trying to get a transfer by id", async () => {
        // Arrange
        const transfer1 = mockedTransfer1;

        const descriptor = Object.getOwnPropertyDescriptor(mongoTransfersRepo, "transfers");
        const mocksForThisObject = mocks.get(mongoTransfersRepo) || {};
        mocksForThisObject["transfers"] = descriptor;
        mocks.set(mongoTransfersRepo, mocksForThisObject);

        Object.defineProperty(mongoTransfersRepo, "transfers", {
            get: jest.fn(() => {
                let userProfile = {} as Collection;
                userProfile.findOne = async () => { throw Error(); };
                return userProfile;
            }),
            configurable: true,
        });

        // Act & Assert
        await expect(mongoTransfersRepo.getTransferById(transfer1.transferId)).rejects.toThrowError(UnableToGetTransferError);

        undoMockProperty(mongoTransfersRepo, "transfers" as any)
    });

    test("should throw error when trying to get transfers", async () => {
        // Arrange

        const descriptor = Object.getOwnPropertyDescriptor(mongoTransfersRepo, "transfers");
        const mocksForThisObject = mocks.get(mongoTransfersRepo) || {};
        mocksForThisObject["transfers"] = descriptor;
        mocks.set(mongoTransfersRepo, mocksForThisObject);

        Object.defineProperty(mongoTransfersRepo, "transfers", {
            get: jest.fn(() => {
                let userProfile = {} as any;
                userProfile.find = () => {
                    return { 
                        toArray: async () => { throw Error(); }
                    }
                }
                return userProfile;
            }),
            configurable: true,
        });

        // Act & Assert
        await expect(mongoTransfersRepo.getTransfers()).rejects.toThrowError(UnableToGetTransferError);

        undoMockProperty(mongoTransfersRepo, "transfers" as any)
    });

    test("should throw error when trying to search for transfers", async () => {
        // Arrange

        const descriptor = Object.getOwnPropertyDescriptor(mongoTransfersRepo, "transfers");
        const mocksForThisObject = mocks.get(mongoTransfersRepo) || {};
        mocksForThisObject["transfers"] = descriptor;
        mocks.set(mongoTransfersRepo, mocksForThisObject);

        Object.defineProperty(mongoTransfersRepo, "transfers", {
            get: jest.fn(() => {
                let userProfile = {} as any;
                userProfile.find = () => {
                    return { 
                        toArray: async () => { throw Error(); }
                    }
                }
                return userProfile;
            }),
            configurable: true,
        });

        // Act & Assert
        await expect(mongoTransfersRepo.searchTransfers()).rejects.toThrowError(UnableToGetTransferError);

        undoMockProperty(mongoTransfersRepo, "transfers" as any)
    });

    test("should throw error when trying to store transfers", async () => {
        // Arrange
        const transfer1 = mockedTransfer1;

        const descriptor = Object.getOwnPropertyDescriptor(mongoTransfersRepo, "transfers");
        const mocksForThisObject = mocks.get(mongoTransfersRepo) || {};
        mocksForThisObject["transfers"] = descriptor;
        mocks.set(mongoTransfersRepo, mocksForThisObject);

        Object.defineProperty(mongoTransfersRepo, "transfers", {
            get: jest.fn(() => {
                let userProfile = {} as any;
                userProfile.bulkWrite = async () => { throw Error(); };
                return userProfile;
            }),
            configurable: true,
        });

        // Act & Assert
        await expect(mongoTransfersRepo.storeTransfers([transfer1])).rejects.toThrowError();

        undoMockProperty(mongoTransfersRepo, "transfers" as any)
    });

    test("should throw error when trying to update transfer that was not found", async () => {
        // Arrange
        const transfer1 = mockedTransfer1;

        const descriptor = Object.getOwnPropertyDescriptor(mongoTransfersRepo, "transfers");
        const mocksForThisObject = mocks.get(mongoTransfersRepo) || {};
        mocksForThisObject["transfers"] = descriptor;
        mocks.set(mongoTransfersRepo, mocksForThisObject);

        Object.defineProperty(mongoTransfersRepo, "transfers", {
            get: jest.fn(() => {
                let userProfile = {} as any;
                userProfile.findOne = async () => { return null; };
                userProfile.bulkWrite = async () => { throw Error(); };
                return userProfile;
            }),
            configurable: true,
        });

        // Act & Assert
        await expect(mongoTransfersRepo.updateTransfer(transfer1)).rejects.toThrowError(NoSuchTransferError);

        undoMockProperty(mongoTransfersRepo, "transfers" as any)
    });

    test("should throw error when trying to update existing transfer", async () => {
        // Arrange
        const transfer1 = mockedTransfer1;

        const descriptor = Object.getOwnPropertyDescriptor(mongoTransfersRepo, "transfers");
        const mocksForThisObject = mocks.get(mongoTransfersRepo) || {};
        mocksForThisObject["transfers"] = descriptor;
        mocks.set(mongoTransfersRepo, mocksForThisObject);

        Object.defineProperty(mongoTransfersRepo, "transfers", {
            get: jest.fn(() => {
                let userProfile = {} as any;
                userProfile.findOne = async () => { return transfer1; };
                userProfile.updateOne = async () => { throw Error(); };
                return userProfile;
            }),
            configurable: true,
        });

        // Act & Assert
        await expect(mongoTransfersRepo.updateTransfer(transfer1)).rejects.toThrowError(UnableToUpdateTransferError);

        undoMockProperty(mongoTransfersRepo, "transfers" as any)
    });
});



