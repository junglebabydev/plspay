// Organiser accounts and sign-in, at the backend.
import { describe, expect, it } from "vitest";
import { api, organiser, randomIp } from "./pb";

describe("Accounts", () => {
  it("AC-F01-06 nobody can sign up: creating a user without superuser rights is refused", async () => {
    const body = { email: "walk-in@plspay.test", password: "a-long-password-123", passwordConfirm: "a-long-password-123" };
    const anon = await api("POST", "/api/collections/users/records", { json: body });
    expect(anon.status).toBe(403);
    const o = await organiser("signup");
    const asOrganiser = await api("POST", "/api/collections/users/records", { token: o.token, json: { ...body, email: "friend@plspay.test" } });
    expect(asOrganiser.status).toBe(403);
    const login = await api("POST", "/api/collections/users/auth-with-password", { json: { identity: body.email, password: body.password } });
    expect(login.status).toBe(400);
  });

  it("AC-F01-06 an organiser can't delete their own account", async () => {
    const o = await organiser("self-delete");
    expect((await api("DELETE", `/api/collections/users/records/${o.id}`, { token: o.token })).status).toBe(403);
  });

  it("AC-F01-04 a wrong password and an unknown email get the same answer", async () => {
    const o = await organiser("wrong-pass");
    const wrong = await api("POST", "/api/collections/users/auth-with-password", { json: { identity: o.email, password: "nope-nope-nope" } });
    const unknown = await api("POST", "/api/collections/users/auth-with-password", { json: { identity: "nobody@plspay.test", password: "nope-nope-nope" } });
    expect(wrong.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(wrong.body).toEqual(unknown.body);
  });
});

describe("Backend limits", () => {
  it("SEC-12 PocketBase's own sign-in limit is on: a third attempt within 3 seconds from one IP gets 429", async () => {
    const ip = randomIp();
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) {
      codes.push((await api("POST", "/api/collections/users/auth-with-password", { ip, json: { identity: "nobody@plspay.test", password: "x".repeat(10) } })).status);
    }
    expect(codes).toEqual([400, 400, 429]);
  });

  it("SEC-10 superuser login answers only on the path Cloudflare Access guards", async () => {
    const json = { identity: "nobody@plspay.test", password: "x".repeat(10) };
    for (const path of ["/api/collections/pbc_3142635823/auth-with-password", "/api/collections/_SUPERUSERS/auth-with-password", "/api/collections/%5Fsuperusers/auth-with-password"]) {
      expect((await api("POST", path, { json })).status, path).toBe(404);
    }
    expect((await api("POST", "/api/collections/_superusers/auth-with-password", { json })).status).toBe(400);
  });
});
