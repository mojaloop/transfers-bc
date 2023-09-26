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

 * Crosslake
 - Pedro Sousa Barreto <pedrob@crosslaketech.com>

 --------------
 **/

"use strict";

import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import { ITransfersRepository, ITransfer } from "@mojaloop/transfers-bc-domain-lib";

// TODO: remove esling disable
/* eslint-disable */

declare type CacheItem = {
    item:ITransfer, timestamp:number
}

export class InMemoryTransfersRepo implements ITransfersRepository {
	private readonly _logger: ILogger;
    private _cache: Map<string, CacheItem> = new Map<string, CacheItem>();

	constructor(logger: ILogger, _dbName: string) {
		this._logger = logger.createChild(this.constructor.name);
	}

	async init(): Promise<void> {
		return;
	}

	async destroy(): Promise<void> {
		return;
	}

	async addTransfer(transfer: ITransfer): Promise<string> {
        this._cache.set(transfer.transferId, {item: transfer, timestamp: Date.now()});
        return transfer.transferId;
	}

	async removeTransfer(transferId: string): Promise<void> {
        this._cache.delete(transferId);
	}

	async getTransferById(transferId:string):Promise<ITransfer|null>{
        const found = this._cache.get(transferId);
        if(found) return found.item;
        return null;
	}

	async getTransfers():Promise<ITransfer[]>{
        return Array.from(this._cache.values()).map(value=>value.item);
	}

	async searchTransfers(
		_state?:string,
		_currencyCode?:string,
		_startDate?:number,
		_endDate?:number,
		_id?:string
	):Promise<ITransfer[]>{
		throw new Error("Not implemented");
	}

	async addTransfers(_transfers: ITransfer[]): Promise<void> {
        throw new Error("Not implemented");
	}

	async updateTransfer(transfer: ITransfer): Promise<void> {
        this._cache.set(transfer.transferId, {item: transfer, timestamp: Date.now()});
        return;
	}

    async storeTransfers(transfers:ITransfer[]):Promise<void>{
        for(const transf of transfers){
            await this.updateTransfer(transf);
        }
    }
}
