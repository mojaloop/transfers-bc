/*****
 License
 --------------
 Copyright © 2017 Bill & Melinda Gates Foundation
 The Mojaloop files are made available by the Bill & Melinda Gates Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

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

 --------------
******/

"use strict";

import { ConsoleLogger, ILogger, LogLevel } from "@mojaloop/logging-bc-public-types-lib";
import { GrpcAccountsAndBalancesAdapter } from "../../src/external_adapters/grpc_acc_bal_adapter";

import { IAuthenticatedHttpRequester, ILoginHelper } from "@mojaloop/security-bc-public-types-lib";
import { MemoryAuthenticatedHttpRequesterMock, MemoryLoginHelper } from "@mojaloop/transfers-bc-shared-mocks-lib";
import { AccountsAndBalancesGrpcClient, GrpcCreateAccountArray } from "@mojaloop/accounts-and-balances-bc-grpc-client-lib";
import {
    AccountsAndBalancesAccount,
    AccountsAndBalancesJournalEntry,
    AccountsAndBalancesAccountType, IAccountsBalancesHighLevelRequest, IAccountsBalancesHighLevelResponse
} from "@mojaloop/accounts-and-balances-bc-public-types-lib";

const BASE_URL_GRPC_ACC_BAL_CLIENT: string = "http://localhost:1234";
const AUTH_TOKEN_ENPOINT = "http://localhost:3101/authTokenEndpoint";

const initSpy = jest.fn();
const createAccountsSpy = (asd:any) => {
    debugger
    return;
};

const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.FATAL);
let authenticatedHttpRequesterMock: IAuthenticatedHttpRequester;
let loginHelperMock: ILoginHelper;

jest.mock("@mojaloop/accounts-and-balances-bc-grpc-client-lib", () => {
    return {
        AccountsAndBalancesGrpcClient: jest.fn().mockImplementation(() => {
            return {
                init: initSpy,
                createAccounts: createAccountsSpy
            };
        }),
    };
});

let grpcAccountsAndBalancesAdapter: GrpcAccountsAndBalancesAdapter;

describe("Implementations - IAccountsBalancesAdapter Unit Tests", () => {
    beforeAll(async () => {
        authenticatedHttpRequesterMock = new MemoryAuthenticatedHttpRequesterMock(logger, AUTH_TOKEN_ENPOINT);
        loginHelperMock = new MemoryLoginHelper();
            grpcAccountsAndBalancesAdapter = new GrpcAccountsAndBalancesAdapter(
            BASE_URL_GRPC_ACC_BAL_CLIENT,
            loginHelperMock,
            logger
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        jest.clearAllMocks();
    });

    // Init.
    test("initSpy - should successfully init AccountsAndBalancesGrpcClient", async () => {
        // Arrange Act
        await grpcAccountsAndBalancesAdapter.init();

        // Assert
        expect(initSpy).toHaveBeenCalled();
    });

    test("setToken - should successfully set token", async () => {
        // Arrange
        const token: string = "randomToken";
        jest.spyOn(loginHelperMock, "setToken");

        // Act
        grpcAccountsAndBalancesAdapter.setToken(token);
        
        // Assert
        expect(loginHelperMock.setToken).toHaveBeenCalledWith(token);
    });

    test("setUserCredentials - should successfully set user credentials", async () => {
        // Arrange
        const clientId:string = "randomClientId";
        const username:string = "randomUsername";
        const password:string = "randomPassword";
        jest.spyOn(loginHelperMock, "setUserCredentials");

        // Act
        grpcAccountsAndBalancesAdapter.setUserCredentials(clientId, username, password);
        
        // Assert
        expect(loginHelperMock.setUserCredentials).toHaveBeenCalledWith(clientId, username, password);
    });
    
    test("setAppCredentials - should successfully set app credentials", async () => {
        // Arrange
        const clientId:string = "randomClientId";
        const clientSecret:string = "randomClientSecret";

        jest.spyOn(loginHelperMock, "setAppCredentials");

        // Act
        grpcAccountsAndBalancesAdapter.setAppCredentials(clientId, clientSecret);
        
        // Assert
        expect(loginHelperMock.setAppCredentials).toHaveBeenCalledWith(clientId, clientSecret);
    });
        
    test("createAccount - should successfully set app credentials", async () => {
        // Arrange
        const requestedId:string = "randomRequestedId";
        const ownerId:string = "randomOwnerId";
        const type = "POSITION";
        const currencyCode:string = "USD";

        // Act
        const result = grpcAccountsAndBalancesAdapter.createAccount(requestedId, ownerId, type, currencyCode);
        
        // Assert
        expect(result).toEqual(requestedId);
    });
});
