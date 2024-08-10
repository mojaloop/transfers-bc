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



import {DomainEventMsg} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {
    TRANSFERS_AGGREGATE_NAME,
    TRANSFERS_BOUNDED_CONTEXT_NAME,
    TransfersBCTopics
} from "@mojaloop/platform-shared-lib-public-messages-lib";


export class CheckExpiredTimerTickEvt extends DomainEventMsg {
    boundedContextName: string = TRANSFERS_BOUNDED_CONTEXT_NAME;
    aggregateId: string;
    aggregateName: string = TRANSFERS_AGGREGATE_NAME;
    msgKey: string;
    msgTopic: string = TransfersBCTopics.TimeoutEvents;
    payload: null;

    constructor () {
        super();

        // Note: fixed msgKey, so all CheckExpiredTimerTickEvt end up in the same partition
        // this is important, we only want to have one handler (consumer group) handing these events
        // Nothing bad will happen if not, just not efficient having multiple instances doing the same work
        this.aggregateId = this.msgKey = "0";
        //this.payload = payload;
    }

    validatePayload (): void {
        // noop
    }
}
