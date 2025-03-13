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

* Arg Software
- José Antunes <jose.antunes@arg.software>
- Rui Rocha <rui.rocha@arg.software>
*****/

"use strict";

import { ConsoleLogger, ILogger, LogLevel } from "@mojaloop/logging-bc-public-types-lib";
import { SettlementsAdapter } from "../../../src/external_adapters/settlements_adapter";

import { IAuthenticatedHttpRequester } from "@mojaloop/security-bc-public-types-lib";
import { MemoryAuthenticatedHttpRequesterMock } from "@mojaloop/transfers-bc-shared-mocks-lib";

const BASE_URL_SCHEDULING_CLIENT: string = "http://localhost:1234";
const AUTH_TOKEN_ENPOINT = "http://localhost:3101/authTokenEndpoint";

const initSpy = jest.fn();
const getSettlementModelIdSpy = jest.fn();


const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.FATAL);
let authenticatedHttpRequesterMock: IAuthenticatedHttpRequester;

jest.mock("@mojaloop/settlements-bc-model-lib", () => {
    return {
        SettlementModelClient: jest.fn().mockImplementation(() => {
            return {
                init: initSpy,
                getSettlementModelId: getSettlementModelIdSpy,

            };
        }),
    };
});

let settlementsAdapter: SettlementsAdapter;

describe("Implementations - SettlementsAdapter Adapter Unit Tests", () => {
    beforeAll(async () => {
        authenticatedHttpRequesterMock = new MemoryAuthenticatedHttpRequesterMock(logger, AUTH_TOKEN_ENPOINT);
        settlementsAdapter = new SettlementsAdapter(logger, BASE_URL_SCHEDULING_CLIENT, authenticatedHttpRequesterMock);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        jest.clearAllMocks();
    });

    // #region init
    test("initSpy - should successfully init AccountsAndBalancesGrpcClient", async () => {
        // Arrange Act
        await settlementsAdapter.init();

        // Assert
        expect(initSpy).toHaveBeenCalled();
    });
    // #endregion

    // #region getSettlementModelId
    test("getSettlementModelId - should successfully get the settlement model id", async () => {
        // Arrange
        const transferAmount:string = "10"; 
        const payerCurrency:string = "USD"; 
        const payeeCurrency:string = "USD";
        const existingSettlementModelId = "randomSettlemodelId"
        getSettlementModelIdSpy.mockResolvedValueOnce(existingSettlementModelId);

        // Act
        const retrievedSettlementModelid = await settlementsAdapter.getSettlementModelId(transferAmount, payerCurrency, payeeCurrency, []);
        
        // Assert
        expect(retrievedSettlementModelid).toEqual(existingSettlementModelId);
    });

    test("getSettlementModelId - should throw when getting a settlement model id", async () => {
        // Arrange
        const transferAmount:string = "10"; 
        const payerCurrency:string = "USD"; 
        const payeeCurrency:string = "USD";
        const defaultSettlementModelIdValue = "DEFAULT"
        getSettlementModelIdSpy.mockRejectedValueOnce(null);

        // Act
        const retrievedSettlementModelid = await settlementsAdapter.getSettlementModelId(transferAmount, payerCurrency, payeeCurrency, []);
        
        // Assert
        expect(retrievedSettlementModelid).toEqual(defaultSettlementModelIdValue);
    });
    // #endregion


});
