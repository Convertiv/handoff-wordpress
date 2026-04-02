"use strict";
/**
 * Property Manifest - Tracks property names across compilations
 * to detect breaking changes to WordPress data structures
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
exports.formatValidationResult = exports.updateManifest = exports.validateComponent = exports.saveManifest = exports.loadManifest = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const MANIFEST_FILENAME = 'property-manifest.json';
/**
 * Load the property manifest from disk
 */
const loadManifest = (outputDir) => {
    const manifestPath = path.join(outputDir, MANIFEST_FILENAME);
    if (!fs.existsSync(manifestPath)) {
        return {
            version: '1.0.0',
            components: {}
        };
    }
    try {
        const content = fs.readFileSync(manifestPath, 'utf-8');
        return JSON.parse(content);
    }
    catch (error) {
        console.warn(`⚠️  Could not parse manifest file, starting fresh`);
        return {
            version: '1.0.0',
            components: {}
        };
    }
};
exports.loadManifest = loadManifest;
/**
 * Save the property manifest to disk
 */
const saveManifest = (outputDir, manifest) => {
    const manifestPath = path.join(outputDir, MANIFEST_FILENAME);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
};
exports.saveManifest = saveManifest;
/**
 * Recursively extract property schema from a HandoffProperty
 */
const extractPropertySchema = (prop) => {
    const schema = {
        type: prop.type
    };
    // Handle object type - descend into properties
    if (prop.type === 'object' && prop.properties) {
        schema.properties = {};
        for (const [key, nestedProp] of Object.entries(prop.properties)) {
            schema.properties[key] = extractPropertySchema(nestedProp);
        }
    }
    // Handle array type - descend into items.properties
    if (prop.type === 'array') {
        // Arrays have item structure defined in items.properties or properties
        const itemProperties = prop.items?.properties || prop.properties;
        if (itemProperties) {
            schema.items = {
                type: 'object',
                properties: {}
            };
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
/**
 * Recursively compare two property schemas and collect changes
 */
const compareSchemas = (oldSchema, newSchema, path, changes) => {
    let isValid = true;
    // Property was removed
    if (oldSchema && !newSchema) {
        isValid = false;
        changes.push({
            type: 'removed',
            propertyPath: path,
            oldType: oldSchema.type,
            message: `Property "${path}" was removed. This will break existing content.`
        });
        return isValid;
    }
    // Property was added
    if (!oldSchema && newSchema) {
        changes.push({
            type: 'added',
            propertyPath: path,
            newType: newSchema.type,
            message: `New property "${path}" (${newSchema.type}) was added.`
        });
        return isValid;
    }
    // Both exist - compare types
    if (oldSchema && newSchema) {
        if (oldSchema.type !== newSchema.type) {
            isValid = false;
            changes.push({
                type: 'type_changed',
                propertyPath: path,
                oldType: oldSchema.type,
                newType: newSchema.type,
                message: `Property "${path}" type changed from "${oldSchema.type}" to "${newSchema.type}". This may break existing content.`
            });
            // Don't descend further if type changed
            return isValid;
        }
        // Compare nested properties for objects
        if (oldSchema.properties || newSchema.properties) {
            const oldProps = oldSchema.properties || {};
            const newProps = newSchema.properties || {};
            const allKeys = new Set([...Object.keys(oldProps), ...Object.keys(newProps)]);
            for (const key of allKeys) {
                const nestedValid = compareSchemas(oldProps[key], newProps[key], `${path}.${key}`, changes);
                if (!nestedValid)
                    isValid = false;
            }
        }
        // Compare array item structure
        if (oldSchema.items || newSchema.items) {
            // Compare the items schema recursively
            if (oldSchema.items && newSchema.items) {
                // Compare item properties
                const oldItemProps = oldSchema.items.properties || {};
                const newItemProps = newSchema.items.properties || {};
                const allKeys = new Set([...Object.keys(oldItemProps), ...Object.keys(newItemProps)]);
                for (const key of allKeys) {
                    const nestedValid = compareSchemas(oldItemProps[key], newItemProps[key], `${path}[].${key}`, changes);
                    if (!nestedValid)
                        isValid = false;
                }
            }
            else if (oldSchema.items && !newSchema.items) {
                // Array item structure was removed
                isValid = false;
                changes.push({
                    type: 'removed',
                    propertyPath: `${path}[]`,
                    message: `Array item structure for "${path}" was removed. This will break existing content.`
                });
            }
            else if (!oldSchema.items && newSchema.items) {
                // Array item structure was added
                changes.push({
                    type: 'added',
                    propertyPath: `${path}[]`,
                    message: `Array item structure for "${path}" was added.`
                });
            }
        }
    }
    return isValid;
};
/**
 * Compare current properties against the manifest
 */
const validateComponent = (component, manifest) => {
    const componentId = component.id;
    const currentProperties = extractProperties(component.properties);
    const existingEntry = manifest.components[componentId];
    const result = {
        componentId,
        componentTitle: component.title,
        isValid: true,
        changes: [],
        isNew: !existingEntry
    };
    if (!existingEntry) {
        // New component, no breaking changes possible
        return result;
    }
    const oldProperties = existingEntry.properties;
    // Get all top-level property keys
    const allKeys = new Set([
        ...Object.keys(oldProperties),
        ...Object.keys(currentProperties)
    ]);
    // Compare each property recursively
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
 * Update the manifest with the current component properties
 */
const updateManifest = (component, manifest) => {
    const entry = {
        componentId: component.id,
        componentTitle: component.title,
        properties: extractProperties(component.properties),
        lastUpdated: new Date().toISOString()
    };
    return {
        ...manifest,
        components: {
            ...manifest.components,
            [component.id]: entry
        }
    };
};
exports.updateManifest = updateManifest;
/**
 * Format validation results for console output
 */
const formatValidationResult = (result) => {
    const lines = [];
    if (result.isNew) {
        lines.push(`📦 ${result.componentTitle} (${result.componentId})`);
        lines.push(`   ✨ New component - will be added to manifest on compilation`);
        return lines.join('\n');
    }
    const icon = result.isValid ? '✅' : '❌';
    lines.push(`${icon} ${result.componentTitle} (${result.componentId})`);
    if (result.changes.length === 0) {
        lines.push(`   No property changes detected`);
    }
    else {
        // Group changes by type for cleaner output
        const breaking = result.changes.filter(c => c.type === 'removed' || c.type === 'type_changed');
        const additions = result.changes.filter(c => c.type === 'added');
        if (breaking.length > 0) {
            lines.push(`   🚨 Breaking Changes:`);
            for (const change of breaking) {
                const changeIcon = change.type === 'removed' ? '🗑️' : '⚠️';
                lines.push(`      ${changeIcon} ${change.message}`);
            }
        }
        if (additions.length > 0) {
            lines.push(`   ➕ Additions:`);
            for (const change of additions) {
                lines.push(`      ${change.message}`);
            }
        }
    }
    return lines.join('\n');
};
exports.formatValidationResult = formatValidationResult;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvcGVydHktbWFuaWZlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvdmFsaWRhdG9ycy9wcm9wZXJ0eS1tYW5pZmVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztHQUdHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBd0M3QixNQUFNLGlCQUFpQixHQUFHLHdCQUF3QixDQUFDO0FBRW5EOztHQUVHO0FBQ0ksTUFBTSxZQUFZLEdBQUcsQ0FBQyxTQUFpQixFQUFvQixFQUFFO0lBQ2xFLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFFN0QsSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQztRQUNqQyxPQUFPO1lBQ0wsT0FBTyxFQUFFLE9BQU87WUFDaEIsVUFBVSxFQUFFLEVBQUU7U0FDZixDQUFDO0lBQ0osQ0FBQztJQUVELElBQUksQ0FBQztRQUNILE1BQU0sT0FBTyxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsWUFBWSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZELE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQXFCLENBQUM7SUFDakQsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsSUFBSSxDQUFDLG1EQUFtRCxDQUFDLENBQUM7UUFDbEUsT0FBTztZQUNMLE9BQU8sRUFBRSxPQUFPO1lBQ2hCLFVBQVUsRUFBRSxFQUFFO1NBQ2YsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUFwQlcsUUFBQSxZQUFZLGdCQW9CdkI7QUFFRjs7R0FFRztBQUNJLE1BQU0sWUFBWSxHQUFHLENBQUMsU0FBaUIsRUFBRSxRQUEwQixFQUFRLEVBQUU7SUFDbEYsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztJQUM3RCxFQUFFLENBQUMsYUFBYSxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNwRSxDQUFDLENBQUM7QUFIVyxRQUFBLFlBQVksZ0JBR3ZCO0FBRUY7O0dBRUc7QUFDSCxNQUFNLHFCQUFxQixHQUFHLENBQUMsSUFBcUIsRUFBa0IsRUFBRTtJQUN0RSxNQUFNLE1BQU0sR0FBbUI7UUFDN0IsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO0tBQ2hCLENBQUM7SUFFRiwrQ0FBK0M7SUFDL0MsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDOUMsTUFBTSxDQUFDLFVBQVUsR0FBRyxFQUFFLENBQUM7UUFDdkIsS0FBSyxNQUFNLENBQUMsR0FBRyxFQUFFLFVBQVUsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7WUFDaEUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsR0FBRyxxQkFBcUIsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUM3RCxDQUFDO0lBQ0gsQ0FBQztJQUVELG9EQUFvRDtJQUNwRCxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssT0FBTyxFQUFFLENBQUM7UUFDMUIsdUVBQXVFO1FBQ3ZFLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxLQUFLLEVBQUUsVUFBVSxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUM7UUFDakUsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUNuQixNQUFNLENBQUMsS0FBSyxHQUFHO2dCQUNiLElBQUksRUFBRSxRQUFRO2dCQUNkLFVBQVUsRUFBRSxFQUFFO2FBQ2YsQ0FBQztZQUNGLEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxVQUFVLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUM7Z0JBQy9ELE1BQU0sQ0FBQyxLQUFLLENBQUMsVUFBVyxDQUFDLEdBQUcsQ0FBQyxHQUFHLHFCQUFxQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ3BFLENBQUM7UUFDSCxDQUFDO0lBQ0gsQ0FBQztJQUVELE9BQU8sTUFBTSxDQUFDO0FBQ2hCLENBQUMsQ0FBQztBQUVGOztHQUVHO0FBQ0gsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLFVBQTJDLEVBQWtDLEVBQUU7SUFDeEcsTUFBTSxNQUFNLEdBQW1DLEVBQUUsQ0FBQztJQUVsRCxLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1FBQ3JELE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBRUQsT0FBTyxNQUFNLENBQUM7QUFDaEIsQ0FBQyxDQUFDO0FBRUY7O0dBRUc7QUFDSCxNQUFNLGNBQWMsR0FBRyxDQUNyQixTQUFxQyxFQUNyQyxTQUFxQyxFQUNyQyxJQUFZLEVBQ1osT0FBeUIsRUFDaEIsRUFBRTtJQUNYLElBQUksT0FBTyxHQUFHLElBQUksQ0FBQztJQUVuQix1QkFBdUI7SUFDdkIsSUFBSSxTQUFTLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUM1QixPQUFPLEdBQUcsS0FBSyxDQUFDO1FBQ2hCLE9BQU8sQ0FBQyxJQUFJLENBQUM7WUFDWCxJQUFJLEVBQUUsU0FBUztZQUNmLFlBQVksRUFBRSxJQUFJO1lBQ2xCLE9BQU8sRUFBRSxTQUFTLENBQUMsSUFBSTtZQUN2QixPQUFPLEVBQUUsYUFBYSxJQUFJLGtEQUFrRDtTQUM3RSxDQUFDLENBQUM7UUFDSCxPQUFPLE9BQU8sQ0FBQztJQUNqQixDQUFDO0lBRUQscUJBQXFCO0lBQ3JCLElBQUksQ0FBQyxTQUFTLElBQUksU0FBUyxFQUFFLENBQUM7UUFDNUIsT0FBTyxDQUFDLElBQUksQ0FBQztZQUNYLElBQUksRUFBRSxPQUFPO1lBQ2IsWUFBWSxFQUFFLElBQUk7WUFDbEIsT0FBTyxFQUFFLFNBQVMsQ0FBQyxJQUFJO1lBQ3ZCLE9BQU8sRUFBRSxpQkFBaUIsSUFBSSxNQUFNLFNBQVMsQ0FBQyxJQUFJLGNBQWM7U0FDakUsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxPQUFPLENBQUM7SUFDakIsQ0FBQztJQUVELDZCQUE2QjtJQUM3QixJQUFJLFNBQVMsSUFBSSxTQUFTLEVBQUUsQ0FBQztRQUMzQixJQUFJLFNBQVMsQ0FBQyxJQUFJLEtBQUssU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3RDLE9BQU8sR0FBRyxLQUFLLENBQUM7WUFDaEIsT0FBTyxDQUFDLElBQUksQ0FBQztnQkFDWCxJQUFJLEVBQUUsY0FBYztnQkFDcEIsWUFBWSxFQUFFLElBQUk7Z0JBQ2xCLE9BQU8sRUFBRSxTQUFTLENBQUMsSUFBSTtnQkFDdkIsT0FBTyxFQUFFLFNBQVMsQ0FBQyxJQUFJO2dCQUN2QixPQUFPLEVBQUUsYUFBYSxJQUFJLHdCQUF3QixTQUFTLENBQUMsSUFBSSxTQUFTLFNBQVMsQ0FBQyxJQUFJLHFDQUFxQzthQUM3SCxDQUFDLENBQUM7WUFDSCx3Q0FBd0M7WUFDeEMsT0FBTyxPQUFPLENBQUM7UUFDakIsQ0FBQztRQUVELHdDQUF3QztRQUN4QyxJQUFJLFNBQVMsQ0FBQyxVQUFVLElBQUksU0FBUyxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2pELE1BQU0sUUFBUSxHQUFHLFNBQVMsQ0FBQyxVQUFVLElBQUksRUFBRSxDQUFDO1lBQzVDLE1BQU0sUUFBUSxHQUFHLFNBQVMsQ0FBQyxVQUFVLElBQUksRUFBRSxDQUFDO1lBQzVDLE1BQU0sT0FBTyxHQUFHLElBQUksR0FBRyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFOUUsS0FBSyxNQUFNLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQztnQkFDMUIsTUFBTSxXQUFXLEdBQUcsY0FBYyxDQUNoQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQ2IsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUNiLEdBQUcsSUFBSSxJQUFJLEdBQUcsRUFBRSxFQUNoQixPQUFPLENBQ1IsQ0FBQztnQkFDRixJQUFJLENBQUMsV0FBVztvQkFBRSxPQUFPLEdBQUcsS0FBSyxDQUFDO1lBQ3BDLENBQUM7UUFDSCxDQUFDO1FBRUQsK0JBQStCO1FBQy9CLElBQUksU0FBUyxDQUFDLEtBQUssSUFBSSxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDdkMsdUNBQXVDO1lBQ3ZDLElBQUksU0FBUyxDQUFDLEtBQUssSUFBSSxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ3ZDLDBCQUEwQjtnQkFDMUIsTUFBTSxZQUFZLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxVQUFVLElBQUksRUFBRSxDQUFDO2dCQUN0RCxNQUFNLFlBQVksR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLFVBQVUsSUFBSSxFQUFFLENBQUM7Z0JBQ3RELE1BQU0sT0FBTyxHQUFHLElBQUksR0FBRyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBRXRGLEtBQUssTUFBTSxHQUFHLElBQUksT0FBTyxFQUFFLENBQUM7b0JBQzFCLE1BQU0sV0FBVyxHQUFHLGNBQWMsQ0FDaEMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxFQUNqQixZQUFZLENBQUMsR0FBRyxDQUFDLEVBQ2pCLEdBQUcsSUFBSSxNQUFNLEdBQUcsRUFBRSxFQUNsQixPQUFPLENBQ1IsQ0FBQztvQkFDRixJQUFJLENBQUMsV0FBVzt3QkFBRSxPQUFPLEdBQUcsS0FBSyxDQUFDO2dCQUNwQyxDQUFDO1lBQ0gsQ0FBQztpQkFBTSxJQUFJLFNBQVMsQ0FBQyxLQUFLLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQy9DLG1DQUFtQztnQkFDbkMsT0FBTyxHQUFHLEtBQUssQ0FBQztnQkFDaEIsT0FBTyxDQUFDLElBQUksQ0FBQztvQkFDWCxJQUFJLEVBQUUsU0FBUztvQkFDZixZQUFZLEVBQUUsR0FBRyxJQUFJLElBQUk7b0JBQ3pCLE9BQU8sRUFBRSw2QkFBNkIsSUFBSSxrREFBa0Q7aUJBQzdGLENBQUMsQ0FBQztZQUNMLENBQUM7aUJBQU0sSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLElBQUksU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUMvQyxpQ0FBaUM7Z0JBQ2pDLE9BQU8sQ0FBQyxJQUFJLENBQUM7b0JBQ1gsSUFBSSxFQUFFLE9BQU87b0JBQ2IsWUFBWSxFQUFFLEdBQUcsSUFBSSxJQUFJO29CQUN6QixPQUFPLEVBQUUsNkJBQTZCLElBQUksY0FBYztpQkFDekQsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztRQUNILENBQUM7SUFDSCxDQUFDO0lBRUQsT0FBTyxPQUFPLENBQUM7QUFDakIsQ0FBQyxDQUFDO0FBRUY7O0dBRUc7QUFDSSxNQUFNLGlCQUFpQixHQUFHLENBQy9CLFNBQTJCLEVBQzNCLFFBQTBCLEVBQ1IsRUFBRTtJQUNwQixNQUFNLFdBQVcsR0FBRyxTQUFTLENBQUMsRUFBRSxDQUFDO0lBQ2pDLE1BQU0saUJBQWlCLEdBQUcsaUJBQWlCLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ2xFLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUM7SUFFdkQsTUFBTSxNQUFNLEdBQXFCO1FBQy9CLFdBQVc7UUFDWCxjQUFjLEVBQUUsU0FBUyxDQUFDLEtBQUs7UUFDL0IsT0FBTyxFQUFFLElBQUk7UUFDYixPQUFPLEVBQUUsRUFBRTtRQUNYLEtBQUssRUFBRSxDQUFDLGFBQWE7S0FDdEIsQ0FBQztJQUVGLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNuQiw4Q0FBOEM7UUFDOUMsT0FBTyxNQUFNLENBQUM7SUFDaEIsQ0FBQztJQUVELE1BQU0sYUFBYSxHQUFHLGFBQWEsQ0FBQyxVQUFVLENBQUM7SUFFL0Msa0NBQWtDO0lBQ2xDLE1BQU0sT0FBTyxHQUFHLElBQUksR0FBRyxDQUFDO1FBQ3RCLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUM7UUFDN0IsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDO0tBQ2xDLENBQUMsQ0FBQztJQUVILG9DQUFvQztJQUNwQyxLQUFLLE1BQU0sR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQzFCLE1BQU0sVUFBVSxHQUFHLGNBQWMsQ0FDL0IsYUFBYSxDQUFDLEdBQUcsQ0FBQyxFQUNsQixpQkFBaUIsQ0FBQyxHQUFHLENBQUMsRUFDdEIsR0FBRyxFQUNILE1BQU0sQ0FBQyxPQUFPLENBQ2YsQ0FBQztRQUNGLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNoQixNQUFNLENBQUMsT0FBTyxHQUFHLEtBQUssQ0FBQztRQUN6QixDQUFDO0lBQ0gsQ0FBQztJQUVELE9BQU8sTUFBTSxDQUFDO0FBQ2hCLENBQUMsQ0FBQztBQTNDVyxRQUFBLGlCQUFpQixxQkEyQzVCO0FBRUY7O0dBRUc7QUFDSSxNQUFNLGNBQWMsR0FBRyxDQUM1QixTQUEyQixFQUMzQixRQUEwQixFQUNSLEVBQUU7SUFDcEIsTUFBTSxLQUFLLEdBQTBCO1FBQ25DLFdBQVcsRUFBRSxTQUFTLENBQUMsRUFBRTtRQUN6QixjQUFjLEVBQUUsU0FBUyxDQUFDLEtBQUs7UUFDL0IsVUFBVSxFQUFFLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUM7UUFDbkQsV0FBVyxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO0tBQ3RDLENBQUM7SUFFRixPQUFPO1FBQ0wsR0FBRyxRQUFRO1FBQ1gsVUFBVSxFQUFFO1lBQ1YsR0FBRyxRQUFRLENBQUMsVUFBVTtZQUN0QixDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLO1NBQ3RCO0tBQ0YsQ0FBQztBQUNKLENBQUMsQ0FBQztBQWxCVyxRQUFBLGNBQWMsa0JBa0J6QjtBQUVGOztHQUVHO0FBQ0ksTUFBTSxzQkFBc0IsR0FBRyxDQUFDLE1BQXdCLEVBQVUsRUFBRTtJQUN6RSxNQUFNLEtBQUssR0FBYSxFQUFFLENBQUM7SUFFM0IsSUFBSSxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDakIsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLE1BQU0sQ0FBQyxjQUFjLEtBQUssTUFBTSxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUM7UUFDbEUsS0FBSyxDQUFDLElBQUksQ0FBQywrREFBK0QsQ0FBQyxDQUFDO1FBQzVFLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUMxQixDQUFDO0lBRUQsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7SUFDeEMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksSUFBSSxNQUFNLENBQUMsY0FBYyxLQUFLLE1BQU0sQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDO0lBRXZFLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDaEMsS0FBSyxDQUFDLElBQUksQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO0lBQ2hELENBQUM7U0FBTSxDQUFDO1FBQ04sMkNBQTJDO1FBQzNDLE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxTQUFTLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxjQUFjLENBQUMsQ0FBQztRQUMvRixNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssT0FBTyxDQUFDLENBQUM7UUFFakUsSUFBSSxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3hCLEtBQUssQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsQ0FBQztZQUN0QyxLQUFLLE1BQU0sTUFBTSxJQUFJLFFBQVEsRUFBRSxDQUFDO2dCQUM5QixNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUMsSUFBSSxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7Z0JBQzVELEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxVQUFVLElBQUksTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDdEQsQ0FBQztRQUNILENBQUM7UUFFRCxJQUFJLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDekIsS0FBSyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQzlCLEtBQUssTUFBTSxNQUFNLElBQUksU0FBUyxFQUFFLENBQUM7Z0JBQy9CLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUN4QyxDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDMUIsQ0FBQyxDQUFDO0FBcENXLFFBQUEsc0JBQXNCLDBCQW9DakMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFByb3BlcnR5IE1hbmlmZXN0IC0gVHJhY2tzIHByb3BlcnR5IG5hbWVzIGFjcm9zcyBjb21waWxhdGlvbnNcbiAqIHRvIGRldGVjdCBicmVha2luZyBjaGFuZ2VzIHRvIFdvcmRQcmVzcyBkYXRhIHN0cnVjdHVyZXNcbiAqL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgSGFuZG9mZkNvbXBvbmVudCwgSGFuZG9mZlByb3BlcnR5IH0gZnJvbSAnLi4vdHlwZXMnO1xuXG4vKipcbiAqIFJlY3Vyc2l2ZSBwcm9wZXJ0eSBzY2hlbWEgdGhhdCBmdWxseSBkZXNjcmliZXMgbmVzdGVkIHN0cnVjdHVyZXNcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBQcm9wZXJ0eVNjaGVtYSB7XG4gIHR5cGU6IHN0cmluZztcbiAgcHJvcGVydGllcz86IFJlY29yZDxzdHJpbmcsIFByb3BlcnR5U2NoZW1hPjsgLy8gRm9yIG9iamVjdHNcbiAgaXRlbXM/OiBQcm9wZXJ0eVNjaGVtYTsgLy8gRm9yIGFycmF5cyAoZGVzY3JpYmVzIHRoZSBhcnJheSBpdGVtIHN0cnVjdHVyZSlcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcm9wZXJ0eU1hbmlmZXN0RW50cnkge1xuICBjb21wb25lbnRJZDogc3RyaW5nO1xuICBjb21wb25lbnRUaXRsZTogc3RyaW5nO1xuICBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBQcm9wZXJ0eVNjaGVtYT47XG4gIGxhc3RVcGRhdGVkOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJvcGVydHlNYW5pZmVzdCB7XG4gIHZlcnNpb246IHN0cmluZztcbiAgY29tcG9uZW50czogUmVjb3JkPHN0cmluZywgUHJvcGVydHlNYW5pZmVzdEVudHJ5Pjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcm9wZXJ0eUNoYW5nZSB7XG4gIHR5cGU6ICdhZGRlZCcgfCAncmVtb3ZlZCcgfCAndHlwZV9jaGFuZ2VkJztcbiAgcHJvcGVydHlQYXRoOiBzdHJpbmc7XG4gIG9sZFR5cGU/OiBzdHJpbmc7XG4gIG5ld1R5cGU/OiBzdHJpbmc7XG4gIG1lc3NhZ2U6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWYWxpZGF0aW9uUmVzdWx0IHtcbiAgY29tcG9uZW50SWQ6IHN0cmluZztcbiAgY29tcG9uZW50VGl0bGU6IHN0cmluZztcbiAgaXNWYWxpZDogYm9vbGVhbjtcbiAgY2hhbmdlczogUHJvcGVydHlDaGFuZ2VbXTtcbiAgaXNOZXc6IGJvb2xlYW47XG59XG5cbmNvbnN0IE1BTklGRVNUX0ZJTEVOQU1FID0gJ3Byb3BlcnR5LW1hbmlmZXN0Lmpzb24nO1xuXG4vKipcbiAqIExvYWQgdGhlIHByb3BlcnR5IG1hbmlmZXN0IGZyb20gZGlza1xuICovXG5leHBvcnQgY29uc3QgbG9hZE1hbmlmZXN0ID0gKG91dHB1dERpcjogc3RyaW5nKTogUHJvcGVydHlNYW5pZmVzdCA9PiB7XG4gIGNvbnN0IG1hbmlmZXN0UGF0aCA9IHBhdGguam9pbihvdXRwdXREaXIsIE1BTklGRVNUX0ZJTEVOQU1FKTtcbiAgXG4gIGlmICghZnMuZXhpc3RzU3luYyhtYW5pZmVzdFBhdGgpKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHZlcnNpb246ICcxLjAuMCcsXG4gICAgICBjb21wb25lbnRzOiB7fVxuICAgIH07XG4gIH1cbiAgXG4gIHRyeSB7XG4gICAgY29uc3QgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhtYW5pZmVzdFBhdGgsICd1dGYtOCcpO1xuICAgIHJldHVybiBKU09OLnBhcnNlKGNvbnRlbnQpIGFzIFByb3BlcnR5TWFuaWZlc3Q7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS53YXJuKGDimqDvuI8gIENvdWxkIG5vdCBwYXJzZSBtYW5pZmVzdCBmaWxlLCBzdGFydGluZyBmcmVzaGApO1xuICAgIHJldHVybiB7XG4gICAgICB2ZXJzaW9uOiAnMS4wLjAnLFxuICAgICAgY29tcG9uZW50czoge31cbiAgICB9O1xuICB9XG59O1xuXG4vKipcbiAqIFNhdmUgdGhlIHByb3BlcnR5IG1hbmlmZXN0IHRvIGRpc2tcbiAqL1xuZXhwb3J0IGNvbnN0IHNhdmVNYW5pZmVzdCA9IChvdXRwdXREaXI6IHN0cmluZywgbWFuaWZlc3Q6IFByb3BlcnR5TWFuaWZlc3QpOiB2b2lkID0+IHtcbiAgY29uc3QgbWFuaWZlc3RQYXRoID0gcGF0aC5qb2luKG91dHB1dERpciwgTUFOSUZFU1RfRklMRU5BTUUpO1xuICBmcy53cml0ZUZpbGVTeW5jKG1hbmlmZXN0UGF0aCwgSlNPTi5zdHJpbmdpZnkobWFuaWZlc3QsIG51bGwsIDIpKTtcbn07XG5cbi8qKlxuICogUmVjdXJzaXZlbHkgZXh0cmFjdCBwcm9wZXJ0eSBzY2hlbWEgZnJvbSBhIEhhbmRvZmZQcm9wZXJ0eVxuICovXG5jb25zdCBleHRyYWN0UHJvcGVydHlTY2hlbWEgPSAocHJvcDogSGFuZG9mZlByb3BlcnR5KTogUHJvcGVydHlTY2hlbWEgPT4ge1xuICBjb25zdCBzY2hlbWE6IFByb3BlcnR5U2NoZW1hID0ge1xuICAgIHR5cGU6IHByb3AudHlwZVxuICB9O1xuICBcbiAgLy8gSGFuZGxlIG9iamVjdCB0eXBlIC0gZGVzY2VuZCBpbnRvIHByb3BlcnRpZXNcbiAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgc2NoZW1hLnByb3BlcnRpZXMgPSB7fTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIG5lc3RlZFByb3BdIG9mIE9iamVjdC5lbnRyaWVzKHByb3AucHJvcGVydGllcykpIHtcbiAgICAgIHNjaGVtYS5wcm9wZXJ0aWVzW2tleV0gPSBleHRyYWN0UHJvcGVydHlTY2hlbWEobmVzdGVkUHJvcCk7XG4gICAgfVxuICB9XG4gIFxuICAvLyBIYW5kbGUgYXJyYXkgdHlwZSAtIGRlc2NlbmQgaW50byBpdGVtcy5wcm9wZXJ0aWVzXG4gIGlmIChwcm9wLnR5cGUgPT09ICdhcnJheScpIHtcbiAgICAvLyBBcnJheXMgaGF2ZSBpdGVtIHN0cnVjdHVyZSBkZWZpbmVkIGluIGl0ZW1zLnByb3BlcnRpZXMgb3IgcHJvcGVydGllc1xuICAgIGNvbnN0IGl0ZW1Qcm9wZXJ0aWVzID0gcHJvcC5pdGVtcz8ucHJvcGVydGllcyB8fCBwcm9wLnByb3BlcnRpZXM7XG4gICAgaWYgKGl0ZW1Qcm9wZXJ0aWVzKSB7XG4gICAgICBzY2hlbWEuaXRlbXMgPSB7XG4gICAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgICBwcm9wZXJ0aWVzOiB7fVxuICAgICAgfTtcbiAgICAgIGZvciAoY29uc3QgW2tleSwgbmVzdGVkUHJvcF0gb2YgT2JqZWN0LmVudHJpZXMoaXRlbVByb3BlcnRpZXMpKSB7XG4gICAgICAgIHNjaGVtYS5pdGVtcy5wcm9wZXJ0aWVzIVtrZXldID0gZXh0cmFjdFByb3BlcnR5U2NoZW1hKG5lc3RlZFByb3ApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBcbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbi8qKlxuICogRXh0cmFjdCBhbGwgcHJvcGVydHkgc2NoZW1hcyBmcm9tIGEgY29tcG9uZW50XG4gKi9cbmNvbnN0IGV4dHJhY3RQcm9wZXJ0aWVzID0gKHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4pOiBSZWNvcmQ8c3RyaW5nLCBQcm9wZXJ0eVNjaGVtYT4gPT4ge1xuICBjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIFByb3BlcnR5U2NoZW1hPiA9IHt9O1xuICBcbiAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKSkge1xuICAgIHJlc3VsdFtrZXldID0gZXh0cmFjdFByb3BlcnR5U2NoZW1hKHByb3ApO1xuICB9XG4gIFxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBSZWN1cnNpdmVseSBjb21wYXJlIHR3byBwcm9wZXJ0eSBzY2hlbWFzIGFuZCBjb2xsZWN0IGNoYW5nZXNcbiAqL1xuY29uc3QgY29tcGFyZVNjaGVtYXMgPSAoXG4gIG9sZFNjaGVtYTogUHJvcGVydHlTY2hlbWEgfCB1bmRlZmluZWQsXG4gIG5ld1NjaGVtYTogUHJvcGVydHlTY2hlbWEgfCB1bmRlZmluZWQsXG4gIHBhdGg6IHN0cmluZyxcbiAgY2hhbmdlczogUHJvcGVydHlDaGFuZ2VbXVxuKTogYm9vbGVhbiA9PiB7XG4gIGxldCBpc1ZhbGlkID0gdHJ1ZTtcbiAgXG4gIC8vIFByb3BlcnR5IHdhcyByZW1vdmVkXG4gIGlmIChvbGRTY2hlbWEgJiYgIW5ld1NjaGVtYSkge1xuICAgIGlzVmFsaWQgPSBmYWxzZTtcbiAgICBjaGFuZ2VzLnB1c2goe1xuICAgICAgdHlwZTogJ3JlbW92ZWQnLFxuICAgICAgcHJvcGVydHlQYXRoOiBwYXRoLFxuICAgICAgb2xkVHlwZTogb2xkU2NoZW1hLnR5cGUsXG4gICAgICBtZXNzYWdlOiBgUHJvcGVydHkgXCIke3BhdGh9XCIgd2FzIHJlbW92ZWQuIFRoaXMgd2lsbCBicmVhayBleGlzdGluZyBjb250ZW50LmBcbiAgICB9KTtcbiAgICByZXR1cm4gaXNWYWxpZDtcbiAgfVxuICBcbiAgLy8gUHJvcGVydHkgd2FzIGFkZGVkXG4gIGlmICghb2xkU2NoZW1hICYmIG5ld1NjaGVtYSkge1xuICAgIGNoYW5nZXMucHVzaCh7XG4gICAgICB0eXBlOiAnYWRkZWQnLFxuICAgICAgcHJvcGVydHlQYXRoOiBwYXRoLFxuICAgICAgbmV3VHlwZTogbmV3U2NoZW1hLnR5cGUsXG4gICAgICBtZXNzYWdlOiBgTmV3IHByb3BlcnR5IFwiJHtwYXRofVwiICgke25ld1NjaGVtYS50eXBlfSkgd2FzIGFkZGVkLmBcbiAgICB9KTtcbiAgICByZXR1cm4gaXNWYWxpZDtcbiAgfVxuICBcbiAgLy8gQm90aCBleGlzdCAtIGNvbXBhcmUgdHlwZXNcbiAgaWYgKG9sZFNjaGVtYSAmJiBuZXdTY2hlbWEpIHtcbiAgICBpZiAob2xkU2NoZW1hLnR5cGUgIT09IG5ld1NjaGVtYS50eXBlKSB7XG4gICAgICBpc1ZhbGlkID0gZmFsc2U7XG4gICAgICBjaGFuZ2VzLnB1c2goe1xuICAgICAgICB0eXBlOiAndHlwZV9jaGFuZ2VkJyxcbiAgICAgICAgcHJvcGVydHlQYXRoOiBwYXRoLFxuICAgICAgICBvbGRUeXBlOiBvbGRTY2hlbWEudHlwZSxcbiAgICAgICAgbmV3VHlwZTogbmV3U2NoZW1hLnR5cGUsXG4gICAgICAgIG1lc3NhZ2U6IGBQcm9wZXJ0eSBcIiR7cGF0aH1cIiB0eXBlIGNoYW5nZWQgZnJvbSBcIiR7b2xkU2NoZW1hLnR5cGV9XCIgdG8gXCIke25ld1NjaGVtYS50eXBlfVwiLiBUaGlzIG1heSBicmVhayBleGlzdGluZyBjb250ZW50LmBcbiAgICAgIH0pO1xuICAgICAgLy8gRG9uJ3QgZGVzY2VuZCBmdXJ0aGVyIGlmIHR5cGUgY2hhbmdlZFxuICAgICAgcmV0dXJuIGlzVmFsaWQ7XG4gICAgfVxuICAgIFxuICAgIC8vIENvbXBhcmUgbmVzdGVkIHByb3BlcnRpZXMgZm9yIG9iamVjdHNcbiAgICBpZiAob2xkU2NoZW1hLnByb3BlcnRpZXMgfHwgbmV3U2NoZW1hLnByb3BlcnRpZXMpIHtcbiAgICAgIGNvbnN0IG9sZFByb3BzID0gb2xkU2NoZW1hLnByb3BlcnRpZXMgfHwge307XG4gICAgICBjb25zdCBuZXdQcm9wcyA9IG5ld1NjaGVtYS5wcm9wZXJ0aWVzIHx8IHt9O1xuICAgICAgY29uc3QgYWxsS2V5cyA9IG5ldyBTZXQoWy4uLk9iamVjdC5rZXlzKG9sZFByb3BzKSwgLi4uT2JqZWN0LmtleXMobmV3UHJvcHMpXSk7XG4gICAgICBcbiAgICAgIGZvciAoY29uc3Qga2V5IG9mIGFsbEtleXMpIHtcbiAgICAgICAgY29uc3QgbmVzdGVkVmFsaWQgPSBjb21wYXJlU2NoZW1hcyhcbiAgICAgICAgICBvbGRQcm9wc1trZXldLFxuICAgICAgICAgIG5ld1Byb3BzW2tleV0sXG4gICAgICAgICAgYCR7cGF0aH0uJHtrZXl9YCxcbiAgICAgICAgICBjaGFuZ2VzXG4gICAgICAgICk7XG4gICAgICAgIGlmICghbmVzdGVkVmFsaWQpIGlzVmFsaWQgPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gQ29tcGFyZSBhcnJheSBpdGVtIHN0cnVjdHVyZVxuICAgIGlmIChvbGRTY2hlbWEuaXRlbXMgfHwgbmV3U2NoZW1hLml0ZW1zKSB7XG4gICAgICAvLyBDb21wYXJlIHRoZSBpdGVtcyBzY2hlbWEgcmVjdXJzaXZlbHlcbiAgICAgIGlmIChvbGRTY2hlbWEuaXRlbXMgJiYgbmV3U2NoZW1hLml0ZW1zKSB7XG4gICAgICAgIC8vIENvbXBhcmUgaXRlbSBwcm9wZXJ0aWVzXG4gICAgICAgIGNvbnN0IG9sZEl0ZW1Qcm9wcyA9IG9sZFNjaGVtYS5pdGVtcy5wcm9wZXJ0aWVzIHx8IHt9O1xuICAgICAgICBjb25zdCBuZXdJdGVtUHJvcHMgPSBuZXdTY2hlbWEuaXRlbXMucHJvcGVydGllcyB8fCB7fTtcbiAgICAgICAgY29uc3QgYWxsS2V5cyA9IG5ldyBTZXQoWy4uLk9iamVjdC5rZXlzKG9sZEl0ZW1Qcm9wcyksIC4uLk9iamVjdC5rZXlzKG5ld0l0ZW1Qcm9wcyldKTtcbiAgICAgICAgXG4gICAgICAgIGZvciAoY29uc3Qga2V5IG9mIGFsbEtleXMpIHtcbiAgICAgICAgICBjb25zdCBuZXN0ZWRWYWxpZCA9IGNvbXBhcmVTY2hlbWFzKFxuICAgICAgICAgICAgb2xkSXRlbVByb3BzW2tleV0sXG4gICAgICAgICAgICBuZXdJdGVtUHJvcHNba2V5XSxcbiAgICAgICAgICAgIGAke3BhdGh9W10uJHtrZXl9YCxcbiAgICAgICAgICAgIGNoYW5nZXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICghbmVzdGVkVmFsaWQpIGlzVmFsaWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChvbGRTY2hlbWEuaXRlbXMgJiYgIW5ld1NjaGVtYS5pdGVtcykge1xuICAgICAgICAvLyBBcnJheSBpdGVtIHN0cnVjdHVyZSB3YXMgcmVtb3ZlZFxuICAgICAgICBpc1ZhbGlkID0gZmFsc2U7XG4gICAgICAgIGNoYW5nZXMucHVzaCh7XG4gICAgICAgICAgdHlwZTogJ3JlbW92ZWQnLFxuICAgICAgICAgIHByb3BlcnR5UGF0aDogYCR7cGF0aH1bXWAsXG4gICAgICAgICAgbWVzc2FnZTogYEFycmF5IGl0ZW0gc3RydWN0dXJlIGZvciBcIiR7cGF0aH1cIiB3YXMgcmVtb3ZlZC4gVGhpcyB3aWxsIGJyZWFrIGV4aXN0aW5nIGNvbnRlbnQuYFxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSBpZiAoIW9sZFNjaGVtYS5pdGVtcyAmJiBuZXdTY2hlbWEuaXRlbXMpIHtcbiAgICAgICAgLy8gQXJyYXkgaXRlbSBzdHJ1Y3R1cmUgd2FzIGFkZGVkXG4gICAgICAgIGNoYW5nZXMucHVzaCh7XG4gICAgICAgICAgdHlwZTogJ2FkZGVkJyxcbiAgICAgICAgICBwcm9wZXJ0eVBhdGg6IGAke3BhdGh9W11gLFxuICAgICAgICAgIG1lc3NhZ2U6IGBBcnJheSBpdGVtIHN0cnVjdHVyZSBmb3IgXCIke3BhdGh9XCIgd2FzIGFkZGVkLmBcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIFxuICByZXR1cm4gaXNWYWxpZDtcbn07XG5cbi8qKlxuICogQ29tcGFyZSBjdXJyZW50IHByb3BlcnRpZXMgYWdhaW5zdCB0aGUgbWFuaWZlc3RcbiAqL1xuZXhwb3J0IGNvbnN0IHZhbGlkYXRlQ29tcG9uZW50ID0gKFxuICBjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQsXG4gIG1hbmlmZXN0OiBQcm9wZXJ0eU1hbmlmZXN0XG4pOiBWYWxpZGF0aW9uUmVzdWx0ID0+IHtcbiAgY29uc3QgY29tcG9uZW50SWQgPSBjb21wb25lbnQuaWQ7XG4gIGNvbnN0IGN1cnJlbnRQcm9wZXJ0aWVzID0gZXh0cmFjdFByb3BlcnRpZXMoY29tcG9uZW50LnByb3BlcnRpZXMpO1xuICBjb25zdCBleGlzdGluZ0VudHJ5ID0gbWFuaWZlc3QuY29tcG9uZW50c1tjb21wb25lbnRJZF07XG4gIFxuICBjb25zdCByZXN1bHQ6IFZhbGlkYXRpb25SZXN1bHQgPSB7XG4gICAgY29tcG9uZW50SWQsXG4gICAgY29tcG9uZW50VGl0bGU6IGNvbXBvbmVudC50aXRsZSxcbiAgICBpc1ZhbGlkOiB0cnVlLFxuICAgIGNoYW5nZXM6IFtdLFxuICAgIGlzTmV3OiAhZXhpc3RpbmdFbnRyeVxuICB9O1xuICBcbiAgaWYgKCFleGlzdGluZ0VudHJ5KSB7XG4gICAgLy8gTmV3IGNvbXBvbmVudCwgbm8gYnJlYWtpbmcgY2hhbmdlcyBwb3NzaWJsZVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cbiAgXG4gIGNvbnN0IG9sZFByb3BlcnRpZXMgPSBleGlzdGluZ0VudHJ5LnByb3BlcnRpZXM7XG4gIFxuICAvLyBHZXQgYWxsIHRvcC1sZXZlbCBwcm9wZXJ0eSBrZXlzXG4gIGNvbnN0IGFsbEtleXMgPSBuZXcgU2V0KFtcbiAgICAuLi5PYmplY3Qua2V5cyhvbGRQcm9wZXJ0aWVzKSxcbiAgICAuLi5PYmplY3Qua2V5cyhjdXJyZW50UHJvcGVydGllcylcbiAgXSk7XG4gIFxuICAvLyBDb21wYXJlIGVhY2ggcHJvcGVydHkgcmVjdXJzaXZlbHlcbiAgZm9yIChjb25zdCBrZXkgb2YgYWxsS2V5cykge1xuICAgIGNvbnN0IGlzS2V5VmFsaWQgPSBjb21wYXJlU2NoZW1hcyhcbiAgICAgIG9sZFByb3BlcnRpZXNba2V5XSxcbiAgICAgIGN1cnJlbnRQcm9wZXJ0aWVzW2tleV0sXG4gICAgICBrZXksXG4gICAgICByZXN1bHQuY2hhbmdlc1xuICAgICk7XG4gICAgaWYgKCFpc0tleVZhbGlkKSB7XG4gICAgICByZXN1bHQuaXNWYWxpZCA9IGZhbHNlO1xuICAgIH1cbiAgfVxuICBcbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogVXBkYXRlIHRoZSBtYW5pZmVzdCB3aXRoIHRoZSBjdXJyZW50IGNvbXBvbmVudCBwcm9wZXJ0aWVzXG4gKi9cbmV4cG9ydCBjb25zdCB1cGRhdGVNYW5pZmVzdCA9IChcbiAgY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50LFxuICBtYW5pZmVzdDogUHJvcGVydHlNYW5pZmVzdFxuKTogUHJvcGVydHlNYW5pZmVzdCA9PiB7XG4gIGNvbnN0IGVudHJ5OiBQcm9wZXJ0eU1hbmlmZXN0RW50cnkgPSB7XG4gICAgY29tcG9uZW50SWQ6IGNvbXBvbmVudC5pZCxcbiAgICBjb21wb25lbnRUaXRsZTogY29tcG9uZW50LnRpdGxlLFxuICAgIHByb3BlcnRpZXM6IGV4dHJhY3RQcm9wZXJ0aWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKSxcbiAgICBsYXN0VXBkYXRlZDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXG4gIH07XG4gIFxuICByZXR1cm4ge1xuICAgIC4uLm1hbmlmZXN0LFxuICAgIGNvbXBvbmVudHM6IHtcbiAgICAgIC4uLm1hbmlmZXN0LmNvbXBvbmVudHMsXG4gICAgICBbY29tcG9uZW50LmlkXTogZW50cnlcbiAgICB9XG4gIH07XG59O1xuXG4vKipcbiAqIEZvcm1hdCB2YWxpZGF0aW9uIHJlc3VsdHMgZm9yIGNvbnNvbGUgb3V0cHV0XG4gKi9cbmV4cG9ydCBjb25zdCBmb3JtYXRWYWxpZGF0aW9uUmVzdWx0ID0gKHJlc3VsdDogVmFsaWRhdGlvblJlc3VsdCk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuICBcbiAgaWYgKHJlc3VsdC5pc05ldykge1xuICAgIGxpbmVzLnB1c2goYPCfk6YgJHtyZXN1bHQuY29tcG9uZW50VGl0bGV9ICgke3Jlc3VsdC5jb21wb25lbnRJZH0pYCk7XG4gICAgbGluZXMucHVzaChgICAg4pyoIE5ldyBjb21wb25lbnQgLSB3aWxsIGJlIGFkZGVkIHRvIG1hbmlmZXN0IG9uIGNvbXBpbGF0aW9uYCk7XG4gICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xuICB9XG4gIFxuICBjb25zdCBpY29uID0gcmVzdWx0LmlzVmFsaWQgPyAn4pyFJyA6ICfinYwnO1xuICBsaW5lcy5wdXNoKGAke2ljb259ICR7cmVzdWx0LmNvbXBvbmVudFRpdGxlfSAoJHtyZXN1bHQuY29tcG9uZW50SWR9KWApO1xuICBcbiAgaWYgKHJlc3VsdC5jaGFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuICAgIGxpbmVzLnB1c2goYCAgIE5vIHByb3BlcnR5IGNoYW5nZXMgZGV0ZWN0ZWRgKTtcbiAgfSBlbHNlIHtcbiAgICAvLyBHcm91cCBjaGFuZ2VzIGJ5IHR5cGUgZm9yIGNsZWFuZXIgb3V0cHV0XG4gICAgY29uc3QgYnJlYWtpbmcgPSByZXN1bHQuY2hhbmdlcy5maWx0ZXIoYyA9PiBjLnR5cGUgPT09ICdyZW1vdmVkJyB8fCBjLnR5cGUgPT09ICd0eXBlX2NoYW5nZWQnKTtcbiAgICBjb25zdCBhZGRpdGlvbnMgPSByZXN1bHQuY2hhbmdlcy5maWx0ZXIoYyA9PiBjLnR5cGUgPT09ICdhZGRlZCcpO1xuICAgIFxuICAgIGlmIChicmVha2luZy5sZW5ndGggPiAwKSB7XG4gICAgICBsaW5lcy5wdXNoKGAgICDwn5qoIEJyZWFraW5nIENoYW5nZXM6YCk7XG4gICAgICBmb3IgKGNvbnN0IGNoYW5nZSBvZiBicmVha2luZykge1xuICAgICAgICBjb25zdCBjaGFuZ2VJY29uID0gY2hhbmdlLnR5cGUgPT09ICdyZW1vdmVkJyA/ICfwn5eR77iPJyA6ICfimqDvuI8nO1xuICAgICAgICBsaW5lcy5wdXNoKGAgICAgICAke2NoYW5nZUljb259ICR7Y2hhbmdlLm1lc3NhZ2V9YCk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIGlmIChhZGRpdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgbGluZXMucHVzaChgICAg4p6VIEFkZGl0aW9uczpgKTtcbiAgICAgIGZvciAoY29uc3QgY2hhbmdlIG9mIGFkZGl0aW9ucykge1xuICAgICAgICBsaW5lcy5wdXNoKGAgICAgICAke2NoYW5nZS5tZXNzYWdlfWApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBcbiAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xufTtcbiJdfQ==