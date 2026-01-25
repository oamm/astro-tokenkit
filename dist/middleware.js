// packages/astro-tokenkit/src/middleware.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { bindContext } from './client/context';
/**
 * Create middleware for context binding and automatic token rotation
 */
export function createMiddleware(client) {
    return (ctx, next) => __awaiter(this, void 0, void 0, function* () {
        const tokenManager = client.tokenManager;
        const contextOptions = client.contextOptions;
        const runLogic = () => __awaiter(this, void 0, void 0, function* () {
            // Proactively ensure valid session if auth is configured
            if (tokenManager) {
                try {
                    // This handles token rotation (refresh) if needed
                    yield tokenManager.ensure(ctx);
                }
                catch (error) {
                    // Log but don't block request if rotation fails
                    console.error('[TokenKit] Automatic token rotation failed:', error);
                }
            }
            return next();
        });
        // If getContextStore is defined, it means the context is managed externally (e.g., by a superior ALS)
        // We skip bindContext to avoid nesting ALS.run() unnecessarily.
        if (contextOptions === null || contextOptions === void 0 ? void 0 : contextOptions.getContextStore) {
            return runLogic();
        }
        return bindContext(ctx, runLogic, contextOptions);
    });
}
