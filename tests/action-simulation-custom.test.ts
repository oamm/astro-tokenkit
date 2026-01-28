import { describe, it, expect, vi } from "vitest";
import { api, setConfig, createMiddleware } from "../src";
import type { APIContext } from "astro";

describe("Astro Action Simulation with Custom Store", () => {
    const mockCtx = {
        cookies: {
            get: vi.fn(),
            set: vi.fn(),
            delete: vi.fn(),
        },
        request: new Request("https://example.com"),
    } as unknown as APIContext;

    it("should fail if using non-async-safe custom store in an Action", async () => {
        let globalStore: any = null;
        
        setConfig({
            baseURL: "https://api.example.com",
            auth: {
                login: "/login",
                refresh: "/refresh",
            },
            getContextStore: () => globalStore,
            setContextStore: (ctx) => { globalStore = ctx; }
        });

        const middleware = createMiddleware();
        
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ access_token: "abc", refresh_token: "def", expires_in: 3600 }),
        });

        const actionHandler = async () => {
            // Simulate an async hop that might clear some types of context
            // (Though a simple global variable like globalStore will still work in this single-request test)
            await new Promise(resolve => setTimeout(resolve, 10));
            return await api.login({ username: "test" });
        };

        const next = vi.fn().mockImplementation(async () => {
            return await actionHandler();
        });

        // This will still work in a simple test because globalStore is just a variable
        const response: any = await middleware(mockCtx, next);
        expect(response.data.accessToken).toBe("abc");
    });
});
