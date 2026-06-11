#!/usr/bin/env node
// Dev launcher — runs the Vite frontend and the Express API together.
//
// Why not `concurrently`? In non-interactive / piped shells (CI, some VS Code
// terminals) concurrently can exit as soon as stdin reaches EOF, tearing down
// both child processes even though they started fine. This launcher uses
// child_process directly, keeps the parent alive via the child handles, and
// shuts both down cleanly on Ctrl+C or when either child exits.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import process from 'node:process'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Point at Vite's bin file on disk directly. require.resolve('vite/bin/vite.js')
// is blocked by Vite's package "exports" map, and the node_modules/.bin shims
// are only on PATH when npm injects them — so we resolve the real file path and
// run it with Node. Works in any shell (npm, bare terminal, CI).
const viteBin = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')
if (!fs.existsSync(viteBin)) {
  console.error(`[dev] Could not find Vite at ${viteBin}. Run "npm install" first.`)
  process.exit(1)
}

const targets = [
  { name: 'web', color: '\x1b[35m', cmd: process.execPath, args: [viteBin] },
  { name: 'api', color: '\x1b[36m', cmd: process.execPath, args: ['server/index.js'] },
]

const RESET = '\x1b[0m'
const children = []
let shuttingDown = false

function prefix(name, color) {
  return `${color}[${name}]${RESET} `
}

function pipeWithPrefix(stream, name, color, out) {
  let buffer = ''
  stream.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) out.write(prefix(name, color) + line + '\n')
  })
  stream.on('end', () => {
    if (buffer.length) out.write(prefix(name, color) + buffer + '\n')
  })
}

function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  // Give children a moment to exit, then force-quit the launcher.
  setTimeout(() => process.exit(code ?? 0), 300)
}

for (const target of targets) {
  const child = spawn(target.cmd, target.args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(child)

  pipeWithPrefix(child.stdout, target.name, target.color, process.stdout)
  pipeWithPrefix(child.stderr, target.name, target.color, process.stderr)

  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    process.stdout.write(
      prefix(target.name, target.color) +
        `exited (${signal || `code ${code}`}) — stopping the other process.\n`,
    )
    shutdown(code ?? 1)
  })

  child.on('error', (err) => {
    process.stderr.write(prefix(target.name, target.color) + `failed to start: ${err.message}\n`)
    shutdown(1)
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
