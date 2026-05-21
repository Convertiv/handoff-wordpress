"use strict";
/**
 * PostCSS scope design-system CSS for the block editor canvas.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scopeDesignSystemForEditor = exports.resolveEditorConfig = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const postcss_1 = __importDefault(require("postcss"));
const postcss_prefix_selector_1 = __importDefault(require("postcss-prefix-selector"));
/** Matches compiler preview wrappers (*-editor-preview) and optional handoff-editor-canvas. */
const DEFAULT_SCOPE_PREFIX = '.editor-styles-wrapper [class*="-editor-preview"] ';
const resolveEditorConfig = (editor) => ({
    designSystemStylesheets: editor?.designSystemStylesheets?.length
        ? editor.designSystemStylesheets
        : ['assets/css/main.css'],
    scopeDesignSystem: editor?.scopeDesignSystem !== false,
    scopePrefix: editor?.scopePrefix ?? DEFAULT_SCOPE_PREFIX,
    canvasShim: editor?.canvasShim !== false,
    extraStylesheets: editor?.extraStylesheets ?? [],
    canvasButtonPatterns: editor?.canvasButtonPatterns ?? [],
});
exports.resolveEditorConfig = resolveEditorConfig;
const scopedOutputPath = (inputPath) => {
    const ext = path_1.default.extname(inputPath);
    const base = inputPath.slice(0, -ext.length);
    return `${base}.editor-scoped${ext}`;
};
const scopeCssFile = async (inputPath, outputPath, scopePrefix) => {
    const css = fs_1.default.readFileSync(inputPath, 'utf8');
    const result = await (0, postcss_1.default)([
        (0, postcss_prefix_selector_1.default)({
            prefix: scopePrefix.trim(),
            transform(_prefix, selector, prefixedSelector, _filePath, rule) {
                const postcssRule = rule;
                if (postcssRule?.parent?.type === 'atrule') {
                    const name = postcssRule.parent.name;
                    if (name === 'keyframes' || name === 'font-face') {
                        return selector;
                    }
                }
                if (selector === ':root' || selector === 'html' || selector === 'body') {
                    return selector;
                }
                return prefixedSelector;
            },
        }),
    ]).process(css, { from: inputPath, to: outputPath });
    fs_1.default.mkdirSync(path_1.default.dirname(outputPath), { recursive: true });
    fs_1.default.writeFileSync(outputPath, result.css);
};
/**
 * Generate *.editor-scoped.css siblings for configured design-system stylesheets.
 */
