"use strict";
/**
 * Block lifecycle: mark local blocks deprecated when they are not in the
 * current Handoff compile output (removed from Handoff, import-disabled, or
 * superseded by a merged group block).
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconcileLocalBlocks = exports.clearBlockDeprecated = exports.markBlockDeprecated = exports.getActiveBlockSlugs = exports.listLocalBlockSlugs = exports.groupSlugToBlockName = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const block_json_1 = require("./generators/block-json");
const DEPRECATED_TITLE_PREFIX = '(Deprecated) ';
/** Normalize merged group config key to block directory slug (matches compileGroup). */
const groupSlugToBlockName = (groupSlug) => groupSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
exports.groupSlugToBlockName = groupSlugToBlockName;
/**
 * List block directory slugs under the compiler output dir that contain block.json.
 */
const listLocalBlockSlugs = (outputDir) => {
    if (!fs.existsSync(outputDir)) {
        return [];
    }
    const slugs = [];
    for (const entry of fs.readdirSync(outputDir)) {
        if (entry === '.' || entry === '..')
            continue;
        const blockDir = path.join(outputDir, entry);
        if (fs.statSync(blockDir).isDirectory() && fs.existsSync(path.join(blockDir, 'block.json'))) {
            slugs.push(entry);
        }
    }
    return slugs;
};
exports.listLocalBlockSlugs = listLocalBlockSlugs;
/**
 * Block slugs that compileAll would write this run (individual + merged groups).
 */
const getActiveBlockSlugs = (individualComponents, groupBuckets) => {
    const slugs = new Set();
    for (const component of individualComponents) {
        slugs.add((0, block_json_1.toBlockName)(component.id));
    }
    for (const groupSlug of Object.keys(groupBuckets)) {
        slugs.add((0, exports.groupSlugToBlockName)(groupSlug));
    }
    return slugs;
};
exports.getActiveBlockSlugs = getActiveBlockSlugs;
/**
 * Mark a block as removed from compile output by patching block.json in place.
 */
const markBlockDeprecated = (blockDir, reason = 'not-in-compile-output') => {
    const blockJsonPath = path.join(blockDir, 'block.json');
    if (!fs.existsSync(blockJsonPath)) {
        return;
    }
    const blockJson = JSON.parse(fs.readFileSync(blockJsonPath, 'utf-8'));
    if (!blockJson.__handoff || typeof blockJson.__handoff !== 'object') {
        blockJson.__handoff = {};
    }
    const handoff = blockJson.__handoff;
    handoff.removedFromHandoff = true;
    handoff.removedFromHandoffAt = new Date().toISOString();
    handoff.removedFromHandoffReason = reason;
    if (!blockJson.supports || typeof blockJson.supports !== 'object') {
        blockJson.supports = {};
    }
    blockJson.supports.inserter = false;
    if (typeof blockJson.title === 'string' && !blockJson.title.startsWith(DEPRECATED_TITLE_PREFIX)) {
        blockJson.title = DEPRECATED_TITLE_PREFIX + blockJson.title;
    }
    fs.writeFileSync(blockJsonPath, JSON.stringify(blockJson, null, 2) + '\n');
};
exports.markBlockDeprecated = markBlockDeprecated;
/**
 * Remove removed-from-compile deprecation fields from block.json (used when re-activating without full regen).
 */
const clearBlockDeprecated = (blockDir) => {
    const blockJsonPath = path.join(blockDir, 'block.json');
    if (!fs.existsSync(blockJsonPath)) {
        return;
    }
    const blockJson = JSON.parse(fs.readFileSync(blockJsonPath, 'utf-8'));
    if (blockJson.__handoff && typeof blockJson.__handoff === 'object') {
        const handoff = blockJson.__handoff;
        delete handoff.removedFromHandoff;
        delete handoff.removedFromHandoffAt;
        delete handoff.removedFromHandoffReason;
        if (Object.keys(handoff).length === 0) {
            delete blockJson.__handoff;
        }
    }
    if (blockJson.supports && typeof blockJson.supports === 'object') {
        const supports = blockJson.supports;
        if (supports.inserter === false) {
            delete supports.inserter;
        }
        if (Object.keys(supports).length === 0) {
            delete blockJson.supports;
        }
    }
    if (typeof blockJson.title === 'string' && blockJson.title.startsWith(DEPRECATED_TITLE_PREFIX)) {
        blockJson.title = blockJson.title.slice(DEPRECATED_TITLE_PREFIX.length);
    }
    fs.writeFileSync(blockJsonPath, JSON.stringify(blockJson, null, 2) + '\n');
};
exports.clearBlockDeprecated = clearBlockDeprecated;
/**
 * Compare local block dirs to active compile slugs; mark orphans as deprecated.
 */
