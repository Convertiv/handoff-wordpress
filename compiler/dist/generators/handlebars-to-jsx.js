"use strict";
/**
 * Handlebars to JSX Transpiler
 *
 * This file re-exports from the modular implementation in the handlebars-to-jsx folder.
 * The implementation is split into logical modules for better maintainability:
 *
 * - types.ts: Type definitions
 * - constants.ts: HTML to JSX attribute mapping and other constants
 * - utils.ts: String utilities and helper functions
 * - expression-parser.ts: Handlebars expression parsing
 * - field-lookup.ts: Property field type lookup
 * - styles.ts: CSS style parsing
 * - attributes.ts: HTML to JSX attribute conversion
 * - preprocessors.ts: Template preprocessing
 * - node-converter.ts: HTML node to JSX conversion
 * - postprocessors.ts: JSX postprocessing
 * - index.ts: Main entry points
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCamelCase = exports.generateFallbackPreview = exports.generateJsxPreview = exports.transpileHandlebarsToJsx = void 0;
var index_1 = require("./handlebars-to-jsx/index");
Object.defineProperty(exports, "transpileHandlebarsToJsx", { enumerable: true, get: function () { return index_1.transpileHandlebarsToJsx; } });
Object.defineProperty(exports, "generateJsxPreview", { enumerable: true, get: function () { return index_1.generateJsxPreview; } });
Object.defineProperty(exports, "generateFallbackPreview", { enumerable: true, get: function () { return index_1.generateFallbackPreview; } });
Object.defineProperty(exports, "toCamelCase", { enumerable: true, get: function () { return index_1.toCamelCase; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGFuZGxlYmFycy10by1qc3guanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2VuZXJhdG9ycy9oYW5kbGViYXJzLXRvLWpzeC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBaUJHOzs7QUFFSCxtREFLbUM7QUFKakMsaUhBQUEsd0JBQXdCLE9BQUE7QUFDeEIsMkdBQUEsa0JBQWtCLE9BQUE7QUFDbEIsZ0hBQUEsdUJBQXVCLE9BQUE7QUFDdkIsb0dBQUEsV0FBVyxPQUFBIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBIYW5kbGViYXJzIHRvIEpTWCBUcmFuc3BpbGVyXG4gKiBcbiAqIFRoaXMgZmlsZSByZS1leHBvcnRzIGZyb20gdGhlIG1vZHVsYXIgaW1wbGVtZW50YXRpb24gaW4gdGhlIGhhbmRsZWJhcnMtdG8tanN4IGZvbGRlci5cbiAqIFRoZSBpbXBsZW1lbnRhdGlvbiBpcyBzcGxpdCBpbnRvIGxvZ2ljYWwgbW9kdWxlcyBmb3IgYmV0dGVyIG1haW50YWluYWJpbGl0eTpcbiAqIFxuICogLSB0eXBlcy50czogVHlwZSBkZWZpbml0aW9uc1xuICogLSBjb25zdGFudHMudHM6IEhUTUwgdG8gSlNYIGF0dHJpYnV0ZSBtYXBwaW5nIGFuZCBvdGhlciBjb25zdGFudHNcbiAqIC0gdXRpbHMudHM6IFN0cmluZyB1dGlsaXRpZXMgYW5kIGhlbHBlciBmdW5jdGlvbnNcbiAqIC0gZXhwcmVzc2lvbi1wYXJzZXIudHM6IEhhbmRsZWJhcnMgZXhwcmVzc2lvbiBwYXJzaW5nXG4gKiAtIGZpZWxkLWxvb2t1cC50czogUHJvcGVydHkgZmllbGQgdHlwZSBsb29rdXBcbiAqIC0gc3R5bGVzLnRzOiBDU1Mgc3R5bGUgcGFyc2luZ1xuICogLSBhdHRyaWJ1dGVzLnRzOiBIVE1MIHRvIEpTWCBhdHRyaWJ1dGUgY29udmVyc2lvblxuICogLSBwcmVwcm9jZXNzb3JzLnRzOiBUZW1wbGF0ZSBwcmVwcm9jZXNzaW5nXG4gKiAtIG5vZGUtY29udmVydGVyLnRzOiBIVE1MIG5vZGUgdG8gSlNYIGNvbnZlcnNpb25cbiAqIC0gcG9zdHByb2Nlc3NvcnMudHM6IEpTWCBwb3N0cHJvY2Vzc2luZ1xuICogLSBpbmRleC50czogTWFpbiBlbnRyeSBwb2ludHNcbiAqL1xuXG5leHBvcnQgeyBcbiAgdHJhbnNwaWxlSGFuZGxlYmFyc1RvSnN4LCBcbiAgZ2VuZXJhdGVKc3hQcmV2aWV3LCBcbiAgZ2VuZXJhdGVGYWxsYmFja1ByZXZpZXcsXG4gIHRvQ2FtZWxDYXNlIFxufSBmcm9tICcuL2hhbmRsZWJhcnMtdG8tanN4L2luZGV4JztcblxuZXhwb3J0IHR5cGUgeyBKc3hQcmV2aWV3UmVzdWx0IH0gZnJvbSAnLi9oYW5kbGViYXJzLXRvLWpzeC9pbmRleCc7XG4iXX0=