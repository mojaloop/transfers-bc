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
import { GrpcAccountsAndBalancesAdapter } from "../../../src/external_adapters/grpc_acc_bal_adapter";
import { IAuthenticatedHttpRequester, ILoginHelper, UnauthorizedError } from "@mojaloop/security-bc-public-types-lib";
import { MemoryAuthenticatedHttpRequesterMock, MemoryLoginHelper } from "@mojaloop/transfers-bc-shared-mocks-lib";
import { IAccountsBalancesHighLevelRequest, IAccountsBalancesHighLevelResponse, AccountsBalancesHighLevelRequestTypes } from "@mojaloop/accounts-and-balances-bc-public-types-lib";

const BASE_URL_GRPC_ACC_BAL_CLIENT: string = "http://localhost:1234";
const AUTH_TOKEN_ENPOINT = "http://localhost:3101/authTokenEndpoint";

const initSpy = jest.fn();
const destroySpy = jest.fn();
const createAccountsSpy = jest.fn();
const createJournalEntrySpy = jest.fn();
const getAccountsSpy = jest.fn();
const getParticipantAccountsSpy = jest.fn();
const processHighLevelBatchSpy = jest.fn();

const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.DEBUG);
let authenticatedHttpRequesterMock: IAuthenticatedHttpRequester;
let loginHelperMock: ILoginHelper;
let grpcAccountsAndBalancesAdapter: GrpcAccountsAndBalancesAdapter;

jest.mock("@mojaloop/accounts-and-balances-bc-grpc-client-lib", () => {
    return {
        AccountsAndBalancesGrpcClient: jest.fn().mockImplementation(() => {
            return {
                init: initSpy,
                destroy: destroySpy,
                createAccounts: createAccountsSpy,
                createJournalEntries: createJournalEntrySpy,
                getAccountsByIds: getAccountsSpy,
                getAccountsByOwnerId: getParticipantAccountsSpy,
                processHighLevelBatch: processHighLevelBatchSpy

            };
        })
    };
});

