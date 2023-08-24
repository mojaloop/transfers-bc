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

import { Collection, MongoClient } from "mongodb";
import { ConsoleLogger, ILogger, LogLevel } from "@mojaloop/logging-bc-public-types-lib";
import { NoSuchTransferError, TransferAlreadyExistsError } from "../../../packages/implementations-lib/src/errors";
import { mockedTransfer1, mockedTransfer2, mockedTransfer3, mockedTransfer4 } from "@mojaloop/transfers-bc-shared-mocks-lib";

import { MongoTransfersRepo } from "../../../packages/implementations-lib/src/transfers/mongo_transfers_repo";
import { TransferState } from "@mojaloop/transfers-bc-domain-lib";

const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.FATAL);

const DB_NAME = process.env.ACCOUNT_LOOKUP_DB_TEST_NAME ?? "test";
const CONNECTION_STRING = process.env["MONGO_URL"] || "mongodb://root:mongoDbPas42@localhost:27017/";
// const CONNECTION_STRING = process.env["MONGO_URL"] || "mongodb://127.0.0.1:27017/";
const COLLECTION_NAME = "transfers";

let mongoTransfersRepo : MongoTransfersRepo;

let mongoClient: MongoClient;
let collection : Collection;

describe("Implementations - Mongo transfers Repo Integration tests", () => {

    beforeAll(async () => {
        mongoClient = await MongoClient.connect(CONNECTION_STRING);
        collection = mongoClient.db(DB_NAME).collection(COLLECTION_NAME);
        mongoTransfersRepo = new MongoTransfersRepo(logger, CONNECTION_STRING, DB_NAME);
        await mongoTransfersRepo.init();
        await collection.deleteMany({});
    });

    afterEach(async () => {
        await collection.deleteMany({});
    });

    afterAll(async () => {
        await collection.deleteMany({});
        await mongoTransfersRepo.destroy();
        await mongoClient.close();
    });

    test("should be able to init mongo transfers repo", async () => {
        expect(mongoTransfersRepo).toBeDefined();
    });

    test("should throw error when is unable to init transfers repo", async () => {
        // Arrange
        const badMongoRepository = new MongoTransfersRepo(logger, "invalid connection", "invalid_db_name");

        // Act
        await expect(badMongoRepository.init()).rejects.toThrowError();

    });

    test("should throw error when is unable to destroy mongo transfer repo", async () => {
        // Arrange
        const badMongoRepository = new MongoTransfersRepo(logger, "invalid connection", "invalid_db_name");

        // Act
        await expect(badMongoRepository.destroy()).rejects.toThrowError();
    });

    test("should insert a transfer in the database", async () => {
        // Arrange
        const transfer1 = mockedTransfer1;

        // Act
        const transferId = await mongoTransfersRepo.addTransfer(transfer1);

        // Assert
        expect(transferId).toBeDefined();
        expect(transferId).toEqual(transfer1.transferId);

    });

    test("should throw error when trying to insert a transfer with an existing id", async () => {
        // Arrange
        const transfer1 = mockedTransfer1;

        // Act
        await mongoTransfersRepo.addTransfer(transfer1);

        // Assert
        await expect(mongoTransfersRepo.addTransfer(transfer1)).rejects.toThrowError(TransferAlreadyExistsError);

    });

    test("should insert multiple transfers in the database", async () => {
        // Arrange
        const transfers = [mockedTransfer1, mockedTransfer2, mockedTransfer3, mockedTransfer4];

        // Act
        await mongoTransfersRepo.addTransfers(transfers);

        // Assert
        const transfer1 = await mongoTransfersRepo.getTransferById(transfers[0].transferId);
        const transfer2 = await mongoTransfersRepo.getTransferById(transfers[1].transferId);
        const transfer3 = await mongoTransfersRepo.getTransferById(transfers[2].transferId);
        const transfer4 = await mongoTransfersRepo.getTransferById(transfers[3].transferId);

        expect(transfer1).toBeDefined();
        expect(transfer1).toEqual(transfers[0]);
        expect(transfer2).toBeDefined();
        expect(transfer2).toEqual(transfers[1]);
        expect(transfer3).toBeDefined();
        expect(transfer3).toEqual(transfers[2]);
        expect(transfer4).toBeDefined();
        expect(transfer4).toEqual(transfers[3]);

    });

    test("should throw error when trying to insert multiple transfers with an existing id", async () => {
        // Arrange
        const transfer1 = mockedTransfer1;
        const transfer2 = mockedTransfer2;
        const transfer3 = mockedTransfer3;
        const transfer4 = mockedTransfer4;
        transfer4.transferId = transfer1.transferId;
        await mongoTransfersRepo.addTransfer(transfer1);

        // Act && Assert
        await expect(mongoTransfersRepo.addTransfers([transfer1, transfer2, transfer3, transfer4])).rejects.toThrowError(TransferAlreadyExistsError);

    });


    test("should throw an error when trying to update a transfer that does not exist", async () => {
        // Arrange
        const transfer1 = mockedTransfer1;

        // Act && Assert
        await expect(mongoTransfersRepo.updateTransfer(transfer1)).rejects.toThrowError(NoSuchTransferError);

    });

    test("should update a transfer in the database", async () => {
        // Arrange
        const transfer1 = mockedTransfer1;
        const newTransfer = mockedTransfer2;
        await mongoTransfersRepo.addTransfer(transfer1);
        newTransfer.transferId = transfer1.transferId;

        // Act
        await mongoTransfersRepo.updateTransfer(newTransfer);

        // Assert
        const result = await mongoTransfersRepo.getTransferById(newTransfer.transferId);
        expect(result).toBeDefined();
        expect(result).toEqual(newTransfer);
    });

    test("should update a transfer partially in the database", async () => {
        // Arrange
        const transfer1 = mockedTransfer1;
        const newPayee = mockedTransfer2.payeeFspId;
        const newTransfer = mockedTransfer2;
        newTransfer.payeeFspId = newPayee;

        await mongoTransfersRepo.addTransfer(transfer1);

        // Act
        await mongoTransfersRepo.updateTransfer(newTransfer);

        // Assert
        const result = await mongoTransfersRepo.getTransferById(newTransfer.transferId);
        expect(result).toBeDefined();
        expect(result?.payeeFspId).toEqual(newPayee);
    });

    test("should return null when a transfer that does not exist", async () => {
        // Arrange
        const transfer1 = mockedTransfer1;

        // Act
        const result = await mongoTransfersRepo.getTransferById(transfer1.transferId);

        // Assert
        expect(result).toBeNull();
    });

    test("should return a transfer when it exists", async () => {
        // Arrange
        const transfer1 = mockedTransfer1;
        await mongoTransfersRepo.addTransfer(transfer1);

        // Act
        const result = await mongoTransfersRepo.getTransferById(transfer1.transferId);

        // Assert
        expect(result).toBeDefined();
        expect(result).toEqual(transfer1);
    });

    test("should return a empty array when there are no transfers", async () => {
         // Act
         const result = await mongoTransfersRepo.getTransfers();

         // Assert
         expect(result).toBeDefined();
         expect(result).toEqual([]);
    });

    // test("should return a list of transfers", async () => {
    //     // Arrange
    //     const transfer1 = mockedTransfer1;
    //     const transfer2 = mockedTransfer2;
    //     const transfer3 = mockedTransfer3;
    //     const transfer4 = mockedTransfer4;
    //     await mongoTransfersRepo.addTransfers([transfer1, transfer2, transfer3, transfer4]);

    //     // Act
    //     const result = await mongoTransfersRepo.getTransfers();

    //     // Assert
    //     expect(result).toBeDefined();
    //     expect(result).toHaveLength(4);
    //     expect(result).toEqual([transfer1, transfer2, transfer3, transfer4]);
    // });

});



