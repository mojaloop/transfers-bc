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

import { ApprovalRequestState, IParticipant, ParticipantAccountTypes, ParticipantChangeTypes, ParticipantEndpointProtocols, ParticipantEndpointTypes, ParticipantFundsMovementDirections, ParticipantTypes } from "@mojaloop/participant-bc-public-types-lib";
import { BulkTransferState, IBulkTransfer, ITransfer, TransferErrorCodes, TransferState } from "@mojaloop/transfers-bc-public-types-lib";

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
	payerIdType: "MSISDN", 
	payeeIdType: "IBAN",
	transferType: "DEPOSIT",
	errorCode: TransferErrorCodes.TRANSFER_EXPIRED
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
	payerIdType: "MSISDN", 
	payeeIdType: "IBAN",
	transferType: "DEPOSIT",
	errorCode: TransferErrorCodes.TRANSFER_EXPIRED
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
	transferState: TransferState.ABORTED,
	ilpPacket: "omnis",
	condition: "omnis",
	fulfilment: "1",
	expirationTimestamp: now,
	completedTimestamp: now,
	settlementModel: "DEFAULT",
	hash: "randomhash",
	bulkTransferId: null,
	payerIdType: "MSISDN", 
	payeeIdType: "IBAN",
	transferType: "DEPOSIT",
	errorCode: TransferErrorCodes.TRANSFER_EXPIRED
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
	payerIdType: "MSISDN", 
	payeeIdType: "IBAN",
	transferType: "DEPOSIT",
	errorCode: TransferErrorCodes.TRANSFER_EXPIRED
};

export const mockedHubParticipant:IParticipant = {
	id: "hub",
	name: "HUB",
	type: ParticipantTypes.HUB,
	isActive: true,
	description: "Hub participant account",
	createdBy: "(system)",
	createdDate: 1694597529931,
	approved: true,
	approvedBy: "(system)",
	approvedDate: 1694597529931,
	lastUpdated: 1694597529931,
	participantAccounts: [
		{
			id: "d68edf98-8164-4982-b866-57791a9ca616",
			type: ParticipantAccountTypes.HUB_MULTILATERAL_SETTLEMENT,
			currencyCode: "EUR",
			debitBalance: null,
			creditBalance: null,
			balance: null,
			externalBankAccountId: "externalAccountId1",
			externalBankAccountName: "externalBankName1"
		},
		{
			id: "a83318b7-59cb-4830-bc7a-302b1be8929c",
			type: ParticipantAccountTypes.HUB_RECONCILIATION,
			currencyCode: "EUR",
			debitBalance: null,
			creditBalance: null,
			balance: null,
			externalBankAccountId: "externalAccountId1",
			externalBankAccountName: "externalBankName1"
		},
		{
			id: "bfee2497-3a6d-4c93-be7f-1335f84b2ebc",
			type: ParticipantAccountTypes.HUB_MULTILATERAL_SETTLEMENT,
			currencyCode: "USD",
			debitBalance: null,
			creditBalance: null,
			balance: null,
			externalBankAccountId: "externalAccountId1",
			externalBankAccountName: "externalBankName1"
		},
		{
			id: "f371b8a5-1bd1-4b30-ace5-39ca67847c1b",
			type: ParticipantAccountTypes.HUB_RECONCILIATION,
			currencyCode: "USD",
			debitBalance: null,
			creditBalance: null,
			balance: null,
			externalBankAccountId: "externalAccountId1",
			externalBankAccountName: "externalBankName1"
		},
		{
			id: "fee64a85-1cd2-4d99-b0f0-0691a05c3016",
			type: ParticipantAccountTypes.HUB_MULTILATERAL_SETTLEMENT,
			currencyCode: "MMK",
			debitBalance: null,
			creditBalance: null,
			balance: null,
			externalBankAccountId: "externalAccountId1",
			externalBankAccountName: "externalBankName1"
		},
		{
			id: "42c79887-f15b-4f2a-b6f7-ed87decdbc6b",
			type: ParticipantAccountTypes.HUB_RECONCILIATION,
			currencyCode: "MMK",
			debitBalance: null,
			creditBalance: null,
			balance: null,
			externalBankAccountId: "externalAccountId1",
			externalBankAccountName: "externalBankName1"
		},
	],
	participantEndpoints: [],
	participantAllowedSourceIps: [],
	fundsMovements: [],
	changeLog: [
		{
			changeType: ParticipantChangeTypes.CREATE,
			user: "(system)",
			timestamp: 1694597529931,
			notes: "(participants-svc bootstrap routine)",
		},
		{
			changeType: ParticipantChangeTypes.ADD_ACCOUNT,
			user: "(system)",
			timestamp: 1694597529931,
			notes: "(participants-svc bootstrap routine added HMLNS account for: [object Object])",
		},
		{
			changeType: ParticipantChangeTypes.ADD_ACCOUNT,
			user: "(system)",
			timestamp: 1694597529931,
			notes: "(participants-svc bootstrap routine added Reconciliation account for: [object Object])",
		},
		{
			changeType: ParticipantChangeTypes.ADD_ACCOUNT,
			user: "(system)",
			timestamp: 1694597529931,
			notes: "(participants-svc bootstrap routine added HMLNS account for: [object Object])",
		},
		{
			changeType: ParticipantChangeTypes.ADD_ACCOUNT,
			user: "(system)",
			timestamp: 1694597529931,
			notes: "(participants-svc bootstrap routine added Reconciliation account for: [object Object])",
		},
		{
			changeType: ParticipantChangeTypes.ADD_ACCOUNT,
			user: "(system)",
			timestamp: 1694597529931,
			notes: "(participants-svc bootstrap routine added HMLNS account for: [object Object])",
		},
		{
			changeType: ParticipantChangeTypes.ADD_ACCOUNT,
			user: "(system)",
			timestamp: 1694597529931,
			notes: "(participants-svc bootstrap routine added Reconciliation account for: [object Object])",
		},
	],
	netDebitCaps: [],
	netDebitCapChangeRequests: [],
	participantSourceIpChangeRequests: [],
	participantAccountsChangeRequest: [],
	participantContacts: [],
	participantContactInfoChangeRequests: [],
	participantStatusChangeRequests: []
};

