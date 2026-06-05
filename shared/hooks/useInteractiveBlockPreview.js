/**
 * Editor hydration for interactive Handoff blocks.
 *
 * @package Handoff_Blocks
 */

import { useEffect, useRef } from '@wordpress/element';

/**
 * @param {Object} options
 * @param {import('react').RefObject<HTMLElement|null>} options.previewRef
 * @param {boolean} options.enabled
 * @param {(root: HTMLElement) => void} options.init
 * @param {(root: HTMLElement) => void} options.destroy
 * @param {unknown[]} [options.deps]
 */
export function useInteractiveBlockPreview( { previewRef, enabled, init, destroy, deps = [] } ) {
	const initRef = useRef( init );
	const destroyRef = useRef( destroy );

	initRef.current = init;
	destroyRef.current = destroy;

	useEffect( () => {
		const root = previewRef.current;
		if ( ! enabled || ! root ) {
			return undefined;
		}

		const timer = window.setTimeout( () => {
			try {
				initRef.current( root );
			} catch ( err ) {
				// eslint-disable-next-line no-console -- editor diagnostics
				console.error( '[handoff] interactive preview init failed:', err );
			}
		}, 0 );

		return () => {
			window.clearTimeout( timer );
			try {
				destroyRef.current( root );
			} catch ( err ) {
				// eslint-disable-next-line no-console -- editor diagnostics
				console.error( '[handoff] interactive preview destroy failed:', err );
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- deps supplied by caller
	}, [ enabled, previewRef, ...deps ] );
}
