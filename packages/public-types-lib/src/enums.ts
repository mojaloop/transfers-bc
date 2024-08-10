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

 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>

 * Crosslake
 - Pedro Sousa Barreto <pedrob@crosslaketech.com>

 * Arg Software
 - José Antunes <jose.antunes@arg.software>
 - Rui Rocha <rui.rocha@arg.software>

 --------------
 ******/

"use strict";

export declare const enum TransferState {
    RECEIVED = "RECEIVED", 		// initial state
	RESERVED = "RESERVED", 		// after prepare
    COMMITTED = "COMMITTED", 	// after fulfil (final state of successful transfer)
    ABORTED = "ABORTED" 		// failed to perform the transfer or expired
}

export declare const enum BulkTransferState {
    RECEIVED = "RECEIVED", 		// initial state
	PENDING = "PENDING", 		// after prepare
	ACCEPTED = "ACCEPTED", 		// when fulfil starts
    PROCESSING = "PROCESSING", 	// while fulfiling each individual transfer
    COMPLETED = "COMPLETED", 	// after fulfil (final state of processing all individual transfers)
    REJECTED = "REJECTED"		// payee reject to process the bulk transfer
}

type TransferErrorCodeKeys = keyof typeof TransferErrorCodes;

export const TransferErrorCodes = {
    COMMAND_TYPE_UNKNOWN: "Command type is unknown",
    UNABLE_TO_GET_TRANSFER: "Unable to get transfer",
    UNABLE_TO_ADD_TRANSFER: "Unable to add transfer",
    UNABLE_TO_UPDATE_TRANSFER: "Unable to update transfer",
    UNABLE_TO_CANCEL_TRANSFER_RESERVATION: "Unable to cancel transfer reservation",
    UNABLE_TO_CANCEL_TRANSFER_RESERVATION_AND_COMMIT: "Unable to cancel transfer reservation and commit",
    TRANSFER_NOT_FOUND: "Transfer not found",
    TRANSFER_EXPIRED: "The transfer has surpassed its expiration time",
    TRANSFER_LIQUIDITY_CHECK_FAILED: "Transfer liquidity check failed",
    TRANSFER_REJECTED_BY_PAYEE: "Transfer rejected by payee",
    UNABLE_TO_GET_TRANSFER_SETTLEMENT_MODEL: "Unable to get transfer settlement model",
    UNABLE_TO_CREATE_TRANSFER_REMINDER: "Unable to create transfer reminder",
    HUB_NOT_FOUND: "Hub not found",
    HUB_PARTICIPANT_ID_MISMATCH: "Hub participant id mismatch",
    HUB_PARTICIPANT_NOT_APPROVED: "Hub participant not approved",
    HUB_PARTICIPANT_NOT_ACTIVE: "Hub participant not active",
    PAYER_PARTICIPANT_NOT_FOUND: "Payer participant not found",
    PAYER_PARTICIPANT_ID_MISMATCH: "Payer participant id mismatch",
    PAYER_PARTICIPANT_NOT_APPROVED: "Payer participant not approved",
    PAYER_PARTICIPANT_NOT_ACTIVE: "Payer participant not active",
    PAYEE_PARTICIPANT_NOT_FOUND: "Payee participant not found",
    PAYEE_PARTICIPANT_ID_MISMATCH: "Payee participant id mismatch",
    PAYEE_PARTICIPANT_NOT_APPROVED: "Payee participant not approved",
    PAYEE_PARTICIPANT_NOT_ACTIVE: "Payee participant not active",
    HUB_ACCOUNT_NOT_FOUND: "Hub account not found",
    PAYER_POSITION_ACCOUNT_NOT_FOUND: "Payer position account not found",
    PAYER_LIQUIDITY_ACCOUNT_NOT_FOUND: "Payer liquidity account not found",
    PAYEE_POSITION_ACCOUNT_NOT_FOUND: "Payee position account not found",
    PAYEE_LIQUIDITY_ACCOUNT_NOT_FOUND: "Payee liquidity account not found",
    BULK_TRANSFERS_NO_ITEMS: "Bulk transfers has no items",
    UNABLE_TO_GET_BULK_TRANSFER: "Unable to get bulk transfer",
    BULK_TRANSFER_NOT_FOUND: "Bulk transfer not found",
    UNABLE_TO_GET_TRANSFERS_FROM_BULK_TRANSFER: "Unable to get transfers from bulk transfer",
    UNABLE_TO_ADD_BULK_TRANSFER: "Unable to add bulk transfer",
    UNABLE_TO_DELETE_TRANSFER_REMINDER: "Unable to delete transfer reminder",
    DUPLICATE_TRANSFER_ID_DETECTED: "Another transfer with the same ID and different contents was found",
    DUPLICATE_TRANSFER_ID_DETECTED_IN_UNEXPECTED_STATE: "Another transfer with the same ID was found with an unexpected state",
} as const;

