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
import { SchedulingAdapter } from "../../../src/external_adapters/scheduling_adapter";

import { IAuthenticatedHttpRequester, ILoginHelper } from "@mojaloop/security-bc-public-types-lib";
import { MemoryAuthenticatedHttpRequesterMock, MemoryLoginHelper } from "@mojaloop/transfers-bc-shared-mocks-lib";

const BASE_URL_SCHEDULING_CLIENT: string = "http://localhost:1234";
const AUTH_TOKEN_ENPOINT = "http://localhost:3101/authTokenEndpoint";

const createReminderSpy = jest.fn();
const createSingleReminderSpy = jest.fn();
const getReminderSpy = jest.fn();
const deleteReminderSpy = jest.fn();

const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.FATAL);
let authenticatedHttpRequesterMock: IAuthenticatedHttpRequester;

jest.mock("@mojaloop/scheduling-bc-client-lib", () => {
    return {
        SchedulingClient: jest.fn().mockImplementation(() => {
            return {
                createReminder: createReminderSpy,
                createSingleReminder: createSingleReminderSpy,
                getReminder: getReminderSpy,
                deleteReminder: deleteReminderSpy
            };
        }),
    };
});

let schedulingAdapter: SchedulingAdapter;

describe("Implementations - SchedulingAdapter Unit Tests", () => {
    beforeAll(async () => {
        authenticatedHttpRequesterMock = new MemoryAuthenticatedHttpRequesterMock(logger, AUTH_TOKEN_ENPOINT);
        schedulingAdapter = new SchedulingAdapter(logger, BASE_URL_SCHEDULING_CLIENT);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        jest.clearAllMocks();
    });

    // #region createReminder
    test("createReminder - should successfully create a reminder", async () => {
        // Arrange
        const id:string = "randomId";
        const time:string = "123456789";
        const payload:any = {
            "randomKey": "randomValue"
        };
        const successfulReminder:string = "successful-reminder-id"

        createReminderSpy.mockResolvedValueOnce(successfulReminder);

        // Act
        const createdReminderId = await schedulingAdapter.createReminder(id, time, payload);
        
        // Assert
        expect(createdReminderId).toEqual(successfulReminder);
    });

    test("createReminder - should throw when creating a reminder", async () => {
        // Arrange
        const id:string = "randomId";
        const time:string = "123456789";
        const payload:any = {
            "randomKey": "randomValue"
        };        
        createReminderSpy.mockRejectedValueOnce(null);

        // Act
        const createdReminderId = await schedulingAdapter.createReminder(id, time, payload);
        
        // Assert
        expect(createdReminderId).toBeUndefined();
    });
    // #endregion


    // #region createSingleReminder
    test("createSingleReminder - should successfully create a reminder", async () => {
        // Arrange
        const id:string = "randomId";
        const time:string = "123456789";
        const payload:any = {
            "randomKey": "randomValue"
        };
        const successfulSingleReminder:string = "successful-reminder-id"

        createSingleReminderSpy.mockResolvedValueOnce(successfulSingleReminder);

        // Act
        const createdReminderId = await schedulingAdapter.createSingleReminder(id, time, payload);
        
        // Assert
        expect(createdReminderId).toEqual(successfulSingleReminder);
    });

    test("createSingleReminder - should throw when creating a reminder", async () => {
        // Arrange
        const id:string = "randomId";
        const time:string = "123456789";
        const payload:any = {
            "randomKey": "randomValue"
        };

        createSingleReminderSpy.mockRejectedValueOnce(null);

        // Act
        const createdReminderId = await schedulingAdapter.createSingleReminder(id, time, payload);
        
        // Assert
        expect(createdReminderId).toBeUndefined();
    });
    // #endregion

    
    // #region getReminder
    test("getReminder - should successfully return a reminder", async () => {
        // Arrange
        const id:string = "randomId";
        const existingReminder:string = "created-reminder-id"

        getReminderSpy.mockResolvedValueOnce(existingReminder);

        // Act
        const retrievedReminder = await schedulingAdapter.getReminder(id);
        
        // Assert
        expect(retrievedReminder).toEqual(existingReminder);
    });

    test("getReminder - should throw when trying to get a reminder", async () => {
        // Arrange
        const id:string = "randomId";

        getReminderSpy.mockRejectedValueOnce(null);

        // Act
        const retrievedReminder = await schedulingAdapter.getReminder(id);
        
        // Assert
        expect(retrievedReminder).toBeUndefined();
    });
    // #endregion
        

    // #region deleteReminder
    test("deleteReminder - should successfully delete a reminder", async () => {
        // Arrange
        const id:string = "randomId";
        const existingReminder:string = "deleted-reminder-id"

        deleteReminderSpy.mockResolvedValueOnce(existingReminder);

        // Act
        const deletedReminder = await schedulingAdapter.deleteReminder(id);
        
        // Assert
        expect(deletedReminder).toEqual(existingReminder);
    });

    test("deleteReminder - should throw when trying to delete a reminder", async () => {
        // Arrange
        const id:string = "randomId";

        deleteReminderSpy.mockRejectedValueOnce(null);

        // Act
        const deletedReminder = await schedulingAdapter.deleteReminder(id);
        
        // Assert
        expect(deletedReminder).toBeUndefined();
    });
    // #endregion
});
