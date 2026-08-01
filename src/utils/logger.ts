import { getConfig } from '../config';

/**
 * Logger utility that respects the debug flag in the configuration
 */
function withTimestamp(message: string): string {
    const timestamp = `[${new Date().toISOString()}]`;

    if (!message.startsWith('[TokenKit]')) {
        return `${timestamp} ${message}`;
    }

    return message.replace(/^(\[TokenKit\])(\[[^\]]+\])? ?/, (_, tokenKit, scope = '') => {
        return `${tokenKit} ${timestamp}${scope ? ` ${scope}` : ''} `;
    });
}

export const logger = {
    debug: (message: string, force?: boolean, ...args: any[]) => {
        if (force || getConfig().debug) {
            console.debug(withTimestamp(message), ...args);
        }
    },
    info: (message: string, force?: boolean, ...args: any[]) => {
        if (force || getConfig().debug) {
            console.log(withTimestamp(message), ...args);
        }
    },
    warn: (message: string, ...args: any[]) => {
        console.warn(withTimestamp(message), ...args);
    },
    error: (message: string, ...args: any[]) => {
        console.error(withTimestamp(message), ...args);
    }
};