export const TransferErrorCodeNames: {
    [K in TransferErrorCodeKeys]: K;
  } = {
    COMMAND_TYPE_UNKNOWN: "COMMAND_TYPE_UNKNOWN",
    UNABLE_TO_GET_TRANSFER: "UNABLE_TO_GET_TRANSFER",
    UNABLE_TO_ADD_TRANSFER: "UNABLE_TO_ADD_TRANSFER",
    UNABLE_TO_UPDATE_TRANSFER: "UNABLE_TO_UPDATE_TRANSFER",
    UNABLE_TO_CANCEL_TRANSFER_RESERVATION: "UNABLE_TO_CANCEL_TRANSFER_RESERVATION",
    UNABLE_TO_CANCEL_TRANSFER_RESERVATION_AND_COMMIT: "UNABLE_TO_CANCEL_TRANSFER_RESERVATION_AND_COMMIT",
    TRANSFER_NOT_FOUND: "TRANSFER_NOT_FOUND",
    TRANSFER_EXPIRED: "TRANSFER_EXPIRED",
    TRANSFER_LIQUIDITY_CHECK_FAILED: "TRANSFER_LIQUIDITY_CHECK_FAILED",
    TRANSFER_REJECTED_BY_PAYEE: "TRANSFER_REJECTED_BY_PAYEE",
    UNABLE_TO_GET_TRANSFER_SETTLEMENT_MODEL: "UNABLE_TO_GET_TRANSFER_SETTLEMENT_MODEL",
    UNABLE_TO_CREATE_TRANSFER_REMINDER: "UNABLE_TO_CREATE_TRANSFER_REMINDER",
    HUB_NOT_FOUND: "HUB_NOT_FOUND",
    HUB_PARTICIPANT_ID_MISMATCH: "HUB_PARTICIPANT_ID_MISMATCH",
    HUB_PARTICIPANT_NOT_APPROVED: "HUB_PARTICIPANT_NOT_APPROVED",
    HUB_PARTICIPANT_NOT_ACTIVE: "HUB_PARTICIPANT_NOT_ACTIVE",
    PAYER_PARTICIPANT_NOT_FOUND: "PAYER_PARTICIPANT_NOT_FOUND",
    PAYER_PARTICIPANT_ID_MISMATCH: "PAYER_PARTICIPANT_ID_MISMATCH",
    PAYER_PARTICIPANT_NOT_APPROVED: "PAYER_PARTICIPANT_NOT_APPROVED",
    PAYER_PARTICIPANT_NOT_ACTIVE: "PAYER_PARTICIPANT_NOT_ACTIVE",
    PAYEE_PARTICIPANT_NOT_FOUND: "PAYEE_PARTICIPANT_NOT_FOUND",
    PAYEE_PARTICIPANT_ID_MISMATCH: "PAYEE_PARTICIPANT_ID_MISMATCH",
    PAYEE_PARTICIPANT_NOT_APPROVED: "PAYEE_PARTICIPANT_NOT_APPROVED",
    PAYEE_PARTICIPANT_NOT_ACTIVE: "PAYEE_PARTICIPANT_NOT_ACTIVE",
    HUB_ACCOUNT_NOT_FOUND: "HUB_ACCOUNT_NOT_FOUND",
    PAYER_POSITION_ACCOUNT_NOT_FOUND: "PAYER_POSITION_ACCOUNT_NOT_FOUND",
    PAYER_LIQUIDITY_ACCOUNT_NOT_FOUND: "PAYER_LIQUIDITY_ACCOUNT_NOT_FOUND",
    PAYEE_POSITION_ACCOUNT_NOT_FOUND: "PAYEE_POSITION_ACCOUNT_NOT_FOUND",
    PAYEE_LIQUIDITY_ACCOUNT_NOT_FOUND: "PAYEE_LIQUIDITY_ACCOUNT_NOT_FOUND",
    BULK_TRANSFERS_NO_ITEMS: "BULK_TRANSFERS_NO_ITEMS",
    UNABLE_TO_GET_BULK_TRANSFER: "UNABLE_TO_GET_BULK_TRANSFER",
    BULK_TRANSFER_NOT_FOUND: "BULK_TRANSFER_NOT_FOUND",
    UNABLE_TO_GET_TRANSFERS_FROM_BULK_TRANSFER: "UNABLE_TO_GET_TRANSFERS_FROM_BULK_TRANSFER",
    UNABLE_TO_ADD_BULK_TRANSFER: "UNABLE_TO_ADD_BULK_TRANSFER",
    UNABLE_TO_DELETE_TRANSFER_REMINDER: "UNABLE_TO_DELETE_TRANSFER_REMINDER",
    DUPLICATE_TRANSFER_ID_DETECTED: "DUPLICATE_TRANSFER_ID_DETECTED",
    DUPLICATE_TRANSFER_ID_DETECTED_IN_UNEXPECTED_STATE: "DUPLICATE_TRANSFER_ID_DETECTED_IN_UNEXPECTED_STATE"
  };
