"use strict";
/**
 * Schema History - Tracks property schemas across compilations with
 * versioned history to detect breaking changes and enable automatic
 * Gutenberg block deprecation generation.
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
exports.formatValidationResult = exports.getComponentHistory = exports.updateManifest = exports.validateComponent = exports.extractProperties = exports.saveManifest = exports.loadManifest = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const HISTORY_FILENAME = 'schema-history.json';
const LEGACY_FILENAME = 'property-manifest.json';
/**
 * Load the schema history from disk, migrating from the legacy format if needed.
 */
const loadManifest = (outputDir) => {
    const historyPath = path.join(outputDir, HISTORY_FILENAME);
    if (fs.existsSync(historyPath)) {
        try {
            const content = fs.readFileSync(historyPath, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            console.warn(`Warning: Could not parse ${HISTORY_FILENAME}, starting fresh`);
            return { version: '2.0.0', components: {} };
        }
    }
    const legacyPath = path.join(outputDir, LEGACY_FILENAME);
    if (fs.existsSync(legacyPath)) {
        try {
            const content = fs.readFileSync(legacyPath, 'utf-8');
            const legacy = JSON.parse(content);
            const migrated = migrateLegacyManifest(legacy);
            (0, exports.saveManifest)(outputDir, migrated);
            console.log(`Migrated ${LEGACY_FILENAME} to ${HISTORY_FILENAME}`);
            return migrated;
        }
        catch {
            console.warn(`Warning: Could not parse legacy manifest, starting fresh`);
        }
    }
    return { version: '2.0.0', components: {} };
};
exports.loadManifest = loadManifest;
/**
 * Convert old property-manifest.json into the new schema-history format.
 */
const migrateLegacyManifest = (legacy) => {
    const history = { version: '2.0.0', components: {} };
    for (const [id, entry] of Object.entries(legacy.components)) {
        history.components[id] = {
            componentId: entry.componentId,
            componentTitle: entry.componentTitle,
            schemaVersion: 1,
            current: entry.properties,
            lastUpdated: entry.lastUpdated,
            history: [],
        };
    }
    return history;
};
/**
 * Save the schema history to disk
 */
const saveManifest = (outputDir, history) => {
    const historyPath = path.join(outputDir, HISTORY_FILENAME);
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
};
exports.saveManifest = saveManifest;
/**
 * Recursively extract property schema from a HandoffProperty
 */
const extractPropertySchema = (prop) => {
    const schema = { type: prop.type };
    if (prop.type === 'object' && prop.properties) {
        schema.properties = {};
        for (const [key, nestedProp] of Object.entries(prop.properties)) {
            schema.properties[key] = extractPropertySchema(nestedProp);
        }
    }
    if (prop.type === 'array') {
        const itemProperties = prop.items?.properties || prop.properties;
        if (itemProperties) {
            schema.items = { type: 'object', properties: {} };
            for (const [key, nestedProp] of Object.entries(itemProperties)) {
                schema.items.properties[key] = extractPropertySchema(nestedProp);
            }
        }
    }
    return schema;
};
/**
 * Extract all property schemas from a component
 */
const extractProperties = (properties) => {
    const result = {};
    for (const [key, prop] of Object.entries(properties)) {
        result[key] = extractPropertySchema(prop);
    }
    return result;
};
exports.extractProperties = extractProperties;
/**
 * Recursively compare two property schemas and collect changes
 */
const compareSchemas = (oldSchema, newSchema, propPath, changes) => {
    let isValid = true;
    if (oldSchema && !newSchema) {
        isValid = false;
        changes.push({
            type: 'removed',
            propertyPath: propPath,
            oldType: oldSchema.type,
            message: `Property "${propPath}" was removed. This will break existing content.`
        });
        return isValid;
    }
    if (!oldSchema && newSchema) {
        changes.push({
            type: 'added',
            propertyPath: propPath,
            newType: newSchema.type,
            message: `New property "${propPath}" (${newSchema.type}) was added.`
        });
        return isValid;
    }
    if (oldSchema && newSchema) {
        if (oldSchema.type !== newSchema.type) {
            isValid = false;
            changes.push({
                type: 'type_changed',
                propertyPath: propPath,
                oldType: oldSchema.type,
                newType: newSchema.type,
                message: `Property "${propPath}" type changed from "${oldSchema.type}" to "${newSchema.type}". This may break existing content.`
            });
            return isValid;
        }
        if (oldSchema.properties || newSchema.properties) {
            const oldProps = oldSchema.properties || {};
            const newProps = newSchema.properties || {};
            const allKeys = new Set([...Object.keys(oldProps), ...Object.keys(newProps)]);
            for (const key of allKeys) {
                const nestedValid = compareSchemas(oldProps[key], newProps[key], `${propPath}.${key}`, changes);
                if (!nestedValid)
                    isValid = false;
            }
        }
        if (oldSchema.items || newSchema.items) {
            if (oldSchema.items && newSchema.items) {
                const oldItemProps = oldSchema.items.properties || {};
                const newItemProps = newSchema.items.properties || {};
                const allKeys = new Set([...Object.keys(oldItemProps), ...Object.keys(newItemProps)]);
                for (const key of allKeys) {
                    const nestedValid = compareSchemas(oldItemProps[key], newItemProps[key], `${propPath}[].${key}`, changes);
                    if (!nestedValid)
                        isValid = false;
                }
            }
            else if (oldSchema.items && !newSchema.items) {
                isValid = false;
                changes.push({
                    type: 'removed',
                    propertyPath: `${propPath}[]`,
                    message: `Array item structure for "${propPath}" was removed. This will break existing content.`
                });
            }
            else if (!oldSchema.items && newSchema.items) {
                changes.push({
                    type: 'added',
                    propertyPath: `${propPath}[]`,
                    message: `Array item structure for "${propPath}" was added.`
                });
            }
        }
    }
    return isValid;
};
/**
 * Compare current properties against the stored history entry
 */
const validateComponent = (component, history) => {
    const componentId = component.id;
    const currentProperties = (0, exports.extractProperties)(component.properties);
    const existingEntry = history.components[componentId];
    const result = {
        componentId,
        componentTitle: component.title,
        isValid: true,
        changes: [],
        isNew: !existingEntry
    };
    if (!existingEntry) {
        return result;
    }
    const oldProperties = existingEntry.current;
    const allKeys = new Set([...Object.keys(oldProperties), ...Object.keys(currentProperties)]);
    for (const key of allKeys) {
        const isKeyValid = compareSchemas(oldProperties[key], currentProperties[key], key, result.changes);
        if (!isKeyValid) {
            result.isValid = false;
        }
    }
    return result;
};
exports.validateComponent = validateComponent;
/**
 * Update the history with the current component properties.
 * If there are breaking changes, the old schema is pushed to history
 * and the schema version is incremented.
 */
const updateManifest = (component, history) => {
    const currentProperties = (0, exports.extractProperties)(component.properties);
    const existingEntry = history.components[component.id];
    if (!existingEntry) {
        return {
            ...history,
            components: {
                ...history.components,
                [component.id]: {
                    componentId: component.id,
                    componentTitle: component.title,
                    schemaVersion: 1,
                    current: currentProperties,
                    lastUpdated: new Date().toISOString(),
                    history: [],
                },
            },
        };
    }
    const changes = [];
    const allKeys = new Set([
        ...Object.keys(existingEntry.current),
        ...Object.keys(currentProperties),
    ]);
    let hasBreaking = false;
    for (const key of allKeys) {
        const valid = compareSchemas(existingEntry.current[key], currentProperties[key], key, changes);
        if (!valid)
            hasBreaking = true;
    }
    const breakingChanges = changes.filter((c) => c.type === 'removed' || c.type === 'type_changed');
    let updatedHistory = [...existingEntry.history];
    let nextVersion = existingEntry.schemaVersion;
    if (hasBreaking && breakingChanges.length > 0) {
        updatedHistory = [
            {
                version: existingEntry.schemaVersion,
                schema: existingEntry.current,
                changedAt: new Date().toISOString(),
                changes: breakingChanges,
            },
            ...updatedHistory,
        ];
        nextVersion = existingEntry.schemaVersion + 1;
    }
    return {
        ...history,
        components: {
            ...history.components,
            [component.id]: {
                componentId: component.id,
                componentTitle: component.title,
                schemaVersion: nextVersion,
                current: currentProperties,
                lastUpdated: new Date().toISOString(),
                history: updatedHistory,
            },
        },
    };
};
exports.updateManifest = updateManifest;
/**
 * Get the full history entry for a component (used by deprecation generator)
 */
const getComponentHistory = (history, componentId) => {
    return history.components[componentId];
};
exports.getComponentHistory = getComponentHistory;
/**
 * Format validation results for console output
 */
const formatValidationResult = (result) => {
    const lines = [];
    if (result.isNew) {
        lines.push(`  ${result.componentTitle} (${result.componentId})`);
        lines.push(`   New component - will be added to manifest on compilation`);
        return lines.join('\n');
    }
    const icon = result.isValid ? 'OK' : 'FAIL';
    lines.push(`${icon} ${result.componentTitle} (${result.componentId})`);
    if (result.changes.length === 0) {
        lines.push(`   No property changes detected`);
    }
    else {
        const breaking = result.changes.filter(c => c.type === 'removed' || c.type === 'type_changed');
        const additions = result.changes.filter(c => c.type === 'added');
        if (breaking.length > 0) {
            lines.push(`   Breaking Changes:`);
            for (const change of breaking) {
                lines.push(`      ${change.message}`);
            }
        }
        if (additions.length > 0) {
            lines.push(`   Additions:`);
            for (const change of additions) {
                lines.push(`      ${change.message}`);
            }
        }
    }
    return lines.join('\n');
};
exports.formatValidationResult = formatValidationResult;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvcGVydHktbWFuaWZlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvdmFsaWRhdG9ycy9wcm9wZXJ0eS1tYW5pZmVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7R0FJRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQStEN0IsTUFBTSxnQkFBZ0IsR0FBRyxxQkFBcUIsQ0FBQztBQUMvQyxNQUFNLGVBQWUsR0FBRyx3QkFBd0IsQ0FBQztBQUVqRDs7R0FFRztBQUNJLE1BQU0sWUFBWSxHQUFHLENBQUMsU0FBaUIsRUFBaUIsRUFBRTtJQUMvRCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO0lBRTNELElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO1FBQy9CLElBQUksQ0FBQztZQUNILE1BQU0sT0FBTyxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3RELE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQWtCLENBQUM7UUFDOUMsQ0FBQztRQUFDLE1BQU0sQ0FBQztZQUNQLE9BQU8sQ0FBQyxJQUFJLENBQUMsNEJBQTRCLGdCQUFnQixrQkFBa0IsQ0FBQyxDQUFDO1lBQzdFLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxFQUFFLEVBQUUsQ0FBQztRQUM5QyxDQUFDO0lBQ0gsQ0FBQztJQUVELE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLGVBQWUsQ0FBQyxDQUFDO0lBQ3pELElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1FBQzlCLElBQUksQ0FBQztZQUNILE1BQU0sT0FBTyxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3JELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFxQixDQUFDO1lBQ3ZELE1BQU0sUUFBUSxHQUFHLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQy9DLElBQUEsb0JBQVksRUFBQyxTQUFTLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDbEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLGVBQWUsT0FBTyxnQkFBZ0IsRUFBRSxDQUFDLENBQUM7WUFDbEUsT0FBTyxRQUFRLENBQUM7UUFDbEIsQ0FBQztRQUFDLE1BQU0sQ0FBQztZQUNQLE9BQU8sQ0FBQyxJQUFJLENBQUMsMERBQTBELENBQUMsQ0FBQztRQUMzRSxDQUFDO0lBQ0gsQ0FBQztJQUVELE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxFQUFFLEVBQUUsQ0FBQztBQUM5QyxDQUFDLENBQUM7QUE1QlcsUUFBQSxZQUFZLGdCQTRCdkI7QUFFRjs7R0FFRztBQUNILE1BQU0scUJBQXFCLEdBQUcsQ0FBQyxNQUF3QixFQUFpQixFQUFFO0lBQ3hFLE1BQU0sT0FBTyxHQUFrQixFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLEVBQUUsRUFBRSxDQUFDO0lBRXBFLEtBQUssTUFBTSxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1FBQzVELE9BQU8sQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLEdBQUc7WUFDdkIsV0FBVyxFQUFFLEtBQUssQ0FBQyxXQUFXO1lBQzlCLGNBQWMsRUFBRSxLQUFLLENBQUMsY0FBYztZQUNwQyxhQUFhLEVBQUUsQ0FBQztZQUNoQixPQUFPLEVBQUUsS0FBSyxDQUFDLFVBQVU7WUFDekIsV0FBVyxFQUFFLEtBQUssQ0FBQyxXQUFXO1lBQzlCLE9BQU8sRUFBRSxFQUFFO1NBQ1osQ0FBQztJQUNKLENBQUM7SUFFRCxPQUFPLE9BQU8sQ0FBQztBQUNqQixDQUFDLENBQUM7QUFFRjs7R0FFRztBQUNJLE1BQU0sWUFBWSxHQUFHLENBQUMsU0FBaUIsRUFBRSxPQUFzQixFQUFRLEVBQUU7SUFDOUUsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztJQUMzRCxFQUFFLENBQUMsYUFBYSxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNsRSxDQUFDLENBQUM7QUFIVyxRQUFBLFlBQVksZ0JBR3ZCO0FBRUY7O0dBRUc7QUFDSCxNQUFNLHFCQUFxQixHQUFHLENBQUMsSUFBcUIsRUFBa0IsRUFBRTtJQUN0RSxNQUFNLE1BQU0sR0FBbUIsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO0lBRW5ELElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQzlDLE1BQU0sQ0FBQyxVQUFVLEdBQUcsRUFBRSxDQUFDO1FBQ3ZCLEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxVQUFVLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1lBQ2hFLE1BQU0sQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcscUJBQXFCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDN0QsQ0FBQztJQUNILENBQUM7SUFFRCxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssT0FBTyxFQUFFLENBQUM7UUFDMUIsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLEtBQUssRUFBRSxVQUFVLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQztRQUNqRSxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQ25CLE1BQU0sQ0FBQyxLQUFLLEdBQUcsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUNsRCxLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsVUFBVSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDO2dCQUMvRCxNQUFNLENBQUMsS0FBSyxDQUFDLFVBQVcsQ0FBQyxHQUFHLENBQUMsR0FBRyxxQkFBcUIsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNwRSxDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPLE1BQU0sQ0FBQztBQUNoQixDQUFDLENBQUM7QUFFRjs7R0FFRztBQUNJLE1BQU0saUJBQWlCLEdBQUcsQ0FBQyxVQUEyQyxFQUFrQyxFQUFFO0lBQy9HLE1BQU0sTUFBTSxHQUFtQyxFQUFFLENBQUM7SUFDbEQsS0FBSyxNQUFNLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztRQUNyRCxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcscUJBQXFCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUNELE9BQU8sTUFBTSxDQUFDO0FBQ2hCLENBQUMsQ0FBQztBQU5XLFFBQUEsaUJBQWlCLHFCQU01QjtBQUVGOztHQUVHO0FBQ0gsTUFBTSxjQUFjLEdBQUcsQ0FDckIsU0FBcUMsRUFDckMsU0FBcUMsRUFDckMsUUFBZ0IsRUFDaEIsT0FBeUIsRUFDaEIsRUFBRTtJQUNYLElBQUksT0FBTyxHQUFHLElBQUksQ0FBQztJQUVuQixJQUFJLFNBQVMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQzVCLE9BQU8sR0FBRyxLQUFLLENBQUM7UUFDaEIsT0FBTyxDQUFDLElBQUksQ0FBQztZQUNYLElBQUksRUFBRSxTQUFTO1lBQ2YsWUFBWSxFQUFFLFFBQVE7WUFDdEIsT0FBTyxFQUFFLFNBQVMsQ0FBQyxJQUFJO1lBQ3ZCLE9BQU8sRUFBRSxhQUFhLFFBQVEsa0RBQWtEO1NBQ2pGLENBQUMsQ0FBQztRQUNILE9BQU8sT0FBTyxDQUFDO0lBQ2pCLENBQUM7SUFFRCxJQUFJLENBQUMsU0FBUyxJQUFJLFNBQVMsRUFBRSxDQUFDO1FBQzVCLE9BQU8sQ0FBQyxJQUFJLENBQUM7WUFDWCxJQUFJLEVBQUUsT0FBTztZQUNiLFlBQVksRUFBRSxRQUFRO1lBQ3RCLE9BQU8sRUFBRSxTQUFTLENBQUMsSUFBSTtZQUN2QixPQUFPLEVBQUUsaUJBQWlCLFFBQVEsTUFBTSxTQUFTLENBQUMsSUFBSSxjQUFjO1NBQ3JFLENBQUMsQ0FBQztRQUNILE9BQU8sT0FBTyxDQUFDO0lBQ2pCLENBQUM7SUFFRCxJQUFJLFNBQVMsSUFBSSxTQUFTLEVBQUUsQ0FBQztRQUMzQixJQUFJLFNBQVMsQ0FBQyxJQUFJLEtBQUssU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3RDLE9BQU8sR0FBRyxLQUFLLENBQUM7WUFDaEIsT0FBTyxDQUFDLElBQUksQ0FBQztnQkFDWCxJQUFJLEVBQUUsY0FBYztnQkFDcEIsWUFBWSxFQUFFLFFBQVE7Z0JBQ3RCLE9BQU8sRUFBRSxTQUFTLENBQUMsSUFBSTtnQkFDdkIsT0FBTyxFQUFFLFNBQVMsQ0FBQyxJQUFJO2dCQUN2QixPQUFPLEVBQUUsYUFBYSxRQUFRLHdCQUF3QixTQUFTLENBQUMsSUFBSSxTQUFTLFNBQVMsQ0FBQyxJQUFJLHFDQUFxQzthQUNqSSxDQUFDLENBQUM7WUFDSCxPQUFPLE9BQU8sQ0FBQztRQUNqQixDQUFDO1FBRUQsSUFBSSxTQUFTLENBQUMsVUFBVSxJQUFJLFNBQVMsQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNqRCxNQUFNLFFBQVEsR0FBRyxTQUFTLENBQUMsVUFBVSxJQUFJLEVBQUUsQ0FBQztZQUM1QyxNQUFNLFFBQVEsR0FBRyxTQUFTLENBQUMsVUFBVSxJQUFJLEVBQUUsQ0FBQztZQUM1QyxNQUFNLE9BQU8sR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRTlFLEtBQUssTUFBTSxHQUFHLElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQzFCLE1BQU0sV0FBVyxHQUFHLGNBQWMsQ0FDaEMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUNiLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFDYixHQUFHLFFBQVEsSUFBSSxHQUFHLEVBQUUsRUFDcEIsT0FBTyxDQUNSLENBQUM7Z0JBQ0YsSUFBSSxDQUFDLFdBQVc7b0JBQUUsT0FBTyxHQUFHLEtBQUssQ0FBQztZQUNwQyxDQUFDO1FBQ0gsQ0FBQztRQUVELElBQUksU0FBUyxDQUFDLEtBQUssSUFBSSxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDdkMsSUFBSSxTQUFTLENBQUMsS0FBSyxJQUFJLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDdkMsTUFBTSxZQUFZLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxVQUFVLElBQUksRUFBRSxDQUFDO2dCQUN0RCxNQUFNLFlBQVksR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLFVBQVUsSUFBSSxFQUFFLENBQUM7Z0JBQ3RELE1BQU0sT0FBTyxHQUFHLElBQUksR0FBRyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBRXRGLEtBQUssTUFBTSxHQUFHLElBQUksT0FBTyxFQUFFLENBQUM7b0JBQzFCLE1BQU0sV0FBVyxHQUFHLGNBQWMsQ0FDaEMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxFQUNqQixZQUFZLENBQUMsR0FBRyxDQUFDLEVBQ2pCLEdBQUcsUUFBUSxNQUFNLEdBQUcsRUFBRSxFQUN0QixPQUFPLENBQ1IsQ0FBQztvQkFDRixJQUFJLENBQUMsV0FBVzt3QkFBRSxPQUFPLEdBQUcsS0FBSyxDQUFDO2dCQUNwQyxDQUFDO1lBQ0gsQ0FBQztpQkFBTSxJQUFJLFNBQVMsQ0FBQyxLQUFLLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQy9DLE9BQU8sR0FBRyxLQUFLLENBQUM7Z0JBQ2hCLE9BQU8sQ0FBQyxJQUFJLENBQUM7b0JBQ1gsSUFBSSxFQUFFLFNBQVM7b0JBQ2YsWUFBWSxFQUFFLEdBQUcsUUFBUSxJQUFJO29CQUM3QixPQUFPLEVBQUUsNkJBQTZCLFFBQVEsa0RBQWtEO2lCQUNqRyxDQUFDLENBQUM7WUFDTCxDQUFDO2lCQUFNLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxJQUFJLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDL0MsT0FBTyxDQUFDLElBQUksQ0FBQztvQkFDWCxJQUFJLEVBQUUsT0FBTztvQkFDYixZQUFZLEVBQUUsR0FBRyxRQUFRLElBQUk7b0JBQzdCLE9BQU8sRUFBRSw2QkFBNkIsUUFBUSxjQUFjO2lCQUM3RCxDQUFDLENBQUM7WUFDTCxDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPLE9BQU8sQ0FBQztBQUNqQixDQUFDLENBQUM7QUFFRjs7R0FFRztBQUNJLE1BQU0saUJBQWlCLEdBQUcsQ0FDL0IsU0FBMkIsRUFDM0IsT0FBc0IsRUFDSixFQUFFO0lBQ3BCLE1BQU0sV0FBVyxHQUFHLFNBQVMsQ0FBQyxFQUFFLENBQUM7SUFDakMsTUFBTSxpQkFBaUIsR0FBRyxJQUFBLHlCQUFpQixFQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUNsRSxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBRXRELE1BQU0sTUFBTSxHQUFxQjtRQUMvQixXQUFXO1FBQ1gsY0FBYyxFQUFFLFNBQVMsQ0FBQyxLQUFLO1FBQy9CLE9BQU8sRUFBRSxJQUFJO1FBQ2IsT0FBTyxFQUFFLEVBQUU7UUFDWCxLQUFLLEVBQUUsQ0FBQyxhQUFhO0tBQ3RCLENBQUM7SUFFRixJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDbkIsT0FBTyxNQUFNLENBQUM7SUFDaEIsQ0FBQztJQUVELE1BQU0sYUFBYSxHQUFHLGFBQWEsQ0FBQyxPQUFPLENBQUM7SUFDNUMsTUFBTSxPQUFPLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEVBQUUsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRTVGLEtBQUssTUFBTSxHQUFHLElBQUksT0FBTyxFQUFFLENBQUM7UUFDMUIsTUFBTSxVQUFVLEdBQUcsY0FBYyxDQUMvQixhQUFhLENBQUMsR0FBRyxDQUFDLEVBQ2xCLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxFQUN0QixHQUFHLEVBQ0gsTUFBTSxDQUFDLE9BQU8sQ0FDZixDQUFDO1FBQ0YsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2hCLE1BQU0sQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO1FBQ3pCLENBQUM7SUFDSCxDQUFDO0lBRUQsT0FBTyxNQUFNLENBQUM7QUFDaEIsQ0FBQyxDQUFDO0FBcENXLFFBQUEsaUJBQWlCLHFCQW9DNUI7QUFFRjs7OztHQUlHO0FBQ0ksTUFBTSxjQUFjLEdBQUcsQ0FDNUIsU0FBMkIsRUFDM0IsT0FBc0IsRUFDUCxFQUFFO0lBQ2pCLE1BQU0saUJBQWlCLEdBQUcsSUFBQSx5QkFBaUIsRUFBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDbEUsTUFBTSxhQUFhLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7SUFFdkQsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ25CLE9BQU87WUFDTCxHQUFHLE9BQU87WUFDVixVQUFVLEVBQUU7Z0JBQ1YsR0FBRyxPQUFPLENBQUMsVUFBVTtnQkFDckIsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLEVBQUU7b0JBQ2QsV0FBVyxFQUFFLFNBQVMsQ0FBQyxFQUFFO29CQUN6QixjQUFjLEVBQUUsU0FBUyxDQUFDLEtBQUs7b0JBQy9CLGFBQWEsRUFBRSxDQUFDO29CQUNoQixPQUFPLEVBQUUsaUJBQWlCO29CQUMxQixXQUFXLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7b0JBQ3JDLE9BQU8sRUFBRSxFQUFFO2lCQUNaO2FBQ0Y7U0FDRixDQUFDO0lBQ0osQ0FBQztJQUVELE1BQU0sT0FBTyxHQUFxQixFQUFFLENBQUM7SUFDckMsTUFBTSxPQUFPLEdBQUcsSUFBSSxHQUFHLENBQUM7UUFDdEIsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUM7UUFDckMsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDO0tBQ2xDLENBQUMsQ0FBQztJQUNILElBQUksV0FBVyxHQUFHLEtBQUssQ0FBQztJQUV4QixLQUFLLE1BQU0sR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQzFCLE1BQU0sS0FBSyxHQUFHLGNBQWMsQ0FDMUIsYUFBYSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFDMUIsaUJBQWlCLENBQUMsR0FBRyxDQUFDLEVBQ3RCLEdBQUcsRUFDSCxPQUFPLENBQ1IsQ0FBQztRQUNGLElBQUksQ0FBQyxLQUFLO1lBQUUsV0FBVyxHQUFHLElBQUksQ0FBQztJQUNqQyxDQUFDO0lBRUQsTUFBTSxlQUFlLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FDcEMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssU0FBUyxJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssY0FBYyxDQUN6RCxDQUFDO0lBRUYsSUFBSSxjQUFjLEdBQUcsQ0FBQyxHQUFHLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNoRCxJQUFJLFdBQVcsR0FBRyxhQUFhLENBQUMsYUFBYSxDQUFDO0lBRTlDLElBQUksV0FBVyxJQUFJLGVBQWUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDOUMsY0FBYyxHQUFHO1lBQ2Y7Z0JBQ0UsT0FBTyxFQUFFLGFBQWEsQ0FBQyxhQUFhO2dCQUNwQyxNQUFNLEVBQUUsYUFBYSxDQUFDLE9BQU87Z0JBQzdCLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtnQkFDbkMsT0FBTyxFQUFFLGVBQWU7YUFDekI7WUFDRCxHQUFHLGNBQWM7U0FDbEIsQ0FBQztRQUNGLFdBQVcsR0FBRyxhQUFhLENBQUMsYUFBYSxHQUFHLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRUQsT0FBTztRQUNMLEdBQUcsT0FBTztRQUNWLFVBQVUsRUFBRTtZQUNWLEdBQUcsT0FBTyxDQUFDLFVBQVU7WUFDckIsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLEVBQUU7Z0JBQ2QsV0FBVyxFQUFFLFNBQVMsQ0FBQyxFQUFFO2dCQUN6QixjQUFjLEVBQUUsU0FBUyxDQUFDLEtBQUs7Z0JBQy9CLGFBQWEsRUFBRSxXQUFXO2dCQUMxQixPQUFPLEVBQUUsaUJBQWlCO2dCQUMxQixXQUFXLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7Z0JBQ3JDLE9BQU8sRUFBRSxjQUFjO2FBQ3hCO1NBQ0Y7S0FDRixDQUFDO0FBQ0osQ0FBQyxDQUFDO0FBM0VXLFFBQUEsY0FBYyxrQkEyRXpCO0FBRUY7O0dBRUc7QUFDSSxNQUFNLG1CQUFtQixHQUFHLENBQ2pDLE9BQXNCLEVBQ3RCLFdBQW1CLEVBQ2EsRUFBRTtJQUNsQyxPQUFPLE9BQU8sQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUM7QUFDekMsQ0FBQyxDQUFDO0FBTFcsUUFBQSxtQkFBbUIsdUJBSzlCO0FBRUY7O0dBRUc7QUFDSSxNQUFNLHNCQUFzQixHQUFHLENBQUMsTUFBd0IsRUFBVSxFQUFFO0lBQ3pFLE1BQU0sS0FBSyxHQUFhLEVBQUUsQ0FBQztJQUUzQixJQUFJLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNqQixLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssTUFBTSxDQUFDLGNBQWMsS0FBSyxNQUFNLENBQUMsV0FBVyxHQUFHLENBQUMsQ0FBQztRQUNqRSxLQUFLLENBQUMsSUFBSSxDQUFDLDZEQUE2RCxDQUFDLENBQUM7UUFDMUUsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzFCLENBQUM7SUFFRCxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztJQUM1QyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxJQUFJLE1BQU0sQ0FBQyxjQUFjLEtBQUssTUFBTSxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUM7SUFFdkUsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUNoQyxLQUFLLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxDQUFDLENBQUM7SUFDaEQsQ0FBQztTQUFNLENBQUM7UUFDTixNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssU0FBUyxJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssY0FBYyxDQUFDLENBQUM7UUFDL0YsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLE9BQU8sQ0FBQyxDQUFDO1FBRWpFLElBQUksUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN4QixLQUFLLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLENBQUM7WUFDbkMsS0FBSyxNQUFNLE1BQU0sSUFBSSxRQUFRLEVBQUUsQ0FBQztnQkFDOUIsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQ3hDLENBQUM7UUFDSCxDQUFDO1FBRUQsSUFBSSxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3pCLEtBQUssQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDNUIsS0FBSyxNQUFNLE1BQU0sSUFBSSxTQUFTLEVBQUUsQ0FBQztnQkFDL0IsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQ3hDLENBQUM7UUFDSCxDQUFDO0lBQ0gsQ0FBQztJQUVELE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUMxQixDQUFDLENBQUM7QUFsQ1csUUFBQSxzQkFBc0IsMEJBa0NqQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogU2NoZW1hIEhpc3RvcnkgLSBUcmFja3MgcHJvcGVydHkgc2NoZW1hcyBhY3Jvc3MgY29tcGlsYXRpb25zIHdpdGhcbiAqIHZlcnNpb25lZCBoaXN0b3J5IHRvIGRldGVjdCBicmVha2luZyBjaGFuZ2VzIGFuZCBlbmFibGUgYXV0b21hdGljXG4gKiBHdXRlbmJlcmcgYmxvY2sgZGVwcmVjYXRpb24gZ2VuZXJhdGlvbi5cbiAqL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgSGFuZG9mZkNvbXBvbmVudCwgSGFuZG9mZlByb3BlcnR5IH0gZnJvbSAnLi4vdHlwZXMnO1xuXG4vKipcbiAqIFJlY3Vyc2l2ZSBwcm9wZXJ0eSBzY2hlbWEgdGhhdCBmdWxseSBkZXNjcmliZXMgbmVzdGVkIHN0cnVjdHVyZXNcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBQcm9wZXJ0eVNjaGVtYSB7XG4gIHR5cGU6IHN0cmluZztcbiAgcHJvcGVydGllcz86IFJlY29yZDxzdHJpbmcsIFByb3BlcnR5U2NoZW1hPjtcbiAgaXRlbXM/OiBQcm9wZXJ0eVNjaGVtYTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTY2hlbWFIaXN0b3J5VmVyc2lvbiB7XG4gIHZlcnNpb246IG51bWJlcjtcbiAgc2NoZW1hOiBSZWNvcmQ8c3RyaW5nLCBQcm9wZXJ0eVNjaGVtYT47XG4gIGNoYW5nZWRBdDogc3RyaW5nO1xuICBjaGFuZ2VzOiBQcm9wZXJ0eUNoYW5nZVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNjaGVtYUhpc3RvcnlFbnRyeSB7XG4gIGNvbXBvbmVudElkOiBzdHJpbmc7XG4gIGNvbXBvbmVudFRpdGxlOiBzdHJpbmc7XG4gIHNjaGVtYVZlcnNpb246IG51bWJlcjtcbiAgY3VycmVudDogUmVjb3JkPHN0cmluZywgUHJvcGVydHlTY2hlbWE+O1xuICBsYXN0VXBkYXRlZDogc3RyaW5nO1xuICBoaXN0b3J5OiBTY2hlbWFIaXN0b3J5VmVyc2lvbltdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNjaGVtYUhpc3Rvcnkge1xuICB2ZXJzaW9uOiBzdHJpbmc7XG4gIGNvbXBvbmVudHM6IFJlY29yZDxzdHJpbmcsIFNjaGVtYUhpc3RvcnlFbnRyeT47XG59XG5cbi8qKiBAZGVwcmVjYXRlZCBLZXB0IGZvciBiYWNrd2FyZC1jb21wYXQgbG9hZGluZyBvZiBvbGQgcHJvcGVydHktbWFuaWZlc3QuanNvbiAqL1xuZXhwb3J0IGludGVyZmFjZSBQcm9wZXJ0eU1hbmlmZXN0RW50cnkge1xuICBjb21wb25lbnRJZDogc3RyaW5nO1xuICBjb21wb25lbnRUaXRsZTogc3RyaW5nO1xuICBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBQcm9wZXJ0eVNjaGVtYT47XG4gIGxhc3RVcGRhdGVkOiBzdHJpbmc7XG59XG5cbi8qKiBAZGVwcmVjYXRlZCBLZXB0IGZvciBiYWNrd2FyZC1jb21wYXQgbG9hZGluZyBvZiBvbGQgcHJvcGVydHktbWFuaWZlc3QuanNvbiAqL1xuZXhwb3J0IGludGVyZmFjZSBQcm9wZXJ0eU1hbmlmZXN0IHtcbiAgdmVyc2lvbjogc3RyaW5nO1xuICBjb21wb25lbnRzOiBSZWNvcmQ8c3RyaW5nLCBQcm9wZXJ0eU1hbmlmZXN0RW50cnk+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByb3BlcnR5Q2hhbmdlIHtcbiAgdHlwZTogJ2FkZGVkJyB8ICdyZW1vdmVkJyB8ICd0eXBlX2NoYW5nZWQnO1xuICBwcm9wZXJ0eVBhdGg6IHN0cmluZztcbiAgb2xkVHlwZT86IHN0cmluZztcbiAgbmV3VHlwZT86IHN0cmluZztcbiAgbWVzc2FnZTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZhbGlkYXRpb25SZXN1bHQge1xuICBjb21wb25lbnRJZDogc3RyaW5nO1xuICBjb21wb25lbnRUaXRsZTogc3RyaW5nO1xuICBpc1ZhbGlkOiBib29sZWFuO1xuICBjaGFuZ2VzOiBQcm9wZXJ0eUNoYW5nZVtdO1xuICBpc05ldzogYm9vbGVhbjtcbn1cblxuY29uc3QgSElTVE9SWV9GSUxFTkFNRSA9ICdzY2hlbWEtaGlzdG9yeS5qc29uJztcbmNvbnN0IExFR0FDWV9GSUxFTkFNRSA9ICdwcm9wZXJ0eS1tYW5pZmVzdC5qc29uJztcblxuLyoqXG4gKiBMb2FkIHRoZSBzY2hlbWEgaGlzdG9yeSBmcm9tIGRpc2ssIG1pZ3JhdGluZyBmcm9tIHRoZSBsZWdhY3kgZm9ybWF0IGlmIG5lZWRlZC5cbiAqL1xuZXhwb3J0IGNvbnN0IGxvYWRNYW5pZmVzdCA9IChvdXRwdXREaXI6IHN0cmluZyk6IFNjaGVtYUhpc3RvcnkgPT4ge1xuICBjb25zdCBoaXN0b3J5UGF0aCA9IHBhdGguam9pbihvdXRwdXREaXIsIEhJU1RPUllfRklMRU5BTUUpO1xuXG4gIGlmIChmcy5leGlzdHNTeW5jKGhpc3RvcnlQYXRoKSkge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBjb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGhpc3RvcnlQYXRoLCAndXRmLTgnKTtcbiAgICAgIHJldHVybiBKU09OLnBhcnNlKGNvbnRlbnQpIGFzIFNjaGVtYUhpc3Rvcnk7XG4gICAgfSBjYXRjaCB7XG4gICAgICBjb25zb2xlLndhcm4oYFdhcm5pbmc6IENvdWxkIG5vdCBwYXJzZSAke0hJU1RPUllfRklMRU5BTUV9LCBzdGFydGluZyBmcmVzaGApO1xuICAgICAgcmV0dXJuIHsgdmVyc2lvbjogJzIuMC4wJywgY29tcG9uZW50czoge30gfTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBsZWdhY3lQYXRoID0gcGF0aC5qb2luKG91dHB1dERpciwgTEVHQUNZX0ZJTEVOQU1FKTtcbiAgaWYgKGZzLmV4aXN0c1N5bmMobGVnYWN5UGF0aCkpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhsZWdhY3lQYXRoLCAndXRmLTgnKTtcbiAgICAgIGNvbnN0IGxlZ2FjeSA9IEpTT04ucGFyc2UoY29udGVudCkgYXMgUHJvcGVydHlNYW5pZmVzdDtcbiAgICAgIGNvbnN0IG1pZ3JhdGVkID0gbWlncmF0ZUxlZ2FjeU1hbmlmZXN0KGxlZ2FjeSk7XG4gICAgICBzYXZlTWFuaWZlc3Qob3V0cHV0RGlyLCBtaWdyYXRlZCk7XG4gICAgICBjb25zb2xlLmxvZyhgTWlncmF0ZWQgJHtMRUdBQ1lfRklMRU5BTUV9IHRvICR7SElTVE9SWV9GSUxFTkFNRX1gKTtcbiAgICAgIHJldHVybiBtaWdyYXRlZDtcbiAgICB9IGNhdGNoIHtcbiAgICAgIGNvbnNvbGUud2FybihgV2FybmluZzogQ291bGQgbm90IHBhcnNlIGxlZ2FjeSBtYW5pZmVzdCwgc3RhcnRpbmcgZnJlc2hgKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4geyB2ZXJzaW9uOiAnMi4wLjAnLCBjb21wb25lbnRzOiB7fSB9O1xufTtcblxuLyoqXG4gKiBDb252ZXJ0IG9sZCBwcm9wZXJ0eS1tYW5pZmVzdC5qc29uIGludG8gdGhlIG5ldyBzY2hlbWEtaGlzdG9yeSBmb3JtYXQuXG4gKi9cbmNvbnN0IG1pZ3JhdGVMZWdhY3lNYW5pZmVzdCA9IChsZWdhY3k6IFByb3BlcnR5TWFuaWZlc3QpOiBTY2hlbWFIaXN0b3J5ID0+IHtcbiAgY29uc3QgaGlzdG9yeTogU2NoZW1hSGlzdG9yeSA9IHsgdmVyc2lvbjogJzIuMC4wJywgY29tcG9uZW50czoge30gfTtcblxuICBmb3IgKGNvbnN0IFtpZCwgZW50cnldIG9mIE9iamVjdC5lbnRyaWVzKGxlZ2FjeS5jb21wb25lbnRzKSkge1xuICAgIGhpc3RvcnkuY29tcG9uZW50c1tpZF0gPSB7XG4gICAgICBjb21wb25lbnRJZDogZW50cnkuY29tcG9uZW50SWQsXG4gICAgICBjb21wb25lbnRUaXRsZTogZW50cnkuY29tcG9uZW50VGl0bGUsXG4gICAgICBzY2hlbWFWZXJzaW9uOiAxLFxuICAgICAgY3VycmVudDogZW50cnkucHJvcGVydGllcyxcbiAgICAgIGxhc3RVcGRhdGVkOiBlbnRyeS5sYXN0VXBkYXRlZCxcbiAgICAgIGhpc3Rvcnk6IFtdLFxuICAgIH07XG4gIH1cblxuICByZXR1cm4gaGlzdG9yeTtcbn07XG5cbi8qKlxuICogU2F2ZSB0aGUgc2NoZW1hIGhpc3RvcnkgdG8gZGlza1xuICovXG5leHBvcnQgY29uc3Qgc2F2ZU1hbmlmZXN0ID0gKG91dHB1dERpcjogc3RyaW5nLCBoaXN0b3J5OiBTY2hlbWFIaXN0b3J5KTogdm9pZCA9PiB7XG4gIGNvbnN0IGhpc3RvcnlQYXRoID0gcGF0aC5qb2luKG91dHB1dERpciwgSElTVE9SWV9GSUxFTkFNRSk7XG4gIGZzLndyaXRlRmlsZVN5bmMoaGlzdG9yeVBhdGgsIEpTT04uc3RyaW5naWZ5KGhpc3RvcnksIG51bGwsIDIpKTtcbn07XG5cbi8qKlxuICogUmVjdXJzaXZlbHkgZXh0cmFjdCBwcm9wZXJ0eSBzY2hlbWEgZnJvbSBhIEhhbmRvZmZQcm9wZXJ0eVxuICovXG5jb25zdCBleHRyYWN0UHJvcGVydHlTY2hlbWEgPSAocHJvcDogSGFuZG9mZlByb3BlcnR5KTogUHJvcGVydHlTY2hlbWEgPT4ge1xuICBjb25zdCBzY2hlbWE6IFByb3BlcnR5U2NoZW1hID0geyB0eXBlOiBwcm9wLnR5cGUgfTtcblxuICBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICBzY2hlbWEucHJvcGVydGllcyA9IHt9O1xuICAgIGZvciAoY29uc3QgW2tleSwgbmVzdGVkUHJvcF0gb2YgT2JqZWN0LmVudHJpZXMocHJvcC5wcm9wZXJ0aWVzKSkge1xuICAgICAgc2NoZW1hLnByb3BlcnRpZXNba2V5XSA9IGV4dHJhY3RQcm9wZXJ0eVNjaGVtYShuZXN0ZWRQcm9wKTtcbiAgICB9XG4gIH1cblxuICBpZiAocHJvcC50eXBlID09PSAnYXJyYXknKSB7XG4gICAgY29uc3QgaXRlbVByb3BlcnRpZXMgPSBwcm9wLml0ZW1zPy5wcm9wZXJ0aWVzIHx8IHByb3AucHJvcGVydGllcztcbiAgICBpZiAoaXRlbVByb3BlcnRpZXMpIHtcbiAgICAgIHNjaGVtYS5pdGVtcyA9IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH07XG4gICAgICBmb3IgKGNvbnN0IFtrZXksIG5lc3RlZFByb3BdIG9mIE9iamVjdC5lbnRyaWVzKGl0ZW1Qcm9wZXJ0aWVzKSkge1xuICAgICAgICBzY2hlbWEuaXRlbXMucHJvcGVydGllcyFba2V5XSA9IGV4dHJhY3RQcm9wZXJ0eVNjaGVtYShuZXN0ZWRQcm9wKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gc2NoZW1hO1xufTtcblxuLyoqXG4gKiBFeHRyYWN0IGFsbCBwcm9wZXJ0eSBzY2hlbWFzIGZyb20gYSBjb21wb25lbnRcbiAqL1xuZXhwb3J0IGNvbnN0IGV4dHJhY3RQcm9wZXJ0aWVzID0gKHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4pOiBSZWNvcmQ8c3RyaW5nLCBQcm9wZXJ0eVNjaGVtYT4gPT4ge1xuICBjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIFByb3BlcnR5U2NoZW1hPiA9IHt9O1xuICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMpKSB7XG4gICAgcmVzdWx0W2tleV0gPSBleHRyYWN0UHJvcGVydHlTY2hlbWEocHJvcCk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogUmVjdXJzaXZlbHkgY29tcGFyZSB0d28gcHJvcGVydHkgc2NoZW1hcyBhbmQgY29sbGVjdCBjaGFuZ2VzXG4gKi9cbmNvbnN0IGNvbXBhcmVTY2hlbWFzID0gKFxuICBvbGRTY2hlbWE6IFByb3BlcnR5U2NoZW1hIHwgdW5kZWZpbmVkLFxuICBuZXdTY2hlbWE6IFByb3BlcnR5U2NoZW1hIHwgdW5kZWZpbmVkLFxuICBwcm9wUGF0aDogc3RyaW5nLFxuICBjaGFuZ2VzOiBQcm9wZXJ0eUNoYW5nZVtdXG4pOiBib29sZWFuID0+IHtcbiAgbGV0IGlzVmFsaWQgPSB0cnVlO1xuXG4gIGlmIChvbGRTY2hlbWEgJiYgIW5ld1NjaGVtYSkge1xuICAgIGlzVmFsaWQgPSBmYWxzZTtcbiAgICBjaGFuZ2VzLnB1c2goe1xuICAgICAgdHlwZTogJ3JlbW92ZWQnLFxuICAgICAgcHJvcGVydHlQYXRoOiBwcm9wUGF0aCxcbiAgICAgIG9sZFR5cGU6IG9sZFNjaGVtYS50eXBlLFxuICAgICAgbWVzc2FnZTogYFByb3BlcnR5IFwiJHtwcm9wUGF0aH1cIiB3YXMgcmVtb3ZlZC4gVGhpcyB3aWxsIGJyZWFrIGV4aXN0aW5nIGNvbnRlbnQuYFxuICAgIH0pO1xuICAgIHJldHVybiBpc1ZhbGlkO1xuICB9XG5cbiAgaWYgKCFvbGRTY2hlbWEgJiYgbmV3U2NoZW1hKSB7XG4gICAgY2hhbmdlcy5wdXNoKHtcbiAgICAgIHR5cGU6ICdhZGRlZCcsXG4gICAgICBwcm9wZXJ0eVBhdGg6IHByb3BQYXRoLFxuICAgICAgbmV3VHlwZTogbmV3U2NoZW1hLnR5cGUsXG4gICAgICBtZXNzYWdlOiBgTmV3IHByb3BlcnR5IFwiJHtwcm9wUGF0aH1cIiAoJHtuZXdTY2hlbWEudHlwZX0pIHdhcyBhZGRlZC5gXG4gICAgfSk7XG4gICAgcmV0dXJuIGlzVmFsaWQ7XG4gIH1cblxuICBpZiAob2xkU2NoZW1hICYmIG5ld1NjaGVtYSkge1xuICAgIGlmIChvbGRTY2hlbWEudHlwZSAhPT0gbmV3U2NoZW1hLnR5cGUpIHtcbiAgICAgIGlzVmFsaWQgPSBmYWxzZTtcbiAgICAgIGNoYW5nZXMucHVzaCh7XG4gICAgICAgIHR5cGU6ICd0eXBlX2NoYW5nZWQnLFxuICAgICAgICBwcm9wZXJ0eVBhdGg6IHByb3BQYXRoLFxuICAgICAgICBvbGRUeXBlOiBvbGRTY2hlbWEudHlwZSxcbiAgICAgICAgbmV3VHlwZTogbmV3U2NoZW1hLnR5cGUsXG4gICAgICAgIG1lc3NhZ2U6IGBQcm9wZXJ0eSBcIiR7cHJvcFBhdGh9XCIgdHlwZSBjaGFuZ2VkIGZyb20gXCIke29sZFNjaGVtYS50eXBlfVwiIHRvIFwiJHtuZXdTY2hlbWEudHlwZX1cIi4gVGhpcyBtYXkgYnJlYWsgZXhpc3RpbmcgY29udGVudC5gXG4gICAgICB9KTtcbiAgICAgIHJldHVybiBpc1ZhbGlkO1xuICAgIH1cblxuICAgIGlmIChvbGRTY2hlbWEucHJvcGVydGllcyB8fCBuZXdTY2hlbWEucHJvcGVydGllcykge1xuICAgICAgY29uc3Qgb2xkUHJvcHMgPSBvbGRTY2hlbWEucHJvcGVydGllcyB8fCB7fTtcbiAgICAgIGNvbnN0IG5ld1Byb3BzID0gbmV3U2NoZW1hLnByb3BlcnRpZXMgfHwge307XG4gICAgICBjb25zdCBhbGxLZXlzID0gbmV3IFNldChbLi4uT2JqZWN0LmtleXMob2xkUHJvcHMpLCAuLi5PYmplY3Qua2V5cyhuZXdQcm9wcyldKTtcblxuICAgICAgZm9yIChjb25zdCBrZXkgb2YgYWxsS2V5cykge1xuICAgICAgICBjb25zdCBuZXN0ZWRWYWxpZCA9IGNvbXBhcmVTY2hlbWFzKFxuICAgICAgICAgIG9sZFByb3BzW2tleV0sXG4gICAgICAgICAgbmV3UHJvcHNba2V5XSxcbiAgICAgICAgICBgJHtwcm9wUGF0aH0uJHtrZXl9YCxcbiAgICAgICAgICBjaGFuZ2VzXG4gICAgICAgICk7XG4gICAgICAgIGlmICghbmVzdGVkVmFsaWQpIGlzVmFsaWQgPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAob2xkU2NoZW1hLml0ZW1zIHx8IG5ld1NjaGVtYS5pdGVtcykge1xuICAgICAgaWYgKG9sZFNjaGVtYS5pdGVtcyAmJiBuZXdTY2hlbWEuaXRlbXMpIHtcbiAgICAgICAgY29uc3Qgb2xkSXRlbVByb3BzID0gb2xkU2NoZW1hLml0ZW1zLnByb3BlcnRpZXMgfHwge307XG4gICAgICAgIGNvbnN0IG5ld0l0ZW1Qcm9wcyA9IG5ld1NjaGVtYS5pdGVtcy5wcm9wZXJ0aWVzIHx8IHt9O1xuICAgICAgICBjb25zdCBhbGxLZXlzID0gbmV3IFNldChbLi4uT2JqZWN0LmtleXMob2xkSXRlbVByb3BzKSwgLi4uT2JqZWN0LmtleXMobmV3SXRlbVByb3BzKV0pO1xuXG4gICAgICAgIGZvciAoY29uc3Qga2V5IG9mIGFsbEtleXMpIHtcbiAgICAgICAgICBjb25zdCBuZXN0ZWRWYWxpZCA9IGNvbXBhcmVTY2hlbWFzKFxuICAgICAgICAgICAgb2xkSXRlbVByb3BzW2tleV0sXG4gICAgICAgICAgICBuZXdJdGVtUHJvcHNba2V5XSxcbiAgICAgICAgICAgIGAke3Byb3BQYXRofVtdLiR7a2V5fWAsXG4gICAgICAgICAgICBjaGFuZ2VzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAoIW5lc3RlZFZhbGlkKSBpc1ZhbGlkID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAob2xkU2NoZW1hLml0ZW1zICYmICFuZXdTY2hlbWEuaXRlbXMpIHtcbiAgICAgICAgaXNWYWxpZCA9IGZhbHNlO1xuICAgICAgICBjaGFuZ2VzLnB1c2goe1xuICAgICAgICAgIHR5cGU6ICdyZW1vdmVkJyxcbiAgICAgICAgICBwcm9wZXJ0eVBhdGg6IGAke3Byb3BQYXRofVtdYCxcbiAgICAgICAgICBtZXNzYWdlOiBgQXJyYXkgaXRlbSBzdHJ1Y3R1cmUgZm9yIFwiJHtwcm9wUGF0aH1cIiB3YXMgcmVtb3ZlZC4gVGhpcyB3aWxsIGJyZWFrIGV4aXN0aW5nIGNvbnRlbnQuYFxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSBpZiAoIW9sZFNjaGVtYS5pdGVtcyAmJiBuZXdTY2hlbWEuaXRlbXMpIHtcbiAgICAgICAgY2hhbmdlcy5wdXNoKHtcbiAgICAgICAgICB0eXBlOiAnYWRkZWQnLFxuICAgICAgICAgIHByb3BlcnR5UGF0aDogYCR7cHJvcFBhdGh9W11gLFxuICAgICAgICAgIG1lc3NhZ2U6IGBBcnJheSBpdGVtIHN0cnVjdHVyZSBmb3IgXCIke3Byb3BQYXRofVwiIHdhcyBhZGRlZC5gXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBpc1ZhbGlkO1xufTtcblxuLyoqXG4gKiBDb21wYXJlIGN1cnJlbnQgcHJvcGVydGllcyBhZ2FpbnN0IHRoZSBzdG9yZWQgaGlzdG9yeSBlbnRyeVxuICovXG5leHBvcnQgY29uc3QgdmFsaWRhdGVDb21wb25lbnQgPSAoXG4gIGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudCxcbiAgaGlzdG9yeTogU2NoZW1hSGlzdG9yeVxuKTogVmFsaWRhdGlvblJlc3VsdCA9PiB7XG4gIGNvbnN0IGNvbXBvbmVudElkID0gY29tcG9uZW50LmlkO1xuICBjb25zdCBjdXJyZW50UHJvcGVydGllcyA9IGV4dHJhY3RQcm9wZXJ0aWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKTtcbiAgY29uc3QgZXhpc3RpbmdFbnRyeSA9IGhpc3RvcnkuY29tcG9uZW50c1tjb21wb25lbnRJZF07XG5cbiAgY29uc3QgcmVzdWx0OiBWYWxpZGF0aW9uUmVzdWx0ID0ge1xuICAgIGNvbXBvbmVudElkLFxuICAgIGNvbXBvbmVudFRpdGxlOiBjb21wb25lbnQudGl0bGUsXG4gICAgaXNWYWxpZDogdHJ1ZSxcbiAgICBjaGFuZ2VzOiBbXSxcbiAgICBpc05ldzogIWV4aXN0aW5nRW50cnlcbiAgfTtcblxuICBpZiAoIWV4aXN0aW5nRW50cnkpIHtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgY29uc3Qgb2xkUHJvcGVydGllcyA9IGV4aXN0aW5nRW50cnkuY3VycmVudDtcbiAgY29uc3QgYWxsS2V5cyA9IG5ldyBTZXQoWy4uLk9iamVjdC5rZXlzKG9sZFByb3BlcnRpZXMpLCAuLi5PYmplY3Qua2V5cyhjdXJyZW50UHJvcGVydGllcyldKTtcblxuICBmb3IgKGNvbnN0IGtleSBvZiBhbGxLZXlzKSB7XG4gICAgY29uc3QgaXNLZXlWYWxpZCA9IGNvbXBhcmVTY2hlbWFzKFxuICAgICAgb2xkUHJvcGVydGllc1trZXldLFxuICAgICAgY3VycmVudFByb3BlcnRpZXNba2V5XSxcbiAgICAgIGtleSxcbiAgICAgIHJlc3VsdC5jaGFuZ2VzXG4gICAgKTtcbiAgICBpZiAoIWlzS2V5VmFsaWQpIHtcbiAgICAgIHJlc3VsdC5pc1ZhbGlkID0gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogVXBkYXRlIHRoZSBoaXN0b3J5IHdpdGggdGhlIGN1cnJlbnQgY29tcG9uZW50IHByb3BlcnRpZXMuXG4gKiBJZiB0aGVyZSBhcmUgYnJlYWtpbmcgY2hhbmdlcywgdGhlIG9sZCBzY2hlbWEgaXMgcHVzaGVkIHRvIGhpc3RvcnlcbiAqIGFuZCB0aGUgc2NoZW1hIHZlcnNpb24gaXMgaW5jcmVtZW50ZWQuXG4gKi9cbmV4cG9ydCBjb25zdCB1cGRhdGVNYW5pZmVzdCA9IChcbiAgY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50LFxuICBoaXN0b3J5OiBTY2hlbWFIaXN0b3J5XG4pOiBTY2hlbWFIaXN0b3J5ID0+IHtcbiAgY29uc3QgY3VycmVudFByb3BlcnRpZXMgPSBleHRyYWN0UHJvcGVydGllcyhjb21wb25lbnQucHJvcGVydGllcyk7XG4gIGNvbnN0IGV4aXN0aW5nRW50cnkgPSBoaXN0b3J5LmNvbXBvbmVudHNbY29tcG9uZW50LmlkXTtcblxuICBpZiAoIWV4aXN0aW5nRW50cnkpIHtcbiAgICByZXR1cm4ge1xuICAgICAgLi4uaGlzdG9yeSxcbiAgICAgIGNvbXBvbmVudHM6IHtcbiAgICAgICAgLi4uaGlzdG9yeS5jb21wb25lbnRzLFxuICAgICAgICBbY29tcG9uZW50LmlkXToge1xuICAgICAgICAgIGNvbXBvbmVudElkOiBjb21wb25lbnQuaWQsXG4gICAgICAgICAgY29tcG9uZW50VGl0bGU6IGNvbXBvbmVudC50aXRsZSxcbiAgICAgICAgICBzY2hlbWFWZXJzaW9uOiAxLFxuICAgICAgICAgIGN1cnJlbnQ6IGN1cnJlbnRQcm9wZXJ0aWVzLFxuICAgICAgICAgIGxhc3RVcGRhdGVkOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgaGlzdG9yeTogW10sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH07XG4gIH1cblxuICBjb25zdCBjaGFuZ2VzOiBQcm9wZXJ0eUNoYW5nZVtdID0gW107XG4gIGNvbnN0IGFsbEtleXMgPSBuZXcgU2V0KFtcbiAgICAuLi5PYmplY3Qua2V5cyhleGlzdGluZ0VudHJ5LmN1cnJlbnQpLFxuICAgIC4uLk9iamVjdC5rZXlzKGN1cnJlbnRQcm9wZXJ0aWVzKSxcbiAgXSk7XG4gIGxldCBoYXNCcmVha2luZyA9IGZhbHNlO1xuXG4gIGZvciAoY29uc3Qga2V5IG9mIGFsbEtleXMpIHtcbiAgICBjb25zdCB2YWxpZCA9IGNvbXBhcmVTY2hlbWFzKFxuICAgICAgZXhpc3RpbmdFbnRyeS5jdXJyZW50W2tleV0sXG4gICAgICBjdXJyZW50UHJvcGVydGllc1trZXldLFxuICAgICAga2V5LFxuICAgICAgY2hhbmdlc1xuICAgICk7XG4gICAgaWYgKCF2YWxpZCkgaGFzQnJlYWtpbmcgPSB0cnVlO1xuICB9XG5cbiAgY29uc3QgYnJlYWtpbmdDaGFuZ2VzID0gY2hhbmdlcy5maWx0ZXIoXG4gICAgKGMpID0+IGMudHlwZSA9PT0gJ3JlbW92ZWQnIHx8IGMudHlwZSA9PT0gJ3R5cGVfY2hhbmdlZCdcbiAgKTtcblxuICBsZXQgdXBkYXRlZEhpc3RvcnkgPSBbLi4uZXhpc3RpbmdFbnRyeS5oaXN0b3J5XTtcbiAgbGV0IG5leHRWZXJzaW9uID0gZXhpc3RpbmdFbnRyeS5zY2hlbWFWZXJzaW9uO1xuXG4gIGlmIChoYXNCcmVha2luZyAmJiBicmVha2luZ0NoYW5nZXMubGVuZ3RoID4gMCkge1xuICAgIHVwZGF0ZWRIaXN0b3J5ID0gW1xuICAgICAge1xuICAgICAgICB2ZXJzaW9uOiBleGlzdGluZ0VudHJ5LnNjaGVtYVZlcnNpb24sXG4gICAgICAgIHNjaGVtYTogZXhpc3RpbmdFbnRyeS5jdXJyZW50LFxuICAgICAgICBjaGFuZ2VkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgY2hhbmdlczogYnJlYWtpbmdDaGFuZ2VzLFxuICAgICAgfSxcbiAgICAgIC4uLnVwZGF0ZWRIaXN0b3J5LFxuICAgIF07XG4gICAgbmV4dFZlcnNpb24gPSBleGlzdGluZ0VudHJ5LnNjaGVtYVZlcnNpb24gKyAxO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICAuLi5oaXN0b3J5LFxuICAgIGNvbXBvbmVudHM6IHtcbiAgICAgIC4uLmhpc3RvcnkuY29tcG9uZW50cyxcbiAgICAgIFtjb21wb25lbnQuaWRdOiB7XG4gICAgICAgIGNvbXBvbmVudElkOiBjb21wb25lbnQuaWQsXG4gICAgICAgIGNvbXBvbmVudFRpdGxlOiBjb21wb25lbnQudGl0bGUsXG4gICAgICAgIHNjaGVtYVZlcnNpb246IG5leHRWZXJzaW9uLFxuICAgICAgICBjdXJyZW50OiBjdXJyZW50UHJvcGVydGllcyxcbiAgICAgICAgbGFzdFVwZGF0ZWQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgaGlzdG9yeTogdXBkYXRlZEhpc3RvcnksXG4gICAgICB9LFxuICAgIH0sXG4gIH07XG59O1xuXG4vKipcbiAqIEdldCB0aGUgZnVsbCBoaXN0b3J5IGVudHJ5IGZvciBhIGNvbXBvbmVudCAodXNlZCBieSBkZXByZWNhdGlvbiBnZW5lcmF0b3IpXG4gKi9cbmV4cG9ydCBjb25zdCBnZXRDb21wb25lbnRIaXN0b3J5ID0gKFxuICBoaXN0b3J5OiBTY2hlbWFIaXN0b3J5LFxuICBjb21wb25lbnRJZDogc3RyaW5nXG4pOiBTY2hlbWFIaXN0b3J5RW50cnkgfCB1bmRlZmluZWQgPT4ge1xuICByZXR1cm4gaGlzdG9yeS5jb21wb25lbnRzW2NvbXBvbmVudElkXTtcbn07XG5cbi8qKlxuICogRm9ybWF0IHZhbGlkYXRpb24gcmVzdWx0cyBmb3IgY29uc29sZSBvdXRwdXRcbiAqL1xuZXhwb3J0IGNvbnN0IGZvcm1hdFZhbGlkYXRpb25SZXN1bHQgPSAocmVzdWx0OiBWYWxpZGF0aW9uUmVzdWx0KTogc3RyaW5nID0+IHtcbiAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cbiAgaWYgKHJlc3VsdC5pc05ldykge1xuICAgIGxpbmVzLnB1c2goYCAgJHtyZXN1bHQuY29tcG9uZW50VGl0bGV9ICgke3Jlc3VsdC5jb21wb25lbnRJZH0pYCk7XG4gICAgbGluZXMucHVzaChgICAgTmV3IGNvbXBvbmVudCAtIHdpbGwgYmUgYWRkZWQgdG8gbWFuaWZlc3Qgb24gY29tcGlsYXRpb25gKTtcbiAgICByZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG4gIH1cblxuICBjb25zdCBpY29uID0gcmVzdWx0LmlzVmFsaWQgPyAnT0snIDogJ0ZBSUwnO1xuICBsaW5lcy5wdXNoKGAke2ljb259ICR7cmVzdWx0LmNvbXBvbmVudFRpdGxlfSAoJHtyZXN1bHQuY29tcG9uZW50SWR9KWApO1xuXG4gIGlmIChyZXN1bHQuY2hhbmdlcy5sZW5ndGggPT09IDApIHtcbiAgICBsaW5lcy5wdXNoKGAgICBObyBwcm9wZXJ0eSBjaGFuZ2VzIGRldGVjdGVkYCk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgYnJlYWtpbmcgPSByZXN1bHQuY2hhbmdlcy5maWx0ZXIoYyA9PiBjLnR5cGUgPT09ICdyZW1vdmVkJyB8fCBjLnR5cGUgPT09ICd0eXBlX2NoYW5nZWQnKTtcbiAgICBjb25zdCBhZGRpdGlvbnMgPSByZXN1bHQuY2hhbmdlcy5maWx0ZXIoYyA9PiBjLnR5cGUgPT09ICdhZGRlZCcpO1xuXG4gICAgaWYgKGJyZWFraW5nLmxlbmd0aCA+IDApIHtcbiAgICAgIGxpbmVzLnB1c2goYCAgIEJyZWFraW5nIENoYW5nZXM6YCk7XG4gICAgICBmb3IgKGNvbnN0IGNoYW5nZSBvZiBicmVha2luZykge1xuICAgICAgICBsaW5lcy5wdXNoKGAgICAgICAke2NoYW5nZS5tZXNzYWdlfWApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChhZGRpdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgbGluZXMucHVzaChgICAgQWRkaXRpb25zOmApO1xuICAgICAgZm9yIChjb25zdCBjaGFuZ2Ugb2YgYWRkaXRpb25zKSB7XG4gICAgICAgIGxpbmVzLnB1c2goYCAgICAgICR7Y2hhbmdlLm1lc3NhZ2V9YCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xufTtcbiJdfQ==