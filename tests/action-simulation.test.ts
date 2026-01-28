import {beforeEach, describe, expect, it, vi} from "vitest";
import {api, createMiddleware, setConfig} from "../src";
import type {APIContext} from "astro";

describe("Astro Action Simulation", () => {
    const mockCtx = {
        cookies: {
            get: vi.fn(),
            set: vi.fn(),
            delete: vi.fn(),
        },
        request: new Request("https://example.com"),
    } as unknown as APIContext;

    beforeEach(() => {
        vi.clearAllMocks();
        setConfig({
            baseURL: "https://api.example.com",
            auth: {
                login: "/login",
                refresh: "/refresh",
            },
        });
    });

    it("should allow calling api.login inside a simulated Action", async () => {
        const middleware = createMiddleware();
        
        // Mock fetch for login
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ access_token: "abc", refresh_token: "def", expires_in: 3600 }),
        });

        // Simulate Astro calling middleware and then the Action handler
        const actionHandler = async () => {
            // Inside the Action, we call api.login
            return await api.login({username: "test", password: "pwd"});
        };

        const next = vi.fn().mockImplementation(async () => {
            return await actionHandler();
        });

        const response: any = await middleware(mockCtx, next);

        expect(response.data.accessToken).toBe("abc");
        expect(next).toHaveBeenCalled();
    });

    it("should fail if middleware is NOT used", async () => {
        // Mock fetch for login
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ access_token: "abc", refresh_token: "def", expires_in: 3600 }),
        });

        const actionHandler = async () => {
            return await api.login({ username: "test", password: "pwd" });
        };

        // Calling actionHandler directly without middleware wrapping it
        await expect(actionHandler()).rejects.toThrow("Astro context not found");
    });
});
