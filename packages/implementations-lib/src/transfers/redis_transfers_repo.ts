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
import {
    UnableToCloseDatabaseConnectionError,
    UnableToGetTransferError,
    UnableToInitTransferRegistryError,
    NoSuchTransferError
} from '../errors';
import {Redis} from "ioredis";

// TODO: remove esling disable
/* eslint-disable */

export class RedisTransfersRepo implements ITransfersRepository {
	private readonly _logger: ILogger;
    private _redisClient: Redis;
    private readonly _keyPrefix= "transfer_";

	constructor(
		logger: ILogger,
        redisHost: string,
        redisPort: number
	) {
		this._logger = logger.createChild(this.constructor.name);

        this._redisClient = new Redis({
            port: redisPort,
            host: redisHost,
            lazyConnect: true
        });
	}

	async init(): Promise<void> {
        try{
            await this._redisClient.connect();
        }catch(e){
            this._logger.error(`Unable to connect to redis cache: ${(e as Error).message}`);
            throw new UnableToInitTransferRegistryError();
        }
	}

	async destroy(): Promise<void> {
		try{
            await this._redisClient.quit();
		}
		catch(e: unknown){
			this._logger.error(`Unable to close the database connection: ${(e as Error).message}`);
			throw new UnableToCloseDatabaseConnectionError();
		}
	}

    private _getKeyWithPrefix (key: string): string {
        return this._keyPrefix + key;
    }

	async addTransfer(transfer: ITransfer): Promise<string> {
        const key: string = this._getKeyWithPrefix(transfer.transferId);

        await this._redisClient.set(key, JSON.stringify(transfer));
        return transfer.transferId;
	}

	async removeTransfer(transferId: string): Promise<void> {
        const key: string = this._getKeyWithPrefix(transferId);

        const count = await this._redisClient.del(key);

		if(count == 1){
			return;
		}
		else{
			throw new NoSuchTransferError();
		}
	}

	async getTransferById(transferId:string):Promise<ITransfer|null>{
        const key: string = this._getKeyWithPrefix(transferId);

        const found = await this._redisClient.get(key);
        if(!found)
            return null;

        try{
            const transfer = JSON.parse(found);
            return transfer;
        }catch(e){
            this._logger.error(`Unable to get transfer by id: ${(e as Error).message}`);
            throw new UnableToGetTransferError();
        }
	}

	async getTransfers():Promise<ITransfer[]>{
        const keys:string[] = await this._redisClient.keys(this._keyPrefix + "*");
        if(!keys || keys.length<=0) return [];

		const transfersStrArr = await this._redisClient.mget(keys);
        if(!transfersStrArr || transfersStrArr.length<=0) return [];

        try{
            const ret: ITransfer[]  = [];
            transfersStrArr.forEach(trasfStr => {
               if(trasfStr) ret.push(JSON.parse(trasfStr));
            });
            return ret;
        }catch(e){
            this._logger.error(`Unable to get getTransfers - ${(e as Error).message}`);
            throw new UnableToGetTransferError();
        }
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
        await this.addTransfer(transfer);
	}

    async storeTransfers(transfers:ITransfer[]):Promise<void>{
        for(const transf of transfers){
            await this.updateTransfer(transf);
        }
    }

}
