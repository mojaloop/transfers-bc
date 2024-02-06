# transfers-bc
**EXPERIMENTAL** vNext Transfers Bounded Context


[![Git Commit](https://img.shields.io/github/last-commit/mojaloop/transfers-bc.svg?style=flat)](https://github.com/mojaloop/transfers-bc/commits/master)
[![Git Releases](https://img.shields.io/github/release/mojaloop/transfers-bc.svg?style=flat)](https://github.com/mojaloop/transfers-bc/releases)
[![Docker pulls](https://img.shields.io/docker/pulls/mojaloop/transfers-bc.svg?style=flat)](https://hub.docker.com/r/mojaloop/transfers-bc)
[![CircleCI](https://circleci.com/gh/mojaloop/transfers-bc.svg?style=svg)](https://circleci.com/gh/mojaloop/transfers-bc)

The Transfers BC is responsible for orchestrating transfer requests. 

It works in concert with a number of other BCs, notably Settlements, Scheduling, Participant Lifecycle Management, Accounts & Balances, and the FSPIOP.

## Contents
- [transfers-bc](#transfers-bc)
  - [Contents](#contents)
  - [Packages](#packages)
  - [Running Locally](#running-locally)
  - [Configuration](#configuration)
  - [API](#api)
  - [Logging](#logging)
  - [Tests](#tests)
  - [Auditing Dependencies](#auditing-dependencies)
  - [Container Scans](#container-scans)
  - [Automated Releases](#automated-releases)
    - [Potential problems](#potential-problems)
  - [Documentation](#documentation)

## Packages
The Transfers BC consists of the following packages;

`public-types-lib`
Public shared types.
[README](./packages/public-types-lib/README.md)

`domain-lib`
Domain library types.
[README](./packages/domain-lib/README.md)

`infrastructure-lib`
Infrastructure library.
[README](./packages/infrastructure-lib/README.md)

`transfers-api-svc`
HTTP service for transfers BC.
[README](packages/tranfers-api-svc/README.md)

`event-handler-svc`
Event handler service for transfers BC.
[README](packages/event-handler-svc/README.md)

`command-handler-svc`
Command handler service for transfers BC.
[README](packages/command-handler-svc/README.md)

`transfers-model-lib`
Transfer configuration library for Transfers BC.
[README](./packages/transfers-config-lib/README.md)

`shared-mocks-lib`
Mock implementation used for testing.
[README](./packages/shared-mocks-lib/README.md)

## Running Locally

Please follow the instruction in [Onboarding Document](Onboarding.md) to setup and run the service locally.

## Configuration

See the README.md file on each services for more Environment Variable Configuration options.

## API

For endpoint documentation, see the [API documentation](https://docs.mojaloop.io/api/fspiop/v1.1/api-definition.html#api-resource-transfers).

## Documentation
The following documentation provides insight into the Transfers Bounded Context.

- **Reference Architecture** - https://mojaloop.github.io/reference-architecture-doc/boundedContexts/transfers/
- **MIRO Board** - https://miro.com/app/board/o9J_lJyA1TA=/
- **Work Sessions** - https://docs.google.com/document/d/1Nm6B_tSR1mOM0LEzxZ9uQnGwXkruBeYB2slgYK1Kflo/edit#heading=h.6w64vxvw6er4

## Logging

Logs are sent to standard output by default.

## Tests

### Unit Tests

```bash
npm run test:unit
```

### Run Integration Tests

```shell
npm run test:integration
```

### Run all tests at once
Requires integration tests pre-requisites
```shell
npm run test
```

# Collect coverage (from both unit and integration test types)

After running the unit and/or integration tests: 

```shell
npm run posttest
```

You can then consult the html report in:

```shell
coverage/lcov-report/index.html
```