describe("Implementations - IAccountsBalancesAdapter Unit Tests", () => {
    beforeAll(async () => {
        authenticatedHttpRequesterMock = new MemoryAuthenticatedHttpRequesterMock(logger, AUTH_TOKEN_ENPOINT);
        loginHelperMock = new MemoryLoginHelper();
            grpcAccountsAndBalancesAdapter = new GrpcAccountsAndBalancesAdapter(
                BASE_URL_GRPC_ACC_BAL_CLIENT,
                loginHelperMock,
                logger
        );

        await grpcAccountsAndBalancesAdapter.init();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        jest.clearAllMocks();
    });

    test("initSpy - should successfully init AccountsAndBalancesGrpcClient", async () => {
        // Arrange Act
        await grpcAccountsAndBalancesAdapter.init();

        // Assert
        expect(initSpy).toHaveBeenCalled();
    });

    test("initSpy - should successfully destoy AccountsAndBalancesGrpcClient", async () => {
        // Arrange Act
        await grpcAccountsAndBalancesAdapter.destroy();

        // Assert
        expect(destroySpy).toHaveBeenCalled();
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
        
    // #region createAccount
    test("createAccount - should successfully create an account", async () => {
        // Arrange
        const requestedId:string = "randomRequestedId";
        const ownerId:string = "randomOwnerId";
        const type = "POSITION";
        const currencyCode:string = "USD";

        createAccountsSpy.mockResolvedValueOnce({
            grpcIdArray: [
                {
                    grpcId: "randomGrpcId" 
                }
            ]
        })
        
        // Act
        const result = await grpcAccountsAndBalancesAdapter.createAccount(requestedId, ownerId, type, currencyCode);
        
        // Assert
        expect(result).toEqual("randomGrpcId");
    });

    test("createAccount - should throw when creating an account", async () => {
        // Arrange
        const requestedId:string = "randomRequestedId";
        const ownerId:string = "randomOwnerId";
        const type = "POSITION";
        const currencyCode:string = "USD";
        const errorMessage = "random error reason";

        createAccountsSpy.mockRejectedValueOnce(errorMessage)

        
        // Act & Assert
        await expect(grpcAccountsAndBalancesAdapter.createAccount(requestedId, ownerId, type, currencyCode)).rejects.toThrowError(errorMessage);

    });
    
    test("createAccount - should throw when creating an account due to UnauthorizedError", async () => {
        // Arrange
        const requestedId:string = "randomRequestedId";
        const ownerId:string = "randomOwnerId";
        const type = "POSITION";
        const currencyCode:string = "USD";
        const errorMessage = new UnauthorizedError("No permission");

        createAccountsSpy.mockRejectedValueOnce(errorMessage)


        // Act & Assert
        try {
            await grpcAccountsAndBalancesAdapter.createAccount(requestedId, ownerId, type, currencyCode);
        } catch (error) {
            expect(error).toBeInstanceOf(UnauthorizedError);
            expect(error).toHaveProperty('message', 'No permission');
        }
    });
    
    test("createJournalEntry - should throw when creating a journal entry", async () => {
        // Arrange
        const requestedId:string = "randomRequestedId";
        const ownerId:string = "randomOwnerId";
        const currencyCode:string = "USD";
        const amount:string = "10";
        const pending:boolean = false;
        const debitedAccountId:string = "randomDebitedAccountId";
        const creditedAccountId:string = "randomCreditedAccountId";
        const errorMessage = new UnauthorizedError("No permission");

        createJournalEntrySpy.mockRejectedValueOnce(errorMessage)

        await expect(grpcAccountsAndBalancesAdapter.createJournalEntry(requestedId, ownerId, currencyCode, amount, pending, debitedAccountId, creditedAccountId))
            .rejects.toThrowError(`Could not create journalEntry in remote system: ${errorMessage}`);
    });
    
    test("createJournalEntry - should successfully create a journal entry", async () => {
        // Arrange
        const requestedId:string = "randomRequestedId";
        const ownerId:string = "randomOwnerId";
        const currencyCode:string = "USD";
        const amount:string = "10";
        const pending:boolean = false;
        const debitedAccountId:string = "randomDebitedAccountId";
        const creditedAccountId:string = "randomCreditedAccountId";

        createJournalEntrySpy.mockResolvedValueOnce({
            grpcIdArray: [
                {
                    grpcId: "randomJournalEntryId" 
                }
            ]
        })
        

        // Act
        const result = await grpcAccountsAndBalancesAdapter.createJournalEntry(requestedId, ownerId, currencyCode, amount, pending, debitedAccountId, creditedAccountId);
        
        // Assert
        expect(result).toEqual("randomJournalEntryId");
    });
        
    test("createJournalEntry - should successfully create a journal entry", async () => {
        // Arrange
        const requestedId:string = "randomRequestedId";
        const ownerId:string = "randomOwnerId";
        const currencyCode:string = "USD";
        const amount:string = "10";
        const pending:boolean = false;
        const debitedAccountId:string = "randomDebitedAccountId";
        const creditedAccountId:string = "randomCreditedAccountId";

        createJournalEntrySpy.mockResolvedValueOnce({
            grpcIdArray: [
                {
                    grpcId: "randomJournalEntryId" 
                }
            ]
        })
        

        // Act
        const result = await grpcAccountsAndBalancesAdapter.createJournalEntry(requestedId, ownerId, currencyCode, amount, pending, debitedAccountId, creditedAccountId);
        
        // Assert
        expect(result).toEqual("randomJournalEntryId");
    });

    test("getJournalEntriesByAccountId - should successfully return journal entries by account id", async () => {
        // Arrange
        const accountId:string = "randomAccountId";
    

        // Act
        const result = await grpcAccountsAndBalancesAdapter.getJournalEntriesByAccountId(accountId);
        
        // Assert
        expect(result).toEqual([]); // TODO: remake this test later on when this adapter service call is implemented
    });

    test("getAccount - should return null if no account is found", async () => {
        // Arrange
        const accountId:string = "randomAccountId";
    
        getAccountsSpy.mockResolvedValueOnce([])

        // Act
        const result = await grpcAccountsAndBalancesAdapter.getAccount(accountId);
        
        // Assert
        expect(result).toEqual(null);
    });

    test("getAccount - should successfully return account", async () => {
        // Arrange
        const accountId:string = "randomAccountId";
        const accountIdResponse:string = "randomAccountIdResponse";
        
        getAccountsSpy.mockResolvedValueOnce([accountIdResponse])
        
        // Act
        const result = await grpcAccountsAndBalancesAdapter.getAccount(accountId);
        
        // Assert
        expect(result).toEqual(accountIdResponse); 
    });

    test("getAccounts - should return null if no account is found", async () => {
        // Arrange
        const accountId:string = "randomAccountId";
    
        getAccountsSpy.mockResolvedValueOnce([])

        // Act
        const result = await grpcAccountsAndBalancesAdapter.getAccounts([accountId]);
        
        // Assert
        expect(result).toEqual([]);
    });

    test("getAccounts - should successfully return account", async () => {
        // Arrange
        const accountId:string = "randomAccountId";
        const accountIdResponse:string = "randomAccountIdResponse";
        
        getAccountsSpy.mockResolvedValueOnce([accountIdResponse])
        
        // Act
        const result = await grpcAccountsAndBalancesAdapter.getAccounts([accountId]);
        
        // Assert
        expect(result).toEqual([accountIdResponse]);
    });
        
    test("getParticipantAccounts - should return null if no account is found", async () => {
        // Arrange
        const externalId:string = "randomExternalId";
    
        getParticipantAccountsSpy.mockResolvedValueOnce([])

        // Act
        const result = await grpcAccountsAndBalancesAdapter.getParticipantAccounts(externalId);
        
        // Assert
        expect(result).toEqual([]);
    });

    test("getParticipantAccounts - should successfully return account", async () => {
        // Arrange
        const externalId:string = "randomExternalId";
        const externalIdResponse:string = "randomExternalId";
        
        getParticipantAccountsSpy.mockResolvedValueOnce([externalId])
        
        // Act
        const result = await grpcAccountsAndBalancesAdapter.getParticipantAccounts(externalId);
        
        // Assert
        expect(result).toEqual([externalIdResponse]); 
    });
    
    test("processHighLevelBatch - should successfully return account", async () => {
        // Arrange
        const requests:IAccountsBalancesHighLevelRequest[] = [
            {
                requestType: AccountsBalancesHighLevelRequestTypes.checkLiquidAndReserve,
                requestId: "randomRequestId",
                transferId: "randomTransferId",
                payerPositionAccountId: "randomPayerPositionAccountId",
                hubJokeAccountId: "randomHubJokeAccountId",
                transferAmount: "100",
                currencyCode: "USD",
                payerLiquidityAccountId: "randomPayerLiquidityAccountId",
                payeePositionAccountId: "randomPayeeLiquidityAccountId",
                payerNetDebitCap: "randomPayerNetDebitCap"
            }
        ];
        const externalIdResponse:IAccountsBalancesHighLevelResponse[] = [
            {
                requestType: AccountsBalancesHighLevelRequestTypes.checkLiquidAndReserve,
                requestId: "randomRequestId",
                success: true,
                errorMessage: null
            }
        ];
        
        processHighLevelBatchSpy.mockResolvedValueOnce(externalIdResponse)
        
        // Act
        const result = await grpcAccountsAndBalancesAdapter.processHighLevelBatch(requests);
        
        // Assert
        expect(result).toEqual(externalIdResponse);
    });
});
