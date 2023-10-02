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

import { mockedTransfer1, mockedTransfer2, mockedTransfer3 } from "@mojaloop/transfers-bc-shared-mocks-lib";
import { ConsoleLogger, ILogger, LogLevel } from "@mojaloop/logging-bc-public-types-lib";
import { MongoClient, Collection } from "mongodb";
import { MongoTransfersRepo } from "@mojaloop/transfers-bc-implementations-lib";
import { Service } from "../../../packages/transfers-api-svc/src/service";
import request from "supertest";

const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.FATAL);

const DB_NAME = process.env.TRANSFERS_DB_NAME ?? "transfers";
const CONNECTION_STRING = process.env["MONGO_URL"] || "mongodb://root:mongoDbPas42@localhost:27017/";
// const CONNECTION_STRING = process.env["MONGO_URL"] || "mongodb://127.0.0.1:27017/";
const COLLECTION_NAME = "transfers";

// Hub credentials to get access token
const USERNAME = "user";
const PASSWORD = "superPass";

let accessToken: string;

let mongoTransfersRepo : MongoTransfersRepo;

let mongoClient: MongoClient;
let collection : Collection;

const server = process.env["TRANSFERS_ADM_URL"] || "http://localhost:3500";
const AUTH_N_SVC_BASEURL = process.env["AUTH_N_SVC_BASEURL"] || "http://localhost:3201";

describe("Transfers Admin Routes - Integration", () => {

    beforeAll(async () => {
        process.env = Object.assign(process.env, {
            PLATFORM_CONFIG_BASE_SVC_URL: "http://localhost:3100/"
        });
        
        mongoClient = await MongoClient.connect(CONNECTION_STRING);
        collection = mongoClient.db(DB_NAME).collection(COLLECTION_NAME);
        mongoTransfersRepo = new MongoTransfersRepo(logger, CONNECTION_STRING, DB_NAME);
        await mongoTransfersRepo.init();
        await collection.deleteMany({});

        await Service.start();

        // Get the access token
        const response = await request(AUTH_N_SVC_BASEURL).post("/token").send({
            client_id: "security-bc-ui",
            grant_type: "password",
            username: USERNAME,
            password: PASSWORD,
        });

        accessToken = response?.body?.access_token;
    });

    afterEach(async () => {
        const transfers = await mongoTransfersRepo.getTransfers();
        for await (const transfer of transfers) {
            await mongoTransfersRepo.removeTransfer(transfer.transferId);
        }
    });


    afterAll(async () => {
        await collection.deleteMany({});
        await mongoTransfersRepo.destroy();
        await mongoClient.close();
        await Service.stop();
    });

    test("GET - should get a transfer by it's id", async () => {
        // Arrange
        const newTransfer = mockedTransfer1;
        const transferId = await mongoTransfersRepo.addTransfer(newTransfer);

        // Act
        const response = await request(server)
            .get(`/transfers/${transferId}`)
            .set(`Authorization`, `Bearer ${accessToken}`);

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toEqual(newTransfer);
    });

    test("GET - should return not found error with non-existent transfer id", async () => {
        // Arrange
        const newTransfer = mockedTransfer1;
        await mongoTransfersRepo.addTransfer(newTransfer);
        const transferId = "non-existent-id";

        // Act
        const response = await request(server)
            .get(`/transfers/${transferId}`)
            .set(`Authorization`, `Bearer ${accessToken}`);

        // Assert
        expect(response.status).toBe(404);
    });

    test("GET - should return 401 error when no access token for /transfers/:id route", async () => {
        // Arrange
        const transferId = "example-id";

        // Act
        const response = await request(server)
            .get(`/transfers/${transferId}`);

        // Assert
        expect(response.status).toBe(401);
    });

    test("GET - should get a list of transfers", async () => {
        // Arrange
        await mongoTransfersRepo.addTransfer(mockedTransfer1);
        await mongoTransfersRepo.addTransfer(mockedTransfer2);
        await mongoTransfersRepo.addTransfer(mockedTransfer3);

        // Act
        const response = await request(server)
            .get("/transfers")
            .set(`Authorization`, `Bearer ${accessToken}`);

        // Assert
        expect(response.status).toBe(200);
        expect(response.body[0]).toEqual(mockedTransfer1);
        expect(response.body[1]).toEqual(mockedTransfer2);
        expect(response.body[2]).toEqual(mockedTransfer3);
        expect(response.body.length).toBe(3);
    });

    test("GET - should get a list of transfers by filters", async () => {
        // Arrange
        const transferId = await mongoTransfersRepo.addTransfer(mockedTransfer1);

        // Act
        const response = await request(server)
            .get("/transfers")
            .set(`Authorization`, `Bearer ${accessToken}`)
            .query({
                id: transferId,
                state: mockedTransfer1.transferState,
                startDate: mockedTransfer1.createdAt,
                endDate: mockedTransfer1.createdAt,
                currencyCode: mockedTransfer1.currencyCode,
            });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.length).toBe(1);
        expect(response.body[0]).toEqual(mockedTransfer1);
    });

    test("GET - should return 401 error when no access token for /transfers route", async () => {
        // Act
        const response = await request(server)
                .get("/transfers");
    
        // Assert
        expect(response.status).toBe(401);
    });

    test("GET - should return 401 error due to baddly formatted bearer token", async () => {
        // Act
        const response = await request(server)
            .get("/transfers")
            .set(`Authorization`, `badbearertoken`)
    
        // Assert
        expect(response.status).toBe(401);
    });

    test("GET - should return 401 error due to unverifiable token", async () => {
        // Act
        const response = await request(server)
            .get("/transfers")
            .set(`Authorization`, `Bearer badtoken`);
    
        // Assert
        expect(response.status).toBe(401);
    });

    test("GET - should return 404 error when route doesn't exist", async () => {
        // Act
        const response = await request(server)
            .get("/non-existing-route")
            .set(`Authorization`, `Bearer ${accessToken}`)
    
        // Assert
        expect(response.status).toBe(404);
    });
    
});