export const mockedPayerParticipant:IParticipant = {
	id: "bluebank",
	name: "bluebank name",
	type: ParticipantTypes.DFSP,
	isActive: true,
	description: "bluebank description",
	createdBy: "admin",
	createdDate: 1694597731606,
	approved: true,
	approvedBy: "user",
	approvedDate: 1694597817360,
	lastUpdated: 1694597817360,
	participantAccounts: [
		{
			id: "4494b1a3-70e3-4bbb-b3dc-df4aa265915a",
			type: ParticipantAccountTypes.POSITION,
			currencyCode: "USD",
			creditBalance: null,
			debitBalance: null,
			balance: null,
			externalBankAccountId: "externalAccountId1",
			externalBankAccountName: "externalBankName1"
		},
		{
			id: "9b760de4-a036-4480-88aa-bc9be9692b0f",
			type: ParticipantAccountTypes.SETTLEMENT,
			currencyCode: "USD",
			creditBalance: null,
			debitBalance: null,
			balance: null,
			externalBankAccountId: "externalAccountId1",
			externalBankAccountName: "externalBankName1"
		},
	],
	participantEndpoints: [
		{
			id: "0f89dcf3-70b9-4123-b3cc-9d71faadffac",
			type: ParticipantEndpointTypes.FSPIOP,
			protocol: ParticipantEndpointProtocols["HTTPs/REST"],
			value: "http://host.docker.internal:4040",
		},
	],
	participantAllowedSourceIps: [
	],
	fundsMovements: [
		{
			id: "dcacfb6b-87a2-456f-a723-141cf0af21ff",
			createdBy: "user",
			createdDate: 1694597823737,
			direction: ParticipantFundsMovementDirections.FUNDS_DEPOSIT,
			amount: "99999999999",
			currencyCode: "USD",
			note: "",
			extReference: "",
			requestState: ApprovalRequestState.APPROVED,
			approvedBy: "admin",
			approvedDate: 1694597852070,
			rejectedBy : "",
			rejectedDate : null,
			transferId: "75586b26-99e6-4ff2-bfd6-4fd18a1954e9",
		}
	],
	changeLog: [
		{
			changeType: ParticipantChangeTypes.FUNDS_DEPOSIT,
			user: "admin",
			timestamp: 1694597852070,
			notes: null,
		},
		{
			changeType: ParticipantChangeTypes.APPROVE,
			user: "user",
			timestamp: 1694597817360,
			notes: null,
		},
		{
			changeType: ParticipantChangeTypes.ADD_ACCOUNT,
			user: "user",
			timestamp: 1694597813378,
			notes: null,
		},
		{
			changeType: ParticipantChangeTypes.ADD_ACCOUNT,
			user: "user",
			timestamp: 1694597810076,
			notes: null,
		},
		{
			changeType: ParticipantChangeTypes.ADD_ENDPOINT,
			user: "admin",
			timestamp: 1694597768469,
			notes: null,
		},
		{
			changeType: ParticipantChangeTypes.CREATE,
			user: "admin",
			timestamp: 1694597731606,
			notes: null,
		}
	],
	netDebitCaps: [],
	netDebitCapChangeRequests: [],
	participantSourceIpChangeRequests: [],
	participantAccountsChangeRequest: [],
	participantContacts: [],
	participantContactInfoChangeRequests: [],
	participantStatusChangeRequests: []
};

