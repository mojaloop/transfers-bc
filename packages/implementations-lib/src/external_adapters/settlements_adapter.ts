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

import { ILogger } from "@mojaloop/logging-bc-public-types-lib";
import { SettlementModelClient } from "@mojaloop/settlements-bc-model-lib";
import { ISettlementsServiceAdapter } from "@mojaloop/transfers-bc-domain-lib";
import {IAuthenticatedHttpRequester} from "@mojaloop/security-bc-public-types-lib";
import {DEFAULT_SETTLEMENT_MODEL_ID} from "@mojaloop/settlements-bc-public-types-lib";

export class SettlementsAdapter implements ISettlementsServiceAdapter {
	private readonly _logger: ILogger;
	private readonly _clientBaseUrl: string;
	private readonly _externalSettlementsClient: SettlementModelClient;

	constructor(
		logger: ILogger,
		clientBaseUrl: string,
        authRequester:IAuthenticatedHttpRequester
	) {
		this._logger = logger.createChild(this.constructor.name);
		this._clientBaseUrl = clientBaseUrl;
		this._externalSettlementsClient = new SettlementModelClient(this._logger, this._clientBaseUrl, authRequester);
	}

    async init():Promise<void>{
        await this._externalSettlementsClient.init();
    }

	async getSettlementModelId(transferAmount: string, payerCurrency: string | null, payeeCurrency: string | null, extensionList: { key: string; value: string; }[]): Promise<string> {
		try {
			const modelId = await this._externalSettlementsClient.getSettlementModelId(transferAmount, payerCurrency, payeeCurrency, extensionList);
			return modelId || DEFAULT_SETTLEMENT_MODEL_ID;
		} catch (e: unknown) {
			this._logger.error(e,`getSettlementsInfo: error getting settlements info for transferAmount: ${transferAmount}, payerCurrency: ${payerCurrency}, payeeCurrency: ${payeeCurrency}, extensionList: ${extensionList} - ${e}`);
            //throw e;
            return DEFAULT_SETTLEMENT_MODEL_ID;
        }
	}

}
