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


import Redis from "ioredis";
import {ITimeoutAdapter} from "@mojaloop/transfers-bc-domain-lib";
import {ILogger} from "@mojaloop/logging-bc-public-types-lib";

const REDIS_KEY_NAME = "transfersTimeoutSet";

export class RedisTimeoutAdapter implements ITimeoutAdapter {
    private readonly _logger: ILogger;
    private _redisClient: Redis;

    constructor(logger: ILogger, redisHost: string, redisPort: number) {
        this._logger = logger.createChild(this.constructor.name);

        this._redisClient = new Redis({
            port: redisPort,
            host: redisHost,
            lazyConnect: true
        });
    }

    async init():Promise<void> {
        this._logger.info(`Initializing ${this.constructor.name}...`);
        try{
            await this._redisClient.connect();
            this._logger.info("Connected to Redis successfully");
            this._logger.info(` ${this.constructor.name}...`);
        }catch(error: unknown){
            this._logger.error(`Unable to connect to redis cache: ${(error as Error).message}`);
            throw error;
        }
    }

    async destroy():Promise<void> {
        try {
            this._redisClient.disconnect();
        } catch (e: unknown) {
            if(e instanceof Error) {
                this._logger.error(e,`Unable to disconnect from redis - ${e.message}`);
                throw e;
            }
            this._logger.error(`Unable to disconnect from redis - ${e}`);
            throw new Error(Object(e).toString());
        }
    }

    async setTimeout(transferId: string, timeoutTimestamp: number): Promise<void> {
        try {
            const resp = await this._redisClient.zadd(REDIS_KEY_NAME, timeoutTimestamp, transferId);
            return;
        }catch(error: unknown) {
            let errMessage: string;
            if(error instanceof Error) {
                errMessage = `Unable to setTimeout in redis - ${error.message}`;
                this._logger.error(error);
            }else{
                errMessage = `Unable to setTimeout in redis - ${Object(error).toString()}`;
            }
            throw Error(errMessage);
        }
    }

    async setTimeouts(timeouts:{transferId:string, timeoutTimestamp:number}[]): Promise<void>{
        const redisCmds = timeouts.map(item => {
            return ["zadd", REDIS_KEY_NAME, item.timeoutTimestamp, item.transferId];
        });

        try {
            const resp = await this._redisClient.multi(redisCmds).exec();
            return;
        }catch(error: unknown) {
            let errMessage: string;
            if(error instanceof Error) {
                errMessage = `Unable to setTimeouts in redis - ${error.message}`;
                this._logger.error(error);
            }else{
                errMessage = `Unable to setTimeouts in redis - ${Object(error).toString()}`;
            }
            throw Error(errMessage);
        }

    }

    async clearTimeout(transferId: string): Promise<void> {
        try {
            const resp = await this._redisClient.zrem(REDIS_KEY_NAME, transferId);
            return;
        }catch(error: unknown) {
            let errMessage: string;
            if(error instanceof Error) {
                errMessage = `Unable to clearTimeout in redis - ${error.message}`;
                this._logger.error(error);
            }else{
                errMessage = `Unable to clearTimeout in redis - ${Object(error).toString()}`;
            }
            throw Error(errMessage);
        }
    }

    async clearTimeouts(transferIds:string[]): Promise<void>{
        const redisCmds = transferIds.map(id => {
            return ["zrem", REDIS_KEY_NAME, id];
        });

        try {
            const resp = await this._redisClient.multi(redisCmds).exec();
            return;
        }catch(error: unknown) {
            let errMessage: string;
            if(error instanceof Error) {
                errMessage = `Unable to clearTimeouts in redis - ${error.message}`;
                this._logger.error(error);
            }else{
                errMessage = `Unable to clearTimeouts in redis - ${Object(error).toString()}`;
            }
            throw Error(errMessage);
        }
    }

    async getOlderThan(timestamp?: number): Promise<string[]> {
        if(timestamp == undefined) {
            timestamp = Date.now();
        }

        try {
            const ids:string[] = await this._redisClient.zrangebyscore(REDIS_KEY_NAME, 0, timestamp);
            return ids;
        }catch(error: unknown) {
            let errMessage: string;
            if(error instanceof Error) {
                errMessage = `Unable to getExpired in redis - ${error.message}`;
                this._logger.error(error);
            }else{
                errMessage = `Unable to getExpired in redis - ${Object(error).toString()}`;
            }
            throw Error(errMessage);
        }
    }

}


export const TimeoutTypes ={
    single: "single",
    multiple: "multiple",
    special: "special"
} as const;

export type TimeoutTypes = keyof typeof TimeoutTypes;
const a:TimeoutTypes = TimeoutTypes.single;