export const mockedPayeeParticipant:IParticipant = {
	id: "greenbank",
	name: "greenbank name",
	type: ParticipantTypes.DFSP,
	isActive: true,
	description: "greenbank description",
	createdBy: "admin",
	createdDate: 1694597741775,
	approved: true,
	approvedBy: "user",
	approvedDate: 1694597838021,
	lastUpdated: 1694597838021,
	participantAccounts: [
		{
			id: "06ae867c-5086-49d5-9769-11b6380324fe",
			type: ParticipantAccountTypes.POSITION,
			currencyCode: "USD",
			creditBalance: null,
			debitBalance: null,
			balance: null,
			externalBankAccountId: "externalAccountId1",
			externalBankAccountName: "externalBankName1"
		},
		{
			id: "131d46b0-6c15-41f2-a140-cae3e3f03744",
			type: ParticipantAccountTypes.SETTLEMENT,
			currencyCode: "USD",
			creditBalance: null,
			debitBalance: null,
			balance: null,
			externalBankAccountId: "externalAccountId1",
			externalBankAccountName: "externalBankName1"
		}
	],
	participantEndpoints: [
		{
			id: "5d9aac87-8c37-4c0f-95b4-e70df3e0db4c",
			type: ParticipantEndpointTypes.FSPIOP,
			protocol: ParticipantEndpointProtocols["HTTPs/REST"],
			value: "http://host.docker.internal:4041",
		}
	],
	participantAllowedSourceIps: [],
	fundsMovements: [
		{
			id: "2e1a6462-0fdd-4cdd-95cb-e8534274ebeb",
			createdBy: "user",
			createdDate: 1694597841878,
			direction: ParticipantFundsMovementDirections.FUNDS_DEPOSIT,
			amount: "99999999999",
			currencyCode: "USD",
			note: "",
			extReference: "",
			requestState: ApprovalRequestState.APPROVED,
			approvedBy: "admin",
			approvedDate: 1694597855364,
			rejectedBy : "",
			rejectedDate : null,
			transferId: "ff1f6303-5fd6-43bb-9272-90354f453d43",
		}
	],
	changeLog: [
		{
			changeType: ParticipantChangeTypes.FUNDS_DEPOSIT,
			user: "admin",
			timestamp: 1694597855364,
			notes: null,
		},
		{
			changeType: ParticipantChangeTypes.APPROVE,
			user: "user",
			timestamp: 1694597838021,
			notes: null,
		},
		{
			changeType: ParticipantChangeTypes.ADD_ACCOUNT,
			user: "user",
			timestamp: 1694597837153,
			notes: null,
		},
		{
			changeType: ParticipantChangeTypes.ADD_ACCOUNT,
			user: "user",
			timestamp: 1694597834214,
			notes: null,
		},
		{
			changeType: ParticipantChangeTypes.ADD_ENDPOINT,
			user: "admin",
			timestamp: 1694597778279,
			notes: null,
		},
		{
			changeType: ParticipantChangeTypes.CREATE,
			user: "admin",
			timestamp: 1694597741775,
			notes: null,
		},
	],
	netDebitCaps: [],
	netDebitCapChangeRequests: [],
	participantSourceIpChangeRequests: [],
	participantAccountsChangeRequest: [],
	participantContacts: [],
	participantContactInfoChangeRequests: [],
	participantStatusChangeRequests: []
};

