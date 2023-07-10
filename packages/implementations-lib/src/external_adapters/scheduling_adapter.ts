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
import { SchedulingClient, ReminderTaskType, IReminder } from "@mojaloop/scheduling-bc-client";
import { ISchedulingServiceAdapter } from "@mojaloop/transfers-bc-domain-lib";
import {TransfersBCTopics} from "@mojaloop/platform-shared-lib-public-messages-lib";

export class SchedulingAdapter implements ISchedulingServiceAdapter {
	private readonly _logger: ILogger;
	private readonly _clientBaseUrl: string;
	private readonly _externalSchedulingClient: SchedulingClient;

	constructor(
		logger: ILogger,
		clientBaseUrl: string,
	) {
		this._logger = logger.createChild(this.constructor.name);
		this._clientBaseUrl = clientBaseUrl;
		this._externalSchedulingClient = new SchedulingClient(logger, this._clientBaseUrl, 5000);
	}

	async createReminder(id: string, time: string, payload: any): Promise<string> {
		try {
			const result = await this._externalSchedulingClient.createReminder({ 
				id: id, 
				time: time, 
				payload: payload,
				taskType: ReminderTaskType.EVENT,
				httpPostTaskDetails: null,
				eventTaskDetails: {
					topic: TransfersBCTopics.TimeoutEvents
				}
			}
		);

			return result;
		} catch (e: unknown) {
			this._logger.error(e,`createReminder: error creating reminder - ${e}`);
			throw e;
        }
	}

	async getReminder(id: string): Promise<IReminder | null> {
		try {
			const result = await this._externalSchedulingClient.getReminder(id);

			return result;
		} catch (e: unknown) {
			this._logger.error(e,`createReminder: error getting reminder - ${e}`);
			throw e;
        }
	}

	async deleteReminder(id: string): Promise<void> {
		try {
			const result = await this._externalSchedulingClient.deleteReminder(id);

			return result;
		} catch (e: unknown) {
			this._logger.error(e,`createReminder: error deleting reminder - ${e}`);
			throw e;
        }
	}

}
