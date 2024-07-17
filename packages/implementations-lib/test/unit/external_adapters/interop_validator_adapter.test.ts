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
import { IInteropFspiopValidator } from "@mojaloop/transfers-bc-domain-lib";
import { ITransfer } from "@mojaloop/transfers-bc-public-types-lib";
import { InteropFspiopValidator } from "../../../src/external_adapters/interop_apis_adapter";

const validateFulfilmentOpaqueStateSpy = jest.fn();

jest.mock("@mojaloop/interop-bc-client-lib", () => {
    return {
        InteropValidationClient: jest.fn().mockImplementation(() => {
            return {
                validateFulfilmentOpaqueState: validateFulfilmentOpaqueStateSpy,

            };
        }),
    };
});

const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.FATAL);

describe('Unit tests - InteropFspiopValidator', () => {
    let interopFspiopValidator: IInteropFspiopValidator;

    beforeAll(async () => {
        interopFspiopValidator = new InteropFspiopValidator(logger);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        jest.clearAllMocks();
    });

    it('should return true when validateFulfilmentOpaqueState is successful', () => {
        // Arrange
        const fspiopOpaqueState = { fulfilment: 'validFulfilment' };
        const transfer = { condition: 'validCondition' } as unknown as ITransfer;

        validateFulfilmentOpaqueStateSpy.mockReturnValueOnce(true);;

        // Act
        const result = interopFspiopValidator.validateFulfilmentOpaqueState(fspiopOpaqueState, transfer);

        // Assert
        expect(result).toBe(true);
        expect(validateFulfilmentOpaqueStateSpy).toHaveBeenCalledWith(fspiopOpaqueState, transfer);
    });

    it('should return false when validateFulfilmentOpaqueState returns false', () => {
        // Arrange
        const fspiopOpaqueState = { fulfilment: 'invalidFulfilment' };
        const transfer = { condition: 'validCondition' } as unknown as ITransfer;
        validateFulfilmentOpaqueStateSpy.mockReturnValue(false);

        // Act
        const result = interopFspiopValidator.validateFulfilmentOpaqueState(fspiopOpaqueState, transfer);

        // Assert
        expect(result).toBe(false);
        expect(validateFulfilmentOpaqueStateSpy).toHaveBeenCalledWith(fspiopOpaqueState, transfer);
    });

    it('should return false and log an error when validateFulfilmentOpaqueState throws an error', () => {
        // Arrange
        const fspiopOpaqueState = { fulfilment: 'errorFulfilment' };
        const transfer = { condition: 'validCondition' } as unknown as ITransfer;
        const errorMessage = 'Mocked error';
        validateFulfilmentOpaqueStateSpy.mockImplementation(() => {
            throw new Error(errorMessage);
        });

        // Act
        const result = interopFspiopValidator.validateFulfilmentOpaqueState(fspiopOpaqueState, transfer);

        // Assert
        expect(result).toBe(false);
        expect(validateFulfilmentOpaqueStateSpy).toHaveBeenCalledWith(fspiopOpaqueState, transfer);
    });
});
