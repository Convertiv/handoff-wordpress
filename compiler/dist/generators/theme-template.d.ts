/**
 * Generates PHP theme templates from Handoff components
 * Used for header, footer, and other theme template parts
 */
import { HandoffComponent } from '../types';
/**
 * Generate WordPress header.php template
 */
declare const generateHeaderPhp: (component: HandoffComponent) => string;
/**
 * Generate WordPress footer.php template
 */
declare const generateFooterPhp: (component: HandoffComponent) => string;
/**
 * Generate a generic theme template part
 */
declare const generateTemplatePartPhp: (component: HandoffComponent, templateType: string) => string;
export { generateHeaderPhp, generateFooterPhp, generateTemplatePartPhp };
