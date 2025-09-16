#!/usr/bin/env node
// Thin wrapper that reuses the root CLI implementation while packaging it under the aggo package
import { cliMain } from '../../../src/cli'

cliMain()
