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

import {ILogger} from "@mojaloop/logging-bc-public-types-lib";
import {ParticipantsHttpClient} from "@mojaloop/participants-bc-client-lib";
import {IParticipant} from "@mojaloop/participant-bc-public-types-lib";
import {IParticipantsServiceAdapter } from "@mojaloop/transfers-bc-domain-lib";
import { 
	ILocalCache, 
	// LocalCache 
} from "../local_cache";
import { IAuthenticatedHttpRequester } from "@mojaloop/security-bc-client-lib";

export class ParticipantAdapter implements IParticipantsServiceAdapter {
	private readonly _logger: ILogger;
	// private readonly _localCache: ILocalCache;
	private readonly _clientBaseUrl: string;
	private readonly _externalParticipantClient :ParticipantsHttpClient;
	private readonly _authRequester :IAuthenticatedHttpRequester;
	private readonly _timeoutMs :number;
	private validateStatus = (status: number): boolean => status === 200;

	constructor(
		logger: ILogger,
		clientBaseUrl: string,
		authRequester: IAuthenticatedHttpRequester,
		timeoutMs: number,
		_localCache?: ILocalCache,
	) {
		this._logger = logger.createChild(this.constructor.name);
		this._clientBaseUrl = clientBaseUrl;
		this._authRequester = authRequester;
		this._timeoutMs = timeoutMs;
		this._externalParticipantClient = new ParticipantsHttpClient(this._logger, this._clientBaseUrl, this._authRequester, this._timeoutMs);
		// this._localCache = localCache ?? new LocalCache(logger);
	}

	async getParticipantInfo(fspId: string): Promise<IParticipant| null> {
		// const result = this._localCache.get("getParticipantInfo", fspId) as IParticipant;
		//
		// if (result) {
		// 	this._logger.debug(`getParticipantInfo: returning cached result for fspId: ${fspId}`);
		// 	return result;
		// }

		try {
			const result = await this._externalParticipantClient.getParticipantById(fspId);
			// if(result) {
			// 	this._localCache.set(result, "getParticipantInfo", fspId);
			// }
			return result;
		} catch (e: unknown) {
			this._logger.error(e,`getParticipantInfo: error getting participant info for fspId: ${fspId} - ${e}`);
			return null;
		}
	}

	async getParticipantsInfo(fspIds: string[]): Promise<IParticipant[]|null> {
		// let result: IParticipant[] = [];
		// const missingFspIds: string[] = [];
		//
		// for (const fspId of fspIds) {
		// 	const cachedResult = this._localCache.get("getParticipantInfo", fspId) as IParticipant;
		// 	if (cachedResult) {
		// 		result.push(cachedResult);
		// 	} else {
		// 		missingFspIds.push(fspId);
		// 	}
		// }
		//
		// if (missingFspIds.length === 0) {
		// 	this._logger.debug(`getParticipantsInfo: returning cached result for fspIds: ${fspIds}`);
		// 	return result;
		// }

		try {
			const participants = await this._externalParticipantClient.getParticipantsByIds(fspIds);
			// if(participants) {
			// 	participants.forEach((participant: IParticipant) => this._localCache.set(participant, "getParticipantInfo", participant.id));
			// 	result = result.concat(participants);
			// }
			return participants;

		} catch (e: unknown) {
			this._logger.error(e,`getParticipantInfo: error getting participants info for fspIds: ${fspIds} - ${e}`);
			return null;
		}
	}
}
