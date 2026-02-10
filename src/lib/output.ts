import chalk from 'chalk';
import ora, { Ora } from 'ora';

/**
 * Display a success message
 */
export function success(message: string): void {
  console.log(chalk.green('✓') + ' ' + message);
}

/**
 * Display an error message
 */
export function error(message: string): void {
  console.log(chalk.red('✗') + ' ' + message);
}

/**
 * Display a warning message
 */
export function warning(message: string): void {
  console.log(chalk.yellow('⚠') + ' ' + message);
}

/**
 * Display an info message
 */
export function info(message: string): void {
  console.log(chalk.blue('ℹ') + ' ' + message);
}

/**
 * Display a message without icon
 */
export function log(message: string): void {
  console.log(message);
}

/**
 * Create and start a spinner
 */
export function spinner(message: string): Ora {
  return ora(message).start();
}

/**
 * Display a separator line
 */
export function separator(): void {
  console.log(chalk.gray('─'.repeat(50)));
}
