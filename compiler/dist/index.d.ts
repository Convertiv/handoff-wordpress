#!/usr/bin/env node
/**
 * Gutenberg Compiler
 *
 * Transpiles Handoff components to WordPress Gutenberg blocks.
 *
 * Usage:
 *   npx gutenberg-compile <component-name> [options]
 *
 * Options:
 *   --api-url <url>    Handoff API base URL (default: http://localhost:4000)
 *   --output <dir>     Output directory for blocks (default: ./blocks)
 *   --all              Compile all available components
 *   --theme            Compile header/footer to theme templates
 *   --validate         Validate a component for breaking changes
 *   --validate-all     Validate all components for breaking changes
 *
 * Configuration:
 *   Create a handoff-wp.config.json file in your project root to set defaults:
 *   {
 *     "apiUrl": "https://demo.handoff.com",
 *     "output": "./path/to/blocks",
 *     "themeDir": "./path/to/theme"
 *   }
 */
import { HandoffComponent, CompilerOptions, GeneratedBlock, ImportConfig } from './types';
/**
 * Auth credentials for HTTP requests
 */
interface AuthCredentials {
    username?: string;
    password?: string;
}
/**
 * Required config with defaults applied
 */
interface ResolvedConfig {
    apiUrl: string;
    output: string;
    themeDir: string;
    username?: string;
    password?: string;
    import: ImportConfig;
    groups: Record<string, 'merged' | 'individual'>;
    schemaMigrations?: Record<string, Record<string, {
        renames?: Record<string, string>;
        transforms?: Record<string, {
            from: string;
            to: string;
            rule: string;
        }>;
    }>>;
}
import type { SchemaHistory } from './validators';
/**
 * Fetch component data from Handoff API
 */
declare const fetchComponent: (apiUrl: string, componentName: string, auth?: AuthCredentials) => Promise<HandoffComponent>;
/**
 * Generate all block files from a component
 * @param component - The Handoff component data
 * @param apiUrl - The base API URL for fetching screenshots
 * @param resolvedConfig - The resolved configuration including dynamic array settings
 */
declare const generateBlock: (component: HandoffComponent, apiUrl: string, resolvedConfig: ResolvedConfig, schemaHistory?: SchemaHistory) => GeneratedBlock;
/**
 * Main compilation function
 */
declare const compile: (options: CompilerOptions) => Promise<void>;
export { compile, generateBlock, fetchComponent };
