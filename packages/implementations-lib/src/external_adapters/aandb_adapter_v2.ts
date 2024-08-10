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

 * Interledger Foundation
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>

 --------------
 ******/

"use strict";

import {ILogger} from "@mojaloop/logging-bc-public-types-lib";
import {ILoginHelper} from "@mojaloop/security-bc-public-types-lib";
import {
    IAnbHighLevelRequest,
    IAnbGrpcCertificatesFiles,
    IAnbHighLevelResponse
} from "@mojaloop/accounts-and-balances-bc-public-types-lib";
import {AccountsAndBalancesClient} from "@mojaloop/accounts-and-balances-bc-client-lib";
import {IAccountsBalancesAdapterV2} from "@mojaloop/transfers-bc-domain-lib";
import {Currency} from "@mojaloop/platform-configuration-bc-public-types-lib";
import {IMetrics} from "@mojaloop/platform-shared-lib-observability-types-lib";

export class AccountsAndBalancesAdapterV2 implements IAccountsBalancesAdapterV2{
    private readonly _logger:ILogger;
    private readonly _client: AccountsAndBalancesClient;

    constructor(controlPlaneUrl:string, logger:ILogger, loginHelper:ILoginHelper, currencies:Currency[], metrics:IMetrics, certFiles?: IAnbGrpcCertificatesFiles) {
        this._logger = logger.createChild(this.constructor.name);
        this._client = new AccountsAndBalancesClient(controlPlaneUrl, this._logger, loginHelper, currencies, metrics, certFiles);
    }

    async init():Promise<void>{
        await this._client.Init();
    }

    async destroy():Promise<void>{
        //return this._client.Destroy();
    }

    async processHighLevelBatch(requests:IAnbHighLevelRequest[]): Promise<IAnbHighLevelResponse[]>{
        if(this._logger.isDebugEnabled()) this._logger.debug(`${this.constructor.name}.processHighLevelBatch() - start`);
        const startTs = Date.now();

        const resp = await this._client.processHighLevelBatch(requests);

        const tookMs = Date.now()-startTs;
        if(this._logger.isDebugEnabled()) this._logger.debug(`${this.constructor.name}.processHighLevelBatch() - end - took ${tookMs} ms to process a batch of: ${requests.length} requests`);

        return resp;
    }

}
