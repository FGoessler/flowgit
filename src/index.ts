#!/usr/bin/env node

import { Command } from 'commander';
import { createCommand } from './commands/create.js';
import { modifyCommand } from './commands/modify.js';
import { coCommand } from './commands/co.js';
import { submitCommand } from './commands/submit.js';
import { syncCommand } from './commands/sync.js';
import { upCommand } from './commands/up.js';
import { downCommand } from './commands/down.js';
import { logCommand } from './commands/log.js';
import { restackCommand } from './commands/restack.js';
import { todoCommand } from './commands/todo.js';

const program = new Command();

program
  .name('gf')
  .description('FlowGit - A workflow-optimized wrapper around git and gh CLI')
  .version('0.1.0');

program
  .command('create')
  .description('Create a new branch based on current changes')
  .action(async () => {
    try {
      await createCommand();
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('modify')
  .description('Amend the current commit with new changes')
  .action(async () => {
    try {
      await modifyCommand();
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('co [branch]')
  .description('Smart branch checkout')
  .action(async (branch?: string) => {
    try {
      await coCommand(branch);
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('submit')
  .description('Push branch and create/update pull request')
  .option('--current', 'Only submit current branch, not full stack')
  .action(async (options) => {
    try {
      await submitCommand(options);
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('sync')
  .description('Synchronize tracked branches with remote')
  .action(async () => {
    try {
      await syncCommand();
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('up')
  .description('Navigate to child branch in stack')
  .action(async () => {
    try {
      await upCommand();
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('down')
  .description('Navigate to parent branch in stack')
  .action(async () => {
    try {
      await downCommand();
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('log')
  .description('Display branch stack visualization')
  .action(async () => {
    try {
      await logCommand();
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('restack')
  .description('Rebase current branch and optionally children')
  .action(async () => {
    try {
      await restackCommand();
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('todo')
  .description('Show overview of PRs and branches needing attention')
  .action(async () => {
    try {
      await todoCommand();
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program.parse();
