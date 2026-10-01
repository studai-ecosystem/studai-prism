// C3.05 — campus repository contract against the memory adapter (always runs).
import test from 'node:test'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { runCampusRepoContract } from '../test-support/campusRepoContract.js'

runCampusRepoContract(test, 'memory', async () => createMemoryCampusRepos())