const scopeDesignSystemForEditor = async (contentRoot, editor) => {
    const resolved = (0, exports.resolveEditorConfig)(editor);
    if (!resolved.scopeDesignSystem) {
        return [];
    }
    const written = [];
    for (const rel of resolved.designSystemStylesheets) {
        const inputPath = path_1.default.join(contentRoot, rel);
        if (!fs_1.default.existsSync(inputPath)) {
            console.warn(`   ⚠️  Editor scope skipped (missing): ${rel}`);
            continue;
        }
        const outputRel = scopedOutputPath(rel);
        const outputPath = path_1.default.join(contentRoot, outputRel);
        await scopeCssFile(inputPath, outputPath, resolved.scopePrefix);
        written.push(outputRel);
        console.log(`   ✅ ${outputRel} (editor-scoped)`);
    }
    return written;
};
exports.scopeDesignSystemForEditor = scopeDesignSystemForEditor;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NvcGUtZWRpdG9yLWNzcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9zY29wZS1lZGl0b3ItY3NzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7R0FFRzs7Ozs7O0FBRUgsNENBQW9CO0FBQ3BCLGdEQUF3QjtBQUN4QixzREFBOEI7QUFDOUIsc0ZBQXFEO0FBR3JELCtGQUErRjtBQUMvRixNQUFNLG9CQUFvQixHQUFHLG9EQUFvRCxDQUFDO0FBRTNFLE1BQU0sbUJBQW1CLEdBQUcsQ0FDakMsTUFBNEIsRUFXNUIsRUFBRSxDQUFDLENBQUM7SUFDSix1QkFBdUIsRUFBRSxNQUFNLEVBQUUsdUJBQXVCLEVBQUUsTUFBTTtRQUM5RCxDQUFDLENBQUMsTUFBTSxDQUFDLHVCQUF1QjtRQUNoQyxDQUFDLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQztJQUMzQixpQkFBaUIsRUFBRSxNQUFNLEVBQUUsaUJBQWlCLEtBQUssS0FBSztJQUN0RCxXQUFXLEVBQUUsTUFBTSxFQUFFLFdBQVcsSUFBSSxvQkFBb0I7SUFDeEQsVUFBVSxFQUFFLE1BQU0sRUFBRSxVQUFVLEtBQUssS0FBSztJQUN4QyxnQkFBZ0IsRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLElBQUksRUFBRTtJQUNoRCxvQkFBb0IsRUFBRSxNQUFNLEVBQUUsb0JBQW9CLElBQUksRUFBRTtDQUN6RCxDQUFDLENBQUM7QUFyQlUsUUFBQSxtQkFBbUIsdUJBcUI3QjtBQUVILE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxTQUFpQixFQUFVLEVBQUU7SUFDckQsTUFBTSxHQUFHLEdBQUcsY0FBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUNwQyxNQUFNLElBQUksR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUM3QyxPQUFPLEdBQUcsSUFBSSxpQkFBaUIsR0FBRyxFQUFFLENBQUM7QUFDdkMsQ0FBQyxD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bnRlbnQiOlsiLyoqXG4gKiBQb3N0Q1NTIHNjb3BlIGRlc2lnbi1zeXN0ZW0gQ1NTIGZvciB0aGUgYmxvY2sgZWRpdG9yIGNhbnZhcy5cbiAqL1xuXG5pbXBvcnQgZnMgZnJvbSAnZnMnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgcG9zdGNzcyBmcm9tICdwb3N0Y3NzJztcbmltcG9ydCBwcmVmaXhTZWxlY3RvciBmcm9tICdwb3N0Y3NzLXByZWZpeC1zZWxlY3Rvcic7XG5pbXBvcnQgdHlwZSB7IEhhbmRvZmZFZGl0b3JDb25maWcgfSBmcm9tICcuL3R5cGVzJztcblxuLyoqIE1hdGNoZXMgY29tcGlsZXIgcHJldmlldyB3cmFwcGVycyAoKi1lZGl0b3ItcHJldmlldykgYW5kIG9wdGlvbmFsIGhhbmRvZmYtZWRpdG9yLWNhbnZhcy4gKi9cbmNvbnN0IERFRkFVTFRfU0NPUEVfUFJFRklYID0gJy5lZGl0b3Itc3R5bGVzLXdyYXBwZXIgW2NsYXNzKj1cIi1lZGl0b3ItcHJldmlld1wiXSAnO1xuXG5leHBvcnQgY29uc3QgcmVzb2x2ZUVkaXRvckNvbmZpZyA9IChcbiAgZWRpdG9yPzogSGFuZG9mZkVkaXRvckNvbmZpZyxcbik6IFJlcXVpcmVkPFxuICBQaWNrPFxuICAgIEhhbmRvZmZFZGl0b3JDb25maWcsXG4gICAgfCAnZGVzaWduU3lzdGVtU3R5bGVzaGVldHMnXG4gICAgfCAnc2NvcGVEZXNpZ25TeXN0ZW0nXG4gICAgfCAnc2NvcGVQcmVmaXgnXG4gICAgfCAnY2FudmFzU2hpbSdcbiAgICB8ICdleHRyYVN0eWxlc2hlZXRzJ1xuICAgIHwgJ2NhbnZhc0J1dHRvblBhdHRlcm5zJ1xuICA+XG4+ID0+ICh7XG4gIGRlc2lnblN5c3RlbVN0eWxlc2hlZXRzOiBlZGl0b3I/LmRlc2lnblN5c3RlbVN0eWxlc2hlZXRzPy5sZW5ndGhcbiAgICA/IGVkaXRvci5kZXNpZ25TeXN0ZW1TdHlsZXNoZWV0c1xuICAgIDogWydhc3NldHMvY3NzL21haW4uY3NzJ10sXG4gIHNjb3BlRGVzaWduU3lzdGVtOiBlZGl0b3I/LnNjb3BlRGVzaWduU3lzdGVtICE9PSBmYWxzZSxcbiAgc2NvcGVQcmVmaXg6IGVkaXRvcj8uc2NvcGVQcmVmaXggPz8gREVGQVVMVF9TQ09QRV9QUkVGSVgsXG4gIGNhbnZhc1NoaW06IGVkaXRvcj8uY2FudmFzU2hpbSAhPT0gZmFsc2UsXG4gIGV4dHJhU3R5bGVzaGVldHM6IGVkaXRvcj8uZXh0cmFTdHlsZXNoZWV0cyA/PyBbXSxcbiAgY2FudmFzQnV0dG9uUGF0dGVybnM6IGVkaXRvcj8uY2FudmFzQnV0dG9uUGF0dGVybnMgPz8gW10sXG59KTtcblxuY29uc3Qgc2NvcGVkT3V0cHV0UGF0aCA9IChpbnB1dFBhdGg6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGV4dCA9IHBhdGguZXh0bmFtZShpbnB1dFBhdGgpO1xuICBjb25zdCBiYXNlID0gaW5wdXRQYXRoLnNsaWNlKDAsIC1leHQubGVuZ3RoKTtcbiAgcmV0dXJuIGAke2Jhc2V9LmVkaXRvci1zY29wZWQke2V4dH1gO1xufTtcblxuY29uc3Qgc2NvcGVDc3NGaWxlID0gYXN5bmMgKFxuICBpbnB1dFBhdGg6IHN0cmluZyxcbiAgb3V0cHV0UGF0aDogc3RyaW5nLFxuICBzY29wZVByZWZpeDogc3RyaW5nLFxuKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnN0IGNzcyA9IGZzLnJlYWRGaWxlU3luYyhpbnB1dFBhdGgsICd1dGY4Jyk7XG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHBvc3Rjc3MoW1xuICAgIHByZWZpeFNlbGVjdG9yKHtcbiAgICAgIHByZWZpeDogc2NvcGVQcmVmaXgudHJpbSgpLFxuICAgICAgdHJhbnNmb3JtKF9wcmVmaXgsIHNlbGVjdG9yLCBwcmVmaXhlZFNlbGVjdG9yLCBfZmlsZVBhdGgsIHJ1bGUpIHtcbiAgICAgICAgY29uc3QgcG9zdGNzc1J1bGUgPSBydWxlIGFzIHBvc3Rjc3MuUnVsZSB8IHVuZGVmaW5lZDtcbiAgICAgICAgaWYgKHBvc3Rjc3NSdWxlPy5wYXJlbnQ/LnR5cGUgPT09ICdhdHJ1bGUnKSB7XG4gICAgICAgICAgY29uc3QgbmFtZSA9IChwb3N0Y3NzUnVsZS5wYXJlbnQgYXMgcG9zdGNzcy5BdFJ1bGUpLm5hbWU7XG4gICAgICAgICAgaWYgKG5hbWUgPT09ICdrZXlmcmFtZXMnIHx8IG5hbWUgPT09ICdmb250LWZhY2UnKSB7XG4gICAgICAgICAgICByZXR1cm4gc2VsZWN0b3I7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChzZWxlY3RvciA9PT0gJzpyb290JyB8fCBzZWxlY3RvciA9PT0gJ2h0bWwnIHx8IHNlbGVjdG9yID09PSAnYm9keScpIHtcbiAgICAgICAgICByZXR1cm4gc2VsZWN0b3I7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHByZWZpeGVkU2VsZWN0b3I7XG4gICAgICB9LFxuICAgIH0pLFxuICBdKS5wcm9jZXNzKGNzcywgeyBmcm9tOiBpbnB1dFBhdGgsIHRvOiBvdXRwdXRQYXRoIH0pO1xuXG4gIGZzLm1rZGlyU3luYyhwYXRoLmRpcm5hbWUob3V0cHV0UGF0aCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICBmcy53cml0ZUZpbGVTeW5jKG91dHB1dFBhdGgsIHJlc3VsdC5jc3MpO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSAqLmVkaXRvci1zY29wZWQuY3NzIHNpYmxpbmdzIGZvciBjb25maWd1cmVkIGRlc2lnbi1zeXN0ZW0gc3R5bGVzaGVldHMuXG4gKi9cbmV4cG9ydCBjb25zdCBzY29wZURlc2lnblN5c3RlbUZvckVkaXRvciA9IGFzeW5jIChcbiAgY29udGVudFJvb3Q6IHN0cmluZyxcbiAgZWRpdG9yPzogSGFuZG9mZkVkaXRvckNvbmZpZyxcbik6IFByb21pc2U8c3RyaW5nW10+ID0+IHtcbiAgY29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlRWRpdG9yQ29uZmlnKGVkaXRvcik7XG4gIGlmICghcmVzb2x2ZWQuc2NvcGVEZXNpZ25TeXN0ZW0pIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICBjb25zdCB3cml0dGVuOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IHJlbCBvZiByZXNvbHZlZC5kZXNpZ25TeXN0ZW1TdHlsZXNoZWV0cykge1xuICAgIGNvbnN0IGlucHV0UGF0aCA9IHBhdGguam9pbihjb250ZW50Um9vdCwgcmVsKTtcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoaW5wdXRQYXRoKSkge1xuICAgICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIEVkaXRvciBzY29wZSBza2lwcGVkIChtaXNzaW5nKTogJHtyZWx9YCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3Qgb3V0cHV0UmVsID0gc2NvcGVkT3V0cHV0UGF0aChyZWwpO1xuICAgIGNvbnN0IG91dHB1dFBhdGggPSBwYXRoLmpvaW4oY29udGVudFJvb3QsIG91dHB1dFJlbCk7XG4gICAgYXdhaXQgc2NvcGVDc3NGaWxlKGlucHV0UGF0aCwgb3V0cHV0UGF0aCwgcmVzb2x2ZWQuc2NvcGVQcmVmaXgpO1xuICAgIHdyaXR0ZW4ucHVzaChvdXRwdXRSZWwpO1xuICAgIGNvbnNvbGUubG9nKGAgICDinIUgJHtvdXRwdXRSZWx9IChlZGl0b3Itc2NvcGVkKWApO1xuICB9XG4gIHJldHVybiB3cml0dGVuO1xufTtcbiJdfQ==