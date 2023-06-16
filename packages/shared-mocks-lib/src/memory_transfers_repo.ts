/**
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
import { ITransfersRepository, ITransfer } from "@mojaloop/transfers-bc-domain-lib";

export class MemoryTransferRepo implements ITransfersRepository {
	private readonly _logger: ILogger;
    private readonly _transfers: ITransfer[] = [];

	constructor(
		logger: ILogger,
	) {
		this._logger = logger;
	}

    init(): Promise<void> {
        return Promise.resolve();
    }
    
    destroy(): Promise<void> {
        return Promise.resolve();
    }

    addTransfer(transfer: ITransfer): Promise<string> {
        this._transfers.push(transfer);
        return Promise.resolve(transfer.transferId);
    }

    addTransfers(transfers: ITransfer[]): Promise<void> {
        this._transfers.push(...transfers);
        return Promise.resolve();
    }

    updateTransfer(transfer: ITransfer): Promise<void> {
        const transferToUpdate = this._transfers.find(q => q.transferId === transfer.transferId);
        if (transferToUpdate) {
            Object.assign(transferToUpdate, transfer);
        }
        else{
            throw new Error(`Transfer with id ${transfer.transferId} not found`);
        }
        return Promise.resolve();
    }
    
    removeTransfer(id: string): Promise<void> {
        this._transfers.splice(this._transfers.findIndex(q => q.transferId === id), 1);
        return Promise.resolve();
    }

    getTransferById(id: string): Promise<ITransfer | null> {
        return Promise.resolve(this._transfers.find(q => q.transferId === id) || null);
    }

    getTransfers(): Promise<ITransfer[]> {
        return Promise.resolve(this._transfers);
    }

    searchTransfers(state?: string, currencyCode?: string, startDate?: number, endDate?: number, id?: string): Promise<ITransfer[]> {
        return Promise.resolve(this._transfers);
    }

    storeTransfers(transfers:ITransfer[]):Promise<void> {
        return Promise.resolve();
    }
}
