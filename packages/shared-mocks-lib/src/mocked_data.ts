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

import { ITransfer, TransferState } from "@mojaloop/transfers-bc-domain-lib";

const now = Date.now();

export const mockedTransfer1 : ITransfer = {
	createdAt: now,
	updatedAt: now,
    payerFspId: "payer",
    payeeFspId: "payee",
    transferId: "1",
    amount: "200",
    currencyCode: "EUR",
	extensionList: {
      extension: [
        {
          key: "key",
          value: "value"
        }
      ]
    },
    transferState: TransferState.COMMITTED,
    ilpPacket: "omnis",
    condition: "omnis",
    fulfilment: "1",
    expirationTimestamp: now,
	completedTimestamp: now,
	settlementModel: "DEFAULT",
	hash: "randomhash",
	bulkTransferId: null,
	errorInformation: {
      errorCode: "8562",
      errorDescription: "aliquip",
      extensionList: {
        extension: [
          {
            key: "ad aliqua dolor reprehende",
            value: "ipsum aliq"
          },
          {
            key: "la",
            value: "commodo dolore et"
          }
        ]
      }
    }
};

export const mockedTransfer2 : ITransfer = {
	createdAt: now,
	updatedAt: now,
	payerFspId: "2",
	payeeFspId: "11",
	transferId: "2",
	amount: "300",
	currencyCode: "USD",
	extensionList: {
		extension: [
		{
			key: "key",
			value: "value"
		}
		]
	},
	transferState: TransferState.RESERVED,
	ilpPacket: "omnis",
	condition: "omnis",
	fulfilment: "1",
	expirationTimestamp: now,
	completedTimestamp: now,
	settlementModel: "DEFAULT",
	hash: "randomhash",
	bulkTransferId: null,
	errorInformation: {
		errorCode: "8562",
		errorDescription: "aliquip",
		extensionList: {
			extension: [
				{
					key: "ad aliqua dolor reprehende",
					value: "ipsum aliq"
				},
				{
					key: "la",
					value: "commodo dolore et"
				}
			]
		}
	}
};

export const mockedTransfer3 : ITransfer = {
	createdAt: now,
	updatedAt: now,
	payerFspId: "3",
	payeeFspId: "12",
	transferId: "3",
	amount: "400",
	currencyCode: "USD",
	extensionList: {
		extension: [
		{
			key: "key",
			value: "value"
		}
		]
	},
	transferState: TransferState.REJECTED,
	ilpPacket: "omnis",
	condition: "omnis",
	fulfilment: "1",
	expirationTimestamp: now,
	completedTimestamp: now,
	settlementModel: "DEFAULT",
	hash: "randomhash",
	bulkTransferId: null,
	errorInformation: {
		errorCode: "8562",
		errorDescription: "aliquip",
		extensionList: {
		extension: [
				{
					key: "ad aliqua dolor reprehende",
					value: "ipsum aliq"
				},
				{
					key: "la",
					value: "commodo dolore et"
				}
			]
		}
	}
};

export const mockedTransfer4 : ITransfer = {
	createdAt: now,
	updatedAt: now,
	payerFspId: "4",
	payeeFspId: "13",
	transferId: "4",
	amount: "1000",
	currencyCode: "EUR",
	extensionList: {
		extension: [
		{
			key: "key",
			value: "value"
		}
		]
	},
	transferState: TransferState.COMMITTED,
	ilpPacket: "omnis",
	condition: "omnis",
	fulfilment: "1",
	expirationTimestamp: now,
	completedTimestamp: now,
	settlementModel: "DEFAULT",
	hash: "randomhash",
	bulkTransferId: null,
	errorInformation: {
		errorCode: "8562",
		errorDescription: "aliquip",
		extensionList: {
		extension: [
				{
					key: "ad aliqua dolor reprehende",
					value: "ipsum aliq"
				},
				{
					key: "la",
					value: "commodo dolore et"
				}
			]
		}
	}
};

export const mockedTransfers : ITransfer[] = [
  mockedTransfer1,
  mockedTransfer2,
  mockedTransfer3,
  mockedTransfer4
];
