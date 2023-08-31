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
import { mockedTransfer1, mockedTransfer2, mockedTransfer3 } from "@mojaloop/transfers-bc-shared-mocks-lib";

import { MongoTransfersRepo } from "@mojaloop/transfers-bc-implementations-lib";
import { Service } from "../../../packages/transfers-api-svc/src/service";
import request from "supertest";

const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.FATAL);

const DB_NAME = process.env.ACCOUNT_LOOKUP_DB_TEST_NAME ?? "test";
const CONNECTION_STRING = process.env["MONGO_URL"] || "mongodb://root:mongoDbPas42@localhost:27017/";
// const CONNECTION_STRING = process.env["MONGO_URL"] || "mongodb://127.0.0.1:27017/";
const COLLECTION_NAME = "transfers";

let mongoTransfersRepo : MongoTransfersRepo;

let mongoClient: MongoClient;
let collection : Collection;


const server = process.env["TRANSFERS_ADM_URL"] || "http://localhost:3500";

describe("Transfers Admin Routes - Integration", () => {

    beforeAll(async () => {
        mongoClient = await MongoClient.connect(CONNECTION_STRING);
        collection = mongoClient.db(DB_NAME).collection(COLLECTION_NAME);
        mongoTransfersRepo = new MongoTransfersRepo(logger, CONNECTION_STRING, DB_NAME);
        await mongoTransfersRepo.init();
        await collection.deleteMany({});

        await Service.start();
    });

    afterEach(async () => {
        const transfers = await mongoTransfersRepo.getTransfers();
        for await (const transfer of transfers) {
            await mongoTransfersRepo.removeTransfer(transfer.transferId);
        }
    });


    afterAll(async () => {
        await Service.stop();
    });

    test("GET - should get a transfer by it's id", async () => {
        // Arrange
        const newTransfer = mockedTransfer1;
        const transferId = await mongoTransfersRepo.addTransfer(newTransfer);

        // Act
        const response = await request(server)
            .get(`/transfers/${transferId}`);

        // Assert
        // expect(response.status).toBe(200);
        expect(response.body).toEqual(newTransfer);

    });

    test("GET - should get a list of transfers", async () => {
        // Arrange
        await mongoTransfersRepo.addTransfer(mockedTransfer1);
        await mongoTransfersRepo.addTransfer(mockedTransfer2);
        await mongoTransfersRepo.addTransfer(mockedTransfer3);

        // Act
        const response = await request(server)
            .get("/transfers");

        // Assert
        expect(response.status).toBe(200);
        expect(response.body[0]).toEqual(mockedTransfer1);
        expect(response.body[1]).toEqual(mockedTransfer2);
        expect(response.body[2]).toEqual(mockedTransfer3);
        expect(response.body.length).toBe(3);

    });
});

