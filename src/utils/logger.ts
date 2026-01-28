import { getConfig } from '../config';

/**
 * Logger utility that respects the debug flag in the configuration
 */
export const logger = {
    debug: (message: string, ...args: any[]) => {
        if (getConfig().debug) {
            console.debug(message, ...args);
        }
    },
    info: (message: string, ...args: any[]) => {
        if (getConfig().debug) {
            console.log(message, ...args);
        }
    },
    warn: (message: string, ...args: any[]) => {
        console.warn(message, ...args);
    },
    error: (message: string, ...args: any[]) => {
        console.error(message, ...args);
    }
};
