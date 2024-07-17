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

 * Arg Software
 - José Antunes <jose.antunes@arg.software>
 - Rui Rocha <rui.rocha@arg.software>

 --------------
 **/

"use strict";

import { ILogger } from "@mojaloop/logging-bc-public-types-lib";
import { IInteropFspiopValidator } from "@mojaloop/transfers-bc-domain-lib";
import { InteropValidationClient } from "@mojaloop/interop-bc-client-lib";
import { ITransfer } from "@mojaloop/transfers-bc-public-types-lib";

export class InteropFspiopValidator implements IInteropFspiopValidator {
	private readonly _logger: ILogger;
	private readonly _externalInteropApisClient:InteropValidationClient;

	constructor(
		logger: ILogger,
	) {
		this._logger = logger.createChild(this.constructor.name);
		this._externalInteropApisClient = new InteropValidationClient(this._logger);
	}

	validateFulfilmentOpaqueState(fspiopOpaqueState: any, transfer: ITransfer): boolean {
		try {
			const result = this._externalInteropApisClient.validateFulfilmentOpaqueState(fspiopOpaqueState, transfer);

			return result;
		} catch (e: unknown) {
			this._logger.error(e,`validateFulfilAgainstCondition: error validating message - ${e}`);

			return false;
		}
	}

}