const reconcileLocalBlocks = (outputDir, activeSlugs) => {
    const result = { marked: [], alreadyDeprecated: [] };
    for (const slug of (0, exports.listLocalBlockSlugs)(outputDir)) {
        if (activeSlugs.has(slug)) {
            continue;
        }
        const blockDir = path.join(outputDir, slug);
        const blockJsonPath = path.join(blockDir, 'block.json');
        let already = false;
        try {
            const blockJson = JSON.parse(fs.readFileSync(blockJsonPath, 'utf-8'));
            const handoff = blockJson.__handoff;
            already = handoff?.removedFromHandoff === true;
        }
        catch {
            // treat as not yet deprecated
        }
        (0, exports.markBlockDeprecated)(blockDir);
        if (already) {
            result.alreadyDeprecated.push(slug);
        }
        else {
            result.marked.push(slug);
        }
    }
    return result;
};
exports.reconcileLocalBlocks = reconcileLocalBlocks;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmxvY2stbGlmZWN5Y2xlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2Jsb2NrLWxpZmVjeWNsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7R0FJRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUU3Qix3REFBc0Q7QUFFdEQsTUFBTSx1QkFBdUIsR0FBRyxlQUFlLENBQUM7QUFJaEQsd0ZBQXdGO0FBQ2pGLE1BQU0sb0JBQW9CLEdBQUcsQ0FBQyxTQUFpQixFQUFVLEVBQUUsQ0FDaEUsU0FBUyxDQUFDLFdBQVcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsQ0FBQztBQURqRSxRQUFBLG9CQUFvQix3QkFDNkM7QUFFOUU7O0dBRUc7QUFDSSxNQUFNLG1CQUFtQixHQUFHLENBQUMsU0FBaUIsRUFBWSxFQUFFO0lBQ2pFLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDOUIsT0FBTyxFQUFFLENBQUM7SUFDWixDQUFDO0lBQ0QsTUFBTSxLQUFLLEdBQWEsRUFBRSxDQUFDO0lBQzNCLEtBQUssTUFBTSxLQUFLLElBQUksRUFBRSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1FBQzlDLElBQUksS0FBSyxLQUFLLEdBQUcsSUFBSSxLQUFLLEtBQUssSUFBSTtZQUFFLFNBQVM7UUFDOUMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDN0MsSUFBSSxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLFdBQVcsRUFBRSxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsWUFBWSxD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O1FBQUMsTUFBTSxDQUFDO1lBQ1AsOEJBQThCO1FBQ2hDLENBQUM7UUFFRCxJQUFBLDJCQUFtQixFQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzlCLElBQUksT0FBTyxFQUFFLENBQUM7WUFDWixNQUFNLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RDLENBQUM7YUFBTSxDQUFDO1lBQ04sTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDM0IsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPLE1BQU0sQ0FBQztBQUNoQixDQUFDLENBQUM7QUEvQlcsUUFBQSxvQkFBb0Isd0JBK0IvQiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQmxvY2sgbGlmZWN5Y2xlOiBtYXJrIGxvY2FsIGJsb2NrcyBkZXByZWNhdGVkIHdoZW4gdGhleSBhcmUgbm90IGluIHRoZVxuICogY3VycmVudCBIYW5kb2ZmIGNvbXBpbGUgb3V0cHV0IChyZW1vdmVkIGZyb20gSGFuZG9mZiwgaW1wb3J0LWRpc2FibGVkLCBvclxuICogc3VwZXJzZWRlZCBieSBhIG1lcmdlZCBncm91cCBibG9jaykuXG4gKi9cblxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IEhhbmRvZmZDb21wb25lbnQgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IHRvQmxvY2tOYW1lIH0gZnJvbSAnLi9nZW5lcmF0b3JzL2Jsb2NrLWpzb24nO1xuXG5jb25zdCBERVBSRUNBVEVEX1RJVExFX1BSRUZJWCA9ICcoRGVwcmVjYXRlZCkgJztcblxuZXhwb3J0IHR5cGUgUmVtb3ZlZEZyb21IYW5kb2ZmUmVhc29uID0gJ25vdC1pbi1jb21waWxlLW91dHB1dCc7XG5cbi8qKiBOb3JtYWxpemUgbWVyZ2VkIGdyb3VwIGNvbmZpZyBrZXkgdG8gYmxvY2sgZGlyZWN0b3J5IHNsdWcgKG1hdGNoZXMgY29tcGlsZUdyb3VwKS4gKi9cbmV4cG9ydCBjb25zdCBncm91cFNsdWdUb0Jsb2NrTmFtZSA9IChncm91cFNsdWc6IHN0cmluZyk6IHN0cmluZyA9PlxuICBncm91cFNsdWcudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9bXmEtejAtOV0rL2csICctJykucmVwbGFjZSgvXi0rfC0rJC9nLCAnJyk7XG5cbi8qKlxuICogTGlzdCBibG9jayBkaXJlY3Rvcnkgc2x1Z3MgdW5kZXIgdGhlIGNvbXBpbGVyIG91dHB1dCBkaXIgdGhhdCBjb250YWluIGJsb2NrLmpzb24uXG4gKi9cbmV4cG9ydCBjb25zdCBsaXN0TG9jYWxCbG9ja1NsdWdzID0gKG91dHB1dERpcjogc3RyaW5nKTogc3RyaW5nW10gPT4ge1xuICBpZiAoIWZzLmV4aXN0c1N5bmMob3V0cHV0RGlyKSkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuICBjb25zdCBzbHVnczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBlbnRyeSBvZiBmcy5yZWFkZGlyU3luYyhvdXRwdXREaXIpKSB7XG4gICAgaWYgKGVudHJ5ID09PSAnLicgfHwgZW50cnkgPT09ICcuLicpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGJsb2NrRGlyID0gcGF0aC5qb2luKG91dHB1dERpciwgZW50cnkpO1xuICAgIGlmIChmcy5zdGF0U3luYyhibG9ja0RpcikuaXNEaXJlY3RvcnkoKSAmJiBmcy5leGlzdHNTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ2Jsb2NrLmpzb24nKSkpIHtcbiAgICAgIHNsdWdzLnB1c2goZW50cnkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gc2x1Z3M7XG59O1xuXG4vKipcbiAqIEJsb2NrIHNsdWdzIHRoYXQgY29tcGlsZUFsbCB3b3VsZCB3cml0ZSB0aGlzIHJ1biAoaW5kaXZpZHVhbCArIG1lcmdlZCBncm91cHMpLlxuICovXG5leHBvcnQgY29uc3QgZ2V0QWN0aXZlQmxvY2tTbHVncyA9IChcbiAgaW5kaXZpZHVhbENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSxcbiAgZ3JvdXBCdWNrZXRzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmQ29tcG9uZW50W10+XG4pOiBTZXQ8c3RyaW5nPiA9PiB7XG4gIGNvbnN0IHNsdWdzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgY29tcG9uZW50IG9mIGluZGl2aWR1YWxDb21wb25lbnRzKSB7XG4gICAgc2x1Z3MuYWRkKHRvQmxvY2tOYW1lKGNvbXBvbmVudC5pZCkpO1xuICB9XG4gIGZvciAoY29uc3QgZ3JvdXBTbHVnIG9mIE9iamVjdC5rZXlzKGdyb3VwQnVja2V0cykpIHtcbiAgICBzbHVncy5hZGQoZ3JvdXBTbHVnVG9CbG9ja05hbWUoZ3JvdXBTbHVnKSk7XG4gIH1cbiAgcmV0dXJuIHNsdWdzO1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBSZWNvbmNpbGVSZXN1bHQge1xuICBtYXJrZWQ6IHN0cmluZ1tdO1xuICBhbHJlYWR5RGVwcmVjYXRlZDogc3RyaW5nW107XG59XG5cbi8qKlxuICogTWFyayBhIGJsb2NrIGFzIHJlbW92ZWQgZnJvbSBjb21waWxlIG91dHB1dCBieSBwYXRjaGluZyBibG9jay5qc29uIGluIHBsYWNlLlxuICovXG5leHBvcnQgY29uc3QgbWFya0Jsb2NrRGVwcmVjYXRlZCA9IChcbiAgYmxvY2tEaXI6IHN0cmluZyxcbiAgcmVhc29uOiBSZW1vdmVkRnJvbUhhbmRvZmZSZWFzb24gPSAnbm90LWluLWNvbXBpbGUtb3V0cHV0J1xuKTogdm9pZCA9PiB7XG4gIGNvbnN0IGJsb2NrSnNvblBhdGggPSBwYXRoLmpvaW4oYmxvY2tEaXIsICdibG9jay5qc29uJyk7XG4gIGlmICghZnMuZXhpc3RzU3luYyhibG9ja0pzb25QYXRoKSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGJsb2NrSnNvbiA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKGJsb2NrSnNvblBhdGgsICd1dGYtOCcpKSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblxuICBpZiAoIWJsb2NrSnNvbi5fX2hhbmRvZmYgfHwgdHlwZW9mIGJsb2NrSnNvbi5fX2hhbmRvZmYgIT09ICdvYmplY3QnKSB7XG4gICAgYmxvY2tKc29uLl9faGFuZG9mZiA9IHt9O1xuICB9XG4gIGNvbnN0IGhhbmRvZmYgPSBibG9ja0pzb24uX19oYW5kb2ZmIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBoYW5kb2ZmLnJlbW92ZWRGcm9tSGFuZG9mZiA9IHRydWU7XG4gIGhhbmRvZmYucmVtb3ZlZEZyb21IYW5kb2ZmQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gIGhhbmRvZmYucmVtb3ZlZEZyb21IYW5kb2ZmUmVhc29uID0gcmVhc29uO1xuXG4gIGlmICghYmxvY2tKc29uLnN1cHBvcnRzIHx8IHR5cGVvZiBibG9ja0pzb24uc3VwcG9ydHMgIT09ICdvYmplY3QnKSB7XG4gICAgYmxvY2tKc29uLnN1cHBvcnRzID0ge307XG4gIH1cbiAgKGJsb2NrSnNvbi5zdXBwb3J0cyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikuaW5zZXJ0ZXIgPSBmYWxzZTtcblxuICBpZiAodHlwZW9mIGJsb2NrSnNvbi50aXRsZSA9PT0gJ3N0cmluZycgJiYgIWJsb2NrSnNvbi50aXRsZS5zdGFydHNXaXRoKERFUFJFQ0FURURfVElUTEVfUFJFRklYKSkge1xuICAgIGJsb2NrSnNvbi50aXRsZSA9IERFUFJFQ0FURURfVElUTEVfUFJFRklYICsgYmxvY2tKc29uLnRpdGxlO1xuICB9XG5cbiAgZnMud3JpdGVGaWxlU3luYyhibG9ja0pzb25QYXRoLCBKU09OLnN0cmluZ2lmeShibG9ja0pzb24sIG51bGwsIDIpICsgJ1xcbicpO1xufTtcblxuLyoqXG4gKiBSZW1vdmUgcmVtb3ZlZC1mcm9tLWNvbXBpbGUgZGVwcmVjYXRpb24gZmllbGRzIGZyb20gYmxvY2suanNvbiAodXNlZCB3aGVuIHJlLWFjdGl2YXRpbmcgd2l0aG91dCBmdWxsIHJlZ2VuKS5cbiAqL1xuZXhwb3J0IGNvbnN0IGNsZWFyQmxvY2tEZXByZWNhdGVkID0gKGJsb2NrRGlyOiBzdHJpbmcpOiB2b2lkID0+IHtcbiAgY29uc3QgYmxvY2tKc29uUGF0aCA9IHBhdGguam9pbihibG9ja0RpciwgJ2Jsb2NrLmpzb24nKTtcbiAgaWYgKCFmcy5leGlzdHNTeW5jKGJsb2NrSnNvblBhdGgpKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgYmxvY2tKc29uID0gSlNPTi5wYXJzZShmcy5yZWFkRmlsZVN5bmMoYmxvY2tKc29uUGF0aCwgJ3V0Zi04JykpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXG4gIGlmIChibG9ja0pzb24uX19oYW5kb2ZmICYmIHR5cGVvZiBibG9ja0pzb24uX19oYW5kb2ZmID09PSAnb2JqZWN0Jykge1xuICAgIGNvbnN0IGhhbmRvZmYgPSBibG9ja0pzb24uX19oYW5kb2ZmIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgIGRlbGV0ZSBoYW5kb2ZmLnJlbW92ZWRGcm9tSGFuZG9mZjtcbiAgICBkZWxldGUgaGFuZG9mZi5yZW1vdmVkRnJvbUhhbmRvZmZBdDtcbiAgICBkZWxldGUgaGFuZG9mZi5yZW1vdmVkRnJvbUhhbmRvZmZSZWFzb247XG4gICAgaWYgKE9iamVjdC5rZXlzKGhhbmRvZmYpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgZGVsZXRlIGJsb2NrSnNvbi5fX2hhbmRvZmY7XG4gICAgfVxuICB9XG5cbiAgaWYgKGJsb2NrSnNvbi5zdXBwb3J0cyAmJiB0eXBlb2YgYmxvY2tKc29uLnN1cHBvcnRzID09PSAnb2JqZWN0Jykge1xuICAgIGNvbnN0IHN1cHBvcnRzID0gYmxvY2tKc29uLnN1cHBvcnRzIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgIGlmIChzdXBwb3J0cy5pbnNlcnRlciA9PT0gZmFsc2UpIHtcbiAgICAgIGRlbGV0ZSBzdXBwb3J0cy5pbnNlcnRlcjtcbiAgICB9XG4gICAgaWYgKE9iamVjdC5rZXlzKHN1cHBvcnRzKS5sZW5ndGggPT09IDApIHtcbiAgICAgIGRlbGV0ZSBibG9ja0pzb24uc3VwcG9ydHM7XG4gICAgfVxuICB9XG5cbiAgaWYgKHR5cGVvZiBibG9ja0pzb24udGl0bGUgPT09ICdzdHJpbmcnICYmIGJsb2NrSnNvbi50aXRsZS5zdGFydHNXaXRoKERFUFJFQ0FURURfVElUTEVfUFJFRklYKSkge1xuICAgIGJsb2NrSnNvbi50aXRsZSA9IGJsb2NrSnNvbi50aXRsZS5zbGljZShERVBSRUNBVEVEX1RJVExFX1BSRUZJWC5sZW5ndGgpO1xuICB9XG5cbiAgZnMud3JpdGVGaWxlU3luYyhibG9ja0pzb25QYXRoLCBKU09OLnN0cmluZ2lmeShibG9ja0pzb24sIG51bGwsIDIpICsgJ1xcbicpO1xufTtcblxuLyoqXG4gKiBDb21wYXJlIGxvY2FsIGJsb2NrIGRpcnMgdG8gYWN0aXZlIGNvbXBpbGUgc2x1Z3M7IG1hcmsgb3JwaGFucyBhcyBkZXByZWNhdGVkLlxuICovXG5leHBvcnQgY29uc3QgcmVjb25jaWxlTG9jYWxCbG9ja3MgPSAoXG4gIG91dHB1dERpcjogc3RyaW5nLFxuICBhY3RpdmVTbHVnczogU2V0PHN0cmluZz5cbik6IFJlY29uY2lsZVJlc3VsdCA9PiB7XG4gIGNvbnN0IHJlc3VsdDogUmVjb25jaWxlUmVzdWx0ID0geyBtYXJrZWQ6IFtdLCBhbHJlYWR5RGVwcmVjYXRlZDogW10gfTtcblxuICBmb3IgKGNvbnN0IHNsdWcgb2YgbGlzdExvY2FsQmxvY2tTbHVncyhvdXRwdXREaXIpKSB7XG4gICAgaWYgKGFjdGl2ZVNsdWdzLmhhcyhzbHVnKSkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc3QgYmxvY2tEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCBzbHVnKTtcbiAgICBjb25zdCBibG9ja0pzb25QYXRoID0gcGF0aC5qb2luKGJsb2NrRGlyLCAnYmxvY2suanNvbicpO1xuICAgIGxldCBhbHJlYWR5ID0gZmFsc2U7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGJsb2NrSnNvbiA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKGJsb2NrSnNvblBhdGgsICd1dGYtOCcpKSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICAgIGNvbnN0IGhhbmRvZmYgPSBibG9ja0pzb24uX19oYW5kb2ZmIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xuICAgICAgYWxyZWFkeSA9IGhhbmRvZmY/LnJlbW92ZWRGcm9tSGFuZG9mZiA9PT0gdHJ1ZTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIHRyZWF0IGFzIG5vdCB5ZXQgZGVwcmVjYXRlZFxuICAgIH1cblxuICAgIG1hcmtCbG9ja0RlcHJlY2F0ZWQoYmxvY2tEaXIpO1xuICAgIGlmIChhbHJlYWR5KSB7XG4gICAgICByZXN1bHQuYWxyZWFkeURlcHJlY2F0ZWQucHVzaChzbHVnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0Lm1hcmtlZC5wdXNoKHNsdWcpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59O1xuIl19