export const mockedParticipantTransferAccounts = {
	"hubAccount": {
		"id": "f371b8a5-1bd1-4b30-ace5-39ca67847c1b",
		"type": "HUB_RECONCILIATION",
		"currencyCode": "USD",
		"debitBalance": null,
		"creditBalance": null,
		"balance": null
	},
	"payerPosAccount": {
		"id": "4494b1a3-70e3-4bbb-b3dc-df4aa265915a",
		"type": "POSITION",
		"currencyCode": "USD",
		"creditBalance": null,
		"debitBalance": null,
		"balance": null
	},
	"payerLiqAccount": {
		"id": "9b760de4-a036-4480-88aa-bc9be9692b0f",
		"type": "SETTLEMENT",
		"currencyCode": "USD",
		"creditBalance": null,
		"debitBalance": null,
		"balance": null
	},
	"payeePosAccount": {
		"id": "06ae867c-5086-49d5-9769-11b6380324fe",
		"type": "POSITION",
		"currencyCode": "USD",
		"creditBalance": null,
		"debitBalance": null,
		"balance": null
	},
	"payeeLiqAccount": {
		"id": "131d46b0-6c15-41f2-a140-cae3e3f03744",
		"type": "SETTLEMENT",
		"currencyCode": "USD",
		"creditBalance": null,
		"debitBalance": null,
		"balance": null
	}
};

export const mockedBulkTransfer1 : IBulkTransfer = {
	createdAt: now,
	updatedAt: now,
    bulkTransferId: "1",
    bulkQuoteId: "1",
    payeeFsp: "greenbank",
    payerFsp: "bluebank",
    completedTimestamp: null,
    individualTransfers: [{
		"transferId": "1",
		"transferAmount": {
			"currency": "USD",
			"amount": "10"
		},
		"ilpPacket": "AYICbQAAAAAAAAPoHGcuYmx1ZWJhbmsubXNpc2RuLmJsdWVfYWNjXzGCAkRleUowY21GdWMyRmpkR2x2Ymtsa0lqb2lPV1kxWkRrM09EUXRNMkUxTnkwMU9EWTFMVGxoWVRBdE4yUmtaVGMzT1RFMU5EZ3hJaXdpY1hWdmRHVkpaQ0k2SW1ZMU5UaGtORFE0TFRCbU1UQXROREF4TmkwNE9ESXpMVEU1TjJObU5qZ3haamhrWmlJc0luQmhlV1ZsSWpwN0luQmhjblI1U1dSSmJtWnZJanA3SW5CaGNuUjVTV1JVZVhCbElqb2lUVk5KVTBST0lpd2ljR0Z5ZEhsSlpHVnVkR2xtYVdWeUlqb2lZbXgxWlY5aFkyTmZNU0lzSW1aemNFbGtJam9pWW14MVpXSmhibXNpZlgwc0luQmhlV1Z5SWpwN0luQmhjblI1U1dSSmJtWnZJanA3SW5CaGNuUjVTV1JVZVhCbElqb2lUVk5KVTBST0lpd2ljR0Z5ZEhsSlpHVnVkR2xtYVdWeUlqb2laM0psWlc1ZllXTmpYekVpTENKbWMzQkpaQ0k2SW1keVpXVnVZbUZ1YXlKOWZTd2lZVzF2ZFc1MElqcDdJbU4xY25KbGJtTjVJam9pUlZWU0lpd2lZVzF2ZFc1MElqb2lNVEFpZlN3aWRISmhibk5oWTNScGIyNVVlWEJsSWpwN0luTmpaVzVoY21sdklqb2lSRVZRVDFOSlZDSXNJbWx1YVhScFlYUnZjaUk2SWxCQldVVlNJaXdpYVc1cGRHbGhkRzl5Vkhsd1pTSTZJa0pWVTBsT1JWTlRJbjE5AA",
		"condition": "STksBXN1-J5HnG_4owlzKnbmzCfiOlrKDPgiR-QZ7Kg",
		"extensionList": null
	}],
    expiration: 2697585442210,
    transfersPreparedProcessedIds: [],
    transfersNotProcessedIds: [],
    transfersFulfiledProcessedIds: [],
    status: BulkTransferState.RECEIVED,
	errorCode: null,
    extensionList: null
};

