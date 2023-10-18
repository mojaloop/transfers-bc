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
import {  BulkTransferAlreadyExistsError, MongoBulkTransfersRepo, MongoTransfersRepo, NoSuchTransferError, TransferAlreadyExistsError } from "../../../packages/implementations-lib/src";
import { MongoClient, Collection } from "mongodb";
import { mockedBulkTransfer1, mockedBulkTransfer2 } from "@mojaloop/transfers-bc-shared-mocks-lib";

const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.FATAL);

const DB_NAME = process.env.ACCOUNT_LOOKUP_DB_TEST_NAME ?? "test";
const CONNECTION_STRING = process.env["MONGO_URL"] || "mongodb://root:mongoDbPas42@localhost:27017/";
const COLLECTION_NAME = "bulk_transfers";

let mongoBulkTransfersRepo : MongoBulkTransfersRepo;

let mongoClient: MongoClient;
let collection : Collection;

describe("Implementations - Mongo transfers Repo Integration tests", () => {

    beforeAll(async () => {
        mongoClient = await MongoClient.connect(CONNECTION_STRING);
        collection = mongoClient.db(DB_NAME).collection(COLLECTION_NAME);
        mongoBulkTransfersRepo = new MongoBulkTransfersRepo(logger, CONNECTION_STRING, DB_NAME);
        await mongoBulkTransfersRepo.init();
        await collection.deleteMany({});
    });

    afterEach(async () => {
        await collection.deleteMany({});
    });

    afterAll(async () => {
        await collection.deleteMany({});
        await mongoClient.close();
    });

    test("should be able to init mongo bulk transfers repo", async () => {
        expect(mongoBulkTransfersRepo).toBeDefined();
    });

    test("should throw error when is unable to init bulk transfers repo", async () => {
        // Arrange
        const badMongoRepository = new MongoTransfersRepo(logger, "invalid connection", "invalid_db_name");

        // Act
        await expect(badMongoRepository.init()).rejects.toThrowError();

    });

    test("should throw error when is unable to destroy mongo bulk transfer repo", async () => {
        // Arrange
        const badMongoRepository = new MongoTransfersRepo(logger, "invalid connection", "invalid_db_name");

        // Act
        await expect(badMongoRepository.destroy()).rejects.toThrowError();
    });

    test("should insert a bulk transfer in the database", async () => {
        // Arrange
        const bulkTransfer1 = mockedBulkTransfer1;

        // Act
        const bulkTransferId = await mongoBulkTransfersRepo.addBulkTransfer(bulkTransfer1);

        // Assert
        expect(bulkTransferId).toBeDefined();
        expect(bulkTransferId).toEqual(bulkTransfer1.bulkTransferId);

    });

    test("should throw error when trying to insert a transfer with an existing id", async () => {
        // Arrange
        const bulkTransfer1 = mockedBulkTransfer1;

        // Act
        await mongoBulkTransfersRepo.addBulkTransfer(bulkTransfer1);

        // Assert
        await expect(mongoBulkTransfersRepo.addBulkTransfer(bulkTransfer1)).rejects.toThrowError(BulkTransferAlreadyExistsError);

    });

    test("should update a bulk transfer in the database", async () => {
        // Arrange
        const bulkTransfer1 = mockedBulkTransfer1;
        const newBulkTransfer = mockedBulkTransfer2;
        await mongoBulkTransfersRepo.addBulkTransfer(bulkTransfer1);
        newBulkTransfer.bulkTransferId = bulkTransfer1.bulkTransferId;

        // Act
        await mongoBulkTransfersRepo.updateBulkTransfer(newBulkTransfer);

        // Assert
        const result = await mongoBulkTransfersRepo.getBulkTransferById(newBulkTransfer.bulkTransferId);
        expect(result).toBeDefined();
        expect(result).toEqual(newBulkTransfer);
    });

    test("should update a bulk transfer partially in the database", async () => {
        // Arrange
        const bulkTransfer1 = mockedBulkTransfer1;
        const newPayee = mockedBulkTransfer2.payeeFsp;
        const newBulkTransfer = mockedBulkTransfer2;
        newBulkTransfer.payeeFsp = newPayee;

        await mongoBulkTransfersRepo.addBulkTransfer(bulkTransfer1);

        // Act
        await mongoBulkTransfersRepo.updateBulkTransfer(newBulkTransfer);

        // Assert
        const result = await mongoBulkTransfersRepo.getBulkTransferById(newBulkTransfer.bulkTransferId);
        expect(result).toBeDefined();
        expect(result?.payeeFsp).toEqual(newPayee);
    });

    test("should return null when a bulk transfer that does not exist", async () => {
        // Arrange
        const bulkTransfer1 = mockedBulkTransfer1;

        // Act
        const result = await mongoBulkTransfersRepo.getBulkTransferById(bulkTransfer1.bulkTransferId);

        // Assert
        expect(result).toBeNull();
    });

    test("should return a bulk transfer when it exists", async () => {
        // Arrange
        const bulkTransfer1 = mockedBulkTransfer1;
        await mongoBulkTransfersRepo.addBulkTransfer(bulkTransfer1);

        // Act
        const result = await mongoBulkTransfersRepo.getBulkTransferById(bulkTransfer1.bulkTransferId);

        // Assert
        expect(result).toBeDefined();
        expect(result).toEqual(bulkTransfer1);
    });

    test("should return a empty array when there are no bulk transfers", async () => {
         // Act
         const result = await mongoBulkTransfersRepo.getBulkTransfers();

         // Assert
         expect(result).toBeDefined();
         expect(result).toEqual([]);
    });

});