export const mockedBulkTransfer2 : IBulkTransfer = {
	createdAt: now,
	updatedAt: now,
    bulkTransferId: "2",
    bulkQuoteId: "2",
    payeeFsp: "greenbank",
    payerFsp: "bluebank",
    completedTimestamp: null,
    individualTransfers: [{
		"transferId": "2",
		"transferAmount": {
			"currency": "USD",
			"amount": "10"
		},
		"ilpPacket": "AYICbQAAAAAAAAPoHGcuYmx1ZWJhbmsubXNpc2RuLmJsdWVfYWNjXzGCAkRleUowY21GdWMyRmpkR2x2Ymtsa0lqb2lPV1kxWkRrM09EUXRNMkUxTnkwMU9EWTFMVGxoWVRBdE4yUmtaVGMzT1RFMU5EZ3hJaXdpY1hWdmRHVkpaQ0k2SW1ZMU5UaGtORFE0TFRCbU1UQXROREF4TmkwNE9ESXpMVEU1TjJObU5qZ3haamhrWmlJc0luQmhlV1ZsSWpwN0luQmhjblI1U1dSSmJtWnZJanA3SW5CaGNuUjVTV1JVZVhCbElqb2lUVk5KVTBST0lpd2ljR0Z5ZEhsSlpHVnVkR2xtYVdWeUlqb2lZbXgxWlY5aFkyTmZNU0lzSW1aemNFbGtJam9pWW14MVpXSmhibXNpZlgwc0luQmhlV1Z5SWpwN0luQmhjblI1U1dSSmJtWnZJanA3SW5CaGNuUjVTV1JVZVhCbElqb2lUVk5KVTBST0lpd2ljR0Z5ZEhsSlpHVnVkR2xtYVdWeUlqb2laM0psWlc1ZllXTmpYekVpTENKbWMzQkpaQ0k2SW1keVpXVnVZbUZ1YXlKOWZTd2lZVzF2ZFc1MElqcDdJbU4xY25KbGJtTjVJam9pUlZWU0lpd2lZVzF2ZFc1MElqb2lNVEFpZlN3aWRISmhibk5oWTNScGIyNVVlWEJsSWpwN0luTmpaVzVoY21sdklqb2lSRVZRVDFOSlZDSXNJbWx1YVhScFlYUnZjaUk2SWxCQldVVlNJaXdpYVc1cGRHbGhkRzl5Vkhsd1pTSTZJa0pWVTBsT1JWTlRJbjE5AA",
		"condition": "STksBXN1-J5HnG_4owlzKnbmzCfiOlrKDPgiR-QZ7Kg",
		"extensionList": null
	}],
    expiration: 2697585442210,
    transfersPreparedProcessedIds: [],
    transfersNotProcessedIds: [],
    transfersFulfiledProcessedIds: [],
    status: BulkTransferState.PROCESSING,
	errorCode: null,
    extensionList: null
};

export const mockedTransfers : ITransfer[] = [
	mockedTransfer1,
	mockedTransfer2,
	mockedTransfer3,
	mockedTransfer4,
];
